/* WCAG 文字對比。每個自帶文字節點的元素都量，背景往上找到第一個不透明祖先。 */
/* 顏色解析。兩種格式都要吃：
     rgb(24, 26, 23)                    → 0 到 255
     color(srgb 0.913725 0.909804 ...)  → 0 到 1（color-mix() 會解析成這一種）
   第一版只當成 0-255，於是 color(srgb ...) 的 0.91 被讀成幾乎是黑色，
   整批淺色頁面報出假的對比失敗。判斷依據是格式前綴，不是猜數值範圍。 */
const parse = (c) => {
  const nums = (c.match(/[\d.]+(?:e[-+]?\d+)?/g) || []).map(Number);
  const unit = /^color\(/i.test(c.trim()) ? 1 : 255;
  return [nums[0] / unit, nums[1] / unit, nums[2] / unit];
};
const lum = (c) => {
  const [r, g, b] = parse(c);
  const f = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const bgOf = (el) => {
  let n = el;
  while (n && n !== document.documentElement) {
    const c = getComputedStyle(n).backgroundColor;
    const a = (c.match(/[\d.]+(?:e[-+]?\d+)?/g) || []);
    if (a.length && (a.length < 4 || Number(a[3]) > 0.85)) return c;
    n = n.parentElement;
  }
  return getComputedStyle(document.body).backgroundColor;
};
const bad = [];
for (const el of document.querySelectorAll('body *')) {
  const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  if (!own) continue;
  const s = getComputedStyle(el);
  if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) < 0.5) continue;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) continue;
  const size = parseFloat(s.fontSize);
  const weight = Number(s.fontWeight) || 400;
  const large = size >= 24 || (size >= 18.66 && weight >= 700);
  const need = large ? 3 : 4.5;
  const l1 = lum(s.color), l2 = lum(bgOf(el));
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  if (ratio < need) {
    bad.push({ 文字: el.textContent.trim().slice(0, 24), 比: Number(ratio.toFixed(2)), 需要: need,
               色: s.color, 底: bgOf(el), 級: Math.round(size) });
  }
}
return { 路徑: location.pathname, 深色: matchMedia('(prefers-color-scheme: dark)').matches,
         不合格數: bad.length, 明細: bad.slice(0, 8) };
