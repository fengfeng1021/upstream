/* 首頁「現在」。這一頁的成功條件只有一個：
   一個完全沒有背景知識的人，讀完最上面三行就知道現在是什麼情況。

   所以順序是白話 → 白話 → 白話 → 想深究的人才往下。
   任何需要解釋才看得懂的東西都不准出現在這一頁的上半部。 */

import * as A from './analytics.js';
import * as P from './plain.js';
import * as U from './upstream.js';

const { el } = U;

document.getElementById('masthead').append(U.renderMasthead(null, ''));

const TOOLS = [
  { href: 'apps/assets/', name: '標的分析', body: '每一支標的客觀上是什麼、最慘跌過多少、花多久回本。' },
  { href: 'apps/news/', name: '最新資訊', body: '把財經新聞按主題分類，並說明每一類為什麼跟你有關。' },
  { href: 'apps/chain/', name: '美元與台股的關係', body: '大家都說美元轉強台股就跌。這是真的，但沒有時間差。' },
  { href: 'apps/lead/', name: '誰在領先', body: '各類資產近期誰漲誰跌，用台幣計價。' },
  { href: 'apps/metal/', name: '黃金在對什麼反應', body: '黃金和利率的關係，以及那個關係哪一部分壞掉了。' },
  { href: 'apps/now/', name: '市場的緊張程度', body: '波動率、信用利差、殖利率曲線的現況。' },
];

init();

async function init() {
  const data = await U.loadData([
    'assets/data/snapshot.json', 'assets/data/taiwan.json', 'assets/data/news.json',
  ]);
  if (data.__error) { U.renderError(document.getElementById('main'), data.__error); return; }
  const [snap, tw, news] = data;

  const states = P.CLASSES.map((c) => P.classState(c, snap));

  document.getElementById('today').textContent = `資料更新於 ${snap.generatedAt}`;
  document.getElementById('headline').textContent = P.headline(states, snap);
  document.getElementById('subline').textContent = P.subline(states, snap);
  document.getElementById('caution').textContent = P.caution(states) || '';

  renderCards(states, snap);
  renderNews(news);
  renderTools();
  document.getElementById('foot').append(U.renderFoot(snap.generatedAt));

  const mm = U.motion.init();
  U.motion.enter(mm);
}

/* 四類資產卡片。每一張卡的閱讀順序是刻意的：
     這是什麼 → 現在在哪 → 你該知道的風險 → 有哪些標的追蹤它
   把「風險」排在「標的」前面，因為新手最常犯的錯是先看到標的就想買。 */
