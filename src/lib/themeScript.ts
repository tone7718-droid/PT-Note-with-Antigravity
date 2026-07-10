/**
 * FOUC 방지 인라인 스크립트 — layout.tsx (서버 컴포넌트) 가 그대로 직렬화함.
 * useThemeStore 의 init 은 마운트 후에야 실행되므로, 다크 사용자에게
 * 라이트 화면이 깜빡이는 것을 hydration 전에 차단한다.
 * (PT-Progress-Note lib/themeScript.ts 에서 이식 — 저장 키 "pt-theme" 동일)
 */

export const THEME_KEY = "pt-theme";

export const THEME_INIT_SCRIPT = `(() => {
  try {
    var t = localStorage.getItem("${THEME_KEY}");
    if (t === "dark") document.documentElement.classList.add("dark");
  } catch (_) {}
})();`;
