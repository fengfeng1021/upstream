/* 這個站要回答的問題是「現在是什麼環境、錢往哪裡走」，所以宇宙的挑選原則不是
   「涵蓋愈多標的愈好」，而是「每一條序列都要能單獨回答一個問題」。
   每一條下面那句註解就是它存在的理由，說不出來的就不該進來。

   分類（class）決定它在介面上被放在哪一族，不是排名。族內順序是編輯順序，
   固定寫死在這裡，前端不做任何排序切換——排序等於評價，那是投顧行為。 */

export const ASSETS = [
  // ── 股票：問「風險資產在漲還是在跌，誰在領漲」
  { sym: '^GSPC',     code: 'SPX',    name: '標普 500',        cls: 'equity', ccy: 'USD', note: '美股大盤，全球風險偏好的基準' },
  { sym: '^NDX',      code: 'NDX',    name: '那斯達克 100',    cls: 'equity', ccy: 'USD', note: '成長股，對實質利率最敏感' },
  { sym: '^SOX',      code: 'SOX',    name: '費城半導體',      cls: 'equity', ccy: 'USD', note: '半導體循環，台股的上游訊號' },
  { sym: '^TWII',     code: 'TWII',   name: '台灣加權',        cls: 'equity', ccy: 'TWD', note: '台股大盤' },
  { sym: 'EEM',       code: 'EEM',    name: '新興市場',        cls: 'equity', ccy: 'USD', note: '新興市場，對美元走勢最敏感' },
  { sym: 'EFA',       code: 'EFA',    name: '成熟市場（非美）', cls: 'equity', ccy: 'USD', note: '歐日澳，用來分辨「美股獨強」還是「全球齊漲」' },
  { sym: '^N225',     code: 'N225',   name: '日經 225',        cls: 'equity', ccy: 'JPY', note: '日股，與日圓套利交易連動' },
  { sym: '^HSI',      code: 'HSI',    name: '恒生指數',        cls: 'equity', ccy: 'HKD', note: '港股，中國資產的離岸定價' },

  // ── 債券：問「利率在往哪裡走，市場在避險還是冒險」
  { sym: 'TLT',       code: 'TLT',    name: '20 年期以上美債',  cls: 'bond',   ccy: 'USD', note: '長天期利率風險的純粹曝險' },
  { sym: 'IEF',       code: 'IEF',    name: '7 至 10 年美債',   cls: 'bond',   ccy: 'USD', note: '中天期，避險資金的第一站' },
  { sym: 'LQD',       code: 'LQD',    name: '投資等級公司債',   cls: 'bond',   ccy: 'USD', note: '投等債' },
  { sym: 'HYG',       code: 'HYG',    name: '非投資等級公司債', cls: 'bond',   ccy: 'USD', note: '高收債，對 IEF 的比值是市場自己定價的信用風險' },

  /* 貴金屬與商品：問「通膨與實體需求在哪一邊」。
     四支期貨一律 daily:true。它們的月線有換倉造成的空月（實測 43 處兩個月跳格），
     用日線自己收月才連續。 */
  { sym: 'GC=F',      code: 'GOLD',   name: '黃金',            cls: 'metal',  ccy: 'USD', daily: true, note: '黃金期貨連續月' },
  { sym: 'SI=F',      code: 'SILVER', name: '白銀',            cls: 'metal',  ccy: 'USD', daily: true, note: '白銀，工業用途佔比高於黃金' },
  { sym: 'HG=F',      code: 'COPPER', name: '銅',              cls: 'commod', ccy: 'USD', daily: true, note: '銅，實體經濟需求的代理變數' },
  { sym: 'CL=F',      code: 'OIL',    name: '西德州原油',      cls: 'commod', ccy: 'USD', daily: true, note: '原油，通膨的上游' },
  { sym: 'DBC',       code: 'DBC',    name: '綜合商品',        cls: 'commod', ccy: 'USD', note: '一籃子商品' },

  /* 匯率：問「美元在吸金還是在放水」。台幣是台灣投資人真正的計價基準。
     四組匯率改走 FRED 而不是 Yahoo：Yahoo 的 TWD=X 在 2004-10→2006-05 有 19 個月的洞、
     CNY=X 在 2003-04→2003-12 有 8 個月的洞，而 FRED 的 DEX* 系列每一組都從 1971～1999
     起連續到現在。匯率是這個站的計價基準，基準有洞比晚幾年開始嚴重得多。 */
  { sym: 'DX-Y.NYB',  code: 'DXY',    name: '美元指數',        cls: 'fx',     ccy: 'USD', note: '美元對六大貨幣，全球流動性的方向盤' },
  { fredId: 'DEXTAUS', code: 'TWD',   name: '美元兌台幣',      cls: 'fx',     ccy: 'TWD', note: '數字上升＝台幣貶值。台灣投資人的計價基準' },
  { fredId: 'DEXJPUS', code: 'JPY',   name: '美元兌日圓',      cls: 'fx',     ccy: 'JPY', note: '數字上升＝日圓貶值。套利交易的水位計' },
  { fredId: 'DEXUSEU', code: 'EUR',   name: '歐元兌美元',      cls: 'fx',     ccy: 'USD', note: '美元指數的最大權重成分' },
  { fredId: 'DEXCHUS', code: 'CNY',   name: '美元兌人民幣',    cls: 'fx',     ccy: 'CNY', note: '數字上升＝人民幣貶值' },

  // ── 其他：問「市場自己有多緊張」
  { sym: '^VIX',      code: 'VIX',    name: '波動率指數',      cls: 'risk',   ccy: 'USD', note: '標普 500 的隱含波動率，恐慌的價格' },
  { sym: 'VNQ',       code: 'VNQ',    name: '美國不動產',      cls: 'other',  ccy: 'USD', note: 'REITs，對利率與景氣同時敏感' },
  { sym: 'BTC-USD',   code: 'BTC',    name: '比特幣',          cls: 'other',  ccy: 'USD', note: '流動性最敏感的資產，當作風險偏好的極端讀數' },

  // ── 產業對：問「股市內部在防守還是在進攻」。這幾條只用來算比值，不單獨展示
  { sym: 'XLY',       code: 'XLY',    name: '非必需消費',      cls: 'sector', ccy: 'USD', note: '景氣循環股' },
  { sym: 'XLP',       code: 'XLP',    name: '必需消費',        cls: 'sector', ccy: 'USD', note: '防禦股。XLY/XLP 是股市內部的風險偏好' },
  { sym: 'XLK',       code: 'XLK',    name: '科技',            cls: 'sector', ccy: 'USD', note: '科技' },
  { sym: 'XLU',       code: 'XLU',    name: '公用事業',        cls: 'sector', ccy: 'USD', note: '防禦股，兼具債券性質' },
];

