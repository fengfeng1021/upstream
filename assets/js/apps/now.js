/* 工具 4 ／ 現在的環境。

   兩條實測結論決定了這一頁的寫法：

   一、風險偏好類指標是**同期描述**，不是預測。VIX 的日變動對當日標普報酬的 R² 是 0.62，
       也就是一個含 VIX 的「風險指數」有六成只是在重述今天股市漲跌。所以這一頁的每一句話
       都是現在式，一個未來式動詞都沒有。

   二、「VIX 高＝該跑」在實測上是反的。把 9,146 個交易日按 VIX 水位分成五等分，
       最高的那一等分後續三個月報酬是**最好的**。所以這裡的 VIX 不塗紅、不塗綠，
       就是一支中性刻度加百分位。把恐慌指數畫成紅色警示是在傳達一個資料不支持的方向。

   三、殖利率曲線 43 年只有大約五個可用事件，而且最近三次裡兩次是明確失敗。
       n = 4 校準不出機率，所以這裡給的是事件表不是機率盤，而且失敗案例不放註腳。 */

import * as A from '../analytics.js';
import * as U from '../upstream.js';

const { el, fmt } = U;

document.getElementById('masthead').append(U.renderMasthead('now/', '../../'));

const root = {
  levels: document.getElementById('levels'),
  notes: document.getElementById('notes'),
  curveTable: document.getElementById('curveTable'),
  curveNote: document.getElementById('curveNote'),
  verdict: document.getElementById('verdict'),
  dial: document.getElementById('dial'),
  stamp: document.getElementById('stamp'),
};

const WINDOWS = [
  { value: 60, label: '5 年' },
  { value: 120, label: '10 年' },
  { value: 240, label: '20 年' },
  { value: 1e6, label: '全部' },
];

const state = { win: 240 };
let D = null;

const GAUGES = [
  { key: 'vix', name: '波動率指數', unit: '', digits: 2,
    note: '市場對未來 30 天波動的定價。實測顯示 VIX 最高的五分之一，後續三個月報酬是最好的，'
        + '所以這裡不把高 VIX 畫成警示色。' },
  { key: 'credit', name: 'Baa 公司債對公債利差（%）', unit: '', digits: 2,
    note: '信用利差。1986 年起。用 Moody’s 系列而不是業界常用的 ICE BofA 高收益利差，'
        + '因為後者在免金鑰端點上只回得到最近三年，拿它算長期百分位會算出一個假的數字。' },
  { key: 'nfci', name: '芝加哥聯準會金融情勢指數', unit: '', digits: 3,
    note: '正值＝金融情勢比歷史平均緊縮，負值＝寬鬆。1971 年起。' },
  { key: 'curve', name: '10 年減 2 年公債利差（%）', unit: '', digits: 2,
    note: '負值＝倒掛。下面那張表列出歷史上每一次倒掛，含沒有等到衰退的那幾次。' },
];

init();

async function init() {
  const data = await U.loadData(['../../assets/data/snapshot.json', '../../assets/data/taiwan.json']);
  if (data.__error) { U.renderError(document.getElementById('main'), data.__error); return; }
  const [snap] = data;

  D = {
    axis: snap.axis, generatedAt: snap.generatedAt,
    series: {
      vix: snap.assets.VIX.series,
      credit: snap.macro.credit.series,
      nfci: snap.macro.nfci.series,
      curve: snap.macro.curve102.series,
    },
    recession: snap.macro.recession.series,
  };

  root.stamp.append(U.datestamp(snap.generatedAt));
  document.getElementById('foot').append(U.renderFoot(snap.generatedAt));

  renderDial();
  render();
  renderCurveTable();

  const mm = U.motion.init();
  U.motion.enter(mm);
  U.motion.rise(mm, root.levels);
  U.paintGauges();
}

function renderDial() {
  root.dial.innerHTML = '';
  root.dial.append(U.renderDial({
    label: '百分位視窗',
    options: WINDOWS.map((w) => ({ value: w.value, label: w.label })),
    value: state.win,
    note: '同一個值換一個視窗就可能從高變低，所以視窗永遠寫在數字旁邊。'
        + '五年與二十年給出差很多的判讀時，兩個都會畫出來。',
    onChange: (v) => { state.win = v; render(); },
  }));
}

