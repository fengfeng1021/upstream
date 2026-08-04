/* 白話層。這個站原本的問題是：把方法論的嚴謹直接做成介面，
   新手打開看到的是相關係數矩陣，那是研究報告不是產品。

   這一層的職責是把每一個數字翻成一句人話，而且那句話要滿足三件事：
     1. 不用任何術語。百分位、標準差、beta 都不准出現在第一層。
     2. 不含任何未來式。「偏貴」是對現在的描述，不是「會跌」的預言。
     3. 每一句白話下面都掛得回原始數字，想深究的人點得進去。

   法規上這一層特別敏感，因為白話最容易滑進「建議」。所以措辭一律是
   「現在的位置是⋯⋯」「歷史上這個位置之後⋯⋯」，永遠不是「你應該⋯⋯」。 */

import * as A from './analytics.js';

/* 為什麼這個站不說「現在貴還是便宜」

   第一版做了一個五等分的貴賤標籤，跑出來的結果自相矛盾：債券被標成「就在歷史高點附近」
   同時又寫著「還沒回本」，黃金被標成「偏低」但它其實在近二十年的第 97 百分位。
   兩個都不是資料錯，是那個標籤本身沒有意義——它把「離高點多遠」偷換成「貴不貴」。

   要真的講貴賤，得先有一個「合理價」，而挑那個合理價就是設計者替使用者做判斷，
   正好踩到這個站的第三條硬規則。所以標籤整個拿掉，改成純事實：
   離自己的高點多遠、高點是什麼時候、過去一年動了多少、最慘的時候長什麼樣。

   對新手來說這其實更有用：知道「它最慘跌過五成、花四年才回本」比知道「它偏貴」
   更能決定要不要買，而且前者是事實，後者是意見。 */

/* 離高點的距離 → 白話。純描述，不含價值判斷。 */
export function peakWord(fromPeak) {
  if (fromPeak == null) return null;
  const a = Math.abs(fromPeak);
  if (a < 1) return { word: '就在高點', tone: 'high' };
  if (a < 5) return { word: '接近高點', tone: 'high' };
  if (a < 15) return { word: '略低於高點', tone: 'mid' };
  if (a < 30) return { word: '明顯低於高點', tone: 'low' };
  return { word: '遠低於高點', tone: 'low' };
}

/* 漲跌幅 → 白話。新手看到「+27.5%」不會有感覺，看到「一年多了快三成」會。 */
export function moveWord(pct) {
  if (pct == null) return '沒有資料';
  const a = Math.abs(pct);
  const dir = pct >= 0 ? '漲' : '跌';
  if (a < 2) return '幾乎沒動';
  if (a < 8) return `小幅${dir}`;
  if (a < 20) return `明顯${dir}`;
  if (a < 40) return `大幅${dir}`;
  return `${dir}得非常多`;
}

/* 一年上下大概幾 %。用月報酬標準差年化，但講出來的是「通常一年會在正負幾 % 之間」，
   因為新手要的是「我可能會看到多難看的數字」，不是波動度這個詞。 */
export function swingBand(series) {
  const rets = A.monthlyReturns(series).filter((x) => x != null);
  if (rets.length < 36) return null;
  const sd = A.stdev(rets);
  if (sd == null) return null;
  return Math.round(sd * Math.sqrt(12));
}

/* 最大跌幅與回本時間。這是新手最該知道、卻最少人告訴他的一件事：
   「這個東西最慘的時候跌了多少、花多久才回到原點」。 */
export function worstFall(series) {
  let peak = -Infinity, peakAt = -1;
  let worst = 0, worstPeakAt = -1, worstAt = -1;
  for (let i = 0; i < series.length; i++) {
    const v = series[i];
    if (v == null) continue;
    if (v > peak) { peak = v; peakAt = i; }
    const dd = (v / peak - 1) * 100;
    if (dd < worst) { worst = dd; worstPeakAt = peakAt; worstAt = i; }
  }
  if (worstAt < 0) return null;
  // 從那個高點算起，花幾個月回到同一個水位
  let recovered = null;
  const target = series[worstPeakAt];
  for (let i = worstAt; i < series.length; i++) {
    if (series[i] != null && series[i] >= target) { recovered = i - worstPeakAt; break; }
  }
  return { pct: worst, fromIdx: worstPeakAt, toIdx: worstAt, recoverMonths: recovered };
}

