import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The nav rail: no horizontal slider, and one collapsed state described twice.
 *
 * Two separate things are asserted here, both source-scanned because jsdom
 * does not lay out:
 *
 * 1. **The slider.** Measured before the fix: the widest row ("How to
 *    Explore", carrying the START HERE pill) needed 201px of content inside a
 *    188px box, so `.icg-rail-nav` reported scrollWidth 209 against clientWidth
 *    204 — a 5px horizontal scrollbar under the whole rail. Widening alone
 *    would only move the threshold, so the label is also made shrinkable and
 *    the axis is closed.
 *
 * 2. **The two collapsed rule sets.** The rail collapses for two independent
 *    reasons — the viewport is under 1280, or the reader pressed the toggle —
 *    and CSS cannot share declarations across a media boundary. So the same
 *    rule is written twice and they can drift. This fails when they do.
 *
 * The label rule is called out on its own because it has a WCAG history:
 * `display: none` on `.icg-nav-label` made every nav link nameless below 1280
 * (4.1.2), and the number is the only visible identifier once the label goes.
 * Either copy regressing to `display: none` is a defect, not a shortcut.
 */

const CSS = readFileSync(join(import.meta.dirname, "..", "app", "icg.css"), "utf8");

/** The declaration block for an exact selector, comments stripped. */
function block(selector: string): string {
  const i = CSS.indexOf(`${selector} {`);
  expect(i, `selector not found: ${selector}`).toBeGreaterThan(-1);
  const body = CSS.slice(i + selector.length + 2, CSS.indexOf("}", i));
  return body.replace(/\/\*[\s\S]*?\*\//g, "").trim();
}

/** The `@media (max-width: 1279px)` section, which holds the responsive twin. */
function mediaSection(): string {
  const start = CSS.indexOf("@media (max-width: 1279px)", CSS.indexOf("icg-rail-toggle"));
  expect(start, "the 1279px breakpoint section was not found").toBeGreaterThan(-1);
  return CSS.slice(start, start + 2000);
}

describe("the nav rail cannot produce a horizontal slider", () => {
  it("closes the horizontal axis rather than widening it", () => {
    const nav = block(".icg-rail-nav");
    expect(nav).toMatch(/overflow-y:\s*auto/);
    expect(nav).toMatch(/overflow-x:\s*hidden/);
    // The original `overflow: auto` opened BOTH axes. If it comes back, the
    // 5px slider comes back with it.
    expect(nav).not.toMatch(/overflow:\s*auto/);
  });

  it("lets a nav label shrink instead of forcing the row wider", () => {
    const label = block(".icg-nav-label");
    // A flex item with an auto basis takes max-content as its flex base size
    // and cannot come down from it without min-width:0 — the same mechanism
    // that put a 341-char Ask Gaurd value 1,913px inside a 287px drawer.
    expect(label).toMatch(/min-width:\s*0/);
    expect(label).toMatch(/text-overflow:\s*ellipsis/);
  });

  it("is wide enough that no shipped label truncates today", () => {
    // Measured in a real browser after the widening: the worst row ("How to
    // Explore" + START HERE) needs 226px of rail to render untruncated. At
    // 224 it still ellipsised by 2px — which is why this asserts the measured
    // requirement and not the first width that removed the scrollbar.
    // Ellipsis is the guarantee for a FUTURE label, not the everyday state.
    const width = /width:\s*(\d+)px/.exec(block(".icg-rail"))?.[1];
    expect(Number(width)).toBeGreaterThanOrEqual(226);
  });
});

describe("the manual collapse and the responsive collapse stay in step", () => {
  const HIDDEN = [
    "icg-rail-brand-name",
    "icg-rail-company",
    "icg-nav-badge",
    "icg-nav-start",
    "icg-rail-health",
    "icg-rail-user-meta",
  ];

  it("collapses to the same width", () => {
    expect(block('html[data-icg-rail="collapsed"] .icg-rail')).toMatch(/width:\s*56px/);
    expect(mediaSection()).toMatch(/\.icg-rail\s*\{\s*width:\s*56px/);
  });

  it("hides the same chrome in both", () => {
    const manual = CSS.slice(
      CSS.indexOf('html[data-icg-rail="collapsed"] .icg-rail-brand-name'),
      CSS.indexOf(".icg-rail-toggle {"),
    );
    const media = mediaSection();
    for (const cls of HIDDEN) {
      expect(manual, `manual collapse does not hide .${cls}`).toContain(cls);
      expect(media, `the 1279px breakpoint does not hide .${cls}`).toContain(cls);
    }
  });

  it("takes the label out of the layout but never out of the a11y tree", () => {
    // The regression this guards: display:none here made 17 nav links
    // nameless below 1280. Both copies must use the clip technique.
    const manual = block('html[data-icg-rail="collapsed"] .icg-nav-label');
    expect(manual).toMatch(/clip-path:\s*inset\(50%\)/);
    expect(manual).not.toMatch(/display:\s*none/);

    const media = mediaSection();
    const labelRule = media.slice(media.indexOf(".icg-nav-label"));
    expect(labelRule.slice(0, 200)).toMatch(/clip-path:\s*inset\(50%\)/);
    expect(labelRule.slice(0, 200)).not.toMatch(/display:\s*none/);
  });

  it("does not offer a manual toggle where the viewport already forced it", () => {
    expect(mediaSection()).toBeTruthy();
    expect(CSS).toMatch(/\.icg-rail-toggle\s*\{\s*display:\s*none/);
  });
});
