/* 共用介面層。DESIGN.md §4 的物件與 §5 的動效語彙。
   每個 render* 函式吃資料吐 DOM，不吃全域狀態；動效統一由 motion.* 進場。 */

import * as A from './analytics.js';

export const fmt = {
  /** 有正負意義的數字一律帶符號，因為使用者是在看方向不是看大小。 */
  signed(v, digits = 1) {
    if (v == null || !isFinite(v)) return '--';
    return (v >= 0 ? '+' : '') + v.toFixed(digits);
  },
  num(v, digits = 2) {
    if (v == null || !isFinite(v)) return '--';
    return v.toFixed(digits);
  },
  /** 大數字加千分位。台股成交金額之類的東西不加逗號會看不出量級。 */
  group(v, digits = 0) {
    if (v == null || !isFinite(v)) return '--';
    return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  },
  pct(p) { return p == null ? '--' : `第 ${p} 百分位`; },
  /** 視窗長度（月）換成人話。百分位一定要跟視窗一起出現。 */
  window(months, n) {
    const years = Math.round(months / 12);
    const span = months >= 1e6 ? '全部資料' : `近 ${years} 年`;
    return n != null ? `${span} ${n} 個月` : span;
  },
  month(m) { return m || '--'; },
};

/* 原生的 Node.append() 會把 null 轉成字串 "null" 印到畫面上。
   el() 自己會濾掉，但直接對既有節點 append 的地方不會，所以統一走這個。 */
export const add = (host, ...kids) => {
  for (const k of kids.flat()) if (k != null && k !== false) host.append(k);
  return host;
};

export const el = (tag, attrs = {}, ...kids) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat()) {
    if (kid == null) continue;
    node.append(typeof kid === 'string' ? document.createTextNode(kid) : kid);
  }
  return node;
};

/* ── 4.2 水位標尺 ─────────────────────────────────────────────────────────
   痕跡走 canvas：240 個觀測不能生 240 個 div。
   每一道橫線是一個真實的歷史觀測，疏密就是分布密度。 */

function drawMarks(canvas, hist, lo, hi) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const css = getComputedStyle(document.documentElement);
  ctx.strokeStyle = css.getPropertyValue('--rule-strong').trim() || '#9B9A92';
  ctx.lineWidth = 1;
  /* 重疊處自然加深，於是痕跡的疏密就是分布密度。

     單道的透明度必須隨樣本數調整：240 個月畫在 140px 高的槽裡，平均每個像素
     疊到快兩道，用固定 alpha 會整片糊成一塊實心，密度資訊全部消失。
     用 1/sqrt(n) 收斂，讓「疊起來的深淺」在不同樣本數下都還讀得出來。 */
  ctx.globalAlpha = Math.max(0.06, Math.min(0.5, 2.4 / Math.sqrt(hist.length || 1)));
  const span = hi - lo;
  if (!(span > 0)) return;
  for (const v of hist) {
    if (v == null) continue;
    const y = Math.round(h - ((v - lo) / span) * h) + 0.5;
    ctx.beginPath();
    ctx.moveTo(1, y);
    ctx.lineTo(w - 1, y);
    ctx.stroke();
  }
}

/**
 * @param {object} o
 * @param {number[]} o.series  完整歷史序列
 * @param {number}   o.window  百分位視窗（月）。**必填**，沒有就不渲染（DESIGN.md §1.3）
 */
