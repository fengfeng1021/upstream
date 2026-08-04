/* 機械檢查。DESIGN.md §9 的「機械檢查」那一節，逐條變成程式。

   這支工具的存在理由是：設計文件寫的規則，人會忘、會妥協、會在趕時間的時候破例。
   把規則寫成檢查，破例就會讓 build 失敗，於是規則才真的是規則。

   用法：node tools/audit.mjs
   回傳碼 1 代表有硬性違規。 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('.');
const fails = [];
const passes = [];

const ok = (msg) => passes.push(msg);
const bad = (msg) => fails.push(msg);

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'tools') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = await walk(ROOT);
const byExt = (ext) => files.filter((f) => f.endsWith(ext));
const read = async (f) => readFile(f, 'utf8');

const htmlFiles = byExt('.html');
const cssFiles = byExt('.css');
const jsFiles = byExt('.js').filter((f) => !f.includes('vendor'));
const srcFiles = [...htmlFiles, ...jsFiles];

/* ── 1 破折號 ────────────────────────────────────────────────────────────
   全站渲染文字中的 em dash 與 en dash 必須是 0。中文破折號一併禁用。
   註解裡的不算——使用者看不到，而且中文註解本來就會用到。 */
{
  const hits = [];
  for (const f of srcFiles) {
    const t = await read(f);
    // 先把 JS 與 CSS 註解剝掉，只檢查會被渲染的部分
    const stripped = f.endsWith('.js')
      ? t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      : t.replace(/<!--[\s\S]*?-->/g, '');
    const m = stripped.match(/[—–]/g);
    if (m) hits.push(`${path.relative(ROOT, f)} ×${m.length}`);
  }
  hits.length ? bad(`破折號（— 或 –）出現在 ${hits.length} 個檔案：${hits.join('、')}`)
              : ok('破折號 0 個');
}

/* ── 2 eyebrow ──────────────────────────────────────────────────────────
   text-transform: uppercase 搭配 letter-spacing 的小標，全站必須是 0。 */
{
  let n = 0;
  for (const f of cssFiles) {
    const t = await read(f);
    for (const block of t.split('}')) {
      if (/text-transform:\s*uppercase/.test(block) && /letter-spacing/.test(block)) n++;
    }
  }
  n ? bad(`eyebrow 樣式 ${n} 個（uppercase + letter-spacing）`) : ok('eyebrow 0 個');
}

/* ── 3 形狀鎖 ────────────────────────────────────────────────────────────
   border-radius 的相異值只能有 var(--radius)、6px、0、2px（標尺內的小色塊）。 */
{
  const allowed = new Set(['var(--radius)', '6px', '0', '2px', 'inherit', '999px']);
  const found = new Map();
  for (const f of cssFiles) {
    const t = await read(f);
    for (const m of t.matchAll(/border-radius:\s*([^;]+);/g)) {
      const v = m[1].trim();
      if (v === '999px') continue; // 若真的出現要報，見下
      found.set(v, (found.get(v) || 0) + 1);
    }
  }
  const illegal = [...found.keys()].filter((v) => !allowed.has(v));
  illegal.length ? bad(`border-radius 出現不在鎖內的值：${illegal.join('、')}`)
                 : ok(`border-radius 只有 ${[...found.keys()].join('、')}`);
  if (found.has('999px')) bad('出現膠囊形狀（999px），形狀鎖只允許 6px');
}

