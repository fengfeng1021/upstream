/* 台灣本地資料的回補。這是整個資料層唯一需要「逐月迴圈」的部分，所以它自己一支。

   為什麼不用證交所的 OpenAPI（openapi.twse.com.tw）：那組端點只回「最近一個交易日」，
   即使 summary 寫著歷史資料也一樣。要歷史只能走舊版的 /rwd/ 端點，一次一個月。
   代價是 1999 年到今天要跑三百多次請求，所以這支腳本會快取到磁碟，重跑時只補新的。

   證交所的兩個坑：
   1. 回 HTTP 200 但 stat 是錯誤字串（例如「查詢日期小於99年1月4日」），必須檢查 stat。
   2. 節流很兇。實測要間隔三秒以上，否則會開始回空。

   用法：node tools/build-taiwan.mjs [--from 1999-01] */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36';
const OUT = path.resolve('data');
const CACHE = path.resolve('.cache');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const argVal = (f) => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : null; };
const FROM = argVal('--from') || '1999-01';

/** 民國日期 115/07/31 → 2026-07-31 */
const rocToISO = (s) => {
  const m = String(s).trim().match(/^(\d{2,3})\/(\d{2})\/(\d{2})$/);
  if (!m) return null;
  return `${Number(m[1]) + 1911}-${m[2]}-${m[3]}`;
};
const num = (v) => {
  const n = Number(String(v).replace(/,/g, '').trim());
  return isFinite(n) ? n : null;
};

async function twse(url, { tries = 4 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 40000);
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ac.signal });
      clearTimeout(timer);
      if (res.ok) {
        const j = await res.json();
        // 坑 1：HTTP 200 但 stat 不是 OK。這種回應解析起來完全正常，只是沒有資料。
        if (j?.stat && j.stat !== 'OK') return { ok: false, reason: j.stat };
        return { ok: true, json: j };
      }
    } catch { /* 逾時或連線失敗，退避後重試 */ }
    await sleep(3000 * (i + 1));
  }
  return { ok: false, reason: 'retries exhausted' };
}

const monthsBetween = (from, to) => {
  const out = [];
  let [y, m] = from.split('-').map(Number);
  const [ey, em] = to.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
};

const nowISO = new Date().toISOString().slice(0, 10);
const endMonth = nowISO.slice(0, 7);

await mkdir(CACHE, { recursive: true });
await mkdir(OUT, { recursive: true });

const cacheGet = async (k) => { try { return JSON.parse(await readFile(path.join(CACHE, k + '.json'), 'utf8')); } catch { return null; } };
const cachePut = (k, v) => writeFile(path.join(CACHE, k + '.json'), JSON.stringify(v));

/* ── 加權指數日線（FMTQIK，一次一個月）─────────────────────────────────────
   欄位：日期 / 成交股數 / 成交金額 / 成交筆數 / 發行量加權股價指數 / 漲跌點數
   除了指數本身，成交金額也留著——台股的成交量是散戶參與度的直接讀數。 */
async function fetchTAIEX() {
  const months = monthsBetween(FROM, endMonth);
  const days = new Map();
  let fetched = 0, cached = 0, failed = 0;
  for (const ym of months) {
    const key = `taiex-${ym}`;
    // 當月與上個月一律重抓（當月還在長，上個月可能有事後更正）
    const isRecent = ym >= endMonth.replace('-', '') || ym >= String(Number(endMonth.replace('-', '')) - 1);
    let got = isRecent ? null : await cacheGet(key);
    if (got) { cached++; } else {
      const r = await twse(`https://www.twse.com.tw/rwd/zh/afterTrading/FMTQIK?date=${ym}01&response=json`);
      if (!r.ok) { failed++; process.stdout.write(`\r  ${ym} 取不到（${r.reason}）          `); await sleep(3200); continue; }
      got = (r.json.data || []).map((row) => ({
        d: rocToISO(row[0]), vol: num(row[1]), amt: num(row[2]), idx: num(row[4]),
      })).filter((x) => x.d && x.idx != null);
      await cachePut(key, got);
      fetched++;
      await sleep(3200); // 坑 2：證交所節流很兇，間隔要三秒以上
    }
    for (const row of got) days.set(row.d, row);
    process.stdout.write(`\r  加權指數 ${ym}  已抓 ${fetched} 快取 ${cached} 失敗 ${failed}  共 ${days.size} 日   `);
  }
  console.log('');
  return [...days.values()].sort((a, b) => (a.d < b.d ? -1 : 1));
}

/* ── 三大法人買賣金額（BFI82U，月累計）─────────────────────────────────────
   外資買賣超是「美元 → 台幣 → 外資 → 台股」這條鏈的第三環。

   端點有 type=day 與 type=month 兩種。**一定要用 month。**
   type=day 一次只回一天，若退而求其次只抓每月最後一個交易日，拿到的是
   「當月最後一天的單日買賣超」，那跟「當月的買賣超」是兩個不同的東西——
   單日值的雜訊遠大於訊號，拿它去跟月報酬算關聯會系統性低估這一環。
   type=month 直接回整個月的累計買進、賣出與淨額，這才是要放進鏈裡的量。

   參數形狀有陷阱：必須同時給 dayDate 與 monthDate（weekDate 留空），
   只給 type=month 而不給 monthDate 會回一整頁 HTML 而不是 JSON。 */