/* 年化報酬。用幾何平均，不是算術平均——算術平均會系統性高估，
   而高估報酬正是新手最容易被誤導的地方。 */
export function annualised(series, months = null) {
  const end = A.lastIndex(series);
  if (end < 0) return null;
  let start = 0;
  if (months != null) {
    start = end - months;
    if (start < 0) return null;
  } else {
    while (start < series.length && series[start] == null) start++;
  }
  const a = series[start], b = series[end];
  if (a == null || b == null || a <= 0) return null;
  const yrs = (end - start) / 12;
  if (yrs < 1) return null;
  return (Math.pow(b / a, 1 / yrs) - 1) * 100;
}

/* 四大類資產。這是全站的骨架，因為新手真正該做的第一個決定是
   「錢放在哪一類」，不是「買哪一支」。

   每一類都要有：它是什麼（白話）、為什麼會漲跌、最慘的時候長什麼樣。
   代表指標用來判斷這一類現在的位置；追蹤標的只列出來給使用者自己查，
   不排名、不標記優劣、不預設勾選。 */
export const CLASSES = [
  {
    key: 'stock', name: '股票', gauge: 'SPY',
    what: '買下公司的一小部分。公司賺錢你就跟著賺。',
    why: '長期來看漲最多，但跌起來也最兇，而且你不知道要等多久才會回本。',
    when: '經濟好、利率降的時候通常表現好；經濟差或利率快速上升時最容易受傷。',
    tracks: [
      { code: 'SPY', label: '美國五百大公司', note: '追蹤標普 500 指數' },
      { code: 'QQQ', label: '美國科技股為主', note: '追蹤那斯達克 100 指數' },
      { code: 'VT',  label: '全世界的股票', note: '涵蓋已開發與新興市場' },
      { code: 'EFA', label: '美國以外的成熟市場', note: '歐洲、日本、澳洲等' },
      { code: 'EEM', label: '新興市場', note: '包含台灣、韓國、中國、印度等' },
    ],
  },
  {
    key: 'bond', name: '債券', gauge: 'AGG',
    what: '把錢借給政府或公司，收利息。',
    why: '利息相對穩定，但利率上升的時候債券價格會跌，這一點很多人不知道。',
    when: '利率往下走的時候表現好；利率快速上升時會虧，2022 年就是這樣。',
    tracks: [
      { code: 'AGG', label: '美國各種債券混合', note: '公債加公司債的綜合' },
      { code: 'IEF', label: '中期美國公債', note: '七到十年期' },
      { code: 'TLT', label: '長期美國公債', note: '二十年期以上，對利率最敏感' },
      { code: 'LQD', label: '體質較好的公司債', note: '投資等級' },
      { code: 'HYG', label: '體質較差的公司債', note: '利息高但違約風險也高' },
    ],
  },
  {
    key: 'gold', name: '黃金', gauge: 'GLD',
    what: '一種不會生利息的金屬，幾千年來被當成錢用。',
    why: '它不配息也不成長，價格幾乎全看「大家有多需要一個不會變薄的東西」。',
    when: '實質利率低、通膨高、或大家對貨幣沒信心的時候通常上漲。',
    tracks: [
      { code: 'GLD', label: '黃金', note: '持有實體黃金的基金' },
    ],
  },
  {
    key: 'cash', name: '現金與定存', gauge: null,
    what: '放在銀行或貨幣市場，不會跌。',
    why: '帳面上不會虧，但通膨會慢慢吃掉它的購買力，這是看不見的損失。',
    when: '利率高的時候現金的機會成本比較低；通膨高於利率時實質上是在虧錢。',
    tracks: [],
  },
];

/* 這一類現在在什麼位置。回傳白話 + 原始數字，兩者一起給，
   讓使用者可以只看白話，也可以往下追到數字。 */
