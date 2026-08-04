/* 工具 3 ／ 貴金屬。

   這一頁存在的理由是一個被普遍誤診的說法：「黃金和實質利率的關係失效了」。
   實測（DFII10 與黃金月資料）顯示這句話一半對一半錯：
     水位關係：2005-2021 R² 高，2024-2026 掉到接近 0——確實崩了。
     變動關係：每一個子期間的 beta 都是負的、符號一致，2022–23 還是最強的一段。
   崩掉的是截距，不是敏感度。

   所以這裡畫 beta 不畫合理價。合理價模型在過去兩年會一路喊賣，而黃金漲了六成以上。
   把兩種算法並排、把 R² 崩掉的那幾格照實印出來，比給一個看起來很篤定的估值有用得多。 */

import * as A from '../analytics.js';
import * as U from '../upstream.js';

const { el, fmt } = U;

document.getElementById('masthead').append(U.renderMasthead('metal/', '../../'));

const root = {
  scatter: document.getElementById('scatter'),
  scatterNote: document.getElementById('scatterNote'),
  scatterStamp: document.getElementById('scatterStamp'),
  betaTable: document.getElementById('betaTable'),
  levels: document.getElementById('levels'),
  verdict: document.getElementById('verdict'),
  dial: document.getElementById('dial'),
  stamp: document.getElementById('stamp'),
};

const PERIODS = [
  { value: 'all', label: '全部',      from: '2003-01', to: null },
  { value: 'a',   label: '2003-2011', from: '2003-01', to: '2011-12' },
  { value: 'b',   label: '2012-2021', from: '2012-01', to: '2021-12' },
  { value: 'c',   label: '2022-2023', from: '2022-01', to: '2023-12' },
  { value: 'd',   label: '2024 至今',  from: '2024-01', to: null },
];

const state = { period: 'all' };
let D = null;

init();

async function init() {
  const data = await U.loadData(['../../assets/data/snapshot.json', '../../assets/data/taiwan.json']);
  if (data.__error) { U.renderError(document.getElementById('main'), data.__error); return; }
  const [snap, tw] = data;

  const axis = snap.axis;
  const idx = new Map(axis.map((m, i) => [m, i]));
  const put = (months, values) => {
    const out = new Array(axis.length).fill(null);
    for (let i = 0; i < months.length; i++) {
      const k = idx.get(months[i]);
      if (k != null && values[i] != null) out[k] = values[i];
    }
    return out;
  };

  D = {
    axis, idx, generatedAt: snap.generatedAt,
    // LBMA 定盤價：1968 起，且是定盤基準而不是滾動期貨合約（Yahoo GC=F 只到 2000 且有換倉跳空）
    gold: put(tw.metals.gold.months, tw.metals.gold.values),
    silver: put(tw.metals.silver.months, tw.metals.silver.values),
    goldFull: tw.metals.gold,
    silverFull: tw.metals.silver,
    real: snap.macro.real10.series,
  };
  D.goldRet = A.monthlyReturns(D.gold);
  D.realChg = D.real.map((_, i) => A.changeAbs(D.real, 1, i));

  root.stamp.append(U.datestamp(snap.generatedAt));
  document.getElementById('foot').append(U.renderFoot(snap.generatedAt));

  renderDial();
  renderLevels();
  update();

  const mm = U.motion.init();
  U.motion.enter(mm);
  U.motion.rise(mm, root.levels);
  U.paintGauges();
  window.addEventListener('resize', () => { clearTimeout(D._t); D._t = setTimeout(update, 180); });
}

const range = () => {
  const p = PERIODS.find((x) => x.value === state.period);
  return { from: D.idx.get(p.from) ?? 0, to: p.to ? (D.idx.get(p.to) ?? D.axis.length - 1) : D.axis.length - 1, label: p.label };
};

/* 最小平方迴歸。回傳斜率（beta）、截距、R²、樣本數。
   beta 的單位是「實質利率每變動 1 個百分點，黃金當月變動幾 %」。 */
function regress(xs, ys) {
  const n = xs.length;
  if (n < 12) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (!sxx || !syy) return null;
  const beta = sxy / sxx;
  const r = sxy / Math.sqrt(sxx * syy);
  return { beta, intercept: my - beta * mx, r2: r * r, r, n, mx, my };
}

