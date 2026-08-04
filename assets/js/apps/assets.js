/* 標的分析。每一支客觀上是什麼、歷史上發生過什麼。

   刻意的順序：先跌幅、再回本時間、最後才是報酬。
   一般網站的順序是反過來的，而那個順序正是讓人在下跌時賣掉的原因——
   他買進時只看過報酬，沒看過這東西跌起來的樣子。

   法規上這一頁最敏感，所以規則最硬：全母體、不排序、不評分、不標記優劣，
   一句「適合誰」都不寫。全部是可查證的事實陳述。 */

import * as A from '../analytics.js';
import * as P from '../plain.js';
import * as U from '../upstream.js';

const { el, fmt } = U;

document.getElementById('masthead').append(U.renderMasthead('assets/', '../../'));

/* 每一支的白話說明。這些是可查證的客觀描述（追蹤什麼指數、持有什麼），
   屬於「商品條款揭露」，不是評價。內扣費用寫的是公開資料，並標明是概數。 */
const DESC = {
  SPY:  { what: '美國最大的五百家上市公司', detail: '追蹤標普 500 指數。這五百家佔美國股市總市值大約八成。', fee: '0.09%' },
  QQQ:  { what: '那斯達克交易所最大的一百家非金融公司', detail: '科技股佔比很高，所以它的漲跌通常比標普 500 更劇烈。', fee: '0.20%' },
  VT:   { what: '全世界的股票', detail: '涵蓋已開發與新興市場共數千家公司，美國大約佔六成。', fee: '0.06%' },
  EFA:  { what: '美國以外的成熟市場股票', detail: '主要是歐洲、日本、澳洲。不含美國，也不含新興市場。', fee: '0.33%' },
  EEM:  { what: '新興市場股票', detail: '包含台灣、韓國、中國、印度、巴西等。台灣通常是前幾大權重。', fee: '0.72%' },
  AGG:  { what: '美國各種債券的混合', detail: '公債、房貸債、投資等級公司債都有，是美國債券市場的整體代表。', fee: '0.03%' },
  IEF:  { what: '七到十年期的美國公債', detail: '中等年期。利率變動時的價格波動比長天期小。', fee: '0.15%' },
  TLT:  { what: '二十年期以上的美國公債', detail: '年期最長，所以對利率最敏感。利率上升時它跌得比其他債券兇很多。', fee: '0.15%' },
  LQD:  { what: '體質較好的公司債', detail: '投資等級。違約機率低，但利率上升時一樣會跌。', fee: '0.14%' },
  HYG:  { what: '體質較差的公司債', detail: '非投資等級，俗稱垃圾債。利息高，但景氣轉壞時違約率會上升，跌幅接近股票。', fee: '0.49%' },
  GLD:  { what: '黃金', detail: '持有實體黃金的基金。不配息，價格完全來自金價本身。', fee: '0.40%' },
  VNQ:  { what: '美國不動產投資信託', detail: '持有一籃子收租的不動產公司。對利率和景氣同時敏感。', fee: '0.13%' },
  SPX:  { what: '標普 500 指數本身', detail: '指數不含股息，所以報酬會低於實際持有 SPY 的結果。', fee: null },
  TWII: { what: '台灣加權股價指數', detail: '台股全體上市公司的市值加權指數。', fee: null },
  SOX:  { what: '費城半導體指數', detail: '全球主要半導體公司。台股與它的連動很高。', fee: null },
  NDX:  { what: '那斯達克 100 指數', detail: '指數本身，不含股息。', fee: null },
  N225: { what: '日經 225 指數', detail: '日本代表性的股價指數。', fee: null },
  HSI:  { what: '恒生指數', detail: '香港代表性的股價指數。', fee: null },
  EUR:  { what: '歐元兌美元', detail: '數字上升代表歐元變強。', fee: null },
  JPY:  { what: '美元兌日圓', detail: '數字上升代表日圓變弱。', fee: null },
  CNY:  { what: '美元兌人民幣', detail: '數字上升代表人民幣變弱。', fee: null },
  TWD:  { what: '美元兌台幣', detail: '數字上升代表台幣變弱，你的美元資產換回台幣會變多。', fee: null },
  DXY:  { what: '美元指數', detail: '美元對六種主要貨幣的加權強弱。', fee: null },
  GOLD: { what: '黃金期貨價格', detail: '國際金價，美元計價、每盎司。', fee: null },
  SILVER: { what: '白銀期貨價格', detail: '工業用途比黃金高，所以波動通常更大。', fee: null },
  COPPER: { what: '銅期貨價格', detail: '工業金屬，常被當成景氣的溫度計。', fee: null },
  OIL:  { what: '西德州原油期貨', detail: '國際油價的主要指標之一。', fee: null },
  DBC:  { what: '一籃子大宗商品', detail: '能源、金屬、農產品的組合。', fee: '0.87%' },
  VIX:  { what: '波動率指數', detail: '市場對未來三十天波動的定價，俗稱恐慌指數。它不是可以直接買的東西。', fee: null },
  BTC:  { what: '比特幣', detail: '波動遠大於股票。這個站列出它是為了完整，不代表任何評價。', fee: null },
};

