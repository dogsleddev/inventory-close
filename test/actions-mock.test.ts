import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { collect, REPO_ROOT } from "./repo-scan";

/**
 * Every `vi.mock("../app/actions")` factory names every export the module has.
 *
 * A factory that omits one does not yield `undefined` — vitest wraps the
 * factory in a proxy that THROWS `No "<name>" export is defined` the first
 * time anything reads the missing name. So the omission is lazy rather than
 * silent: it survives exactly as long as no test reaches that control, and a
 * new server action can sit unmocked across several stages before a test
 * finally touches it. That is what happened to `recordSignOff`.
 *
 * The comments in those four files used to be the enforcement. A comment
 * asserting a property nothing checks is the same claim-vs-enforcement defect
 * as a screen describing a control it does not gate — and more dangerous,
 * because the next author trusts it instead of re-deriving it.
 *
 * This is a STATIC SCAN by necessity. `vi.mock` is hoisted above imports and
 * cannot close over an outer binding, so `Object.keys(factory)` is not
 * reachable from inside the file; and `vi.importActual` executes the real
 * "use server" module, returning interop keys alongside the functions.
 */

const ACTIONS_PATH = "apps/web/app/actions.ts";
const MOCKING_FILES = [
  "apps/web/test/ask-gaurd.test.tsx",
  "apps/web/test/close-loop.test.tsx",
  "apps/web/test/overview.test.tsx",
  "apps/web/test/stage09.test.tsx",
] as const;

/**
 * Matches the mock call by MODULE rather than by one spelling of its
 * specifier: a test file one directory deeper has to write `../../app/actions`,
 * and a substring match on the shallow form would silently exclude it from a
 * scan whose whole job is to be exhaustive.
 */
const MOCK_CALL = /vi\.(?:do)?mock\(\s*["'](?:\.\.\/)+app\/actions(?:\.tsx?)?["']/;

const read = (path: string): string => readFileSync(join(REPO_ROOT, path), "utf8");

/** The exports the module actually has. */
function realExports(): string[] {
  return [...read(ACTIONS_PATH).matchAll(/^export (?:async function|function|const) (\w+)/gm)]
    .map((m) => m[1]!)
    .sort();
}

/** The keys one factory lists. */
function factoryKeys(path: string): string[] {
  const source = read(path);
  const start = source.search(MOCK_CALL);
  if (start === -1) return [];
  const end = source.indexOf("\n}));", start);
  if (end === -1) return [];
  return [...source.slice(start, end).matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]!).sort();
}

describe("every actions mock lists every action", () => {
  for (const path of MOCKING_FILES) {
    it(`${path} mocks the whole module`, () => {
      expect(factoryKeys(path)).toEqual(realExports());
    });
  }
});

describe("the scan covers what it claims to cover", () => {
  it("finds the real exports", () => {
    // Without this, a renamed actions module makes every assertion above
    // compare two empty arrays and pass.
    expect(realExports().length).toBeGreaterThan(5);
  });

  it("parses every factory it claims to check", () => {
    for (const path of MOCKING_FILES) {
      expect(
        factoryKeys(path).length,
        `${path} parsed to zero keys — the scan would report it clean without reading it`,
      ).toBeGreaterThan(0);
    }
  });

  it("reads every export the module declares", () => {
    // A regex over source text is an allowlist of SYNTAX, and it can never be
    // complete — `export default`, `export { … } from` and `export *` all
    // return nothing from it. This makes an unrecognised form loud instead of
    // invisible, so the scan cannot certify a factory complete against a list
    // it silently failed to build.
    const declared = [...read(ACTIONS_PATH).matchAll(/^export /gm)].length;
    expect(declared, "actions.ts has an export the scan's regex does not read").toBe(
      realExports().length,
    );
  });

  it("knows about every file that mocks the actions module", () => {
    // Re-derived from the tree, so a fifth mocking file cannot be added
    // without either being covered or failing here.
    const found = collect(["apps/web/test"], [".ts", ".tsx"])
      .filter((f) => MOCK_CALL.test(f.text))
      .map((f) => f.path)
      .sort();
    expect(found).toEqual([...MOCKING_FILES].sort());
  });
});