function renderCards(states, snap) {
  const host = document.getElementById('cards');
  host.innerHTML = '';

  P.CLASSES.forEach((cls, i) => {
    const st = states[i];
    const card = el('article', { class: 'n-card u-enter', 'data-tone': st?.level?.tone || 'none' });

    card.append(
      el('div', { class: 'n-card__head' },
        el('h3', { class: 'n-card__name' }, cls.name),
        st?.peak
          ? el('span', { class: 'n-card__level', 'data-tone': st.peak.tone }, st.peak.word)
          : el('span', { class: 'n-card__level', 'data-tone': 'none' }, '不會漲跌'),
      ),
      el('p', { class: 'n-card__what' }, cls.what),
    );

    if (st) {
      /* 兩個數字一起給。只給「離高點多遠」會讓人以為便宜，
         只給「百分位」會讓人以為貴，兩個都給才是完整的位置。 */
      const bits = [];
      if (st.fromPeak != null) {
        const gap = Math.abs(st.fromPeak);
        bits.push(gap < 0.3
          ? '這個月就是歷史最高點'
          : `比歷史最高點低 ${gap < 1 ? gap.toFixed(1) : gap.toFixed(0)}%`
            + (st.monthsSincePeak ? `（高點在 ${st.monthsSincePeak} 個月前）` : ''));
      }
      if (st.pct != null) {
        bits.push(st.pct >= 99
          ? '價格是過去二十年來最高的水準'
          : `價格比過去二十年裡 ${st.pct}% 的時間都高`);
      }
      card.append(el('p', { class: 'n-card__state' }, bits.join('，') + '。'));

      const facts = el('dl', { class: 'n-facts' });
      const fact = (k, v) => { facts.append(el('dt', {}, k), el('dd', { class: 'u-num' }, v)); };
      if (st.year1 != null) fact('過去一年', `${st.year1 >= 0 ? '+' : ''}${st.year1.toFixed(1)}%`);
      if (st.ann != null) fact('長期年化', `${st.ann.toFixed(1)}%`);
      if (st.swing != null) fact('一年上下大約', `${st.swing}%`);
      if (st.worst) {
        fact('最慘跌過', `${Math.abs(st.worst.pct).toFixed(0)}%`);
        fact('回本花了', st.worst.recoverMonths
          ? `${(st.worst.recoverMonths / 12).toFixed(1)} 年`
          : '還沒回本');
      }
      card.append(facts);
    }

    card.append(el('p', { class: 'n-card__why' }, cls.why));

    if (cls.tracks.length) {
      const list = el('ul', { class: 'n-track' });
      for (const t of cls.tracks) {
        const a = snap.assets[t.code];
        list.append(el('li', { class: 'n-track__item' },
          el('a', { href: `apps/assets/#${t.code}` },
            el('span', { class: 'n-track__label' }, t.label),
            el('span', { class: 'n-track__code u-num' }, t.code)),
          el('span', { class: 'n-track__note' }, t.note),
        ));
      }
      card.append(
        el('p', { class: 'n-card__tracklab' }, '追蹤這一類的標的（依資料檔順序，不是排名）'),
        list);
    } else {
      /* 現金沒有價格可畫，但它有一個新手最該看到的事實：
         利息拿多少、通膨吃掉多少。兩者相減才是實質的結果。 */
      const cash = P.cashState(snap);
      if (cash) {
        const f = el('dl', { class: 'n-facts' });
        const put = (k, v) => { f.append(el('dt', {}, k), el('dd', { class: 'u-num' }, v)); };
        if (cash.rate != null) put('美國政策利率', `${cash.rate.toFixed(2)}%`);
        if (cash.infl != null) put('美國通膨年增', `${cash.infl.toFixed(1)}%`);
        if (cash.real != null) put('相減之後', `${cash.real >= 0 ? '+' : ''}${cash.real.toFixed(1)}%`);
        card.append(f);
        card.append(el('p', { class: 'n-card__state' },
          cash.real != null && cash.real > 0
            ? '目前利息高於通膨，現金的購買力沒有被吃掉。'
            : '目前利息低於通膨，放著不動的錢購買力正在變小。'));
      }
      card.append(el('p', { class: 'n-card__why' },
        '台灣的銀行定存利率與美國不同，這裡列美國的數字是因為它是全球資金成本的基準。'
        + '這個站不追蹤現金的價格，因為它不會漲跌。'));
    }

    host.append(card);
  });
}

function renderNews(news) {
  const host = document.getElementById('news');
  host.innerHTML = '';
  document.getElementById('newsSub').textContent =
    `${news.fetchedDate} 從 ${news.sources.join('、')} 抓下來的 ${news.total} 則，按主題分好。`
    + '點標題會離開這個站到原始報導。';

  // 只顯示有內容的主題，每個主題兩則。首頁是摘要不是清單。
  const shown = news.topics.filter((t) => (news.byTopic[t.key] || []).length).slice(0, 6);
  for (const t of shown) {
    const items = news.byTopic[t.key].slice(0, 2);
    host.append(el('div', { class: 'n-topic u-enter' },
      el('h3', { class: 'n-topic__name' }, t.name),
      el('p', { class: 'n-topic__why' }, t.why),
      el('ul', { class: 'n-topic__list' },
        items.map((it) => el('li', {},
          el('a', { href: it.link, rel: 'noopener noreferrer', target: '_blank' }, it.title),
          el('span', { class: 'n-topic__src' }, it.src),
        ))),
    ));
  }
}

function renderTools() {
  const host = document.getElementById('tools');
  host.innerHTML = '';
  for (const t of TOOLS) {
    host.append(el('a', { class: 'n-tool u-enter', href: t.href },
      el('span', { class: 'n-tool__name' }, t.name),
      el('span', { class: 'n-tool__body' }, t.body),
    ));
  }
}
