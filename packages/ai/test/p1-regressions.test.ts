import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { userByRole } from "@icg/data";
import { namesContradiction } from "@icg/domain";
import { createProjectionService, createQueryService, createWorkspace } from "@icg/services";
import { answerQuestion, routeQuestion, type AiToolContext } from "../src/index.js";

/**
 * The open P1 findings from the Stage G review, fixed.
 *
 * Each block names the finding and the observable defect, because a test that
 * only asserts the corrected behaviour reads as an arbitrary preference once
 * the defect is out of living memory.
 */

let t: AiToolContext;

beforeEach(() => {
  const ws = createWorkspace();
  t = {
    queries: createQueryService(ws),
    projections: createProjectionService(ws),
    ctx: { user: userByRole("CONTROLLER"), correlationId: "T-P1", sourceInterface: "ASK_GAURD" },
  };
});

/**
 * G41 — the worst of the open findings.
 *
 * "Which exceptions are not resolved?" matched `resolved-exceptions`'s
 * `["which", "resolved"]` group, because both words are present and the
 * pattern language has no negation by design. The product answered with the
 * RESOLVED population: "8 of 15 exceptions carry a recorded resolution",
 * followed by eight rows every one of which was the opposite of the question.
 */
describe("G41 — a negated ask is not answered with the affirmative population", () => {
  const NEGATED = [
    "Which exceptions are not resolved?",
    "What has not been resolved?",
    "Which exceptions are unresolved?",
    "Show me unresolved items.",
    "Which exceptions have not been concluded?",
  ];
  const AFFIRMATIVE = [
    "Which exceptions are resolved?",
    "What is already resolved?",
    "Which items are resolved?",
  ];

  it("routes every negated phrasing away from the resolved intent", () => {
    for (const q of NEGATED) {
      expect(routeQuestion(q)?.key, q).toBe("unresolved-exceptions");
    }
  });

  it("leaves the affirmative phrasings exactly where they were", () => {
    // The other half of the biconditional. A fix that captured both would
    // have moved the defect rather than closed it.
    for (const q of AFFIRMATIVE) {
      expect(routeQuestion(q)?.key, q).toBe("resolved-exceptions");
    }
  });

  it("answers with the open population, and the two answers are complements", () => {
    const open = answerQuestion(t, "Which exceptions are not resolved?");
    const resolved = answerQuestion(t, "Which exceptions are resolved?");

    const idsOf = (r: typeof open): string[] =>
      (r.answer?.knownFacts ?? []).map((f) => f.label.split(" — ")[0] as string).sort();
    const openIds = idsOf(open);
    const resolvedIds = idsOf(resolved);

    // Derived from the workspace, never transcribed: a hard-coded id list here
    // would be satisfied by a literal in the engine.
    const all = t.queries.listExceptions(t.ctx);
    expect(openIds.length).toBeGreaterThan(0);
    expect(resolvedIds.length).toBeGreaterThan(0);
    // Disjoint...
    expect(openIds.filter((id) => resolvedIds.includes(id))).toEqual([]);
    // ...and exhaustive. Together they are the whole population, which is the
    // property that makes "not resolved" a real answer rather than a
    // differently-wrong one.
    expect([...openIds, ...resolvedIds].sort()).toEqual(all.map((e) => e.exception.id).sort());
    // And every row it returns is genuinely open, checked against the service.
    const openByService = new Set(all.filter((e) => e.open).map((e) => e.exception.id));
    for (const id of openIds) expect(openByService.has(id), id).toBe(true);
  });

  it("says it is reporting what is outstanding, not what is closed", () => {
    const r = answerQuestion(t, "Which exceptions are not resolved?");
    expect(r.answer?.status).toMatch(/not resolved/);
    expect(r.answer?.status).not.toMatch(/carry a recorded resolution/);
  });
});

/**
 * G14 + G15 — one root cause, three call sites.
 *
 * `conflictingEvidence` was keyed on open-ness alone: `open ? [f.whyFlagged] : []`.
 * That treats "the rule is still firing" as a synonym for "two records
 * disagree", and the rules fire for two different reasons. So EXC-007's drawer
 * announced under CONFLICTING EVIDENCE that "the year-end custodian
 * confirmation requested 2026-12-28 has not been answered" — inviting an
 * auditor to look for a contradictory record that does not exist — while the
 * SAME answer filed the same absence under MISSING EVIDENCE. The fleet answer
 * then summed the same seven strings into "7 open items carry evidence that
 * conflicts".
 */
