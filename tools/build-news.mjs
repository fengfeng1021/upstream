/* 最新資訊彙總。從繁體中文財經媒體的公開 RSS 抓標題，分類後寫成 assets/data/news.json。

   為什麼只取標題與摘要、不轉載全文：全文有著作權，標題與短摘要加上原文連結
   屬於合理引用，而且使用者本來就該去看原文。這個站的價值在「幫你分類與排序」，
   不在「幫你省下點連結的動作」。

   為什麼分類用關鍵字而不用模型：關鍵字看得見、可稽核、跑起來不用錢，
   而且錯了使用者一眼就知道是分類錯不是判斷錯。分類錯很便宜，判斷錯很貴。

   用法：node tools/build-news.mjs */

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36';
const OUT = path.resolve('assets/data');

const FEEDS = [
  { src: '鉅亨網', name: '頭條', url: 'https://news.cnyes.com/rss/v1/news/category/headline' },
  { src: '鉅亨網', name: '台股', url: 'https://news.cnyes.com/rss/v1/news/category/tw_stock' },
  { src: '鉅亨網', name: '美股', url: 'https://news.cnyes.com/rss/v1/news/category/wd_stock' },
  { src: '中央社', name: '財經', url: 'https://feeds.feedburner.com/rsscna/finance' },
  { src: '經濟日報', name: '要聞', url: 'https://money.udn.com/rssfeed/news/1001/5591?ch=money' },
  { src: 'Yahoo 股市', name: '最新', url: 'https://tw.stock.yahoo.com/rss?category=news' },
];

/* 分類。順序即優先序：一則新聞落在第一個命中的類別，不重複計算。
   每一類的 why 會直接顯示在介面上，告訴新手「這類新聞為什麼跟你有關」。 */
const TOPICS = [
  { key: 'rate', name: '利率與央行',
    why: '利率決定你的錢放銀行值不值得，也決定股票與債券的價格。這是所有資產的定價基準。',
    kw: ['聯準會', 'Fed', '升息', '降息', '利率', '央行', '貨幣政策', 'FOMC', '鮑爾', '殖利率', '公債'] },
  { key: 'fx', name: '匯率',
    why: '台幣升貶直接改變你手上美元資產換回台幣的金額，也影響出口公司的獲利。',
    kw: ['匯率', '台幣', '新台幣', '美元指數', '日圓', '人民幣', '歐元', '貶值', '升值', '匯市'] },
  { key: 'infl', name: '通膨與物價',
    why: '通膨吃掉現金的購買力，也決定央行要不要升息。它是利率的上游。',
    kw: ['通膨', 'CPI', '物價', '通縮', '油價', '原油', '糧價', '電價'] },
  { key: 'tw', name: '台股',
    why: '台股與外資動向、台幣、半導體循環高度連動，這幾件事通常同時發生。',
    kw: ['台股', '加權指數', '外資', '投信', '融資', '除權息', '台積電', '櫃買', '集中市場'] },
  { key: 'us', name: '美股與科技',
    why: '美股是全球風險偏好的基準，台股的方向多半跟著它走。',
    kw: ['美股', '道瓊', '那斯達克', '標普', 'S&P', '費半', '輝達', 'NVIDIA', 'AI', '半導體', '科技股'] },
  { key: 'metal', name: '黃金與商品',
    why: '黃金不產生利息，所以它的價格主要對實質利率與貨幣信心反應。',
    kw: ['黃金', '金價', '白銀', '銅價', '商品', '大宗', '貴金屬'] },
  { key: 'macro', name: '經濟數據',
    why: '就業、生產、消費這些數字決定景氣的方向，但它們都是落後發布的。',
    kw: ['GDP', '失業', '非農', '就業', 'PMI', '製造業', '零售', '消費者信心', '景氣', '出口', '外銷訂單'] },
  { key: 'policy', name: '政策與地緣',
    why: '關稅、制裁、選舉會改變資金往哪裡去，通常比經濟數據更快反映在價格上。',
    kw: ['關稅', '制裁', '貿易', '地緣', '戰爭', '選舉', '川普', '中國', '歐盟', '協議', '管制'] },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const decode = (s) => String(s)
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/<[^>]+>/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const tagOf = (block, tag) => {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? decode(m[1]) : '';
};

async function fetchFeed(f) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 25000);
  try {
    const res = await fetch(f.url, {
      headers: { 'User-Agent': UA, Accept: 'application/rss+xml,application/xml,text/xml,*/*' },
      signal: ac.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const items = [];
    for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
      const b = m[0];
      const title = tagOf(b, 'title');
      const link = tagOf(b, 'link');
      if (!title || !link) continue;
      items.push({
        title,
        link,
        summary: tagOf(b, 'description').slice(0, 110),
        at: tagOf(b, 'pubDate'),
        src: f.src,
      });
    }
    return items;
  } finally {
    clearTimeout(timer);
  }
}

const classify = (item) => {
  const hay = `${item.title} ${item.summary}`;
  for (const t of TOPICS) {
    if (t.kw.some((k) => hay.includes(k))) return t.key;
  }
  return null;
};

const toISO = (s) => {
  const d = new Date(s);
  return isFinite(d.getTime()) ? d.toISOString() : null;
};

const all = [];
const failed = [];
console.log('抓取新聞來源');
for (const f of FEEDS) {
  try {
    const items = await fetchFeed(f);
    all.push(...items);
    console.log(`  ${f.src} ${f.name}`.padEnd(22) + `${items.length} 則`);
  } catch (e) {
    failed.push(`${f.src} ${f.name}: ${e.message}`);
    console.log(`  ✗ ${f.src} ${f.name} ${e.message}`);
  }
  await sleep(400);
}

/* 同一則新聞常被多個來源或多個分類頻道重複發布。以標題去重，保留最早出現的那一筆。
   不用連結去重：同一則稿在不同頻道的連結不同，用連結去重等於沒去重。 */
const seen = new Set();
const uniq = [];
for (const it of all) {
  const key = it.title.replace(/\s|[「」《》（）()【】]/g, '').slice(0, 30);
  if (seen.has(key)) continue;
  seen.add(key);
  uniq.push({ ...it, at: toISO(it.at), topic: classify(it) });
}

uniq.sort((a, b) => (b.at || '').localeCompare(a.at || ''));

const byTopic = {};
for (const t of TOPICS) {
  byTopic[t.key] = uniq.filter((x) => x.topic === t.key).slice(0, 12);
}
const unclassified = uniq.filter((x) => !x.topic).length;

const out = {
  generatedAt: new Date().toISOString(),
  fetchedDate: new Date().toISOString().slice(0, 10),
  topics: TOPICS.map(({ key, name, why }) => ({ key, name, why })),
  byTopic,
  counts: Object.fromEntries(TOPICS.map((t) => [t.key, byTopic[t.key].length])),
  total: uniq.length,
  sources: [...new Set(FEEDS.map((f) => f.src))],
};

await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'news.json'), JSON.stringify(out));

console.log(`\n去重後 ${uniq.length} 則（原始 ${all.length} 則），未分類 ${unclassified} 則`);
for (const t of TOPICS) console.log(`  ${t.name.padEnd(10)} ${byTopic[t.key].length} 則`);
console.log(`\n寫入 assets/data/news.json（${(JSON.stringify(out).length / 1024).toFixed(0)} KB）`);
if (failed.length) console.log(`抓不到：${failed.join('、')}`);
