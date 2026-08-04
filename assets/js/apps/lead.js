/* 工具 2 ／ 誰在領先。

   實測結論決定了這一頁的形狀：時間序列動能在所有回看期都是正的（Sharpe 0.51 到 1.06），
   這是真的穩健；但最佳視窗不可辨識（2008–16 是 24 個月最好、2017–26 是 3 個月最好），
   而且好處是**降波動不是增報酬**（4.4%/年 @ 5.6% 波動 vs 買進持有 6.25% @ 10.2%）。

   所以這一頁固定 3／6／12 三個視窗並排，不提供自訂、不提供最佳化——
   開放調整等於邀請使用者做參數挖掘，而挖出來的東西樣本外不成立。
   一致與不一致都畫出來，因為多視窗一致才是這裡唯一站得住的訊號。 */

import * as A from '../analytics.js';
import * as U from '../upstream.js';

const { el, fmt } = U;

document.getElementById('masthead').append(U.renderMasthead('lead/', '../../'));

const root = {
  board: document.getElementById('board'),
  dialCcy: document.getElementById('dialCcy'),
  verdict: document.getElementById('verdict'),
  stamp: document.getElementById('stamp'),
};

/* 展示的資產。順序固定為資料檔的 classOrder，組內固定為這裡的順序。
   沒有排序切換：排序等於排名，排名等於推介個別有價證券。 */
const SHOW = {
  equity: ['SPX', 'NDX', 'SOX', 'TWII', 'EEM', 'EFA', 'N225', 'HSI'],
  bond:   ['TLT', 'IEF', 'LQD', 'HYG'],
  metal:  ['GOLD', 'SILVER'],
  commod: ['COPPER', 'OIL', 'DBC'],
  fx:     ['DXY', 'TWD', 'JPY', 'EUR', 'CNY'],
};
const ORDER = ['equity', 'bond', 'metal', 'commod', 'fx'];

const state = { ccy: 'twd' };
let D = null;

init();

async function init() {
  const data = await U.loadData(['../../assets/data/snapshot.json', '../../assets/data/taiwan.json']);
  if (data.__error) { U.renderError(document.getElementById('main'), data.__error); return; }
  const [snap, tw] = data;
  D = { snap, tw, usdtwd: snap.macro.usdtwd.series };

  root.stamp.append(U.datestamp(snap.generatedAt));
  document.getElementById('foot').append(U.renderFoot(snap.generatedAt));

  renderDial();
  render();

  const mm = U.motion.init();
  U.motion.enter(mm);
  U.motion.align(mm, root.board);
}

/* 台幣計價。一個台灣投資人持有美股，真正承受的是資產報酬乘上匯率變動，
   所以預設開啟。匯率本身（DXY／TWD 之類）不換算，換算它會變成拿匯率乘匯率。 */
function seriesFor(code) {
  const a = D.snap.assets[code];
  if (!a) return null;
  if (state.ccy === 'usd' || a.cls === 'fx') return a.series;
  if (a.ccy === 'TWD') return a.series;
  return A.inTWD(a.series, D.usdtwd);
}

function renderDial() {
  root.dialCcy.innerHTML = '';
  root.dialCcy.append(U.renderDial({
    label: '計價幣別',
    options: [
      { value: 'twd', label: '台幣計價' },
      { value: 'usd', label: '原幣計價' },
    ],
    value: state.ccy,
    note: '台幣計價是台灣投資人實際承受的口徑：美元資產的報酬要再乘上匯率變動。匯率本身那一組不換算。',
    onChange: (v) => { state.ccy = v; render(); },
  }));
}

function render() {
  root.board.innerHTML = '';
  const rows = [];

  for (const cls of ORDER) {
    const meta = D.snap.classes[cls];
    const group = el('section', { class: 'a-group' },
      el('div', { class: 'a-group__head' },
        el('h2', { class: 'a-group__name' }, meta.name),
        meta.role ? el('p', { class: 'a-group__role' }, meta.role) : null,
      ));

    const list = el('div', { class: 'a-group__list' });
    for (const code of SHOW[cls]) {
      const a = D.snap.assets[code];
      const s = seriesFor(code);
      if (!a || !s) continue;
      const mw = A.multiWindow(s);
      rows.push({ code, cls, mw, name: a.name });

      const w = U.renderWindows(s);
      list.append(el('div', { class: 'a-asset' },
        el('div', { class: 'a-asset__head' },
          el('span', { class: 'a-asset__name' }, a.name),
          el('span', { class: `a-asset__flag ${mw.agree ? 'is-agree' : ''}` },
            mw.agree ? '三個視窗一致' : '不一致'),
        ),
        w,
      ));
    }
    group.append(list);
    root.board.append(group);
  }

  renderVerdict(rows);
}

function renderVerdict(rows) {
  const agree = rows.filter((r) => r.mw.agree);
  const up = agree.filter((r) => r.mw.direction > 0);
  const down = agree.filter((r) => r.mw.direction < 0);
  const disagree = rows.filter((r) => !r.mw.agree);

  const listOf = (arr, n = 4) => arr.slice(0, n).map((r) => r.name).join('、')
    + (arr.length > n ? ` 等 ${arr.length} 項` : '');

  const now = `${rows.length} 項標的裡，${agree.length} 項的 3、6、12 個月方向一致，`
    + `${disagree.length} 項不一致。方向一致且為正的有 ${up.length} 項`
    + (up.length ? `（${listOf(up)}）` : '')
    + `，方向一致且為負的有 ${down.length} 項`
    + (down.length ? `（${listOf(down)}）` : '') + '。';

  const link = disagree.length
    ? `不一致的 ${disagree.length} 項當中，短視窗與長視窗指向相反的方向。`
      + `這代表近期的變動與過去一年的變動不同向，不代表任何一邊比較對。`
    : '這次所有標的的三個視窗都同向。';

  const edge = '以上是價格變動的描述，不是預測。歷史上多視窗一致的訊號比單一視窗穩定，'
    + '但實測顯示它降低的是波動而不是提高報酬，而且最佳回看期在不同期間並不相同，'
    + '所以站上不提供視窗最佳化。不構成任何建議。';

  root.verdict.innerHTML = '';
  root.verdict.append(U.renderVerdict({ now, link, edge }));
}
