import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { goldenBaselineSchema, isResolvedStatus } from "@icg/domain";
import { runClose } from "../src/index.js";
import { closeInputFromDataset } from "./helpers.js";

/**
 * THE STAGE 03 HARD GATE (prompt 03): all 15 golden accounting scenarios
 * and the aggregate controls must pass before any main-dashboard UI is
 * built. Expectations are restated from CANONICAL_SPEC sections 5-13 and
 * golden/baseline.json independently of the engine.
 */

const here = dirname(fileURLToPath(import.meta.url));
const golden = goldenBaselineSchema.parse(
  JSON.parse(
    readFileSync(join(here, "..", "..", "..", "golden", "baseline.json"), "utf8"),
  ),
);

const result = runClose(closeInputFromDataset());
const byId = new Map(result.exceptions.map((e) => [e.id, e]));

/** [id, ruleId, status, risk, exposureCents, blocker] from CANONICAL section 9 + docs/08. */
const GOLDEN_SCENARIOS: readonly [string, string, string, string, number, boolean][] = [
  ["EXC-001", "CUT-OUT-001", "WAITING_ON_CONTRACT", "HIGH", 1480000, true],
  ["EXC-002", "CUT-IN-001", "ACCOUNTING_REVIEW", "HIGH", 2760000, true],
  ["EXC-003", "CNT-EX-001", "RECOUNT_REQUIRED", "HIGH", 920000, true],
  ["EXC-004", "CNT-COMP-001", "ACCOUNTING_REVIEW", "HIGH", 920000, true],
  ["EXC-005", "CNT-VAR-001", "RESOLVED_NO_ADJUSTMENT", "MEDIUM", 290000, false],
  ["EXC-006", "CNT-MOVE-001", "RESOLVED_NO_ADJUSTMENT", "MEDIUM", 740000, false],
  ["EXC-007", "TPI-CONF-001", "WAITING_ON_THIRD_PARTY", "HIGH", 9240000, true],
  ["EXC-008", "OWN-LOAN-001", "RESOLVED_NO_ADJUSTMENT", "MEDIUM", 1280000, false],
  ["EXC-009", "RMA-DUP-001", "RESOLVED_ADJUSTMENT_PROPOSED", "MEDIUM", 290000, false],
  ["EXC-010", "DEMO-AGE-001", "RESOLVED_NO_ADJUSTMENT", "MEDIUM", 920000, false],
  ["EXC-011", "VAL-EO-001", "ACCOUNTING_REVIEW", "HIGH", 2700000, true],
  ["EXC-012", "VAL-DMG-001", "RESOLVED_NO_ADJUSTMENT", "MEDIUM", 490000, false],
  ["EXC-013", "DQ-LOC-001", "RESOLVED_NO_ADJUSTMENT", "LOW", 740000, false],
  ["EXC-014", "REC-GL-001", "RESOLVED_ADJUSTMENT_PROPOSED", "MEDIUM", 920000, false],
  ["EXC-015", "GL-MAN-001", "CONTROLLER_REVIEW", "CRITICAL", 1875000, true],
];

