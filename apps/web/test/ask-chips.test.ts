import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { userByRole } from "@icg/data";
import {
  INTERPRETATION_CONSTANT_NAMES,
  createProjectionService,
  createQueryService,
  createWorkspace,
} from "@icg/services";
import { INTENT_KEYS, answerQuestion, type AiToolContext } from "@icg/ai";
import { askGaurdData } from "../lib/server/ask-view";

/**
 * Every suggestion chip the product ships reaches a handler and gets an
 * answer (COMPLETION_PLAN Stage G).
 *
 * The stage-08 version of this test listed thirteen chips by hand, in
 * `packages/ai`, copied from the screens. By the time Stage F shipped, the
 * screens carried fifty-four and **twenty-two of them refused** —
 * every Costing, Custody and Methodology chip, both Procurement population
 * chips, and the memo and reconciliation phrasings. The hand-copied list had
 * not been wrong on the day it was written; it had simply stopped being the
 * list. A chip that refuses is the worst refusal the product can produce,
 * because the product suggested the question itself.
 *
 * So the population is READ FROM THE TREE, the way `test/actions-mock.test.ts`
 * re-derives its four mocking files. A new screen with a new chip is covered
 * the moment it is written, and a chip nobody remembered to route fails here.
 *
 * This lives in `apps/web` rather than in `packages/ai` because apps/web owns
 * the components: a test in @icg/ai reading across the workspace would be
 * asserting something about a package it does not depend on.
 */

const COMPONENTS = join(import.meta.dirname, "..", "components");

/** The scope AppShell hands the drawer, read from the screen's own askScope. */
type ChipScope = { exceptionId?: string; serial?: string };

interface Chip {
  readonly file: string;
  readonly question: string;
  readonly scope: ChipScope;
}

/**
 * A real object of each kind, for the screens whose drawer is scoped to one.
 * The screens pass `data.id` / `data.serial`; a test cannot read those, so it
 * supplies the objects those screens are rendered for.
 */
const EXCEPTION_UNDER_TEST = "EXC-001";
const SERIAL_UNDER_TEST = "KE-E2-1048";

/**
 * `askScope` is declared in the screen, so which screens are object-scoped is
 * derived rather than listed: a new object-scoped screen does not need this
 * file edited, and — more to the point — a screen that LOSES its scope stops
 * being tested as scoped.
 */
function scopeOf(source: string): ChipScope {
  const declaration = /askScope:\s*\{([^}]*)\}/.exec(source);
  if (declaration === null) return {};
  const body = declaration[1]!;
  return {
    ...(/\bexceptionId\b/.test(body) ? { exceptionId: EXCEPTION_UNDER_TEST } : {}),
    ...(/\bserial\b/.test(body) ? { serial: SERIAL_UNDER_TEST } : {}),
  };
}

const componentFiles = (): readonly string[] =>
  readdirSync(COMPONENTS).filter((f) => f.endsWith(".tsx"));

const read = (file: string): string => readFileSync(join(COMPONENTS, file), "utf8");

