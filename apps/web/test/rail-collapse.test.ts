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

  it("reserves the scrollbar gutter so the content width is not height-dependent", () => {
    // Grouping the rail pushed the nav into vertical overflow and the
    // scrollbar took 15px off the content box, truncating the widest label at
    // a width that had measured clean minutes earlier. Whether that scrollbar
    // exists depends on the viewport HEIGHT, so the gutter is always
    // reserved and the width is sized around it.
    expect(block(".icg-rail-nav")).toMatch(/scrollbar-gutter:\s*stable/);
  });

  it("is wide enough that no shipped label truncates today", () => {
    // Measured in a real browser, three times, and it moved twice:
    //   224 -> widest row still ellipsised by 2px
    //   236 -> clean flat, then truncated again once grouping added a
    //          vertical scrollbar that ate 15px
    //   252 -> 217px of content + 16px nav padding + a 15px reserved gutter
    // This asserts the measured requirement, not the first width that looked
    // right. Ellipsis is the guarantee for a FUTURE label, not the everyday
    // state: zero shipped labels truncate.
    const width = /width:\s*(\d+)px/.exec(block(".icg-rail"))?.[1];
    expect(Number(width)).toBeGreaterThanOrEqual(248);
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
    // The regression this guards: display:none here made every nav link
    // nameless below 1280. Both copies must use the clip technique.
    const manual = block('html[data-icg-rail="collapsed"] .icg-nav-label');
    expect(manual).toMatch(/clip-path:\s*inset\(50%\)/);
    expect(manual).not.toMatch(/display:\s*none/);

    const media = mediaSection();
    const labelRule = media.slice(media.indexOf(".icg-nav-label"));
    expect(labelRule.slice(0, 200)).toMatch(/clip-path:\s*inset\(50%\)/);
    expect(labelRule.slice(0, 200)).not.toMatch(/display:\s*none/);
  });

  it("drops the reserved gutter in both collapsed states", () => {
    // At 56px the gutter would take 15 of ~40 usable pixels and clip the
    // number — the collapsed rail's only visible identifier. Measured:
    // scrollWidth exceeded clientWidth at 56px until this was added.
    expect(block('html[data-icg-rail="collapsed"] .icg-rail-nav')).toMatch(
      /scrollbar-gutter:\s*auto/,
    );
    expect(mediaSection()).toMatch(/\.icg-rail-nav\s*\{\s*scrollbar-gutter:\s*auto/);
  });

  it("keeps the toggle reachable at every width", () => {
    // This asserted the OPPOSITE until a reader hit it: below 1280 the rail
    // was forced to 56px AND the toggle was hidden, on the reasoning that the
    // viewport had already decided. The result was icons, no labels and no
    // control — the one state where the control matters most.
    expect(CSS).not.toMatch(/\.icg-rail-toggle\s*\{\s*display:\s*none/);
    // Its label is hidden the way every other label is, never removed.
    const media = mediaSection();
    const toggleRule = media.slice(media.indexOf(".icg-rail-toggle-text"));
    expect(toggleRule.slice(0, 220)).toMatch(/clip-path:\s*inset\(50%\)/);
    expect(toggleRule.slice(0, 220)).not.toMatch(/display:\s*none/);
  });

  it("lets an explicit expand outrank the breakpoint", () => {
    // The breakpoint is a guess about the reader; the attribute is the reader
    // answering. Every rule inside the 1279px block must therefore yield to
    // `expanded`, or a narrow window can never show labels.
    const media = mediaSection();
    const railRules = media.match(/\n\s*(html[^\n{]*)?\.icg-rail[^\n{]*\{/g) ?? [];
    expect(railRules.length).toBeGreaterThan(2);
    for (const rule of railRules) {
      expect(rule, `unguarded rail rule in the breakpoint: ${rule.trim()}`).toContain(
        'html:not([data-icg-rail="expanded"])',
      );
    }
  });
});
