/* 工具 1 ／ 上游。這個站的招牌。

   產品本體是一個切換：「你以為的」對「實際量到的」。
   兩種模式共用完全相同的 DOM 與樣式，只有時間軸不同——差別必須只在時間，
   否則對照就不成立，使用者會以為是兩張不同的圖。 */

import * as A from '../analytics.js';
import * as U from '../upstream.js';

const { el, fmt } = U;

const root = {
  chain: document.getElementById('chain'),
  matrix: document.getElementById('matrix'),
  matrixNote: document.getElementById('matrixNote'),
  matrixStamp: document.getElementById('matrixStamp'),
  dial: document.getElementById('dial'),
  verdict: document.getElementById('verdict'),
  levels: document.getElementById('levels'),
  stamp: document.getElementById('stamp'),
  modeNote: document.getElementById('modeNote'),
};

document.getElementById('masthead').append(U.renderMasthead('chain/', '../../'));

const NODES = [
  { key: 'usd',  name: '美元',   full: '美元廣義貿易加權指數', unit: '',   digits: 1,
    note: '上升＝美元對主要貿易對手走強' },
  { key: 'twd',  name: '台幣',   full: '美元兌台幣',           unit: '',   digits: 2,
    note: '數字上升＝台幣貶值' },
  { key: 'flow', name: '外資',   full: '外資買賣超佔成交金額',  unit: '%',  digits: 1,
    note: '正值＝當月外資淨買超' },
  { key: 'tw',   name: '台股',   full: '發行量加權股價指數',    unit: '',   digits: 0,
    note: '' },
];

/* 估計期間。切子期間是為了讓使用者自己檢查「這個結論在每一段裡都成立嗎」，
   不是為了讓他挑一段最好看的。四段的切點是等距的整數年，不是我們挑出來的轉折點。 */
const PERIODS = [
  { value: 'all',   label: '全部',      from: null,      to: null },
  { value: 'p1',    label: '2006-2011', from: '2006-01', to: '2011-12' },
  { value: 'p2',    label: '2012-2017', from: '2012-01', to: '2017-12' },
  { value: 'p3',    label: '2018-2021', from: '2018-01', to: '2021-12' },
  { value: 'p4',    label: '2022 至今',  from: '2022-01', to: null },
];

const LAGS = [0, 1, 2, 3];
const state = { mode: 'believe', period: 'all' };
let D = null;   // { axis, nodes, levels, generatedAt, ... }
let mm = null;

init();

async function init() {
  const data = await U.loadData(['../../assets/data/snapshot.json', '../../assets/data/taiwan.json']);
  if (data.__error) { U.renderError(document.getElementById('main'), data.__error); return; }
  const [snap, tw] = data;

  D = build(snap, tw);
  root.stamp.append(U.datestamp(snap.generatedAt));
  document.getElementById('foot').append(U.renderFoot(snap.generatedAt));

  renderChain();
  renderDial();
  renderLevels();
  update();

  mm = U.motion.init();
  U.motion.enter(mm);
  U.paintGauges();
  play();
}

/* 把兩份資料檔對齊成四條可以直接互算的序列。

   三條走月報酬；外資那條走「當月買賣超佔當月成交金額的比例」而不是金額本身。
   理由是台股的成交量在二十年間差了一個量級，用絕對金額會讓 2006 年的大買超
   看起來比 2026 年的小買超還小，那條序列會變成在描述市場規模而不是外資的態度。 */
