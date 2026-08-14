/**
 * One definition of the nav-rail collapse contract.
 *
 * Deliberately the same shape as `theme.ts`, for the same reason: the
 * bootstrap below runs in <head> before first paint, so a reader who
 * collapsed the rail never sees it expand and snap shut on the next
 * navigation. Every screen here is a server component, so navigation is a
 * real document load — without the pre-paint read this would flash on all
 * twenty routes.
 *
 * The toggle writes the key this module names and the bootstrap reads the
 * key this module names, which only stays true while both come from here.
 */

export const RAIL_KEY = "icg-rail";
export const RAIL_ATTR = "data-icg-rail";

export type RailState = "collapsed" | "expanded";

/** Inline <head> script source. Must stay dependency-free and synchronous. */
export const RAIL_BOOTSTRAP = `(function(){try{var r=localStorage.getItem(${JSON.stringify(
  RAIL_KEY,
)});if(r==="collapsed"){document.documentElement.setAttribute(${JSON.stringify(
  RAIL_ATTR,
)},r);}}catch(e){}})();`;