export const CLASSES = {
  equity: { name: '股票',   role: '對經濟成長的曝險。成長好、資金鬆的時候領先' },
  bond:   { name: '債券',   role: '對利率的曝險。利率下降時上漲，是成長轉弱時的避風港' },
  metal:  { name: '貴金屬', role: '對實質利率與貨幣信用的曝險。不產生現金流' },
  commod: { name: '商品',   role: '對實體需求與通膨的曝險' },
  fx:     { name: '匯率',   role: '不是資產，是計價基準。它決定你其他所有部位換回台幣是多少' },
  risk:   { name: '風險',   role: '市場自己對未來波動的定價' },
  other:  { name: '其他',   role: '' },
  sector: { name: '產業',   role: '只用於計算股市內部的攻守比值' },
};

export const CLASS_ORDER = ['equity', 'bond', 'metal', 'commod', 'fx', 'risk', 'other'];

/* 總經序列。全部收斂成月頻（取當月最後一筆）。

   lag 是「這個數字實際發布時已經落後幾個月」，介面上要照實講——把落後兩個月的 CPI
   畫在最新那一格，是在假裝我們知道現在的通膨。

   maxAge 是這條序列「多久沒更新就該當成過期」，由 build 時的 staleness guard 檢查。
   這條檢查不是防禦性程式碼，是被兩個實例逼出來的：FRED 上 USALOLITONOSTSAM
   （OECD 領先指標，也就是投資時鐘原版依賴的那條）最後一筆停在 2024-01，
   USSLIND 停在 2020-02，兩條都照樣回 HTTP 200 與格式完整的 CSV。
   沒有這道檢查，儀表板會拿兩年前的數字當「現在」顯示，而且看起來完全正常。 */
