/* 判讀層。snapshot.json 是原始序列，這裡把它變成「讀數」。

   這個檔案是**唯一一份**：瀏覽器直接 import 它，`tools/` 底下的稽核腳本也 import 同一個檔案
   （純 ES module，沒有 Node API）。目的是讓稽核跑的數字與畫面上顯示的數字
   是同一段程式算出來的。分兩份寫遲早會對不起來，而對不起來的財經數字比沒有數字更糟。

   通則：
   - 任何回傳讀數的函式都必須同時回傳它的樣本數 n。沒有 n 的百分位是假的精度。
   - 缺值一律傳播成 null，不靜默當 0。0 在報酬率的語境是「沒漲沒跌」，不是「不知道」。 */

/* ── 基本工具 ─────────────────────────────────────────────────────────────── */

export const lastIndex = (arr) => {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return i;
  return -1;
};

export const lastValue = (arr) => {
  const i = lastIndex(arr);
  return i < 0 ? null : arr[i];
};

/** 從 at（含）往回 k 格的變動率，%。缺任一端就回 null。 */
export function changePct(series, k, at = null) {
  const i = at == null ? lastIndex(series) : at;
  const j = i - k;
  if (i < 0 || j < 0) return null;
  const a = series[j], b = series[i];
  if (a == null || b == null || a === 0) return null;
  return (b / a - 1) * 100;
}

/** 從 at 往回 k 格的絕對差。用於本身已是百分比的序列（殖利率、利差）。 */
export function changeAbs(series, k, at = null) {
  const i = at == null ? lastIndex(series) : at;
  const j = i - k;
  if (i < 0 || j < 0) return null;
  const a = series[j], b = series[i];
  if (a == null || b == null) return null;
  return b - a;
}

/** 年增率，%。月頻序列固定回看 12 格。 */
export const yoy = (series, at = null) => changePct(series, 12, at);

/* ── 百分位 ───────────────────────────────────────────────────────────────
   「現在這個數字在歷史上算高還是低」。這是全站最常用的讀數，因為它把任何單位的
   任何指標都換算成同一把尺：0 到 100。

   用「小於等於當前值的樣本佔比」定義，不做內插。內插會給出 63.7 這種看起來
   很精確的數字，但樣本只有 300 個月時，第 63 與第 64 百分位差不到一個月，
   那個小數點是假的。一律回傳整數並附上 n。 */
export function percentile(series, { window = null, at = null } = {}) {
  const i = at == null ? lastIndex(series) : at;
  if (i < 0) return null;
  const cur = series[i];
  if (cur == null) return null;
  const from = window == null ? 0 : Math.max(0, i - window + 1);
  const hist = [];
  for (let k = from; k <= i; k++) if (series[k] != null) hist.push(series[k]);
  if (hist.length < 24) return null; // 樣本少於兩年，百分位沒有意義
  let le = 0;
  for (const v of hist) if (v <= cur) le++;
  return { pct: Math.round((le / hist.length) * 100), n: hist.length, value: cur };
}