/* ── 4 捲動監聽 ────────────────────────────────────────────────────────── */
{
  let n = 0;
  for (const f of jsFiles) {
    const t = await read(f);
    n += (t.match(/addEventListener\(\s*['"]scroll['"]/g) || []).length;
  }
  n ? bad(`window scroll 監聽 ${n} 處（一律走 ScrollTrigger）`) : ok('scroll 監聽 0 處');
}

/* ── 5 無限迴圈動畫與 marquee ───────────────────────────────────────────── */
{
  let n = 0;
  for (const f of [...cssFiles, ...jsFiles]) {
    const t = await read(f);
    n += (t.match(/animation-iteration-count:\s*infinite|repeat:\s*-1|<marquee/g) || []).length;
  }
  n ? bad(`無限迴圈動畫或 marquee ${n} 處`) : ok('無限迴圈動畫與 marquee 0 個');
}

/* ── 6 判讀的禁用詞 ──────────────────────────────────────────────────────
   DESIGN.md §4.7。這是全站法規風險最高的一條，所以掃得最嚴：
   HTML 全文與 JS 的字串常值都掃。 */
{
  const banned = [
    '建議', '應該', '適合', '值得', '可以考慮', '比較好', '優於', '推薦', '避免',
    '將會', '預期', '看好', '看壞', '目標價', '支撐', '壓力', '停損', '停利',
    '買點', '賣點', '進場', '出場', '布局', '加碼', '減碼', '精選', '熱門', '最佳', '首選',
  ];
  /* 白名單。每一條都是「這個詞在這裡不是在給建議」的具體實例，逐條列出而不是放寬規則：
     放寬規則會製造漏洞，逐條列出的話，日後新增一句話就得再過一次這裡。

     三類：
     (a) 免責宣告本身要用到「建議」，那是宣告不是給建議。
     (b)「不做什麼」那一節在**否定**這些詞，否定句是這個站的賣點之一，不能因為
         掃描器看到字就把誠實的揭露刪掉。
     (c) 同形異義：「公開賣點」的賣點是 selling point 不是賣出訊號；
         「最佳化」是 optimization 不是「最好的標的」。 */
  const allowlist = [
    // (a)
    '不構成任何建議', '不構成任何投資建議或要約', '這不是建議',
    '不是建議', '不含任何建議', '禁止的動詞', '允許的動詞',
    // (b)
    '不推薦任何標的', '沒有買賣價位、支撐壓力點、停損停利價位、買賣轉折價位',
    '任何數字前面都不會加上「將會」',
    // (c)
    '公開賣點', '最佳化', '最佳視窗不可辨識', '最佳回看期在不同期間並不相同',
    // (b) 首頁與標的頁的「不會做的事」。這幾句是這個站的公開承諾，
    //     被掃到的字全部在否定句裡或被引號括起來當成被禁的例子。
    '沒有投顧執照而推薦個別標的是刑事責任',
    '沒有排名，也沒有推薦',
    '不會看到任何「將會」',
    '你不會在這裡看到目標價、買賣點、支撐壓力',
  ];
  const hits = [];
  for (const f of srcFiles) {
    let t = await read(f);
    t = f.endsWith('.js')
      ? t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      : t.replace(/<!--[\s\S]*?-->/g, '');
    for (const a of allowlist) t = t.split(a).join('');
    for (const w of banned) {
      const c = (t.match(new RegExp(w, 'g')) || []).length;
      if (c) hits.push(`${path.relative(ROOT, f)}：${w} ×${c}`);
    }
  }
  hits.length ? bad(`禁用詞命中 ${hits.length} 處\n      ${hits.join('\n      ')}`)
              : ok('禁用詞 0 命中');
}

/* ── 7 元件契約：每個 .u-gauge 都要有視窗 ────────────────────────────────
   DESIGN.md §1.3。實測顯示同一個值換視窗會反轉訊息，所以「忘了寫視窗」
   必須是壞掉而不是預設值。renderGauge 收不到 window 就不渲染，這裡檢查呼叫端。 */
{
  const hits = [];
  for (const f of jsFiles) {
    const t = await read(f);
    for (const m of t.matchAll(/renderGauge\(\{([\s\S]{0,400}?)\}\)/g)) {
      if (!/window:/.test(m[1]) && !/dual:\s*true/.test(m[1])) {
        hits.push(path.relative(ROOT, f));
      }
    }
  }
  hits.length ? bad(`renderGauge 呼叫缺少 window：${hits.join('、')}`)
              : ok('每個 renderGauge 呼叫都帶視窗');
}

/* ── 8 抓取日戳 ────────────────────────────────────────────────────────── */
/* 抓取日戳。頁面本身只有掛載點，日期是 JS 從資料檔的 generatedAt 填的
   （寫死在 HTML 裡的日期遲早會跟資料對不起來）。所以要連同該頁載入的模組一起看。 */
{
  const missing = [];
  for (const f of htmlFiles) {
    const t = await read(f);
    let has = /id="stamp"|u-datestamp/.test(t);
    if (!has) {
      for (const m of t.matchAll(/<script[^>]+src="([^"]+\.js)"/g)) {
        if (m[1].includes('vendor')) continue;
        const js = path.resolve(path.dirname(f), m[1]);
        try {
          const src = await read(js);
          if (/renderFoot|datestamp/.test(src)) { has = true; break; }
        } catch { /* 找不到就當沒有 */ }
      }
    }
    if (!has) missing.push(path.relative(ROOT, f));
  }
  missing.length ? bad(`沒有抓取日戳的頁面：${missing.join('、')}`) : ok('每一頁都有抓取日戳');
}

/* ── 9 第三方請求 ────────────────────────────────────────────────────────
   零追蹤的承諾要能被機械檢查，不能只寫在文案裡。
   唯一允許的外連是原始碼倉庫。 */
{
  const hits = [];
  for (const f of [...htmlFiles, ...jsFiles, ...cssFiles]) {
    const t = await read(f);
    for (const m of t.matchAll(/https?:\/\/([^\s"'`)]+)/g)) {
      const url = m[0];
      const host = m[1].split('/')[0];
      if (host === 'github.com' || host === 'localhost' || host.startsWith('localhost:')) continue;
      if (/^www\.w3\.org/.test(host)) continue; // SVG namespace，不是請求
      // 註解裡提到的來源網址不算請求，只有屬性值算
      const around = t.slice(Math.max(0, m.index - 60), m.index);
      if (/(src|href)\s*=\s*["']?$/.test(around) || /fetch\(\s*["'`]$/.test(around)) {
        hits.push(`${path.relative(ROOT, f)}：${url}`);
      }
    }
  }
  hits.length ? bad(`第三方資源請求：\n      ${hits.join('\n      ')}`)
              : ok('沒有從第三方網域載入任何資源');
}

/* ── 10 資料檔完整性 ──────────────────────────────────────────────────── */
{
  try {
    const snap = JSON.parse(await read(path.join(ROOT, 'assets/data/snapshot.json')));
    const tw = JSON.parse(await read(path.join(ROOT, 'assets/data/taiwan.json')));
    const nAssets = Object.keys(snap.assets).length;
    const nMacro = Object.keys(snap.macro).length;
    if (nAssets < 20) bad(`snapshot.json 只有 ${nAssets} 檔價格序列`);
    if (nMacro < 15) bad(`snapshot.json 只有 ${nMacro} 條總經序列`);
    if (!tw.taiex?.months?.length) bad('taiwan.json 沒有加權指數');
    if (!tw.flows?.months?.length) bad('taiwan.json 沒有三大法人');
    if (!tw.metals?.gold?.n) bad('taiwan.json 沒有 LBMA 黃金');
    // 月份軸必須連續
    const ax = snap.axis;
    let gaps = 0;
    for (let i = 1; i < ax.length; i++) {
      const [y0, m0] = ax[i - 1].split('-').map(Number);
      const [y1, m1] = ax[i].split('-').map(Number);
      if ((y1 - y0) * 12 + (m1 - m0) !== 1) gaps++;
    }
    if (gaps) bad(`共用月份軸有 ${gaps} 處不連續`);
    else ok(`資料完整：${nAssets} 檔價格、${nMacro} 條總經、軸 ${ax.length} 個月連續、`
          + `加權指數 ${tw.taiex.months.length} 個月、三大法人 ${tw.flows.months.length} 筆、`
          + `LBMA 黃金 ${tw.metals.gold.n} 個月`);
  } catch (e) {
    bad(`資料檔讀取失敗：${e.message}`);
  }
}

/* ── 輸出 ───────────────────────────────────────────────────────────────── */
console.log('\n機械檢查\n');
for (const p of passes) console.log(`  ✔ ${p}`);
for (const f of fails) console.log(`  ✗ ${f}`);
console.log(`\n${passes.length} 過、${fails.length} 不過\n`);
if (fails.length) process.exit(1);