function pairs(from, to) {
  const xs = [], ys = [];
  for (let i = from; i <= to; i++) {
    if (D.realChg[i] != null && D.goldRet[i] != null) { xs.push(D.realChg[i]); ys.push(D.goldRet[i]); }
  }
  return { xs, ys };
}

/* 水位相關：同一段期間，黃金價格與實質利率水位的相關係數。
   這是「崩掉的那一個」，跟上面的變動 beta 並排才看得出差別在哪。 */
function levelCorr(from, to) {
  const xs = [], ys = [];
  for (let i = from; i <= to; i++) {
    if (D.real[i] != null && D.gold[i] != null) { xs.push(D.real[i]); ys.push(Math.log(D.gold[i])); }
  }
  return regress(xs, ys);
}

function update() {
  const { from, to, label } = range();
  const { xs, ys } = pairs(from, to);
  const fit = regress(xs, ys);
  drawScatter(xs, ys, fit);

  root.scatterStamp.innerHTML = '';
  root.scatterStamp.append(el('span', { class: 'u-datestamp' }, `期間 ${label}`));
  root.scatterNote.textContent = fit
    ? `每一點是一個月。斜率 ${fit.beta.toFixed(1)} 代表實質利率每上升 1 個百分點，`
      + `同月黃金平均變動 ${fit.beta.toFixed(1)}%。樣本 ${fit.n} 個月，R² ${fit.r2.toFixed(2)}。`
    : '這段期間的樣本不足以估計。';

  renderBetaTable();
  renderVerdict(fit, label);
}