const GROUPS = [
  { key: 'equity', name: '股票', codes: ['SPY', 'QQQ', 'VT', 'EFA', 'EEM', 'SPX', 'NDX', 'SOX', 'TWII', 'N225', 'HSI'] },
  { key: 'bond',   name: '債券', codes: ['AGG', 'IEF', 'TLT', 'LQD', 'HYG'] },
  { key: 'metal',  name: '貴金屬', codes: ['GLD', 'GOLD', 'SILVER'] },
  { key: 'commod', name: '商品與不動產', codes: ['COPPER', 'OIL', 'DBC', 'VNQ'] },
  { key: 'fx',     name: '匯率', codes: ['TWD', 'DXY', 'JPY', 'EUR', 'CNY'] },
  { key: 'other',  name: '其他', codes: ['VIX', 'BTC'] },
];

init();

async function init() {
  const data = await U.loadData(['../../assets/data/snapshot.json']);
  if (data.__error) { U.renderError(document.getElementById('main'), data.__error); return; }
  const [snap] = data;

  document.getElementById('stamp').textContent = `資料更新於 ${snap.generatedAt}`;
  document.getElementById('foot').append(U.renderFoot(snap.generatedAt));

  const host = document.getElementById('groups');
  for (const g of GROUPS) {
    const items = g.codes.filter((c) => snap.assets[c]);
    if (!items.length) continue;
    const sec = el('section', { class: 'a-group2' },
      el('h2', { class: 'a-group2__name' }, g.name));
    const list = el('div', { class: 'a-cards' });
    for (const code of items) list.append(card(code, snap));
    sec.append(list);
    host.append(sec);
  }

  const mm = U.motion.init();
  U.motion.enter(mm);

  // 從首頁的標的連結進來時捲到對應的那一張並highlight
  if (location.hash) {
    const t = document.getElementById(location.hash.slice(1));
    if (t) { t.scrollIntoView({ block: 'center' }); t.dataset.focus = 'true'; }
  }
}

function card(code, snap) {
  const a = snap.assets[code];
  const d = DESC[code] || { what: a.name, detail: '', fee: null };
  const s = a.series;

  const worst = P.worstFall(s);
  const ann = P.annualised(s);
  const ann10 = P.annualised(s, 120);
  const swing = P.swingBand(s);
  const dd = A.drawdown(s);
  const y1 = A.changePct(s, 12);

  const isFx = a.cls === 'fx';
  const row = (k, v, note) => el('div', { class: 'a-card__row' },
    el('span', { class: 'a-card__k' }, k),
    el('span', { class: 'a-card__v u-num' }, v),
    note ? el('span', { class: 'a-card__note' }, note) : null);

  const facts = el('div', { class: 'a-card__facts' });

  /* 跌幅排最前面。這是刻意的：一般網站把報酬放最前面，
     而那個順序讓人在買進時從沒看過這東西跌起來的樣子。 */
  if (worst && !isFx) {
    facts.append(row('最慘跌過',
      `${Math.abs(worst.pct).toFixed(0)}%`,
      `${snap.axis[worst.fromIdx]} 到 ${snap.axis[worst.toIdx]}`));
    facts.append(row('回本花了',
      worst.recoverMonths ? `${(worst.recoverMonths / 12).toFixed(1)} 年` : '還沒回本',
      worst.recoverMonths ? '從高點算到重新站回同一水位' : '目前仍低於當時的高點'));
  }
  if (swing != null) {
    facts.append(row('一年上下大約', `${swing}%`, '過去的波動幅度，不是保證範圍'));
  }
  if (dd) {
    facts.append(row('現在離高點',
      dd.pct > -0.5 ? '就在高點' : `${Math.abs(dd.pct).toFixed(0)}%`,
      dd.monthsSincePeak ? `上次高點在 ${dd.monthsSincePeak} 個月前` : '本月就是高點'));
  }
  if (y1 != null) facts.append(row('過去一年', `${y1 >= 0 ? '+' : ''}${y1.toFixed(1)}%`, null));
  if (ann10 != null && !isFx) facts.append(row('近十年年化', `${ann10.toFixed(1)}%`, '含息還原'));
  if (ann != null && !isFx) {
    facts.append(row('全期年化', `${ann.toFixed(1)}%`,
      `${a.start} 起，共 ${a.n} 個月`));
  }
  if (d.fee) facts.append(row('內扣費用', d.fee, '公開資料的概數，實際以公開說明書為準'));

  return el('article', { class: 'a-card u-enter', id: code },
    el('div', { class: 'a-card__head' },
      el('h3', { class: 'a-card__name' }, d.what),
      el('span', { class: 'a-card__code u-num' }, code),
    ),
    d.detail ? el('p', { class: 'a-card__detail' }, d.detail) : null,
    facts,
    el('p', { class: 'a-card__src' },
      `資料期間 ${a.start} 至 ${a.end}`,
      isFx ? '。匯率沒有「報酬」的概念，所以不列年化。' : ''),
  );
}