function build(snap, tw) {
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

  const usdLevel = snap.macro.dxyBroad.series;
  const twdLevel = snap.macro.usdtwd.series;
  const twLevel = put(tw.taiex.months, tw.taiex.index);
  const turnover = put(tw.taiex.months, tw.taiex.turnover);
  const netRaw = put(tw.flows.months, tw.flows.foreignNet);

  const flowLevel = axis.map((_, i) =>
    (netRaw[i] != null && turnover[i] > 0) ? (netRaw[i] / turnover[i]) * 100 : null);

  return {
    axis, idx, generatedAt: snap.generatedAt,
    levels: { usd: usdLevel, twd: twdLevel, flow: flowLevel, tw: twLevel },
    // 用於關聯的變數：水位型的取月報酬，流量型的本身就是變動量
    change: {
      usd: A.monthlyReturns(usdLevel),
      twd: A.monthlyReturns(twdLevel),
      flow: flowLevel,
      tw: A.monthlyReturns(twLevel),
    },
    taiexEnd: tw.taiex.months[tw.taiex.months.length - 1],
    flowEnd: tw.flows.months[tw.flows.months.length - 1],
  };
}

const periodRange = () => {
  const p = PERIODS.find((x) => x.value === state.period);
  return {
    from: p.from ? (D.idx.get(p.from) ?? 0) : 0,
    to: p.to ? (D.idx.get(p.to) ?? null) : null,
    label: p.label,
  };
};

const measure = () => {
  const { from, to } = periodRange();
  return A.measureChain(D.change, { from, to, lags: LAGS });
};

/* ── 鏈 ─────────────────────────────────────────────────────────────────── */

function renderChain() {
  root.chain.innerHTML = '';
  const grid = el('div', { class: 'u-chain' });
  NODES.forEach((n, i) => {
    const node = el('div', { class: 'u-chain__node', 'data-node': n.key, id: `node-${n.key}` },
      el('div', { class: 'u-chain__title' }, n.name),
      el('div', { class: 'a-chain__val u-num', id: `val-${n.key}` }, '--'),
      el('div', { class: 'u-chain__note' }, n.note),
    );
    grid.append(node);
    if (i < NODES.length - 1) {
      grid.append(el('div', { class: 'u-chain__link', 'data-link': i },
        el('div', { class: 'u-chain__wire' }, el('div', { class: 'u-chain__spark' })),
        el('div', { class: 'u-chain__meta' }, '--'),
      ));
    }
  });
  root.chain.append(grid);
}

function update() {
  const links = measure();
  const { label } = periodRange();

  // 節點當期讀數
  for (const n of NODES) {
    const s = D.levels[n.key];
    const v = A.lastValue(s);
    const node = document.getElementById(`val-${n.key}`);
    // 千分位要跟下面的 .u-gauge 一致，否則同一個數字在同一頁有兩種寫法
    if (node) node.textContent = v == null ? '--' : fmt.group(v, n.digits) + (n.unit || '');
  }

  // 連線狀態
  links.forEach((lk, i) => {
    const wire = root.chain.querySelector(`[data-link="${i}"]`);
    if (!wire) return;
    const same = lk.byLag[0];
    wire.dataset.weak = String(!lk.measurable);
    const meta = wire.querySelector('.u-chain__meta');
    if (same.insufficient) {
      meta.textContent = `樣本 ${same.n} 個月，不足`;
    } else if (lk.measurable) {
      meta.innerHTML = `同月 r = ${fmt.num(same.r, 2)}<br>n = ${same.n}`;
    } else {
      meta.innerHTML = `同月量不到<br>r = ${fmt.num(same.r, 2)} · n = ${same.n}`;
    }
  });

  renderMatrix(links, label);
  renderVerdict(links, label);
  play();
}

/* ── 關聯矩陣 ─────────────────────────────────────────────────────────────
   落後期那幾欄是這一頁的主角，不會因為數字難看就藏起來。
   切換模式時 highlight 對應的欄，讓動效與數字指向同一件事。 */