function render() {
  root.levels.innerHTML = '';
  root.notes.innerHTML = '';
  for (const g of GAUGES) {
    const s = D.series[g.key];
    root.levels.append(el('div', { class: 'a-level' },
      el('h3', { class: 'a-level__name' }, g.name),
      U.renderGauge({ series: s, window: state.win, name: '', size: 'md', digits: g.digits, dual: true }),
    ));
    root.notes.append(el('div', { class: 'a-note' },
      el('h4', { class: 'a-note__name' }, g.name),
      el('p', { class: 'u-note' }, g.note),
    ));
  }
  U.paintGauges(root.levels);
  renderVerdict();
}

/* 倒掛事件表。定義：10 年減 2 年利差連續兩個月為負視為一次倒掛的開始，
   連續兩個月轉正視為結束。之後找 USREC 的第一個衰退月，算領先期數。
   找不到就照實寫「沒有等到衰退」，那一列不加任何修飾。 */
function episodes() {
  const c = D.series.curve, rec = D.recession, ax = D.axis;
  const out = [];
  let start = null, neg = 0, pos = 0;
  for (let i = 0; i < c.length; i++) {
    if (c[i] == null) continue;
    if (c[i] < 0) {
      neg++; pos = 0;
      if (start == null && neg >= 2) start = i - 1;
    } else {
      pos++; neg = 0;
      if (start != null && pos >= 2) { out.push({ from: start, to: i - 2 }); start = null; }
    }
  }
  if (start != null) out.push({ from: start, to: null });

  for (const e of out) {
    e.fromM = ax[e.from];
    e.toM = e.to == null ? null : ax[e.to];
    // 倒掛開始之後的第一個衰退月
    let hit = null;
    for (let i = e.from; i < rec.length; i++) {
      if (rec[i] === 1) { hit = i; break; }
    }
    // 只認 48 個月內的衰退，超過就不是同一件事
    if (hit != null && hit - e.from <= 48) { e.recM = ax[hit]; e.lead = hit - e.from; }
    else { e.recM = null; e.lead = null; }
    e.months = (e.to == null ? c.length - 1 : e.to) - e.from + 1;
  }
  return out;
}

function renderCurveTable() {
  const eps = episodes();
  const t = root.curveTable;
  t.innerHTML = '';
  t.append(el('thead', {}, el('tr', {},
    el('th', {}, '倒掛期間'), el('th', {}, '持續'), el('th', {}, '之後的衰退'), el('th', {}, '領先'))));
  const body = el('tbody');
  for (const e of eps) {
    body.append(el('tr', {},
      el('td', {}, `${e.fromM} 至 ${e.toM || '仍在'}`),
      el('td', {}, `${e.months} 個月`),
      el('td', { 'data-sig': String(!!e.recM) }, e.recM || '沒有等到衰退'),
      el('td', {}, e.lead == null ? '--' : `${e.lead} 個月`),
    ));
  }
  t.append(body);

  const hit = eps.filter((e) => e.recM).length;
  root.curveNote.textContent =
    `軸上共 ${eps.length} 次倒掛，其中 ${hit} 次在 48 個月內接到 NBER 認定的衰退，`
    + `${eps.length - hit} 次沒有。事件數這麼少的時候算不出可靠的機率，`
    + `所以這一頁不給機率，只給紀錄。衰退認定本身也落後半年以上。`;
}

function renderVerdict() {
  const p = (k) => A.percentile(D.series[k], { window: state.win });
  const v = (k) => A.lastValue(D.series[k]);
  const winLabel = WINDOWS.find((w) => w.value === state.win)?.label ?? '';

  const now = `波動率指數 ${fmt.num(v('vix'), 2)}（${winLabel}第 ${p('vix')?.pct ?? '--'} 百分位）、`
    + `Baa 對公債利差 ${fmt.num(v('credit'), 2)}%（第 ${p('credit')?.pct ?? '--'} 百分位）、`
    + `金融情勢指數 ${fmt.num(v('nfci'), 3)}（第 ${p('nfci')?.pct ?? '--'} 百分位）、`
    + `10 年減 2 年利差 ${fmt.num(v('curve'), 2)}%（第 ${p('curve')?.pct ?? '--'} 百分位）。`;

  const link = `這四個讀數描述的是同一個當下，它們之間不是因果順序。`
    + `金融情勢指數為負代表比歷史平均寬鬆，利差為正代表沒有倒掛。`;

  const edge = `以上全部是現況與歷史百分位，沒有任何一項是預測。`
    + `百分位隨視窗改變，視窗已標在每一個數字旁邊。不構成任何建議。`;

  root.verdict.innerHTML = '';
  root.verdict.append(U.renderVerdict({ now, link, edge }));
}