export function renderGauge(o) {
  const { series, window: win, name, unit = '', size = 'md', digits = 2, at = null, dual = false } = o;

  // 元件契約：沒有視窗就不渲染。實測顯示同一個值換視窗會反轉訊息，
  // 所以「忘了寫視窗」必須是壞掉，不是預設值。
  if (win == null && !dual) {
    return el('div', { class: 'u-note' }, `${name || '這個讀數'} 缺少百分位視窗，未渲染`);
  }

  const i = at == null ? A.lastIndex(series) : at;
  const cur = i >= 0 ? series[i] : null;
  const from = win == null ? 0 : Math.max(0, i - win + 1);
  const hist = [];
  for (let k = from; k <= i; k++) if (series[k] != null) hist.push(series[k]);

  const wrap = el('div', { class: `u-gauge u-gauge--${size}` });
  const well = el('div', { class: 'u-gauge__well' });
  const canvas = el('canvas', { class: 'u-gauge__marks', 'aria-hidden': 'true' });
  well.append(canvas);

  const label = el('div', { class: 'u-gauge__label' });

  if (hist.length < 24 || cur == null) {
    label.append(
      el('div', { class: 'u-gauge__value' }, cur == null ? '--' : fmt.num(cur, digits)),
      el('div', { class: 'u-gauge__name' }, name || ''),
      el('div', { class: 'u-gauge__short' }, `樣本 ${hist.length} 個月，不足以給百分位`),
    );
    wrap.append(well, label);
    return wrap;
  }

  const lo = Math.min(...hist), hi = Math.max(...hist);
  const place = (v) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%`;

  const now = el('div', { class: 'u-gauge__now' });
  now.style.bottom = place(cur);
  well.append(now);

  const p = A.percentile(series, { window: win, at: i });
  const dp = dual ? A.dualPercentile(series, { at: i }) : null;

  // 視窗不一致時畫第二條，並列兩個百分位。不一致本身就是資訊。
  if (dp && dp.diverges && dp.short && dp.long) {
    const longHist = [];
    const lf = Math.max(0, i - dp.longWin + 1);
    for (let k = lf; k <= i; k++) if (series[k] != null) longHist.push(series[k]);
    const alt = el('div', { class: 'u-gauge__now u-gauge__now--alt' });
    alt.style.bottom = place(cur);
    well.append(alt);
  }

  add(label,
    el('div', { class: 'u-gauge__value' },
      fmt.group(cur, digits),
      unit ? el('span', { class: 'u-gauge__unit' }, unit) : null),
    name ? el('div', { class: 'u-gauge__name' }, name) : null,
  );

  if (dp && dp.diverges && dp.short && dp.long) {
    label.append(el('div', { class: 'u-gauge__pct' },
      `${fmt.pct(dp.short.pct)} · ${fmt.window(dp.shortWin, dp.short.n)}`,
      el('br'),
      `${fmt.pct(dp.long.pct)} · ${fmt.window(dp.longWin, dp.long.n)}`,
    ));
    label.append(el('div', { class: 'u-gauge__short' }, '兩個視窗給出不同的高低判讀'));
  } else if (p) {
    label.append(el('div', { class: 'u-gauge__pct' }, `${fmt.pct(p.pct)} · ${fmt.window(win, p.n)}`));
  }

  wrap.append(well, label);
  wrap.setAttribute('role', 'img');
  wrap.setAttribute('aria-label',
    `${name || ''} ${fmt.num(cur, digits)}${unit}，位於${fmt.window(win, p?.n)}的${p ? `第 ${p.pct} 百分位` : '未知百分位'}`);

  // canvas 要等進 DOM 拿得到尺寸才畫得出來
  wrap._paint = () => drawMarks(canvas, hist, lo, hi);
  return wrap;
}

/** 版面穩定後統一補畫所有標尺的痕跡，並在視窗尺寸改變時重畫。 */
export function paintGauges(root = document) {
  const nodes = [...root.querySelectorAll('.u-gauge')].filter((n) => n._paint);
  for (const n of nodes) n._paint();
}
let paintTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(paintTimer);
  paintTimer = setTimeout(() => paintGauges(), 160);
});

/* ── 4.4 讀數 ─────────────────────────────────────────────────────────── */

export function renderReadout({ value, unit = '', what, basis, digits = 1, semantic = false, signed = false }) {
  const cls = semantic && value != null ? (value >= 0 ? 'is-up' : 'is-down') : '';
  return el('div', { class: 'u-readout' },
    el('div', { class: `u-readout__row ${cls}` },
      el('span', { class: 'u-readout__num' }, signed ? fmt.signed(value, digits) : fmt.num(value, digits)),
      unit ? el('span', { class: 'u-readout__unit' }, unit) : null,
    ),
    el('div', { class: 'u-readout__rule' }),
    el('div', { class: 'u-readout__what' }, what || ''),
    el('div', { class: 'u-readout__basis' }, basis || ''),
  );
}

/* ── 4.6 參數旋鈕 ─────────────────────────────────────────────────────── */

export function renderDial({ label, options, value, note, onChange }) {
  const opts = el('div', { class: 'u-dial__opts', role: 'group', 'aria-label': label });
  for (const o of options) {
    const b = el('button', {
      class: 'u-dial__opt', type: 'button',
      'aria-pressed': String(o.value === value),
      'aria-disabled': o.disabled ? 'true' : null,
    }, o.label);
    if (!o.disabled) {
      b.addEventListener('click', () => {
        for (const s of opts.children) s.setAttribute('aria-pressed', 'false');
        b.setAttribute('aria-pressed', 'true');
        onChange(o.value);
      });
    }
    opts.append(b);
  }
  return el('div', { class: 'u-dial' },
    el('div', { class: 'u-dial__lab' }, label),
    opts,
    note ? el('div', { class: 'u-dial__note' }, note) : null,
  );
}

/* ── 4.7 判讀 ─────────────────────────────────────────────────────────────
   固定三段模板。【邊界】永遠存在且不可關閉。
   允許的動詞見 DESIGN.md §4.7；audit.mjs 會逐頁掃禁用詞。 */

export function renderVerdict({ now, link, edge }) {
  const line = (tag, body, cls = '') => el('p', { class: `u-verdict__line ${cls}` },
    el('span', { class: 'u-verdict__tag' }, `【${tag}】`), body);
  return el('div', { class: 'u-verdict' },
    line('現況', now),
    line('鏈結', link),
    line('邊界', edge, 'u-verdict__line--edge'),
  );
}

export function datestamp(date, extra) {
  return el('span', { class: 'u-datestamp' }, `資料 ${date}${extra ? ` · ${extra}` : ''}`);
}

/* ── 4.5 多視窗比對 ───────────────────────────────────────────────────── */

export function renderWindows(series, { at = null, scale = null } = {}) {
  const mw = A.multiWindow(series, A.WINDOWS, at);
  const vals = mw.values.map((v) => v.pct).filter((v) => v != null);
  // 三條共用同一把尺，否則不能並排比較
  const max = scale ?? Math.max(10, ...vals.map((v) => Math.abs(v)));

  const wrap = el('div', { class: 'u-windows' });
  for (const v of mw.values) {
    const track = el('div', { class: 'u-windows__track' }, el('div', { class: 'u-windows__zero' }));
    if (v.pct != null) {
      const frac = Math.min(1, Math.abs(v.pct) / max);
      const bar = el('div', { class: 'u-windows__bar', 'data-dir': v.pct >= 0 ? 'up' : 'down' });
      bar.style.width = `${frac * 50}%`;
      if (v.pct >= 0) bar.style.left = '50%'; else bar.style.right = '50%';
      bar.dataset.w = String(frac * 50);
      track.append(bar);
    }
    wrap.append(el('div', { class: 'u-windows__row' },
      el('div', { class: 'u-windows__lab' }, `${v.k} 個月`),
      el('div', { style: 'display:flex;align-items:center;gap:var(--s-3)' },
        track,
        el('div', { class: `u-windows__val ${v.pct == null ? '' : v.pct >= 0 ? 'is-up' : 'is-down'}` },
          v.pct == null ? '--' : `${fmt.signed(v.pct, 1)}%`),
      ),
    ));
  }
  wrap.append(el('div', { class: 'u-windows__verdict' },
    mw.agree
      ? '三個視窗一致'
      : mw.odd
        ? `三個視窗不一致：${mw.odd} 個月的方向與另外兩個相反`
        : '三個視窗不一致'));
  wrap._mw = mw;
  return wrap;
}

/* ── §5 動效語彙 ──────────────────────────────────────────────────────────
   全部包在 gsap.matchMedia 裡，reduce 分支一律直接跳終態。
   只動 transform 與 opacity。 */

export const motion = {
  ready() { return typeof window.gsap !== 'undefined'; },

  init() {
    if (!this.ready()) return null;
    document.documentElement.classList.add('js-anim');
    if (window.ScrollTrigger) window.gsap.registerPlugin(window.ScrollTrigger);
    return window.gsap.matchMedia();
  },

  /** 全域進場。一個區塊只跑一次。 */
  enter(mm) {
    if (!mm) { for (const n of document.querySelectorAll('.u-enter')) n.style.opacity = '1'; return; }
    const gsap = window.gsap;
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      if (!window.ScrollTrigger) {
        gsap.to('.u-enter', { opacity: 1, duration: 0.34 });
        return;
      }
      window.ScrollTrigger.batch('.u-enter', {
        once: true, start: 'top 88%',
        onEnter: (batch) => gsap.fromTo(batch,
          { opacity: 0, y: 12 },
          { opacity: 1, y: 0, duration: 0.34, ease: 'power4.out', stagger: 0.06, overwrite: true }),
      });
    });
    mm.add('(prefers-reduced-motion: reduce)', () => {
      gsap.set('.u-enter', { opacity: 1, y: 0 });
    });
  },

  /** 動詞 3 ／ 水位上升。從底部升起，讓使用者看見整段量程而不只是停的位置。 */
  rise(mm, scope) {
    const bars = [...(scope || document).querySelectorAll('.u-gauge__now')];
    if (!bars.length) return;
    if (!mm) return;
    const gsap = window.gsap;
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      for (const b of bars) {
        const target = b.style.bottom;
        gsap.fromTo(b, { bottom: '0%', opacity: 0 }, {
          bottom: target, opacity: 1, duration: 0.34, ease: 'power4.out',
          scrollTrigger: window.ScrollTrigger ? { trigger: b, start: 'top 92%', once: true } : undefined,
        });
      }
    });
  },

  /** 動詞 5 ／ 對齊。三條視窗長條滑到共用基線上才能並排比較。 */
  align(mm, scope) {
    const bars = [...(scope || document).querySelectorAll('.u-windows__bar')];
    if (!bars.length || !mm) return;
    const gsap = window.gsap;
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from(bars, {
        scaleX: 0, transformOrigin: 'left center', duration: 0.4,
        ease: 'power2.out', stagger: 0.08,
        scrollTrigger: window.ScrollTrigger ? { trigger: bars[0], start: 'top 92%', once: true } : undefined,
      });
    });
  },
};

/* ── 資料載入 ─────────────────────────────────────────────────────────────
   失敗只有一種真實情境：檔案抓不到。內嵌錯誤區塊，不用 toast，因為這不是暫時性的。 */

export async function loadData(paths) {
  try {
    const res = await Promise.all(paths.map((p) => fetch(p)));
    for (const r of res) if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await Promise.all(res.map((r) => r.json()));
  } catch (e) {
    return { __error: e.message || String(e) };
  }
}

export function renderError(where, msg) {
  where.innerHTML = '';
  where.append(el('div', { class: 'u-error' },
    el('h2', {}, '資料檔沒有載入'),
    el('p', { class: 'u-note' }, `重新整理，或檢查網路連線。（${msg}）`),
  ));
}

/* 站頭與頁尾。四個工具與中樞共用同一份，避免連結在某一頁漏掉。 */
/* 導覽順序＝新手的閱讀順序，不是我們開發的順序。
   先「現在怎樣」，再「有哪些標的」，再「今天發生什麼」，最後才是深入的工具。 */
export const PAGES = [
  { href: 'assets/', label: '標的分析' },
  { href: 'news/', label: '最新資訊' },
  { href: 'lead/', label: '誰在領先' },
  { href: 'metal/', label: '黃金' },
  { href: 'chain/', label: '美元與台股' },
  { href: 'now/', label: '緊張程度' },
];

export function renderMasthead(current, base = '') {
  const nav = el('nav', { class: 'u-masthead__nav', 'aria-label': '工具' });
  for (const p of PAGES) {
    nav.append(el('a', {
      class: 'u-masthead__link',
      href: `${base}apps/${p.href}`,
      'aria-current': current === p.href ? 'page' : null,
    }, p.label));
  }
  return el('header', { class: 'u-masthead' },
    el('div', { class: 'u-masthead__inner' },
      el('a', { class: 'u-masthead__brand', href: base || './' }, '上游',
        el('span', { class: 'u-masthead__latin' }, 'upstream')),
      nav,
    ));
}

export function renderFoot(generatedAt) {
  return el('footer', { class: 'u-foot' },
    el('div', { class: 'wrap' },
      el('div', { class: 'u-foot__cols' },
        el('div', {},
          el('h2', {}, '資料來源'),
          el('ul', {},
            el('li', {}, 'FRED（聖路易聯準銀行）總經序列'),
            el('li', {}, 'Yahoo Finance 月線價格'),
            el('li', {}, '臺灣證券交易所 加權指數與三大法人'),
            el('li', {}, 'LBMA 金銀定盤價'),
          )),
        el('div', {},
          el('h2', {}, '這個站'),
          el('ul', {},
            el('li', {}, `資料抓取日 ${generatedAt}`),
            el('li', {}, '純靜態，無後端，無追蹤'),
            el('li', {}, '沒有廣告、聯盟連結、會員或任何金流'),
          )),
        el('div', {},
          el('h2', {}, '原始碼'),
          el('ul', {},
            el('li', {}, el('a', { href: 'https://github.com/fengfeng1021/upstream' }, 'github.com/fengfeng1021/upstream')),
            el('li', {}, 'MIT 授權'),
          )),
      ),
      el('p', { class: 'u-foot__legal' },
        '本站非證券投資顧問事業，不提供證券投資顧問服務。站上所有內容為公開市場資料的統計整理與總體經濟數據呈現，'
        + '不針對任何個別有價證券提供分析、推介、買賣價位或買賣時點，不構成任何投資建議或要約。'
        + '所有數字為特定抓取日的歷史快照，非即時資料，可能因來源修訂而變動。歷史關聯不代表未來結果。'
        + '投資決策及其結果由使用者自行負責。'),
    ));
}
