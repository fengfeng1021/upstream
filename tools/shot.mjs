/* 截圖工具（CDP 版）。
   為什麼不用 chrome --screenshot：Windows 上瀏覽器視窗有最小寬度（約 500px），
   所以 --window-size=390 拍出來的其實是 500px 版面被裁掉右邊，
   手機版的驗收會整組失真。改用 Emulation.setDeviceMetricsOverride 做真正的裝置模擬，
   並用 captureBeyondViewport 取得完整長頁。

   用法：node tools/shot.mjs <outDir> <url1> [url2 ...]
        node tools/shot.mjs .shots --only mobile http://...
        node tools/shot.mjs .shots --only small,tablet,laptop --dark http://...
        node tools/shot.mjs .shots --eval tools/probes/hub.js --no-shot http://...

   --only 可以逗號分隔：small(375) mobile(390) tablet(768) laptop(1280) desktop(1440)
   --eval 讀一個 JS 檔在頁面裡跑，把回傳值印成 JSON。同一支工具兼做健檢，
   是因為「畫面對不對」與「數字對不對」必須在同一次載入裡看，分兩次跑就對不起來。
   --motion 關掉 --force-prefers-reduced-motion，用來驗動效的終態。
   --dark 用 prefers-color-scheme: dark 重跑，檔名多一個 .dark。
*/
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p));

const PORT = Number(process.env.CDP_PORT || 9333);
const VIEWPORTS = {
  desktop: { width: 1440, height: 900, dsf: 1, mobile: false },
  laptop: { width: 1280, height: 800, dsf: 1, mobile: false },
  tablet: { width: 768, height: 1024, dsf: 2, mobile: true },
  mobile: { width: 390, height: 844, dsf: 2, mobile: true },
  small: { width: 375, height: 667, dsf: 2, mobile: true },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDevtools(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return await r.json();
    } catch { /* 還沒起來 */ }
    await sleep(250);
  }
  throw new Error('DevTools 沒有在時限內起來');
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = new Map();
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) {
        (this.handlers.get(msg.method) || []).forEach((fn) => fn(msg.params));
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout ' + method)); } }, 30000);
    });
  }
  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
  }
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => resolve(new CDP(ws)));
    ws.addEventListener('error', reject);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const outDir = args[0] || '.shots';
  let which = ['desktop', 'mobile'];
  const onlyIdx = args.indexOf('--only');
  if (onlyIdx >= 0) which = args[onlyIdx + 1].split(',');
  const unknown = which.filter((k) => !VIEWPORTS[k]);
  if (unknown.length) { console.error(`不認識的視窗：${unknown.join(', ')}`); process.exit(1); }
  const urls = args.filter((a, i) => a.startsWith('http') && i > 0);
  if (!urls.length) { console.error('沒有給網址'); process.exit(1); }
  if (!CHROME) { console.error('找不到 Chrome / Edge'); process.exit(1); }

  const noShot = args.includes('--no-shot');
  const motion = args.includes('--motion');
  const dark = args.includes('--dark');
  const evalIdx = args.indexOf('--eval');
  const probe = evalIdx >= 0 ? await readFile(args[evalIdx + 1], 'utf8') : null;

  await mkdir(outDir, { recursive: true });
  const profile = path.join(os.tmpdir(), 'vm-shot-' + Date.now());

  const chrome = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    ...(motion ? [] : ['--force-prefers-reduced-motion']),
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${PORT}`,
    'about:blank',
  ], { stdio: 'ignore' });

  try {
    const ver = await waitForDevtools();
    const browser = await connect(ver.webSocketDebuggerUrl);
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });

    // 用 flatten session：把 sessionId 帶在每個訊息上
    const page = {
      send: (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++browser.id;
        browser.pending.set(id, { resolve, reject });
        browser.ws.send(JSON.stringify({ id, sessionId, method, params }));
        setTimeout(() => { if (browser.pending.has(id)) { browser.pending.delete(id); reject(new Error('timeout ' + method)); } }, 30000);
      }),
    };

    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Log.enable').catch(() => {});
    // 深色不是把淺色反相，是 tokens.css 裡另一組材質，所以必須真的用深色重跑一次驗收。
    if (dark) {
      await page.send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-color-scheme', value: 'dark' }],
      });
    }

    // console error 與未捕捉例外都算失敗。沒有這一段的話，一個載入就爆掉的模組
    // 會拍出一張「看起來只是比較空」的截圖，而那種截圖是會過驗收的。
    let errors = [];
    browser.on('Runtime.exceptionThrown', (p) => {
      errors.push('exception: ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text));
    });
    browser.on('Runtime.consoleAPICalled', (p) => {
      if (p.type !== 'error') return;
      errors.push('console: ' + p.args.map((a) => a.description || a.value).join(' '));
    });
    browser.on('Log.entryAdded', (p) => {
      if (p.entry?.level === 'error') errors.push('log: ' + p.entry.text + ' ' + (p.entry.url || ''));
    });

    for (const url of urls) {
      const slug = url.replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, '').replace(/[^\w.-]+/g, '_') || 'index';
      for (const key of which) {
        const v = VIEWPORTS[key];
        await page.send('Emulation.setDeviceMetricsOverride', {
          width: v.width, height: v.height,
          deviceScaleFactor: v.dsf, mobile: v.mobile,
          screenWidth: v.width, screenHeight: v.height,
        });
        errors = [];
        await page.send('Page.navigate', { url });
        await sleep(2200);

        const res = await page.send('Runtime.evaluate', {
          expression: `JSON.stringify({ w: innerWidth, scrollW: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight, title: document.title })`,
          returnByValue: true,
        });
        const info = JSON.parse(res.result.value || '{}');
        if (info.scrollW > info.w + 1) {
          console.log(`  ⚠ ${slug} ${key}：橫向溢出 ${info.scrollW} > ${info.w}`);
        }

        if (probe) {
          const r = await page.send('Runtime.evaluate', {
            expression: `(() => { try { return JSON.stringify((() => {${probe}\n})(), null, 1); } catch (e) { return JSON.stringify({ 探針爆炸: String(e) }); } })()`,
            returnByValue: true, awaitPromise: true,
          });
          console.log(`— ${slug} ${key} —\n${r.result.value}`);
        }

        for (const e of errors) console.log(`  ✗ ${slug} ${key}：${e}`);

        if (!noShot) {
          const shot = await page.send('Page.captureScreenshot', {
            format: 'png',
            captureBeyondViewport: true,
            clip: { x: 0, y: 0, width: v.width, height: Math.min(info.h || v.height, 6000), scale: 1 },
          });
          const file = path.join(outDir, `${slug}.${key}${dark ? '.dark' : ''}.png`);
          await writeFile(file, Buffer.from(shot.data, 'base64'));
          console.log(`  ✓ ${file}  ${v.width}×${Math.min(info.h, 6000)}`);
        }
      }
    }
    await browser.send('Target.closeTarget', { targetId });
  } finally {
    chrome.kill();
    await sleep(300);
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