export const MACRO = [
  // 利率與殖利率曲線
  { id: 'DGS10',    key: 'y10',      name: '美國 10 年期公債殖利率', unit: '%',  lag: 0, note: '長端利率，所有資產的折現率基準' },
  { id: 'DGS2',     key: 'y2',       name: '美國 2 年期公債殖利率',  unit: '%',  lag: 0, note: '短端利率，反映市場對未來政策利率的預期' },
  { id: 'DGS3MO',   key: 'y3m',      name: '美國 3 個月期公債殖利率', unit: '%', lag: 0, note: '最短端，貼著政策利率走' },
  { id: 'T10Y2Y',   key: 'curve102', name: '10 年減 2 年利差',      unit: '%',  lag: 0, note: '殖利率曲線。負值＝倒掛' },
  { id: 'T10Y3M',   key: 'curve103m',name: '10 年減 3 個月利差',    unit: '%',  lag: 0, note: '另一種曲線定義，學術上對衰退的預測力較強' },
  { id: 'FEDFUNDS', key: 'ffr',      name: '聯邦資金利率',          unit: '%',  lag: 1, note: '美國政策利率' },

  // 通膨與實質利率
  { id: 'DFII10',   key: 'real10',   name: '美國 10 年期實質利率',   unit: '%',  lag: 0, note: 'TIPS 殖利率。黃金最主要的對手' },
  { id: 'T5YIE',    key: 'be5',      name: '5 年期通膨預期',        unit: '%',  lag: 0, note: '市場定價的通膨，不是統計局的通膨' },
  { id: 'CPIAUCSL', key: 'cpi',      name: '美國消費者物價指數',     unit: 'idx', lag: 2, note: '整體 CPI，用來算年增率' },
  { id: 'CPILFESL', key: 'cpiCore',  name: '美國核心消費者物價指數', unit: 'idx', lag: 2, note: '扣除食物與能源' },

  /* 信用與金融壓力。

     這裡刻意不用 BAMLH0A0HYM2（ICE BofA 高收益利差）當歷史基準，雖然它是業界標準。
     原因是 FRED 的免金鑰 CSV 對整個 ICE BofA 家族硬性只給滾動三年，加 cosd 也無效
     （實測 796 列，起點永遠是今天往前推三年）。拿它算「20 年百分位」會算出一個
     其實只有三年的百分位，而且不會報錯——這正是最傷信任的那種安靜錯誤。
     長歷史一律走 NFCICREDIT 與 BAA10Y，兩條都回得到 1971／1986。 */
  { id: 'BAA10Y',     key: 'credit',      name: 'Baa 公司債對公債利差',   unit: '%',  lag: 0, maxAge: 2, note: '信用利差。1986 年起，涵蓋多次完整循環' },
  { id: 'NFCICREDIT', key: 'nfciCredit',  name: '全國金融情勢：信用分項', unit: 'z',  lag: 0, maxAge: 2, note: '1971 年起，正值＝信用取得緊縮' },
  { id: 'NFCIRISK',   key: 'nfciRisk',    name: '全國金融情勢：風險分項', unit: 'z',  lag: 0, maxAge: 2, note: '波動與風險溢酬分項' },
  { id: 'NFCILEVERAGE', key: 'nfciLev',   name: '全國金融情勢：槓桿分項', unit: 'z',  lag: 0, maxAge: 2, note: '債務與權益槓桿分項' },
  { id: 'NFCI',       key: 'nfci',        name: '芝加哥聯準會金融情勢指數', unit: 'z', lag: 0, maxAge: 2, note: '正值＝金融情勢緊縮，負值＝寬鬆' },
  { id: 'VIXCLS',     key: 'vixd',        name: '波動率指數（日）',       unit: 'idx', lag: 0, maxAge: 2, note: 'FRED 版 VIX，補 Yahoo 月線的日頻細節' },
  { id: 'USREC',      key: 'recession',   name: '美國景氣衰退期（NBER）', unit: '0/1', lag: 6, maxAge: 3, note: '用於圖表的衰退區間標示。NBER 認定本身就落後半年以上' },

  // 成長與就業
  { id: 'UNRATE',   key: 'unemp',    name: '美國失業率',            unit: '%',  lag: 1, note: '落後指標，但轉折點很乾淨' },
  { id: 'PAYEMS',   key: 'payrolls', name: '美國非農就業人數',       unit: 'k',  lag: 1, note: '用來算月增與年增' },
  { id: 'INDPRO',   key: 'indpro',   name: '美國工業生產指數',       unit: 'idx', lag: 1, note: '實體產出，商品需求的上游' },
  { id: 'ICSA',     key: 'claims',   name: '美國初次請領失業金',     unit: 'n',  lag: 0, note: '週頻，就業轉弱時最早動的那一個' },

  // 美元與台幣
  { id: 'DTWEXBGS', key: 'dxyBroad', name: '美元廣義貿易加權指數',   unit: 'idx', lag: 0, note: '比 DXY 更能代表美元的實際購買力' },
  { id: 'DEXTAUS',  key: 'usdtwd',   name: '美元兌台幣（聯準會）',   unit: 'twd', lag: 0, note: '1983 年起，比 Yahoo 的台幣序列長得多' },
];

