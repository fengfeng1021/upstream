/* 兩個資料來源的共用抓取層。兩者都在 build time 跑，抓完固化成 JSON commit 進 repo。

   為什麼不在瀏覽器抓：FRED 與 Yahoo 的端點都沒有 access-control-allow-origin，
   前端 fetch 一定被 CORS 擋掉。固化的額外好處是站台離線可用，而且每個數字都能被
   git 追溯到是哪一天抓的。

   這一層只負責「把原始序列拿回來，而且是對的」。所有衍生計算在 build-*.mjs 裡做。 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getText(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 45000);
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, signal: ac.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      await sleep(800 * (i + 1));
    }
  }
  throw lastErr;
}

/* ── FRED ────────────────────────────────────────────────────────────────────
   免金鑰的 CSV 端點。一次只問一個序列：混頻率的多序列請求會回傳一個 ZIP
   （實測 id=A,B,C 且 A 是日頻 B 是月頻時，回來的是 PK\x03\x04 開頭的壓縮檔），
   那個分支不值得處理，逐一抓反而簡單且可重試。

   注意 BAMLH0A0HYM2（ICE BofA 高收益利差）這類授權資料，公開 CSV 只給最近三年，
   給 cosd 也沒用。要長歷史的信用利差請改用 BAA10Y（Moody's，1986 起，不受限）。 */
export async function fred(id) {
  const txt = await getText(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(id)}`);
  if (txt.slice(0, 2) === 'PK') throw new Error(`${id}: 回傳 ZIP（多序列混頻率？）`);
  const lines = txt.trim().split('\n');
  const dates = [];
  const values = [];
  for (let i = 1; i < lines.length; i++) {
    const [d, v] = lines[i].split(',');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    // FRED 用 "." 表示該日無觀測（假日、停止發布）。保留日期、值記 null，
    // 讓下游自己決定要不要前向填補，不要在這一層偷偷決定。
    const n = v === '.' || v === '' || v == null ? null : Number(v);
    dates.push(d);
    values.push(n != null && isFinite(n) ? n : null);
  }
  if (!dates.length) throw new Error(`${id}: 空序列`);
  return { id, dates, values };
}

/* 把日頻／週頻序列收斂成月頻，取每月最後一個有值的觀測。
   用「最後一個」而不是「月平均」：這個站所有的百分位都是拿當下讀數跟歷史讀數比，
   月平均會把極端值抹平，於是 2008-10 的信用利差看起來永遠沒有當時那麼可怕。 */
export function toMonthlyLast(series) {
  const byMonth = new Map();
  for (let i = 0; i < series.dates.length; i++) {
    if (series.values[i] == null) continue;
    byMonth.set(series.dates[i].slice(0, 7), series.values[i]);
  }
  const months = [...byMonth.keys()].sort();
  return { id: series.id, months, values: months.map((m) => byMonth.get(m)) };
}

/* ── Yahoo Finance chart v8 ──────────────────────────────────────────────────
   一定要用 period1/period2，不能用 range=max。

   實測陷阱：range=max&interval=1mo 在長歷史上會靜默降頻成「季」資料。
   ^GSPC 回 168 點、1984-12→2026-08，間距直方圖是 {2:1, 3:166}，也就是 166 個
   三個月的跳格；同一支用 period1 問則回 499 個點、間距全部是 1。
   資料筆數看起來合理、起訖日期看起來合理，只有間距會露餡——這種錯誤不會拋例外，
   它會安靜地把每一個百分位算錯，所以下面 assertMonthly() 把它變成硬性檢查。

   第二個陷阱只打到期貨。GC=F／SI=F／HG=F／CL=F 用 interval=1mo 會有 43 個兩個月的
   跳格（換倉月份的月線是空的），但同一支用 interval=1d 抓回來再自己收月，
   313 個月一格不缺。所以期貨一律走 daily:true，由我們自己決定「月底」是哪一天，
   不把這個決定權交給對方的月線聚合。 */
export async function yahooMonthly(symbol, { from = '1985-01-01', daily = false } = {}) {
  const p1 = Math.floor(new Date(from + 'T00:00:00Z').getTime() / 1000);
  const p2 = Math.floor(Date.now() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`
    + `?period1=${p1}&period2=${p2}&interval=${daily ? '1d' : '1mo'}`;
  const j = JSON.parse(await getText(url));
  const r = j?.chart?.result?.[0];
  if (!r?.timestamp?.length) throw new Error(`${symbol}: 空序列`);

  /* 月線的時間戳是「該月第一個交易日的當地零點」。台北是 UTC+8，直接 toISOString()
     會把 2026-07-01 00:00+08 讀成 2026-06-30 16:00Z，整條台股序列平移一個月。
     用交易所自己回報的 gmtoffset 校正回當地時間再取月份。 */
  const off = (r.meta?.gmtoffset ?? 0) * 1000;
  const toMonth = (t) => new Date(t * 1000 + off).toISOString().slice(0, 7);

  const close = r.indicators?.quote?.[0]?.close || [];
  const adj = r.indicators?.adjclose?.[0]?.adjclose;

  /* 收成月頻：同一個月出現多次就留最後一次（月線本來就一格一月，日線則是取月底）。
     用 Map 覆寫而不是判斷月份是否改變，因為時間戳偶爾不是嚴格遞增。 */
  const byMonth = new Map();
  for (let i = 0; i < r.timestamp.length; i++) {
    const c = close[i];
    if (c == null || !isFinite(c)) continue;
    const a = adj?.[i];
    byMonth.set(toMonth(r.timestamp[i]), {
      price: Number(c.toFixed(4)),
      value: a != null && isFinite(a) ? Number(a.toFixed(4)) : Number(c.toFixed(4)),
    });
  }
  const months = [...byMonth.keys()].sort();
  const values = months.map((m) => byMonth.get(m).value);
  const prices = months.map((m) => byMonth.get(m).price);

  // 當月還沒收完，數字會隨當天變動。切掉，讓結論在一個月內是穩定的。
  const nowMonth = new Date().toISOString().slice(0, 7);
  while (months.length && months[months.length - 1] >= nowMonth) {
    months.pop(); values.pop(); prices.pop();
  }

  assertMonthly(symbol, months);
  return { symbol, months, values, prices, currency: r.meta?.currency || null };
}