describe("G14/G15 — an absence is not filed as a conflict", () => {
  const CONFLICT_QUESTION = "Which items have conflicting evidence?";

  /** Every open exception, with the rules' own classification of its codes. */
  const openExceptions = () =>
    t.queries
      .listExceptions(t.ctx)
      .filter((v) => v.open)
      .map((v) => ({
        id: v.exception.id,
        codes: v.exception.finding.reasonCodes,
        contradicts: namesContradiction(v.exception.finding.reasonCodes),
      }));

  it("emits a conflict narrative only where the finding names a contradiction", () => {
    // The categorical assertion. Rewording any one sentence cannot satisfy it,
    // and it holds for exceptions this dataset has not got yet.
    for (const e of openExceptions()) {
      const r = answerQuestion(t, `Why is ${e.id} still open?`, { exceptionId: e.id });
      const conflicts = r.answer?.conflictingEvidence ?? [];
      expect(conflicts.length > 0, `${e.id} codes=${JSON.stringify(e.codes)}`).toBe(e.contradicts);
    }
  });

  it("keeps EXC-007's absence, and keeps it in the channel that means absence", () => {
    // The flagship case: nothing contradicts anything. NetSuite records 14
    // units and no second record says otherwise — the custodian never replied.
    const r = answerQuestion(t, "Why is EXC-007 still open?", { exceptionId: "EXC-007" });
    expect(r.answer?.conflictingEvidence).toEqual([]);
    // Not deleted — moved. The outstanding record is still reported.
    expect((r.answer?.missingEvidence ?? []).length).toBeGreaterThan(0);
    expect((r.answer?.missingEvidence ?? []).join(" ")).toMatch(/confirmation/i);
  });

  it("does not let a real conflict be dropped along with the absences", () => {
    // The other half of the biconditional. EXC-001 is a genuine
    // shipped-but-still-on-hand contradiction WITH a missing contract
    // provision beside it; the conflict does not stop being real.
    const r = answerQuestion(t, "Why is EXC-001 still open?", { exceptionId: "EXC-001" });
    expect((r.answer?.conflictingEvidence ?? []).length).toBe(1);
  });

  it("counts the fleet status over the items it actually lists", () => {
    const r = answerQuestion(t, CONFLICT_QUESTION);
    const listed = (r.answer?.conflictingEvidence ?? []).length;
    const expected = openExceptions().filter((e) => e.contradicts).length;
    expect(listed).toBe(expected);
    // The status is a count over that population, not over `open.length` —
    // which is how it came to say 7 while three of the seven carried none.
    expect(r.answer?.status).toMatch(new RegExp(`^${expected} open item`));
    expect(expected).toBeLessThan(openExceptions().length);
  });

  it("fixes the serial-scoped door too, not only the two the review named", () => {
    // A third call site the review never listed. A fix at the other two would
    // leave the identical sentences reachable from a unit page.
    const r = answerQuestion(t, "What conflicts about this serial?", { serial: "KE-E2-1048" });
    for (const line of r.answer?.conflictingEvidence ?? []) {
      // Whatever it emits must belong to a finding that names a contradiction.
      const owner = t.queries
        .listExceptions(t.ctx)
        .find((v) => v.exception.finding.whyFlagged === line);
      expect(owner, line.slice(0, 60)).toBeDefined();
      expect(namesContradiction(owner!.exception.finding.reasonCodes)).toBe(true);
    }
  });
});

/**
 * G19 — a doc comment claimed `routeQuestion` was "used by `answerQuestion`,
 * so the two cannot disagree about what the table says". It was not: both ran
 * their own copy of the same `INTENTS.find(...)` expression. They agreed only
 * because the copies happened to be identical, and nothing kept them so — the
 * routing harness could have gone on validating a path production no longer
 * took.
 */
describe("G19 — the harness and production search the table once", () => {
  it("searches the intent table by question in exactly one place", () => {
    // Structural, because the claim is structural: two call sites is the
    // defect, however identical they look on the day they are written.
    //
    // Counted precisely. `INTENTS.find` alone is the wrong probe — this
    // assertion first failed at 3, counting its own explanatory comment and a
    // `find((i) => i.key === "financial-life")`, which is a LOOKUP by
    // identity, not a routing search, and is not what G19 was about. What
    // must be unique is the search that maps a QUESTION onto the table.
    const src = readFileSync(join(import.meta.dirname, "..", "src", "answers.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    const routingSearches = code.match(/INTENTS\s*\.\s*find\s*\(\s*\(?\s*i\s*\)?\s*=>\s*matchesQuestion/g) ?? [];
    expect(routingSearches).toHaveLength(1);
    expect(code).toContain("function selectIntent(");
    // And both public entry points go through it rather than re-deriving.
    expect(code).toMatch(/routeQuestion[\s\S]{0,200}selectIntent\(/);
    expect(code).toMatch(/const intent = selectIntent\(q\)/);
  });

  it("routes a question to the same intent that answers it", () => {
    // The behavioural half. `answerQuestion` may legitimately fall back when
    // an intent matches and yields nothing, so this asserts agreement only
    // where an intent actually produced the answer.
    const QUESTIONS = [
      "Which exceptions are not resolved?",
      "Which exceptions are resolved?",
      "What prevents sign-off?",
      "Why doesn't inventory tie?",
      "Which evidence is still missing?",
      "Which PBC items are not ready?",
      "What is the E&O position?",
    ];
    let agreed = 0;
    for (const q of QUESTIONS) {
      const routed = routeQuestion(q);
      const answered = answerQuestion(t, q);
      if (routed === undefined || answered.answer === undefined) continue;
      if (answered.route === "exception-detail") continue;
      expect(answered.route, q).toBe(routed.key);
      agreed += 1;
    }
    // The loop must actually have proved something.
    expect(agreed).toBeGreaterThanOrEqual(5);
  });
});