function renderMatrix(links, label) {
  const t = root.matrix;
  t.innerHTML = '';
  const head = el('tr', {}, el('th', {}, '環'));
  for (const L of LAGS) {
    head.append(el('th', { 'data-lag': L },
      L === 0 ? '同月' : `落後 ${L} 個月`));
  }
  head.append(el('th', {}, '樣本'));
  t.append(el('thead', {}, head));

  const body = el('tbody');
  for (const lk of links) {
    const tr = el('tr', {}, el('td', {}, lk.label));
    for (const L of LAGS) {
      const c = lk.byLag[L];
      tr.append(el('td', {
        'data-lag': L,
        'data-sig': c && !c.insufficient ? String(c.significant) : null,
      }, c && c.r != null ? fmt.num(c.r, 2) + (c.significant ? ' *' : '') : '--'));
    }
    tr.append(el('td', {}, String(lk.byLag[0]?.n ?? 0)));
    body.append(tr);
  }
  t.append(body);

  root.matrixStamp.innerHTML = '';
  root.matrixStamp.append(el('span', { class: 'u-datestamp' }, `期間 ${label}`));

  const anyLead = links.some((l) => l.anyLead);
  root.matrixNote.textContent = anyLead
    ? '星號代表該格的 |t| 大於 2。這段期間有落後期達到顯著，點開該環看它的逐年變化。'
    : '星號代表該格的 |t| 大於 2。這段期間只有「同月」那一欄顯著，落後一到三個月全部量不到。';

  highlightMatrix();
}

function highlightMatrix() {
  const hl = state.mode === 'measured' ? [0] : [1, 2, 3];
  for (const cell of root.matrix.querySelectorAll('[data-lag]')) {
    cell.dataset.hl = String(hl.includes(Number(cell.dataset.lag)));
  }
}

/* ── 判讀 ─────────────────────────────────────────────────────────────── */

function renderVerdict(links, label) {
  const usdP = A.percentile(D.levels.usd, { window: 240 });
  const twdV = A.lastValue(D.levels.twd);
  const twdChg = A.changePct(D.levels.twd, 3);
  const flowV = A.lastValue(D.levels.flow);
  const twChg = A.changePct(D.levels.tw, 1);

  const strong = links.filter((l) => l.measurable);
  const weak = links.filter((l) => !l.measurable);
  const anyLead = links.some((l) => l.anyLead);

  const now = `美元廣義指數落在近 20 年的第 ${usdP ? usdP.pct : '--'} 百分位，`
    + `美元兌台幣 ${fmt.num(twdV, 2)}，近 3 個月${twdChg >= 0 ? '貶值' : '升值'} ${fmt.num(Math.abs(twdChg), 1)}%，`
    + `外資當月買賣超佔成交金額 ${fmt.signed(flowV, 1)}%，台股當月${twChg >= 0 ? '上漲' : '下跌'} ${fmt.num(Math.abs(twChg), 1)}%。`;

  const link = `在 ${label} 這段期間，`
    + (strong.length ? `${strong.map((l) => l.label).join('、')} 的同月關聯量得到` : '沒有任何一環的同月關聯量得到')
    + (weak.length ? `；${weak.map((l) => l.label).join('、')} 量不到` : '')
    + '。'
    + (anyLead ? '這段期間有落後期達到顯著。' : '落後一到三個月的關聯全部趨近於零，四環是同一個月一起動的。');

  const edge = `以上是月報酬的歷史關聯，樣本與顯著性標在表上。相關不等於因果，`
    + `歷史關聯不預測未來，不構成任何建議。外資買賣超為當月累計，台股與匯率為月底值。`;

  root.verdict.innerHTML = '';
  root.verdict.append(U.renderVerdict({ now, link, edge }));
}

/* ── 旋鈕 ─────────────────────────────────────────────────────────────── */

function renderDial() {
  root.dial.innerHTML = '';
  root.dial.append(U.renderDial({
    label: '估計期間',
    options: PERIODS.map((p) => ({ value: p.value, label: p.label })),
    value: state.period,
    note: '預設停在資料允許的最長期間。這不是建議，換一段看看結論會不會變。',
    onChange: (v) => { state.period = v; update(); },
  }));
}

/* ── 四環水位 ─────────────────────────────────────────────────────────── */