/** 分位點。回傳指定機率處的值，線性內插（這裡內插是對的：我們在描述分布本身）。 */
export function quantiles(values, ps = [0, 0.25, 0.5, 0.75, 1]) {
  const v = values.filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  return ps.map((p) => {
    const idx = p * (v.length - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return lo === hi ? v[lo] : v[lo] + (v[hi] - v[lo]) * (idx - lo);
  });
}

export function mean(values) {
  const v = values.filter((x) => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function stdev(values) {
  const v = values.filter((x) => x != null);
  if (v.length < 2) return null;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
}

/** z 分數。用於把不同單位的指標合成一個綜合讀數。 */
export function zscore(series, { window = null, at = null } = {}) {
  const i = at == null ? lastIndex(series) : at;
  if (i < 0 || series[i] == null) return null;
  const from = window == null ? 0 : Math.max(0, i - window + 1);
  const hist = series.slice(from, i + 1).filter((x) => x != null);
  if (hist.length < 24) return null;
  const m = hist.reduce((a, b) => a + b, 0) / hist.length;
  const sd = Math.sqrt(hist.reduce((a, b) => a + (b - m) ** 2, 0) / (hist.length - 1));
  if (!sd) return null;
  return (series[i] - m) / sd;
}

/* ── 趨勢 ─────────────────────────────────────────────────────────────────
   注意：這裡刻意不做任何均線交叉、動能指標、支撐壓力。金管會明列的四項紅線
   （買賣價位、支撐壓力點、停損停利價位、買賣轉折價位）一項都不碰。
   下面兩個函式回答的是「現在離高點多遠」與「多久沒有創新高」，都是對已發生事實的
   描述，不含任何進出場含意。 */

/** 從歷史最高點的回檔幅度，%（負值）。 */
export function drawdown(series, at = null) {
  const i = at == null ? lastIndex(series) : at;
  if (i < 0 || series[i] == null) return null;
  let peak = -Infinity, peakAt = -1;
  for (let k = 0; k <= i; k++) {
    if (series[k] != null && series[k] > peak) { peak = series[k]; peakAt = k; }
  }
  if (peak <= 0) return null;
  return { pct: (series[i] / peak - 1) * 100, peakAt, monthsSincePeak: i - peakAt };
}

/** 滾動報酬序列：每一格是「從 k 個月前到該格」的報酬率。用來畫分布。 */
export function rollingReturns(series, k) {
  const out = new Array(series.length).fill(null);
  for (let i = k; i < series.length; i++) {
    const a = series[i - k], b = series[i];
    if (a != null && b != null && a !== 0) out[i] = (b / a - 1) * 100;
  }
  return out;
}

/** 兩條序列的比值，對齊後逐格相除。 */
export function ratio(numSeries, denSeries) {
  const out = new Array(numSeries.length).fill(null);
  for (let i = 0; i < numSeries.length; i++) {
    const a = numSeries[i], b = denSeries[i];
    if (a != null && b != null && b !== 0) out[i] = a / b;
  }
  return out;
}

/** 月報酬序列（%）。相關係數與波動度都建立在這上面。 */
export function monthlyReturns(series) {
  const out = new Array(series.length).fill(null);
  for (let i = 1; i < series.length; i++) {
    const a = series[i - 1], b = series[i];
    if (a != null && b != null && a !== 0) out[i] = (b / a - 1) * 100;
  }
  return out;
}

/** 皮爾森相關係數，只取兩邊都有值的月份。回傳 {r, n}。 */
export function correlation(a, b, { window = null, at = null } = {}) {
  const end = at == null ? Math.min(a.length, b.length) - 1 : at;
  const start = window == null ? 0 : Math.max(0, end - window + 1);
  const xs = [], ys = [];
  for (let i = start; i <= end; i++) {
    if (a[i] != null && b[i] != null) { xs.push(a[i]); ys.push(b[i]); }
  }
  if (xs.length < 24) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
  const my = ys.reduce((s, v) => s + v, 0) / ys.length;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < xs.length; i++) {
    const px = xs[i] - mx, py = ys[i] - my;
    num += px * py; dx += px * px; dy += py * py;
  }
  if (!dx || !dy) return null;
  return { r: num / Math.sqrt(dx * dy), n: xs.length };
}


/* ── 落後關聯 ─────────────────────────────────────────────────────────────
   這個站的核心計算。

   corrLag(a, b, lag) 問的是：「a 這個月的變動，跟 b 在 lag 個月之後的變動，有多少關聯？」
   lag = 0 是同期，lag = 1 是 a 領先 b 一個月。

   為什麼一定要附上 t 值：r = 0.24 在 n = 40 時不顯著、在 n = 400 時顯著，
   只印 r 會讓使用者把樣本不足誤讀成「關聯弱」，或把噪音誤讀成「關聯強」。
   顯著性門檻用 |t| > 2（雙尾約 5%），這是通例不是我們挑的數字。 */
export function corrLag(a, b, lag = 0, { from = 0, to = null } = {}) {
  const end = to == null ? Math.min(a.length, b.length) - 1 : to;
  const xs = [], ys = [];
  for (let i = Math.max(0, from); i <= end - lag; i++) {
    if (a[i] != null && b[i + lag] != null) { xs.push(a[i]); ys.push(b[i + lag]); }
  }
  if (xs.length < 24) return { r: null, n: xs.length, t: null, significant: false, insufficient: true };
  const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
  const my = ys.reduce((s, v) => s + v, 0) / ys.length;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < xs.length; i++) {
    const px = xs[i] - mx, py = ys[i] - my;
    num += px * py; dx += px * px; dy += py * py;
  }
  if (!dx || !dy) return { r: null, n: xs.length, t: null, significant: false, insufficient: true };
  const r = num / Math.sqrt(dx * dy);
  const t = r * Math.sqrt((xs.length - 2) / (1 - r * r));
  return { r, n: xs.length, t, significant: Math.abs(t) > 2, insufficient: false };
}

/* 傳導鏈的四環。回傳每一環在 lag 0 到 3 的關聯，以及該環是否「量得到」。

   環的定義刻意保持可檢查：每一環都是相鄰兩個節點的月報酬，沒有任何合成指標、
   沒有任何權重、沒有任何平滑。使用者要能自己拿原始序列重算出同樣的數字。

   實測結論（1990 起、四個子期間全部成立）：lag 0 全部顯著，lag 1 以後全部趨近於零。
   這條鏈是同時性的，不是先後性的。介面的責任是把這件事講清楚，
   而不是把 lag 1 那幾欄藏起來讓鏈看起來比較有用。 */
export const CHAIN_STEPS = [
  { key: 'usd-twd',  from: 'usd',  to: 'twd',  label: '美元 → 台幣' },
  { key: 'twd-flow', from: 'twd',  to: 'flow', label: '台幣 → 外資' },
  { key: 'flow-tw',  from: 'flow', to: 'tw',   label: '外資 → 台股' },
];

export function measureChain(nodes, { from = 0, to = null, lags = [0, 1, 2, 3] } = {}) {
  return CHAIN_STEPS.map((step) => {
    const a = nodes[step.from], b = nodes[step.to];
    const byLag = {};
    for (const L of lags) byLag[L] = (a && b) ? corrLag(a, b, L, { from, to }) : { r: null, n: 0, insufficient: true };
    const same = byLag[0];
    return {
      ...step,
      byLag,
      // 「量得到」＝同期關聯顯著。斷環不是錯誤狀態，它是這個站最重要的輸出之一。
      measurable: !!same && same.significant,
      r: same?.r ?? null,
      n: same?.n ?? 0,
      t: same?.t ?? null,
      // 落後期是否有任何一期顯著。實測是沒有，但這件事必須每次重算而不是寫死。
      anyLead: lags.filter((L) => L > 0).some((L) => byLag[L]?.significant),
    };
  });
}

/* ── 多視窗變動 ───────────────────────────────────────────────────────────
   工具 2 的核心。三個視窗並排，一致與不一致都要看得見。

   刻意不提供自訂視窗、不提供最佳化：實測顯示最佳回看期不可辨識
   （2008–16 是 24 個月最好、2017–26 是 3 個月最好），開放調整等於邀請使用者做參數挖掘。
   固定 3／6／12 是為了讓「一致與否」這件事可比較，不是因為這三個數字特別好。 */
export const WINDOWS = [3, 6, 12];

export function multiWindow(series, windows = WINDOWS, at = null) {
  const vals = windows.map((k) => ({ k, pct: changePct(series, k, at) }));
  const known = vals.filter((v) => v.pct != null);
  const signs = new Set(known.map((v) => (v.pct >= 0 ? 1 : -1)));
  return {
    values: vals,
    agree: known.length === windows.length && signs.size === 1,
    direction: signs.size === 1 ? [...signs][0] : 0,
    // 不一致時指出哪一個視窗跟其他人不同（只有恰好一個異類時才說得出來）
    odd: (() => {
      if (known.length < 3 || signs.size !== 2) return null;
      const pos = known.filter((v) => v.pct >= 0), neg = known.filter((v) => v.pct < 0);
      if (pos.length === 1) return pos[0].k;
      if (neg.length === 1) return neg[0].k;
      return null;
    })(),
  };
}

/* ── 雙視窗百分位 ─────────────────────────────────────────────────────────
   實測顯示同一個值換視窗會反轉訊息：10 年減 3 個月利差在 5 年視窗是第 80 百分位、
   20 年視窗是第 37 百分位；美元廣義指數在 5 年視窗第 33、20 年視窗第 82。
   所以視窗不一致時**兩個都印**，不一致本身就是資訊。 */
export function dualPercentile(series, { shortWin = 60, longWin = 240, at = null, divergeAt = 25 } = {}) {
  const s = percentile(series, { window: shortWin, at });
  const l = percentile(series, { window: longWin, at });
  const diverges = s && l && Math.abs(s.pct - l.pct) >= divergeAt;
  return { short: s, long: l, diverges, shortWin, longWin };
}

/* 台幣計價換算。台灣投資人持有美元資產，真正承受的是資產報酬乘上匯率變動。
   usdtwd 是「一美元換多少台幣」，所以美元資產的台幣價值 = 原幣價格 × usdtwd。 */
export function inTWD(series, usdtwd) {
  const out = new Array(series.length).fill(null);
  for (let i = 0; i < series.length; i++) {
    if (series[i] != null && usdtwd[i] != null) out[i] = series[i] * usdtwd[i];
  }
  return out;
}