describe("golden exception scenarios", () => {
  it("derives exactly 15 designed exceptions", () => {
    expect(result.exceptions).toHaveLength(15);
  });

  it.each(GOLDEN_SCENARIOS)(
    "%s <- %s: %s / %s / %i cents / blocker=%s",
    (id, ruleId, status, risk, exposureCents, blocker) => {
      const exc = byId.get(id);
      expect(exc, `${id} missing`).toBeDefined();
      expect(exc?.finding.ruleId).toBe(ruleId);
      expect(exc?.status).toBe(status);
      expect(exc?.finding.risk).toBe(risk);
      expect(exc?.finding.exposureCents).toBe(exposureCents);
      expect(result.blockers.some((b) => b.exceptionId === id)).toBe(blocker);
    },
  );

  it("keeps the canonical story identifiers on their exceptions", () => {
    expect(byId.get("EXC-001")?.finding.subjects.serials).toContain("KE-E2-1048");
    expect(byId.get("EXC-001")?.finding.subjects.transactionNumbers).toEqual(
      expect.arrayContaining(["SO-26184", "IF-261972", "INV-2027-00418"]),
    );
    expect(byId.get("EXC-002")?.finding.subjects.transactionNumbers).toContain("PO-26-1187");
    expect(byId.get("EXC-003")?.finding.subjects.serials).toEqual(["KE-X1-3498"]);
    expect(byId.get("EXC-004")?.finding.subjects.serials).toEqual(["KE-X1-8842"]);
    expect(byId.get("EXC-007")?.finding.subjects.custodian).toBe(
      "Redwood Installation Services",
    );
    expect(byId.get("EXC-011")?.finding.subjects.skus).toEqual(["KE-M1"]);
    expect(byId.get("EXC-015")?.finding.subjects.transactionNumbers).toEqual(["JE-2026-0847"]);
  });

  it("EXC-001 stays open with no ownership inference and no adjustment", () => {
    const exc = byId.get("EXC-001");
    expect(isResolvedStatus(exc?.status ?? "ACCOUNTING_REVIEW")).toBe(false);
    expect(exc?.finding.reasonCodes).toContain("OWNERSHIP_PROVISION_MISSING");
    expect(exc?.finding.reasonCodes).toContain("INVOICE_NOT_OWNERSHIP_EVIDENCE");
    expect(
      result.reconciliation.items.some((i) => i.relatedExceptionId === "EXC-001"),
    ).toBe(false);
  });

  it("EXC-011 flags valuation indicators without inventing a reserve", () => {
    expect(byId.get("EXC-011")?.finding.attributes?.["reserve"]).toBe("UNDETERMINED");
  });
});

