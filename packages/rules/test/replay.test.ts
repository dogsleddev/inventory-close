import { describe, expect, it } from "vitest";
import { isResolvedStatus } from "@icg/domain";
import { POLICY_V1, reproduceClose, runClose } from "../src/index.js";
import { closeInputFromDataset } from "./helpers.js";

/** Determinism, initial state, and scenario replay (CANONICAL_SPEC section 15). */

describe("initial state before scenario events", () => {
  const initial = runClose(closeInputFromDataset(), { applyScenario: false });

  it("derives all 15 exceptions open with no proposals", () => {
    expect(initial.exceptions).toHaveLength(15);
    expect(initial.exceptions.every((e) => !isResolvedStatus(e.status))).toBe(true);
    expect(initial.proposedAdjustments).toHaveLength(0);
    expect(initial.aggregates.resolvedExceptionCount).toBe(0);
  });

  it("readiness sits below the baseline while everything is open", () => {
    expect(initial.aggregates.closeReadinessBps).toBeLessThan(8142);
  });
});

describe("scenario replay", () => {
  const input = closeInputFromDataset();
  const baseline = runClose(input);

  it("resolves exactly the eight designed historical exceptions", () => {
    const resolved = baseline.exceptions
      .filter((e) => isResolvedStatus(e.status))
      .map((e) => e.id)
      .sort();
    expect(resolved).toEqual([
      "EXC-005", "EXC-006", "EXC-008", "EXC-009", "EXC-010",
      "EXC-012", "EXC-013", "EXC-014",
    ]);
  });

  it("records which events resolved each exception", () => {
    const byId = new Map(baseline.exceptions.map((e) => [e.id, e]));
    expect(byId.get("EXC-005")?.resolvedByEvents).toContain("SE-005");
    expect(byId.get("EXC-006")?.resolvedByEvents).toContain("SE-006");
    expect(byId.get("EXC-008")?.resolvedByEvents).toContain("SE-008");
    expect(byId.get("EXC-009")?.resolvedByEvents).toEqual(
      expect.arrayContaining(["SE-002", "SE-003"]),
    );
    expect(byId.get("EXC-013")?.resolvedByEvents).toContain("SE-007");
    expect(byId.get("EXC-014")?.resolvedByEvents).toEqual(
      expect.arrayContaining(["SE-001", "SE-004"]),
    );
  });

  it("produces two balanced proposed adjustments, never auto-posted", () => {
    expect(baseline.proposedAdjustments).toHaveLength(2);
    for (const p of baseline.proposedAdjustments) {
      expect(p.lines.reduce((s, l) => s + l.amount, 0)).toBe(0);
      expect(p.approved).toBe(false);
    }
    const ids = baseline.proposedAdjustments.map((p) => p.id).sort();
    expect(ids).toEqual(["JE-PROP-001", "JE-PROP-002"]);
  });

  it("Reproduce Close returns MATCH for identical inputs", () => {
    const replay = runClose(input);
    const outcome = reproduceClose(baseline, replay);
    expect(outcome.outcome).toBe("MATCH");
    expect(outcome.mismatchPaths).toEqual([]);
    expect(replay.runManifest.outputHash).toBe(baseline.runManifest.outputHash);
  });

  it("initial and baseline runs are distinguishable, reproducible states", () => {
    const initialA = runClose(input, { applyScenario: false });
    const initialB = runClose(input, { applyScenario: false });
    expect(initialA.runManifest.outputHash).toBe(initialB.runManifest.outputHash);
    expect(initialA.runManifest.outputHash).not.toBe(baseline.runManifest.outputHash);
    expect(reproduceClose(baseline, initialA).outcome).toBe("MISMATCH");
  });

  it("stamps the run manifest with every replay input version", () => {
    const m = baseline.runManifest;
    expect(m.datasetVersion).toBe("FY2026-DEMO-v1.1.0");
    expect(m.scenarioScriptVersion).toBe("SCENARIO-EVENTS-v1.1.0");
    expect(m.rulesetVersion).toBe("RULESET-v1.0.0");
    expect(m.policyVersion).toBe("CLOSE-POLICY-v1.0.0");
    expect(Object.keys(m.ruleVersions)).toHaveLength(21);
    expect(m.sourceSyncIds["NETSUITE_ERP"]).toBe("SYNC-ERP-8841");
  });
});

describe("missing evidence never becomes PASS", () => {
  it("count rules go INCOMPLETE without a year-end plan", () => {
    const input = closeInputFromDataset();
    const gutted = {
      ...input,
      countPlans: input.countPlans.filter((p) => p.countType !== "YEAR_END"),
    };
    const result = runClose(gutted);
    const cnt = result.ruleExecutions.filter((e) =>
      ["CNT-EX-001", "CNT-COMP-001", "CNT-VAR-001", "CNT-MOVE-001"].includes(
        String(e.ruleId),
      ),
    );
    expect(cnt).toHaveLength(4);
    for (const e of cnt) {
      expect(e.result).toBe("INCOMPLETE");
      expect(e.coverage).toBe("INCOMPLETE");
    }
  });

  it("outbound cutoff drops to PARTIAL coverage without carrier data", () => {
    const input = closeInputFromDataset();
    const result = runClose({ ...input, carrierShipments: [] });
    const cutOut = result.ruleExecutions.find((e) => String(e.ruleId) === "CUT-OUT-001");
    expect(cutOut?.coverage).toBe("PARTIAL");
    expect(cutOut?.result).not.toBe("PASS");
  });

  it("a custodian with holdings but no confirmation record becomes an exception, never PASS", () => {
    const input = closeInputFromDataset();
    const result = runClose({
      ...input,
      custodianStatements: input.custodianStatements.filter(
        (s) => s.custodian !== "Beacon Field Services",
      ),
    });
    const tpi = result.ruleExecutions.find((e) => String(e.ruleId) === "TPI-CONF-001");
    expect(tpi?.result).toBe("REVIEW_REQUIRED");
    const beacon = result.exceptions.find(
      (e) => e.finding.subjects.custodian === "Beacon Field Services",
    );
    expect(beacon?.finding.reasonCodes).toContain("CONFIRMATION_NOT_REQUESTED");
    expect(beacon?.status).toBe("WAITING_ON_THIRD_PARTY");
    expect(result.exceptions).toHaveLength(16);
  });

  it("a changed policy is a new version with a different run identity", () => {
    const input = closeInputFromDataset();
    const base = runClose(input);
    const stricter = runClose(input, {
      policy: {
        ...POLICY_V1,
        version: "CLOSE-POLICY-v1.1.0-TEST",
        demoAgeThresholdDays: 90,
      },
    });
    expect(stricter.runManifest.policyVersion).toBe("CLOSE-POLICY-v1.1.0-TEST");
    expect(stricter.runManifest.outputHash).not.toBe(base.runManifest.outputHash);
  });
});