export function classState(cls, snap) {
  if (!cls.gauge) return null;
  const a = snap.assets[cls.gauge];
  if (!a) return null;
  const s = a.series;

  const p12 = A.changePct(s, 12);
  const p60 = A.changePct(s, 60);
  const dd = A.drawdown(s);
  const swing = swingBand(s);
  const worst = worstFall(s);
  const ann = annualised(s);

  /* 水位百分位：現在的價格在自己過去二十年的什麼位置。
     這是事實陳述（「比過去多少比例的時間高」），不是價值判斷（「貴」）。
     它跟「離高點多遠」是兩件事，而且可以同時成立：黃金現在在第 97 百分位，
     同時離自己 2026-02 的高點還有兩成多。兩個數字都要給，只給一個都會誤導。 */
  const pos = A.percentile(s, { window: 240 });

  return {
    code: cls.gauge,
    name: a.name,
    pct: pos?.pct ?? null,
    n: pos?.n ?? 0,
    peak: peakWord(dd?.pct),
    year1: p12, year5: p60,
    fromPeak: dd?.pct ?? null,
    monthsSincePeak: dd?.monthsSincePeak ?? null,
    peakMonth: dd && dd.peakAt >= 0 ? dd.peakAt : null,
    swing, worst, ann,
    series: s,
  };
}

/* 全站最上面那一句話。它是整個產品的臉，所以規則最嚴：
   只陳述已經發生的事，一個未來式動詞都沒有，而且每一個子句都對得回一個數字。 */
/* 最上面那一句。規則：**最多兩個事實**，而且是差異最大的兩個。
   第一版塞了四件事，在桌機上折成三行，讀起來是流水帳而不是結論——
   而首屏那一句如果需要讀三行才懂，它就沒有完成它的工作。
   其餘的事實降到 subline，讓第一句短到一眼看完。 */
export function headline(states, snap) {
  const stock = states.find((s) => s && s.code === 'SPY');
  const gold = states.find((s) => s && s.code === 'GLD');

  const say = (label, st) => {
    if (!st || st.fromPeak == null) return null;
    const a = Math.abs(st.fromPeak);
    if (a < 1) return `${label}在歷史高點`;
    if (a < 5) return `${label}接近歷史高點`;
    return `${label}比高點低 ${a.toFixed(0)}%`;
  };
  const parts = [say('美股', stock), say('黃金', gold)].filter(Boolean);
  return parts.length ? parts.join('，') + '。' : '資料讀取中。';
}

/* 第二行：其餘的事實，一句話帶過。 */
export function subline(states, snap) {
  const parts = [];
  const vix = snap.assets.VIX ? A.percentile(snap.assets.VIX.series, { window: 240 }) : null;
  const fxNow = A.lastValue(snap.macro.usdtwd.series);
  const fxChg = A.changePct(snap.macro.usdtwd.series, 12);

  if (vix) {
    parts.push(vix.pct < 35 ? '市場情緒平靜' : vix.pct > 70 ? '市場情緒緊張' : '市場情緒普通');
  }
  if (fxChg != null) {
    parts.push(`台幣一年來${fxChg >= 0 ? '貶' : '升'}了 ${Math.abs(fxChg).toFixed(1)}%，`
      + `現在一美元換 ${fxNow.toFixed(2)} 元`);
  }
  return parts.join('；') + '。';
}

/* 現金那一格沒有價格可以畫，但它有一個新手最該知道的事實：
   利息拿多少、通膨吃掉多少，兩者相減才是實質的結果。
   這是純粹的資料相減，不含任何判斷。 */
export function cashState(snap) {
  const ffr = A.lastValue(snap.macro.ffr?.series);
  const cpiYoY = snap.macro.cpi ? A.yoy(snap.macro.cpi.series) : null;
  if (ffr == null && cpiYoY == null) return null;
  return {
    rate: ffr,
    infl: cpiYoY,
    real: ffr != null && cpiYoY != null ? ffr - cpiYoY : null,
  };
}

/* 給新手的那一句提醒。它跟著市場狀態變，但永遠是關於「風險」而不是關於「動作」。
   說「現在很貴所以該賣」是建議；說「現在的位置歷史上跌起來會比較深」是事實。 */
export function caution(states) {
  const stock = states.find((s) => s && s.code === 'SPY');
  if (!stock || !stock.worst) return null;
  const w = stock.worst;
  return `美股歷史上最慘的一次從高點跌了 ${Math.abs(w.pct).toFixed(0)}%，`
    + (w.recoverMonths
      ? `花了 ${w.recoverMonths} 個月（約 ${(w.recoverMonths / 12).toFixed(1)} 年）才回到原本的水位。`
      : '到目前為止還沒回到原本的水位。')
    + '這件事跟現在貴不貴無關，它是這一類資產本來就有的性質。';
}
