import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The projection layer's scoping claim, checked rather than asserted.
 *
 * `projections.ts` names which delegates read source documents and call
 * `makeRecordScope` and which reach no scoped record at all. That paragraph has
 * been wrong twice:
 *
 * 1. It first claimed every delegate "already calls `authorize` and scopes
 *    source documents itself" — a claim about ten modules made by a file that
 *    calls into them and checks nothing. It was false of most of them, and live
 *    for one: `getEoMethodology` read a forecast's note straight off the
 *    fixture, so an auditor whose workpaper scope hides FC-002 read its note.
 * 2. The fix for that put `costing` and `methodology` in the scoping list, from
 *    a `grep -c makeRecordScope` that counted the very comments in those files
 *    saying they deliberately do NOT call it — and cited its own guard as
 *    `projections.test.ts`, which did not exist.
 *
 * So this file derives both lists from the source and fails when the comment
 * and the code disagree. A comment naming its own test is worth nothing until
 * the file exists; this is that file.
 */

const SRC = join(import.meta.dirname, "..", "src");
const read = (f: string): string => readFileSync(join(SRC, `${f}.ts`), "utf8");

/**
 * Does this module CALL `makeRecordScope`, as opposed to mentioning it?
 *
 * The distinction is the whole point: `costing.ts` and `methodology.ts` each
 * contain the string in a docstring explaining why they do not call it, and
 * counting those mentions is exactly how the list went wrong the second time.
 * Comments are stripped before looking for a call.
 */
function callsRecordScope(module: string): boolean {
  const withoutComments = read(module)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  return /\bmakeRecordScope\s*\(/.test(withoutComments);
}

/** Every module `projections.ts` delegates to, read from its own imports. */
function delegateModules(): readonly string[] {
  const source = read("projections");
  const imports = [...source.matchAll(/from "\.\/([a-zA-Z]+)\.js"/g)].map((m) => m[1]!);
  return [...new Set(imports)].filter((m) => m !== "queries" && m !== "workspace");
}

describe("the projection layer's scoping claim is checked, not asserted", () => {
  const SCOPES = ["procurement", "ownership", "eoMethodology"];
  const REACHES_NO_SOURCE_RECORD = ["costing", "methodology", "glAccounts", "memo"];

  it("covers every module projections.ts actually delegates to", () => {
    // Without this the two lists below could quietly stop describing the file
    // they are about — which is the failure mode this test exists for.
    const named = new Set([...SCOPES, ...REACHES_NO_SOURCE_RECORD]);
    for (const module of delegateModules()) {
      expect(named.has(module), `${module}.ts is delegated but named in neither list`).toBe(true);
    }
    expect(delegateModules().length).toBeGreaterThan(4);
  });

  it.each(SCOPES)("%s calls makeRecordScope", (module) => {
    expect(callsRecordScope(module)).toBe(true);
  });

  it.each(REACHES_NO_SOURCE_RECORD)("%s does not call makeRecordScope", (module) => {
    expect(callsRecordScope(module)).toBe(false);
  });

  it("distinguishes a call from a mention", () => {
    /**
     * The guard on the guard. `costing.ts` and `methodology.ts` both contain
     * the string `makeRecordScope` in prose; if this helper counted that, the
     * assertion above would pass while describing them wrongly — which is what
     * shipped.
     */
    for (const module of ["costing", "methodology"]) {
      expect(read(module), `${module} no longer mentions the scope in prose`).toContain(
        "makeRecordScope",
      );
      expect(callsRecordScope(module), `${module}: a mention was read as a call`).toBe(false);
    }
  });

  it("says in projections.ts what it says here", () => {
    // The paragraph and the lists are two statements of one fact, and the
    // point of this file is that they cannot come apart.
    const doc = read("projections");
    for (const module of SCOPES) {
      expect(doc, `projections.ts does not name ${module} among the scoping delegates`).toMatch(
        new RegExp(`\`${module}\``),
      );
    }
    for (const module of REACHES_NO_SOURCE_RECORD) {
      expect(doc, `projections.ts does not name ${module}`).toMatch(new RegExp(`\`${module}\``));
    }
  });
});