/* 間距必須全部是 1 個月。這條檢查存在的唯一理由是上面那個降頻陷阱：
   它不拋例外、不改變資料長相，只把間距悄悄變成 3，所以只能用間距抓。 */
export function assertMonthly(tag, months) {
  const bad = [];
  for (let i = 1; i < months.length; i++) {
    const [y0, m0] = months[i - 1].split('-').map(Number);
    const [y1, m1] = months[i].split('-').map(Number);
    const gap = (y1 - y0) * 12 + (m1 - m0);
    if (gap !== 1) bad.push(`${months[i - 1]}→${months[i]}(${gap})`);
  }
  if (bad.length) {
    throw new Error(`${tag}: 月份序列不連續，共 ${bad.length} 處，前五處 ${bad.slice(0, 5).join(' ')}`);
  }
  return true;
}

/* 產生一條連續的月份軸，含頭含尾。 */
export function monthRange(start, end) {
  const out = [];
  let [y, m] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

/* 把一條 {months, values} 對齊到指定的月份軸。缺口用前值填補（最多 maxFill 個月），
   超過就留 null——總經序列有發布落差（CPI 次月才出），前向填補一兩個月是合理的，
   填補一年就是在編造資料。 */
export function alignTo(axis, series, { maxFill = 2 } = {}) {
  const map = new Map();
  for (let i = 0; i < series.months.length; i++) map.set(series.months[i], series.values[i]);
  const out = [];
  let held = null, heldFor = 0;
  for (const m of axis) {
    if (map.has(m) && map.get(m) != null) {
      held = map.get(m); heldFor = 0; out.push(held);
    } else if (held != null && heldFor < maxFill) {
      heldFor++; out.push(held);
    } else {
      out.push(null);
    }
  }
  return out;
}