async function fetchForeignFlows(taiexDays) {
  const months = [...new Set(taiexDays.map((r) => r.d.slice(0, 7)))]
    .filter((m) => m >= '2004-12')   // BFI82U 的起點
    .sort();

  const out = [];
  let fetched = 0, cached = 0, failed = 0;
  for (const month of months) {
    const key = `bfi-m-${month}`;
    const ym = month.replace('-', '') + '01';
    const isRecent = month >= endMonth;
    let got = isRecent ? null : await cacheGet(key);
    if (got) { cached++; } else {
      const r = await twse(`https://www.twse.com.tw/rwd/zh/fund/BFI82U`
        + `?dayDate=${ym}&weekDate=&monthDate=${ym}&type=month&response=json`);
      if (!r.ok) { failed++; await sleep(3200); continue; }
      const rows = r.json.data || [];
      const find = (name) => rows.find((x) => String(x[0]).includes(name));
      const foreign = find('外資及陸資(不含外資自營商)') || find('外資及陸資') || find('外資');
      const trust = find('投信');
      const dealer = find('自營商(自行買賣)');
      got = {
        month,
        foreignNet: foreign ? num(foreign[3]) : null,
        trustNet: trust ? num(trust[3]) : null,
        dealerNet: dealer ? num(dealer[3]) : null,
      };
      await cachePut(key, got);
      fetched++;
      await sleep(3200);
    }
    if (got.foreignNet != null) out.push(got);
    process.stdout.write(`\r  三大法人 ${month}  已抓 ${fetched} 快取 ${cached} 失敗 ${failed}  共 ${out.length} 筆   `);
  }
  console.log('');
  return out;
}

/* ── LBMA 金銀定盤價 ────────────────────────────────────────────────────────
   免金鑰、無節流、黃金與白銀回到 1968，且是真正的定盤基準而不是滾動期貨合約。
   Yahoo 的 GC=F 只到 2000 且有換倉跳空，長期圖表一律以這一份為準。
   v 陣列是 [USD, GBP, EUR]。 */
async function fetchLBMA() {
  const out = {};
  for (const [k, url] of [
    ['gold', 'https://prices.lbma.org.uk/json/gold_pm.json'],
    ['silver', 'https://prices.lbma.org.uk/json/silver.json'],
  ]) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    const rows = await res.json();
    const byMonth = new Map();
    for (const r of rows) {
      const usd = Array.isArray(r.v) ? r.v[0] : null;
      if (r.d && usd != null && isFinite(usd)) byMonth.set(r.d.slice(0, 7), Number(usd));
    }
    const months = [...byMonth.keys()].sort();
    out[k] = { months, values: months.map((m) => byMonth.get(m)), n: months.length, src: url };
    console.log(`  LBMA ${k}  ${months[0]} → ${months[months.length - 1]}  ${months.length} 個月`);
  }
  return out;
}

console.log(`台灣與貴金屬資料回補（${FROM} 起）\n`);
console.log('加權指數日線');
const taiex = await fetchTAIEX();
console.log('三大法人（每月最後一個交易日）');
const flows = await fetchForeignFlows(taiex);
console.log('LBMA 金銀定盤價');
const lbma = await fetchLBMA();

/* 加權指數收成月頻（月底收盤與當月成交金額合計） */
const idxByMonth = new Map();
const amtByMonth = new Map();
for (const r of taiex) {
  idxByMonth.set(r.d.slice(0, 7), r.idx);
  amtByMonth.set(r.d.slice(0, 7), (amtByMonth.get(r.d.slice(0, 7)) || 0) + (r.amt || 0));
}
const tmonths = [...idxByMonth.keys()].sort();

const out = {
  generatedAt: nowISO,
  sources: {
    taiex: '證交所 FMTQIK（發行量加權股價指數，日線逐月回補）',
    flows: '證交所 BFI82U（三大法人買賣金額，每月最後一個交易日）',
    metals: 'LBMA 定盤價（gold_pm / silver，1968 起）',
  },
  taiex: { months: tmonths, index: tmonths.map((m) => idxByMonth.get(m)), turnover: tmonths.map((m) => amtByMonth.get(m) ?? null), days: taiex.length },
  flows: { months: flows.map((f) => f.month), foreignNet: flows.map((f) => f.foreignNet), trustNet: flows.map((f) => f.trustNet), dealerNet: flows.map((f) => f.dealerNet) },
  metals: lbma,
};

await writeFile(path.join(OUT, 'taiwan.json'), JSON.stringify(out));
console.log(`\n寫入 data/taiwan.json`);
console.log(`  加權指數 ${tmonths[0]} → ${tmonths[tmonths.length - 1]}（${tmonths.length} 個月、${taiex.length} 個交易日）`);
console.log(`  三大法人 ${flows.length} 筆`);
console.log(`  LBMA 黃金 ${lbma.gold.n} 個月、白銀 ${lbma.silver.n} 個月`);
console.log(`  檔案大小 ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