describe("golden aggregates", () => {
  it("matches every golden/baseline.json aggregate", () => {
    const a = result.aggregates;
    expect(a.exceptionCount).toBe(golden.exception_count);
    expect(a.openExceptionCount).toBe(golden.open_exception_count);
    expect(a.resolvedExceptionCount).toBe(golden.resolved_exception_count);
    expect(a.blockerCount).toBe(golden.blocker_count);
    expect(a.blockerExposureCents).toBe(golden.blocker_exposure_cents);
    expect(a.designedExceptionExposureCents).toBe(golden.designed_exception_exposure_cents);
    expect(a.closeReadinessBps).toBe(golden.close_readiness_bps);
    expect(a.pbcReady).toBe(golden.pbc_ready);
    expect(a.pbcTotal).toBe(golden.pbc_total);
    expect(a.grossInventoryCents).toBe(golden.gross_inventory_cents);
    expect(a.grossGlCents).toBe(golden.gross_gl_cents);
    expect(a.grossGlDifferenceCents).toBe(golden.gross_gl_difference_cents);
  });

  it("opens exactly EXC-001/002/003/004/007/011/015", () => {
    const open = result.exceptions
      .filter((e) => !isResolvedStatus(e.status))
      .map((e) => e.id)
      .sort();
    expect(open).toEqual([
      "EXC-001", "EXC-002", "EXC-003", "EXC-004", "EXC-007", "EXC-011", "EXC-015",
    ]);
  });

  it("blocker exposure is $198,950 and total designed exposure $255,650", () => {
    expect(result.aggregates.blockerExposureCents).toBe(19895000);
    expect(result.aggregates.designedExceptionExposureCents).toBe(25565000);
  });

  it("reconciles GL to subledger with the three canonical items", () => {
    const r = result.reconciliation;
    expect(r.grossGlCents).toBe(481245000);
    expect(r.subledgerCents).toBe(480000000);
    expect(r.differenceCents).toBe(1245000);
    expect(r.reserveCents).toBe(-5400000);
    const byExc = new Map(r.items.map((i) => [i.relatedExceptionId, i.amountCents]));
    expect(byExc.get("EXC-009")).toBe(-290000);
    expect(byExc.get("EXC-014")).toBe(920000);
    expect(byExc.get("EXC-015")).toBe(-1875000);
    expect(r.items).toHaveLength(3);
    expect(r.unexplainedCents).toBe(0);
    expect(r.potentialAdjustedGlCents).toBe(480000000);
  });

  it("computes close readiness 8142 bps from the canonical category scores", () => {
    expect(result.readiness.totalBasisPoints).toBe(8142);
    const scores = new Map(
      result.readiness.categories.map((c) => [c.key, c.scoreHundredths]),
    );
    expect(scores.get("POPULATION_GL")).toBe(9000);
    expect(scores.get("PHYSICAL_COUNT")).toBe(9000);
    expect(scores.get("CUTOFF")).toBe(8000);
    expect(scores.get("OWNERSHIP")).toBe(8500);
    expect(scores.get("THIRD_PARTY")).toBe(8000);
    expect(scores.get("VALUATION")).toBe(8500);
    expect(scores.get("EXCEPTIONS")).toBe(5333);
    expect(scores.get("ADJUSTMENTS")).toBe(6667);
  });

  it("computes PBC 17/21 = 8095 bps with the authored status breakdown", () => {
    expect(result.aggregates.pbcReady).toBe(17);
    expect(result.aggregates.pbcTotal).toBe(21);
    expect(result.aggregates.pbcReadinessBps).toBe(8095);
    const byStatus = (s: string) => result.pbc.filter((i) => i.status === s).length;
    expect(byStatus("PROVIDED")).toBe(5);
    expect(byStatus("READY")).toBe(12);
    expect(byStatus("PREPARING")).toBe(2);
    expect(byStatus("FOLLOW_UP_REQUESTED")).toBe(1);
    expect(byStatus("NOT_STARTED")).toBe(1);
  });

  it("computes source health 9167 bps", () => {
    expect(result.aggregates.sourceHealthBps).toBe(9167);
  });

  it("summarizes the count: 1,065 population, 1,061 matched, 4 variances, 6 movements, 24+18 tests", () => {
    expect(result.countSummary).toEqual({
      populationUnits: 1065,
      firstPassMatchedUnits: 1061,
      varianceRows: 4,
      movements: 6,
      managementTests: 24,
      auditorTests: 18,
    });
  });

  it("keeps native NetSuite match state separate from close state", () => {
    const exc002 = result.procurementMatches.find(
      (m) => m.purchaseOrderNumber === "PO-26-1187",
    );
    expect(exc002?.nativeNetsuiteMatchStatus).toBe("INCOMPLETE");
    expect(exc002?.closeMatchStatus).toBe("REVIEW_REQUIRED");
    // Native PASS coexisting with a fully-clean close state exists broadly.
    expect(
      result.procurementMatches.some(
        (m) => m.nativeNetsuiteMatchStatus === "PASS" && m.closeMatchStatus === "PASS",
      ),
    ).toBe(true);
    // A native INCOMPLETE that is NOT a close problem (title-clear GIT).
    expect(
      result.procurementMatches.some(
        (m) => m.nativeNetsuiteMatchStatus === "INCOMPLETE" && m.closeMatchStatus === "PASS",
      ),
    ).toBe(true);
  });

  it("builds the EXC-001 transaction chain with required components visibly missing", () => {
    const chain = result.chains.find((c) => c.subjectRef === "SO-26184");
    expect(chain).toBeDefined();
    const missing = chain?.components.filter((c) => c.state === "MISSING") ?? [];
    expect(missing.map((c) => c.name)).toEqual(
      expect.arrayContaining(["Contract (ownership/acceptance)", "Inventory relief"]),
    );
    expect(chain?.requiredMissingCount).toBeGreaterThanOrEqual(2);
    // Present components stay present - completeness, not confidence.
    expect(chain?.presentCount).toBeGreaterThanOrEqual(5);
  });
});