/* 比值。這個站的核心論點是「單一資產的漲跌沒有方向，兩個資產的相對強弱才有」，
   所以比值是一等公民，不是衍生品。每一條都要能用一句話說出它高代表什麼。 */
/* 每一條比值的 hi／lo 只描述「這個比值高／低的時候，市場正在做什麼」，
   一律用現在式與已發生的事實，不含任何「所以你該買什麼」。

   刻意不收金銅比。它是這份清單上最誘人的一條——一條線、故事直觀、圖也漂亮——
   也是最弱的一條：常被引用的 0.85 是兩條非定態序列在 2000 至 2021 這段長期
   通膨下行區間的同期相關，不是樣本外預測力，而把它推廣開的 Gundlach 本人
   後來也公開表示這個關係不再管用。銅與黃金兩條腿現在都被與景氣循環無關的力量
   （綠能需求、央行購金）驅動。要看攻守，XLY／XLP 乾淨得多：兩條腿都是股票，
   混淆因素小一個數量級。 */
export const RATIOS = [
  { key: 'cyclDef',    num: 'XLY',    den: 'XLP',    name: '景氣循環對防禦', hi: '股市內部在進攻',                    lo: '股市內部在防守' },
  { key: 'creditRisk', num: 'HYG',    den: 'IEF',    name: '高收債對公債',  hi: '市場願意承擔信用風險',              lo: '市場在拋棄信用風險' },
  { key: 'stockBond',  num: 'SPX',    den: 'TLT',    name: '股債比',       hi: '股票領先債券',                      lo: '債券領先股票' },
  { key: 'goldStock',  num: 'GOLD',   den: 'SPX',    name: '黃金對股票',   hi: '黃金領先股票',                      lo: '股票領先黃金' },
  { key: 'goldSilver', num: 'GOLD',   den: 'SILVER', name: '金銀比',       hi: '白銀相對便宜',                      lo: '白銀相對貴' },
  { key: 'emDm',       num: 'EEM',    den: 'SPX',    name: '新興對美股',   hi: '新興市場領先',                      lo: '美股獨強' },
  { key: 'twSox',      num: 'TWII',   den: 'SOX',    name: '台股對費半',   hi: '台股跑贏半導體上游',                lo: '台股落後半導體上游' },
];