function renderLevels() {
  root.levels.innerHTML = '';
  for (const n of NODES) {
    const s = D.levels[n.key];
    const card = el('div', { class: 'a-level' },
      el('h3', { class: 'a-level__name' }, n.full),
      U.renderGauge({
        series: s, window: 240, name: '', unit: n.unit,
        size: 'md', digits: n.digits, dual: true,
      }),
    );
    root.levels.append(card);
  }
}

/* ── 動效 ───────────────────────────────────────────────────────────────
   動詞 1「依序流下」與動詞 2「同時亮」共用同一組 DOM，只有時間軸不同。 */

for (const b of document.querySelectorAll('.u-switch__opt')) {
  b.addEventListener('click', () => {
    state.mode = b.dataset.mode;
    for (const s of document.querySelectorAll('.u-switch__opt')) {
      s.setAttribute('aria-pressed', String(s === b));
    }
    highlightMatrix();
    setModeNote();
    play();
  });
}

function setModeNote() {
  root.modeNote.textContent = state.mode === 'believe'
    ? '這是新聞與話術裡的版本：美元先動，其他依序跟上。'
    : '這是資料的版本：四環在同一個月一起動，中間沒有可以搶先的空隙。';
}
setModeNote();

let tl = null;

function play() {
  const nodes = NODES.map((n) => document.getElementById(`node-${n.key}`)).filter(Boolean);
  const wires = [...root.chain.querySelectorAll('.u-chain__wire')];
  const sparks = [...root.chain.querySelectorAll('.u-chain__spark')];
  if (!nodes.length) return;

  const links = measure();
  const setEnd = () => {
    for (const n of nodes) n.dataset.active = 'true';
    for (let i = 0; i < wires.length; i++) {
      wires[i].dataset.live = String(!!links[i]?.measurable);
    }
    for (const s of sparks) s.style.opacity = '0';
  };

  if (!U.motion.ready()) { setEnd(); return; }
  const gsap = window.gsap;
  if (tl) tl.kill();

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) { setEnd(); return; }

  for (const n of nodes) n.dataset.active = 'false';
  for (const w of wires) w.dataset.live = 'false';
  gsap.set(sparks, { opacity: 0, x: 0 });

  tl = gsap.timeline();

  if (state.mode === 'measured') {
    /* 動詞 2 ／ 同時亮。零 stagger。這裡「沒有 stagger」本身就是全站最重要的一句話：
       同月關聯顯著、落後期趨近於零，所以四環之間沒有可以搶先的空隙。 */
    tl.to(nodes, {
      duration: 0.3, ease: 'power2.out',
      onStart: () => { for (const n of nodes) n.dataset.active = 'true'; },
    }, 0);
    wires.forEach((w, i) => {
      if (links[i]?.measurable) tl.set(w, { attr: { 'data-live': 'true' } }, 0);
    });
  } else {
    /* 動詞 1 ／ 依序流下。先把使用者腦中的模型變成看得見的動作，
       否則動詞 2 沒有對照組。走到量不到的那一環就停住並淡出（動詞 2b）。 */
    let t = 0;
    nodes.forEach((n, i) => {
      tl.set(n, { attr: { 'data-active': 'true' } }, t);
      if (i < wires.length) {
        const ok = links[i]?.measurable;
        const w = wires[i];
        const sp = sparks[i];
        const horizontal = window.matchMedia('(min-width: 768px)').matches;
        const dist = horizontal ? w.clientWidth : 0;
        const vert = horizontal ? 0 : w.clientHeight;
        tl.set(sp, { opacity: 1 }, t + 0.12);
        tl.fromTo(sp,
          { x: 0, y: 0 },
          {
            x: dist, y: vert, duration: 0.5, ease: 'none',
            onComplete: () => { if (ok) w.dataset.live = 'true'; },
          }, t + 0.12);
        // 量不到的那一環：光點走到六成就淡出，鏈在這裡斷掉
        tl.to(sp, { opacity: 0, duration: ok ? 0.12 : 0.2 }, t + (ok ? 0.56 : 0.42));
        t += ok ? 0.68 : 0.9;
      }
    });
  }
}
