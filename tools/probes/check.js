/* 一次載入裡同時驗「版面對不對」與「數字對不對」。分兩次跑就對不起來。 */
const wide = [...document.querySelectorAll('body *')]
  .filter((e) => e.getBoundingClientRect().width > innerWidth + 1)
  .slice(0, 5).map((e) => String(e.className || e.tagName).slice(0, 40));

const txt = document.body.innerText;
const mast = document.querySelector('.u-masthead');

return {
  路徑: location.pathname,
  寬: innerWidth,
  橫向溢出: document.documentElement.scrollWidth > innerWidth + 1
    ? `${document.documentElement.scrollWidth} > ${innerWidth}` : false,
  過寬元素: wide,
  出現NaN或null: /NaN|\bnull\b|undefined/.test(txt),
  標尺數: document.querySelectorAll('.u-gauge').length,
  標尺缺視窗: [...document.querySelectorAll('.u-gauge')]
    .filter((g) => !g.querySelector('.u-gauge__pct') && !g.querySelector('.u-gauge__short')).length,
  還在跑的動畫: document.getAnimations ? document.getAnimations().filter((a) => a.playState === 'running').length : -1,
  站頭高: mast ? Math.round(mast.getBoundingClientRect().height) : null,
  按鈕換行: [...document.querySelectorAll('.u-btn,.u-switch__opt')]
    .filter((b) => b.getBoundingClientRect().height > 56).map((b) => b.textContent),
  判讀段數: document.querySelectorAll('.u-verdict__line').length,
};
