/* 最新資訊。把新聞按主題分好，並在每一類前面說清楚「這類新聞為什麼跟你的錢有關」。

   這一頁刻意不做摘要、不做評論、不排「重要性」：
   摘要會扭曲原意，評論會滑進建議，排重要性等於替使用者決定該關心什麼。
   我們只做分類與去重，然後把人送去原始報導。 */

import * as U from '../upstream.js';

const { el } = U;

document.getElementById('masthead').append(U.renderMasthead('news/', '../../'));

init();

async function init() {
  const data = await U.loadData(['../../assets/data/news.json', '../../assets/data/snapshot.json']);
  if (data.__error) { U.renderError(document.getElementById('main'), data.__error); return; }
  const [news, snap] = data;

  document.getElementById('stamp').textContent =
    `新聞抓取於 ${news.fetchedDate}　市場資料更新於 ${snap.generatedAt}`;
  document.getElementById('intro').textContent =
    `從 ${news.sources.join('、')} 抓下 ${news.total} 則，去掉重複後按八個主題分類。`
    + '每一類前面那句話是在說「這件事為什麼會影響你的錢」。'
    + '沒有摘要、沒有評論、沒有重要性排序，點下去就是原始報導。';

  document.getElementById('foot').append(U.renderFoot(snap.generatedAt));

  const host = document.getElementById('feed');
  const shown = news.topics.filter((t) => (news.byTopic[t.key] || []).length);

  for (const t of shown) {
    const items = news.byTopic[t.key];
    host.append(el('section', { class: 'w-topic u-enter' },
      el('div', { class: 'w-topic__head' },
        el('h2', { class: 'w-topic__name' }, t.name),
        el('span', { class: 'w-topic__count u-num' }, `${items.length} 則`),
      ),
      el('p', { class: 'w-topic__why' }, t.why),
      el('ul', { class: 'w-list' },
        items.map((it) => el('li', { class: 'w-item' },
          el('a', { class: 'w-item__title', href: it.link, rel: 'noopener noreferrer', target: '_blank' }, it.title),
          it.summary ? el('p', { class: 'w-item__sum' }, it.summary) : null,
          el('p', { class: 'w-item__meta' },
            el('span', { class: 'w-item__src' }, it.src),
            it.at ? el('span', {}, when(it.at)) : null),
        ))),
    ));
  }

  if (!shown.length) {
    host.append(el('p', { class: 'u-note' }, '這次抓取沒有取得任何新聞。重新整理，或稍後再看。'));
  }

  const mm = U.motion.init();
  U.motion.enter(mm);
}

/* 相對時間。新手看「2026-08-04T06:50:05Z」沒有感覺，看「3 小時前」有。 */
function when(iso) {
  const t = new Date(iso).getTime();
  if (!isFinite(t)) return '';
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 60) return `${Math.max(1, mins)} 分鐘前`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} 小時前`;
  const days = Math.round(hrs / 24);
  return `${days} 天前`;
}
