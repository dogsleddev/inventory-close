import { beforeEach, describe, expect, it } from "vitest";
import { userByRole } from "@icg/data";
import type { Role } from "@icg/domain";
import {
  createProjectionService,
  createQueryService,
  createWorkspace,
  type ServiceContext,
} from "@icg/services";
import { answerQuestion, type AiToolContext } from "../src/index.js";

/**
 * Answer CONTENT, at the states and scopes the shipped chips actually reach.
 *
 * Every question below is a chip a user clicks with no typing, as the default
 * CONTROLLER role, and each one is asserted against the workspace rather than
 * against a transcribed expectation — an assertion that hard-codes what the
 * engine should say is satisfied by a literal in the engine.
 */

let t: AiToolContext;
let queries: ReturnType<typeof createQueryService>;
let ctx: ServiceContext;

const ctxFor = (role: Role): ServiceContext => ({
  user: userByRole(role),
  correlationId: `T-CONTENT-${role}`,
  sourceInterface: "ASK_GAURD",
});

beforeEach(() => {
  const ws = createWorkspace();
  queries = createQueryService(ws);
  ctx = ctxFor("CONTROLLER");
  t = { queries, projections: createProjectionService(ws), ctx };
});

/**
 * ITEM 10. Rendered, this produced eleven missingEvidence lines, seven of them
 * reading "is missing 1 required component(s)." — while the SAME answer's
 * status one line up used plural() correctly. Reachable with no typing from
 * ProcurementScreen.tsx:67 and ReconciliationScreen.tsx:91.
 */
describe("the procurement answer counts its own components", () => {
  it("never renders the (s) parenthetical, and says '1 required component'", () => {
    const r = answerQuestion(t, "Why can a native match pass while the close stays open?");
    const missing = r.answer?.missingEvidence ?? [];

    expect(missing.length).toBeGreaterThan(0);
    expect(missing.filter((m) => /component\(s\)/.test(m))).toEqual([]);
    // The singular case must actually occur, or the assertion above is
    // satisfied by an answer that simply never reaches one.
    expect(missing.some((m) => /\bis missing 1 required component\.$/.test(m))).toBe(true);
    // And the plural is still spelled as a plural.
    for (const line of missing) {
      const n = Number(/is missing (\d+) required/.exec(line)?.[1] ?? "0");
      expect(line, line).toMatch(n === 1 ? /1 required component\./ : /required components\./);
    }
  });
});

/**
 * ITEM 11. `assertions` was the hand-written literal ["EXISTENCE",
 * "COMPLETENESS"], while the answer's citations are EXC-009, EXC-014 and
 * EXC-015, whose findings assert ACCURACY, ACCURACY+CUTOFF and ACCURACY. The
 * two lists were DISJOINT — and `answerException` renders the finding's own
 * assertions, so EXC-015's drawer, one click away through that citation, said
 * "Accuracy". This is the Overview's suggested chip #2.
 */
describe("the reconciliation answer asserts what its own citations assert", () => {
  it("equals the union of the cited findings' assertions", () => {
    const r = answerQuestion(t, "Why doesn't inventory tie?");
    const answer = r.answer;
    expect(answer).toBeDefined();

    const citedIds = (answer?.citations ?? [])
      .map((c) => c.label)
      .filter((label) => /^EXC-\d+$/.test(label));
    expect(citedIds.length).toBeGreaterThan(0);

    // Computed from the workspace, not transcribed. A literal here would be
    // satisfied by a literal in the engine, which is the defect.
    const expected = [
      ...new Set(
        queries
          .listExceptions(ctx)
          .filter((v) => citedIds.includes(v.exception.id))
          .flatMap((v) => v.exception.finding.assertions),
      ),
    ].sort();

    expect([...(answer?.assertions ?? [])].sort()).toEqual(expected);
    // The specific contradiction, named: neither of the two literals it used
    // to claim is asserted by anything it cites.
    expect(expected).toContain("ACCURACY");
    expect(expected).toContain("CUTOFF");
    expect(answer?.assertions).not.toContain("EXISTENCE");
    expect(answer?.assertions).not.toContain("COMPLETENESS");
  });

  it("agrees with the drawer its own citation opens", () => {
    const r = answerQuestion(t, "Why doesn't inventory tie?");
    const drawer = answerQuestion(t, "Why is this still open?", { exceptionId: "EXC-015" });

    // One click apart, about the same record.
    for (const assertion of drawer.answer?.assertions ?? []) {
      expect(r.answer?.assertions, `EXC-015 asserts ${assertion}`).toContain(assertion);
    }
  });
});

/**
 * ITEM 12. `routeQuestion("When was this serial last counted?")` resolves to
 * the `counts` intent, and the answer function never read `q.serial`. Rendered
 * with the real chip scope {serial:"KE-E2-1048"} it returned "1,061 of 1,065
 * units matched on the first pass", seven population facts, NO DATE, and never
 * named the serial. This is the flagship unit page's suggested chip #2
 * (FinancialLifeScreen.tsx:53-58), one click on /inventory/KE-E2-1048.
 */
describe("the counts answer answers about the serial it was asked about", () => {
  const SERIAL = "KE-E2-1048";

  it("names the serial, carries an instant, and drops the close totals", () => {
    const r = answerQuestion(t, "When was this serial last counted?", { serial: SERIAL });
    const answer = r.answer;
    expect(answer).toBeDefined();

    expect(answer?.status).toContain(SERIAL);
    expect(JSON.stringify(answer)).not.toMatch(/1,061 of 1,065/);
    expect(JSON.stringify(answer)).not.toMatch(/1061 of 1065/);

    // At least one fact carries a date or instant, which is what "when" asks.
    const dated = [...(answer?.knownFacts ?? [])].filter((f) =>
      /\d{4}-\d{2}-\d{2}/.test(f.text ?? ""),
    );
    expect(dated.length).toBeGreaterThan(0);
  });

  /**
   * The absence branch. KE-X1-8842 (EXC-004) is off-book by design: it is
   * found on the floor by a test count and named by no count line. It is the
   * unit for which "1,061 of 1,065 units matched on the first pass" was most
   * misleading, because it contributed to neither number — so the absence has
   * to be reported in its own words, never as a zero and never as the
   * population.
   */
  it("reports a serial with no count line as an absence, not a zero", () => {
    const OFF_BOOK = "KE-X1-8842";
    const rows = queries.getCountDetail(ctx).results.filter((r) => r.serial === OFF_BOOK);
    expect(rows, "fixture changed: this serial now has a count line").toEqual([]);

    const r = answerQuestion(t, "When was this serial last counted?", { serial: OFF_BOOK });
    expect(r.answer?.status).toContain(OFF_BOOK);
    expect(r.answer?.status).toMatch(/No count line names/);
    expect(r.answer?.missingEvidence.join(" ")).toMatch(/No count row for KE-X1-8842/);
    expect(JSON.stringify(r.answer)).not.toMatch(/1,061 of 1,065/);
    // The distinction the sentence exists to draw.
    expect(r.answer?.managementConclusion).toMatch(/not a quantity of zero/);
  });

  it("leaves the unscoped population answer alone", () => {
    const r = answerQuestion(t, "When was this serial last counted?");
    const summary = queries.getCountSummary(ctx);
    const counts = (r.answer?.knownFacts ?? []).map((f) => f.count);

    expect(counts).toContain(summary.populationUnits);
    expect(counts).toContain(summary.firstPassMatchedUnits);
    expect(r.answer?.status).not.toContain(SERIAL);
  });
});