/** Files that SHIP chips — AppShell only forwards the prop it is given. */
const shippingFiles = (): readonly string[] =>
  componentFiles().filter((f) => /askSuggestions\s*[:=]\s*\{?\[/.test(read(f)));

function chipsIn(file: string): readonly Chip[] {
  const source = read(file);
  // Non-greedy to the first `]`, which is the closing bracket because no chip
  // contains one. Two screens write the array on a single line, so a pattern
  // anchored on a newline before the bracket read them as empty — caught by
  // the two-chip floor below, which is what that floor is for.
  const block = /askSuggestions\s*[:=]\s*\{?\[([\s\S]*?)\]/.exec(source);
  if (block === null) return [];
  const body = block[1]!;
  const scope = scopeOf(source);
  const literals = [...body.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]!);
  // `Why is ${data.header.primarySerial} still open?` — the design's own demo
  // question. The interpolation is replaced with the serial that screen is
  // rendered for, because the chip a reader clicks carries a real one.
  const templates = [...body.matchAll(/`((?:[^`\\]|\\.)*)`/g)].map((m) =>
    m[1]!.replace(/\$\{[^}]*\}/g, SERIAL_UNDER_TEST),
  );
  return [...literals, ...templates].map((question) => ({ file, question, scope }));
}

const allChips = (): readonly Chip[] => shippingFiles().flatMap(chipsIn);

let t: AiToolContext;
beforeAll(() => {
  const ws = createWorkspace();
  t = {
    queries: createQueryService(ws),
    projections: createProjectionService(ws),
    ctx: {
      user: userByRole("CONTROLLER"),
      correlationId: "T-CHIPS",
      sourceInterface: "ASK_GAURD",
    },
  };
});

describe("the scan covers what it claims to cover", () => {
  it("finds the screens that ship chips", () => {
    // A renamed prop or a moved directory would otherwise make every
    // assertion below iterate an empty list and report the product clean.
    expect(shippingFiles().length).toBeGreaterThan(14);
  });

  it("parses at least two chips out of every screen that ships them", () => {
    for (const file of shippingFiles()) {
      expect(
        chipsIn(file).length,
        `${file} declares askSuggestions and parsed to fewer than two chips — the scan would pass it without reading it`,
      ).toBeGreaterThan(1);
    }
  });

  it("reads the interpolated chip, not only the literal ones", () => {
    // ExceptionDetailScreen's flagship chip is a template literal. A scan
    // that saw only double-quoted strings would silently skip the one
    // question the design names by name.
    const interpolated = allChips().filter((c) => c.question.includes(SERIAL_UNDER_TEST));
    expect(interpolated.length).toBeGreaterThan(0);
  });

  it("knows which screens scope the drawer to an object", () => {
    const scoped = shippingFiles()
      .filter((f) => Object.keys(scopeOf(read(f))).length > 0)
      .sort();
    // Derived from the tree, then asserted: a screen that loses its askScope
    // would otherwise start being tested unscoped and still pass.
    expect(scoped).toEqual(["ExceptionDetailScreen.tsx", "FinancialLifeScreen.tsx"]);
  });
});

describe("every shipped suggestion chip answers", () => {
  it.each(allChips())("$file: $question", ({ question, scope }) => {
    const r = answerQuestion(t, question, scope);
    expect(
      r.answer,
      `refused with ${r.refusal?.reason}: "${r.refusal?.message ?? ""}"`,
    ).toBeDefined();
  });

  it.each(allChips())("$file routes to a named handler: $question", ({ question, scope }) => {
    const r = answerQuestion(t, question, scope);
    // Not merely "an answer came back": WHICH handler produced it. An answer
    // from `unrouted` is impossible, but an answer from the scoped-object
    // fallback where the chip named a topic is a routing miss that still
    // renders something plausible.
    expect([...INTENT_KEYS, "exception-detail", "unit-detail"]).toContain(r.route);
  });
});

describe("no answer shows a reader a canonical token", () => {
  /**
   * @icg/ai emits canonical values because those are the structured ones.
   * apps/web words them, from the maps the screens already use. This is the
   * assertion that keeps that map COMPLETE rather than merely current: it
   * walks every chip's rendered answer and fails on any screaming-snake
   * token still in it.
   *
   * The shape excludes record identifiers deliberately — `EXC-001`,
   * `KE-E2-1048`, `PBC-008` and `SO-26184` carry hyphens, never underscores,
   * and a reader wants those verbatim.
   */
  const TOKEN = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;

  /**
   * A code-constant NAME is not a label and must survive verbatim: `heldIn`
   * names the module a judgement lives in so a reader can go and find it,
   * and the Methodology screen prints it unchanged for the same reason. The
   * exclusion is read from the service's own exported list rather than
   * spelled here, so a renamed constant cannot quietly start being demanded.
   */
  const unworded = (value: string): readonly string[] =>
    (value.match(TOKEN) ?? []).filter((x) => !INTERPRETATION_CONSTANT_NAMES.includes(x));

  it("finds tokens when they are there", () => {
    // The negative assertions below are worthless if the pattern matches
    // nothing; this pins that it matches the shape it claims to.
    expect(unworded("held by COMPANY_WAREHOUSE")).toEqual(["COMPANY_WAREHOUSE"]);
    expect(unworded("EXC-001 and KE-E2-1048 and PBC-008")).toEqual([]);
    expect(unworded("held in INVENTORY_ACCOUNTING_MATRIX")).toEqual([]);
  });

  it.each(allChips())("$file: $question", ({ question, scope }) => {
    const result = askGaurdData(
      userByRole("CONTROLLER"),
      question,
      scope,
      "T-CHIPS-RENDER",
    );
    const answer = result.answer;
    expect(answer, `refused with ${result.refusal?.reason}`).not.toBeNull();
    const strings = [
      answer!.status,
      answer!.managementConclusion,
      answer!.nextAction,
      ...answer!.knownFacts.flatMap((f) => [f.label, f.value]),
      ...answer!.conflictingEvidence,
      ...answer!.missingEvidence,
      // The restriction channel is rendered, so it is scanned. It is a newer
      // channel than this list, and `ask-view.ts` states that this test "asserts
      // no rendered answer field still carries a screaming-snake token, which is
      // what keeps this map complete" — a claim that was more precise than the
      // list enforcing it the moment a rendered field was added and not added
      // here.
      ...answer!.scopeNotes,
      ...answer!.citations.map((c) => c.label),
      ...answer!.assertions,
      ...answer!.draft.flatMap((d) => [d.heading, d.body]),
      ...(answer!.exposure !== null ? [answer!.exposure.label, answer!.exposure.value] : []),
    ];
    for (const value of strings) {
      expect(unworded(value), `unworded canonical value in: "${value}"`).toEqual([]);
    }
  });
});

describe("the chips a reader is offered are answered from the screen they sit on", () => {
  it("answers every chip for every demo role, or refuses it as a restriction", () => {
    /**
     * The other half of "it answers": for a role that may not read what the
     * question needs, the chip must produce NOT_AUTHORIZED — a restriction —
     * and never OUT_OF_SCOPE, which would tell an auditor the product cannot
     * answer a question it simply will not answer for them.
     */
    const ws = createWorkspace();
    const queries = createQueryService(ws);
    const projections = createProjectionService(ws);
    const chips = allChips();
    let checked = 0;
    for (const role of ["AUDITOR_READ_ONLY", "PREPARER", "WAREHOUSE"] as const) {
      const asRole: AiToolContext = {
        queries,
        projections,
        ctx: {
          user: userByRole(role),
          correlationId: `T-CHIPS-${role}`,
          sourceInterface: "ASK_GAURD",
        },
      };
      for (const chip of chips) {
        const r = answerQuestion(asRole, chip.question, chip.scope);
        checked += 1;
        if (r.answer !== undefined) continue;
        expect(
          r.refusal?.reason,
          `${role} · ${chip.file} · "${chip.question}"`,
        ).not.toBe("OUT_OF_SCOPE");
      }
    }
    // Assert the loop ran: a filter that emptied the population would leave
    // every assertion above unexecuted and the test green.
    expect(checked).toBe(chips.length * 3);
  });
});
