/* 中樞。五個區塊、五個不同的版面族。

   首屏那條鏈是活的：它用真實資料算出四環當期狀態並跑「同時亮」。
   那不是用 div 拼的假截圖，它就是產品本身縮小放在首屏（taste §4.8 的第三條路）。 */

import * as A from './analytics.js';
import * as U from './upstream.js';

const { el, fmt } = U;

document.getElementById('masthead').append(U.renderMasthead(null, ''));

const CARDS = [
  {
    href: 'apps/chain/', q: '美元轉強的時候，台股跌完了沒有？',
    body: '把美元、台幣、外資、台股四環逐個落後期量出來。同月的關聯很強，落後一個月的關聯趨近於零，而且這件事在四個子期間裡沒有例外。',
    read: (D) => {
      const l = D.links?.[0];
      return l && l.r != null
        ? { v: fmt.num(l.r, 2), what: '美元與台幣的同月關聯', basis: `樣本 ${l.n} 個月` }
        : null;
    },
  },
  {
    href: 'apps/lead/', q: '該押股、該換匯，還是該做貴金屬？',
    body: '五類資產的 3、6、12 個月變動並排，用台幣計價。多視窗一致與不一致都畫出來。',
    read: (D) => {
      const s = D.snap?.assets?.GOLD?.series;
      const mw = s ? A.multiWindow(s) : null;
      return mw ? { v: mw.agree ? '一致' : '不一致', what: '黃金三個視窗的方向', basis: '3、6、12 個月' } : null;
    },
  },
  {
    href: 'apps/metal/', q: '黃金到底在對什麼反應？',
    body: 'LBMA 定盤價從 1968 年畫起。黃金對實質利率的敏感度沒有崩，崩掉的是水位關係，這兩件事常被混為一談。',
    read: (D) => {
      const s = D.snap?.macro?.real10?.series;
      const p = s ? A.percentile(s, { window: 240 }) : null;
      return p ? { v: `第 ${p.pct}`, what: '美國 10 年期實質利率百分位', basis: `近 20 年 ${p.n} 個月` } : null;
    },
  },
  {
    href: 'apps/now/', q: '現在的環境有多緊？',
    body: '波動率、信用利差、金融情勢、殖利率曲線的現況與百分位。只描述現在，一個未來式動詞都沒有。',
    read: (D) => {
      const s = D.snap?.assets?.VIX?.series;
      const p = s ? A.percentile(s, { window: 240 }) : null;
      return p ? { v: `第 ${p.pct}`, what: '波動率指數百分位', basis: `近 20 年 ${p.n} 個月` } : null;
    },
  },
];

init();

async function init() {
  const data = await U.loadData(['assets/data/snapshot.json', 'assets/data/taiwan.json']);
  if (data.__error) { U.renderError(document.getElementById('main'), data.__error); return; }
  const [snap, tw] = data;

  const D = { snap, tw };
  D.links = buildLinks(snap, tw);

  document.getElementById('foot').append(U.renderFoot(snap.generatedAt));
  renderHeroChain(D);
  renderBento(D);
  renderAxis(snap, tw);

  const mm = U.motion.init();
  U.motion.enter(mm);
  U.paintGauges();
  playHero();
}

function buildLinks(snap, tw) {
  const idx = new Map(snap.axis.map((m, i) => [m, i]));
  const put = (months, values) => {
    const out = new Array(snap.axis.length).fill(null);
    for (let i = 0; i < months.length; i++) {
      const k = idx.get(months[i]);
      if (k != null && values[i] != null) out[k] = values[i];
    }
    return out;
  };
  const twLevel = put(tw.taiex.months, tw.taiex.index);
  const turnover = put(tw.taiex.months, tw.taiex.turnover);
  const netRaw = put(tw.flows.months, tw.flows.foreignNet);
  const flow = snap.axis.map((_, i) =>
    (netRaw[i] != null && turnover[i] > 0) ? (netRaw[i] / turnover[i]) * 100 : null);

  return A.measureChain({
    usd: A.monthlyReturns(snap.macro.dxyBroad.series),
    twd: A.monthlyReturns(snap.macro.usdtwd.series),
    flow,
    tw: A.monthlyReturns(twLevel),
  }, { lags: [0, 1, 2, 3] });
}

/* 首屏的鏈。四個節點、三條連線，跑一次「同時亮」。
   刻意不放讀數：首屏要講的是「它們一起動」這件事的形狀，不是數字。 */
function renderHeroChain(D) {
  const host = document.getElementById('heroChain');
  const grid = el('div', { class: 'u-chain h-chain' });
  const names = ['美元', '台幣', '外資', '台股'];
  names.forEach((n, i) => {
    grid.append(el('div', { class: 'u-chain__node', 'data-node': i },
      el('div', { class: 'u-chain__title' }, n)));
    if (i < 3) {
      const weak = !D.links[i]?.measurable;
      grid.append(el('div', { class: 'u-chain__link', 'data-weak': String(weak) },
        el('div', { class: 'u-chain__wire' }),
        el('div', { class: 'u-chain__meta' },
          D.links[i]?.r != null ? `r = ${fmt.num(D.links[i].r, 2)}` : '--'),
      ));
    }
  });
  host.append(grid,
    el('p', { class: 'h-chain__cap' }, '四環的同月關聯。落後一個月全部趨近於零。'));
}

