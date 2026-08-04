/* 抓下宇宙裡的每一條序列，對齊到同一條月份軸，寫成 data/snapshot.json。
   這一份是所有子專案的共同地基，各站只挑自己要的欄位。

   用法：node tools/build-snapshot.mjs [--only GOLD,SPX] [--macro-only] */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { ASSETS, MACRO, CLASSES, CLASS_ORDER, RATIOS } from './universe.mjs';
import { fred, toMonthlyLast, yahooMonthly, monthRange, alignTo, sleep } from './sources.mjs';

const OUT = path.resolve('data');
const argHas = (f) => process.argv.includes(f);
const argVal = (f) => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : null; };
const only = argVal('--only') ? new Set(argVal('--only').split(',')) : null;

const snap = {
  generatedAt: new Date().toISOString().slice(0, 10),
  sources: {
    prices: 'Yahoo Finance chart v8（月線，period1/period2，非 range=max）',
    macro: 'FRED 公開 CSV（免金鑰），日／週頻取當月最後一筆',
  },
  assets: {},
  macro: {},
};

const failed = [];

/* ── 價格 ─────────────────────────────────────────────────────────────────── */
if (!argHas('--macro-only')) {
  console.log('抓價格序列');
  for (const a of ASSETS) {
    if (only && !only.has(a.code)) continue;
    try {
      // 匯率走 FRED（Yahoo 的 TWD=X／CNY=X 早年有數月至數年的空洞），其餘走 Yahoo。
      const got = a.fredId
        ? { ...toMonthlyLast(await fred(a.fredId)), symbol: `FRED:${a.fredId}` }
        : await yahooMonthly(a.sym, { daily: !!a.daily });
      snap.assets[a.code] = {
        symbol: got.symbol || a.sym, code: a.code, name: a.name, cls: a.cls, ccy: a.ccy, note: a.note,
        start: got.months[0], end: got.months[got.months.length - 1], n: got.months.length,
        months: got.months, values: got.values,
      };
      console.log(`  ${a.code.padEnd(8)} ${a.name.padEnd(18)} ${got.months[0]}→${got.months[got.months.length - 1]}  ${String(got.months.length).padStart(4)}期`);
    } catch (e) {
      failed.push(`${a.code}: ${e.message}`);
      console.log(`  ✗ ${a.code.padEnd(8)} ${e.message}`);
    }
    await sleep(220);
  }
}

/* ── 總經 ─────────────────────────────────────────────────────────────────── */

/* 過期守門。FRED 對已停止發布的序列照樣回 HTTP 200 與格式完整的 CSV，
   實測 USALOLITONOSTSAM 停在 2024-01（31 個月前）、USSLIND 停在 2020-02（78 個月前），
   兩條都完全看不出異常。沒有這道檢查，儀表板會拿數年前的數字當「現在」顯示。
   過期不是抓不到，所以不能只靠 try/catch，必須主動量最後一筆的年齡。 */
const nowMs = Date.now();
const ageInMonths = (yyyymm) => {
  const [y, mm] = yyyymm.split('-').map(Number);
  return Math.round((nowMs - Date.UTC(y, mm - 1, 1)) / (1000 * 86400 * 30.44));
};
const stale = [];

console.log('\n抓總經序列');
for (const m of MACRO) {
  try {
    const raw = await fred(m.id);
    const mon = toMonthlyLast(raw);
    const age = ageInMonths(mon.months[mon.months.length - 1]);
    const limit = (m.maxAge ?? 2) + (m.lag ?? 0);
    if (age > limit) {
      stale.push(`${m.id}（${m.key}）最後一筆 ${mon.months[mon.months.length - 1]}，已 ${age} 個月未更新，容許 ${limit}`);
    }
    snap.macro[m.key] = {
      id: m.id, key: m.key, name: m.name, unit: m.unit, lag: m.lag, note: m.note,
      start: mon.months[0], end: mon.months[mon.months.length - 1], n: mon.months.length,
      months: mon.months, values: mon.values,
    };
    console.log(`  ${m.key.padEnd(10)} ${m.name.padEnd(22)} ${mon.months[0]}→${mon.months[mon.months.length - 1]}  ${String(mon.months.length).padStart(4)}期`);
  } catch (e) {
    failed.push(`${m.id}: ${e.message}`);
    console.log(`  ✗ ${m.key.padEnd(10)} ${e.message}`);
  }
  await sleep(220);
}

/* ── 共用月份軸 ────────────────────────────────────────────────────────────
   軸的終點取「所有價格序列都有值的最後一個月」，不是取最大值。
   不同市場的月線收檔時間差一天就會讓某幾檔多一格，那一格在跨資產比較裡是空的，
   而空格在相對強弱排名上會變成「這個資產今天不存在」，比晚一個月更糟。 */
const priceEnds = Object.values(snap.assets).map((a) => a.end).sort();
const macroEnds = Object.values(snap.macro).map((a) => a.end).sort();
const axisEnd = priceEnds.length ? priceEnds[0] : macroEnds[0];
const axisStart = '1990-01';
snap.axis = monthRange(axisStart, axisEnd);
console.log(`\n共用月份軸 ${snap.axis[0]} → ${snap.axis[snap.axis.length - 1]}（${snap.axis.length} 個月）`);
console.log(`  價格序列最早收在 ${priceEnds[0]}，最晚收在 ${priceEnds[priceEnds.length - 1]}`);

// 對齊。價格不做前向填補（缺就是還沒上市），總經允許補兩個月（發布落差）。
for (const k of Object.keys(snap.assets)) {
  const a = snap.assets[k];
  a.series = alignTo(snap.axis, { months: a.months, values: a.values }, { maxFill: 0 });
  delete a.months; delete a.values;
}
for (const k of Object.keys(snap.macro)) {
  const m = snap.macro[k];
  m.series = alignTo(snap.axis, { months: m.months, values: m.values }, { maxFill: 2 });
  delete m.months; delete m.values;
}

snap.classes = CLASSES;
snap.classOrder = CLASS_ORDER;
snap.ratios = RATIOS;

await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'snapshot.json'), JSON.stringify(snap));
const kb = (JSON.stringify(snap).length / 1024).toFixed(0);
console.log(`\n寫入 data/snapshot.json：${Object.keys(snap.assets).length} 檔價格、${Object.keys(snap.macro).length} 條總經、${kb} KB`);
if (failed.length) console.log(`\n抓不到（${failed.length}）：\n  ${failed.join('\n  ')}`);

if (stale.length) {
  console.log(`\n⚠ 過期序列（${stale.length}）：\n  ${stale.join('\n  ')}`);
  console.log('\n過期序列不能當成現況顯示。要嘛換一條，要嘛在介面上明確標示為已停止發布。');
  process.exitCode = 1;
} else {
  console.log('過期檢查：全部序列都在容許的更新間隔內。');
}