function drawScatter(xs, ys, fit) {
  const c = root.scatter;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = c.clientWidth || 720, h = Math.round((c.clientWidth || 720) * 0.62);
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  c.style.height = h + 'px';
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const css = getComputedStyle(document.documentElement);
  const col = (v, f) => css.getPropertyValue(v).trim() || f;
  const pad = { l: 46, r: 12, t: 12, b: 34 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  if (!xs.length) return;

  const xr = Math.max(0.35, Math.max(...xs.map(Math.abs)) * 1.05);
  const yr = Math.max(6, Math.max(...ys.map(Math.abs)) * 1.05);
  const X = (v) => pad.l + ((v + xr) / (2 * xr)) * iw;
  const Y = (v) => pad.t + ih - ((v + yr) / (2 * yr)) * ih;

  // 軸與零線。零線比刻度線重，因為正負是這張圖的重點。
  ctx.strokeStyle = col('--rule-faint', '#DEDDD7'); ctx.lineWidth = 1;
  for (let k = -2; k <= 2; k++) {
    if (!k) continue;
    const gx = X(xr * k / 2.5), gy = Y(yr * k / 2.5);
    ctx.beginPath(); ctx.moveTo(gx, pad.t); ctx.lineTo(gx, pad.t + ih); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pad.l, gy); ctx.lineTo(pad.l + iw, gy); ctx.stroke();
  }
  ctx.strokeStyle = col('--rule-strong', '#9B9A92');
  ctx.beginPath(); ctx.moveTo(X(0), pad.t); ctx.lineTo(X(0), pad.t + ih); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(pad.l, Y(0)); ctx.lineTo(pad.l + iw, Y(0)); ctx.stroke();

  // 點
  ctx.fillStyle = col('--ink-3', '#5A5E56');
  ctx.globalAlpha = 0.55;
  for (let i = 0; i < xs.length; i++) {
    ctx.beginPath(); ctx.arc(X(xs[i]), Y(ys[i]), 2.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 迴歸線。這是這張圖唯一用強調色的東西：它就是答案。
  if (fit) {
    ctx.strokeStyle = col('--accent', '#8F4E04'); ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(X(-xr), Y(fit.intercept + fit.beta * -xr));
    ctx.lineTo(X(xr), Y(fit.intercept + fit.beta * xr));
    ctx.stroke();
  }

  // 刻度文字
  ctx.fillStyle = col('--ink-3', '#5A5E56');
  ctx.font = '11px ui-monospace, Consolas, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('實質利率月變動（個百分點）', pad.l + iw / 2, pad.t + ih + 16);
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.fillText(`+${yr.toFixed(0)}%`, pad.l - 6, Y(yr * 0.92));
  ctx.fillText('0', pad.l - 6, Y(0));
  ctx.fillText(`-${yr.toFixed(0)}%`, pad.l - 6, Y(-yr * 0.92));
  ctx.save();
  ctx.translate(12, pad.t + ih / 2); ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('黃金月變動', 0, 0);
  ctx.restore();
}

/* 逐期間表。兩欄並排：變動 beta（沒崩）與水位相關（崩了）。
   R² 掉到 0 的那幾格照實印出來，那正是這一頁要講的事。 */
function renderBetaTable() {
  const t = root.betaTable;
  t.innerHTML = '';
  t.append(el('thead', {}, el('tr', {},
    el('th', {}, '期間'), el('th', {}, '敏感度'), el('th', {}, '變動 R²'), el('th', {}, '水位相關'), el('th', {}, '樣本'))));
  const body = el('tbody');
  for (const p of PERIODS) {
    const from = D.idx.get(p.from) ?? 0;
    const to = p.to ? (D.idx.get(p.to) ?? D.axis.length - 1) : D.axis.length - 1;
    const { xs, ys } = pairs(from, to);
    const fit = regress(xs, ys);
    const lv = levelCorr(from, to);
    body.append(el('tr', { 'data-cur': String(p.value === state.period) },
      el('td', {}, p.label),
      el('td', { 'data-sig': fit ? String(Math.abs(fit.r * Math.sqrt((fit.n - 2) / (1 - fit.r * fit.r))) > 2) : null },
        fit ? `${fit.beta.toFixed(1)}%` : '--'),
      el('td', {}, fit ? fit.r2.toFixed(2) : '--'),
      el('td', {}, lv ? lv.r.toFixed(2) : '--'),
      el('td', {}, fit ? String(fit.n) : '--'),
    ));
  }
  t.append(body);
}

function renderDial() {
  root.dial.innerHTML = '';
  root.dial.append(U.renderDial({
    label: '估計期間',
    options: PERIODS.map((p) => ({ value: p.value, label: p.label })),
    value: state.period,
    note: '實質利率序列從 2003 年開始（TIPS 殖利率的起點），所以這一頁的期間不會比它更早。',
    onChange: (v) => { state.period = v; update(); },
  }));
}

function renderLevels() {
  root.levels.innerHTML = '';
  const items = [
    { s: D.gold, name: '黃金（LBMA 定盤，美元／盎司）', digits: 0, full: D.goldFull },
    { s: D.silver, name: '白銀（LBMA 定盤，美元／盎司）', digits: 2, full: D.silverFull },
    { s: D.real, name: '美國 10 年期實質利率（%）', digits: 2 },
    { s: A.ratio(D.gold, D.silver), name: '金銀比', digits: 1 },
  ];
  for (const it of items) {
    root.levels.append(el('div', { class: 'a-level' },
      el('h3', { class: 'a-level__name' }, it.name),
      U.renderGauge({ series: it.s, window: 240, name: '', size: 'md', digits: it.digits, dual: true }),
      it.full ? el('p', { class: 'u-note', style: 'margin-top:var(--s-3)' },
        `完整序列 ${it.full.months[0]} 起，共 ${it.full.n} 個月`) : null,
    ));
  }
}

function renderVerdict(fit, label) {
  const gp = A.dualPercentile(D.gold);
  const rp = A.dualPercentile(D.real);
  const gold = A.lastValue(D.gold);
  const real = A.lastValue(D.real);

  const now = `黃金 ${fmt.group(gold, 0)} 美元，位於近 20 年的第 ${gp.long?.pct ?? '--'} 百分位；`
    + `美國 10 年期實質利率 ${fmt.num(real, 2)}%，位於近 20 年的第 ${rp.long?.pct ?? '--'} 百分位、`
    + `近 5 年的第 ${rp.short?.pct ?? '--'} 百分位。`;

  const link = fit
    ? `在 ${label} 這段期間，實質利率每上升 1 個百分點，同月黃金平均變動 ${fit.beta.toFixed(1)}%，`
      + `樣本 ${fit.n} 個月。這個符號在每一個子期間都相同，但同一段期間的水位相關在近幾年掉到接近零。`
      + `敏感度與水位是兩件事。`
    : '這段期間的樣本不足以估計敏感度。';

  const edge = '以上是月資料的歷史關聯，不是估值模型，也不是合理價。'
    + '用水位去估黃金合理價的做法在 2024 年之後失去解釋力，站上不採用。'
    + '相關不等於因果，歷史關聯不預測未來，不構成任何建議。';

  root.verdict.innerHTML = '';
  root.verdict.append(U.renderVerdict({ now, link, edge }));
}