function playHero() {
  const nodes = [...document.querySelectorAll('#heroChain .u-chain__node')];
  const wires = [...document.querySelectorAll('#heroChain .u-chain__wire')];
  const setEnd = () => {
    for (const n of nodes) n.dataset.active = 'true';
    for (const w of wires) if (w.parentElement.dataset.weak !== 'true') w.dataset.live = 'true';
  };
  if (!U.motion.ready() || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setEnd(); return; }
  const gsap = window.gsap;
  gsap.timeline({ delay: 0.25 })
    .call(setEnd)
    .from(nodes, { opacity: 0.35, duration: 0.3, ease: 'power2.out' }, 0);
}

function renderBento(D) {
  const host = document.getElementById('bento');
  for (const c of CARDS) {
    const r = c.read(D);
    host.append(el('a', { class: 'h-bento__cell u-enter', href: c.href },
      el('div', { class: 'h-bento__q' }, c.q),
      el('p', { class: 'h-bento__body' }, c.body),
      r ? el('div', { class: 'h-bento__read' },
        U.renderReadout({ value: null, what: r.what, basis: r.basis })) : null,
    ));
    // 讀數的值是字串（百分位、一致與否），renderReadout 只吃數字，所以直接覆寫
    if (r) {
      const num = host.lastElementChild.querySelector('.u-readout__num');
      if (num) num.textContent = r.v;
    }
  }
}

/* 資料地基：一條 1990 → 現在的軸，每條序列的涵蓋期間畫成一段。
   這一段本身就是「我們有多少資料」的誠實揭露，不需要另外寫一段文案。 */
function renderAxis(snap, tw) {
  const host = document.getElementById('axis');
  const axis = snap.axis;
  const y0 = Number(axis[0].slice(0, 4));
  const y1 = Number(axis[axis.length - 1].slice(0, 4));
  const pos = (m) => {
    const i = axis.indexOf(m);
    return i < 0 ? null : (i / (axis.length - 1)) * 100;
  };

  /* 刻線在線上，年份標籤在線外的獨立層。
     標籤原本是 .h-axis__line 的子節點，那條線只有 2px 高卻是實心的 --rule-strong，
     於是標籤在 DOM 上「壓在」一條深色帶上——視覺上沒事，但對比檢查會照 DOM 祖先
     去找背景，量出 2.46:1。與其把檢查放寬，不如把結構改對：標籤本來就不屬於那條線。 */
  const line = el('div', { class: 'h-axis__line' });
  const labs = el('div', { class: 'h-axis__labs' });
  for (let y = Math.ceil(y0 / 5) * 5; y <= y1; y += 5) {
    const p = pos(`${y}-01`);
    if (p == null) continue;
    line.append(el('div', { class: 'h-axis__tick', style: `left:${p}%` }));
    labs.append(el('div', { class: 'h-axis__lab', style: `left:${p}%` }, String(y)));
  }

  const rows = el('div', { class: 'h-axis__rows' });
  const items = [
    ['美國總經（FRED）', snap.macro.y10.start, snap.macro.y10.end],
    ['美元廣義指數', snap.macro.dxyBroad.start, snap.macro.dxyBroad.end],
    ['美元兌台幣', snap.macro.usdtwd.start, snap.macro.usdtwd.end],
    ['加權指數（證交所）', tw.taiex.months[0], tw.taiex.months[tw.taiex.months.length - 1]],
    ['外資買賣超（證交所）', tw.flows.months[0], tw.flows.months[tw.flows.months.length - 1]],
    ['黃金（LBMA）', tw.metals.gold.months[0], tw.metals.gold.months[tw.metals.gold.n - 1]],
    ['標普 500', snap.assets.SPX.start, snap.assets.SPX.end],
    ['波動率指數', snap.assets.VIX.start, snap.assets.VIX.end],
  ];
  for (const [name, from, to] of items) {
    const a = pos(from), b = pos(to);
    const bar = el('div', { class: 'h-axis__bar' });
    if (a != null && b != null) {
      bar.append(el('div', { class: 'h-axis__span', style: `left:${a}%;width:${Math.max(0.6, b - a)}%` }));
    } else if (b != null) {
      // 起點早於軸的左端（例如 LBMA 從 1968），從最左邊畫起並在標籤註明
      bar.append(el('div', { class: 'h-axis__span', style: `left:0%;width:${b}%` }));
    }
    rows.append(el('div', { class: 'h-axis__row' },
      el('div', { class: 'h-axis__name' }, name + (a == null ? `（${from} 起）` : '')),
      bar,
    ));
  }

  host.append(line, labs, rows,
    el('p', { class: 'u-note', style: 'margin-top:var(--s-5)' },
      `軸的範圍是 ${axis[0]} 到 ${axis[axis.length - 1]}。早於 ${axis[0]} 的序列在標籤上註明真正的起點。`));
}
