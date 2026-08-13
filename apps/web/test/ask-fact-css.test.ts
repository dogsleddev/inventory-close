import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A source-scanning test, in the shape of `no-hardcoded-totals.test.ts`.
 *
 * jsdom does not lay out, so no assertion made here can observe the actual
 * defect: an Ask Gaurd known-fact value 341 characters long rendering as one
 * 1,913px line inside a 287px drawer. What CAN be asserted is the declaration
 * that caused it. `.icg-ask-fact` is a flex row; a flex item whose basis is
 * `auto` takes its max-content width as its flex base size, and `flex-shrink:
 * 0` forbids it coming down from there. The value therefore could not wrap at
 * any drawer width, and all the negative free space landed on the label.
 *
 * The history is why this is asserted at all rather than left to review:
 * commit 4552c9b removed `white-space: nowrap` from this exact block and added
 * `flex-shrink: 0` in the same hunk — re-creating the identical overflow
 * through a second mechanism, under a comment announcing the class closed.
 */

const CSS = readFileSync(join(import.meta.dirname, "..", "app", "icg.css"), "utf8");

/**
 * The declarations inside one rule, selected by its exact selector, with
 * comments stripped. The stripping is load-bearing: these blocks are heavily
 * commented, and the comments quote the very declarations under test — a
 * comment reading "`flex-shrink: 0` forbids it coming down from there" is
 * enough to satisfy a naive scan of the raw text and hide a real regression.
 */
function block(selector: string): string {
  const at = CSS.indexOf(`${selector} {`);
  expect(at, `${selector} is no longer declared in icg.css`).toBeGreaterThan(-1);
  const open = CSS.indexOf("{", at);
  const close = CSS.indexOf("}", open);
  expect(close).toBeGreaterThan(open);
  return CSS.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("Ask Gaurd known-fact rows wrap inside the drawer", () => {
  const dd = block(".icg-ask-fact dd");
  const dt = block(".icg-ask-fact dt");

  it("lets the value shrink from its max-content width", () => {
    expect(dd).not.toMatch(/flex-shrink:\s*0\b/);
  });

  it("removes the automatic minimum that would block the shrink", () => {
    expect(dd).toMatch(/min-width:\s*0\b/);
  });

  it("gives the value a break opportunity inside a long token", () => {
    expect(dd).toMatch(/overflow-wrap:/);
  });

  it("never restores the nowrap the shrink replaced", () => {
    expect(dd).not.toMatch(/white-space:\s*nowrap/);
  });

  /**
   * The other half of the same row. Once the value can shrink, flex
   * distributes the shortfall in proportion to base size — which still hands a
   * 5-char label a 5px box next to a 1,913px value. What stops the label
   * obeying is its own automatic minimum, and `min-width: 0` is precisely the
   * declaration that removes it. `overflow-wrap: anywhere` removes it too, by
   * dropping min-content to one character; `break-word` does not.
   */
  it("keeps a floor under the label so it cannot collapse to one letter per line", () => {
    expect(dt).not.toMatch(/min-width:\s*0\b/);
    expect(dt).not.toMatch(/overflow-wrap:\s*anywhere/);
    expect(dt).toMatch(/overflow-wrap:\s*break-word/);
  });
});
