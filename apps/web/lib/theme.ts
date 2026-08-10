/**
 * One definition of the theme contract. The bootstrap below runs in <head>
 * before first paint (§4: "theme reads from storage before first paint") so
 * the first frame never flashes the wrong palette — and it reads the same key
 * the toggle writes, which only holds if both come from here.
 */

export const THEME_KEY = "icg-theme";
export const THEME_ATTR = "data-icg";

export type Theme = "light" | "dark";

/** Inline <head> script source. Must stay dependency-free and synchronous. */
export const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_KEY,
)});if(t==="dark"||t==="light"){document.documentElement.setAttribute(${JSON.stringify(
  THEME_ATTR,
)},t);}}catch(e){}})();`;
