import { describe, expect, it } from "vitest";
import { isResolvedStatus } from "@icg/domain";
import { hashObject } from "@icg/data";
import { runClose } from "../src/index.js";
import { closeInputFromDataset } from "./helpers.js";

/**
 * Regression pins for the Stage 03 adversarial-fleet findings. Each test
 * exercises a data variation the fixed demo dataset never reaches.
 */

const RETRIEVED = "2027-01-07T06:00:00Z";
const mkRef = (n: string) => ({
  sourceSystem: "NETSUITE_ERP" as const,
  recordType: "GL_ENTRY",
  internalId: n,
  transactionNumber: n,
  retrievedAt: RETRIEVED,
  sourceHash: hashObject({ n }),
});

describe("GL-MAN-001 credit-side direction", () => {
  it("reverses an unsupported manual CREDIT entry in the correct (+) direction", () => {
    const input = closeInputFromDataset();
    const credit = {
      sourceRef: mkRef("JE-TEST-NEG"),
      transactionNumber: "JE-TEST-NEG",
      postedDate: "2026-12-30",
      account: "1200",
      amountCents: -5000000,
      memo: "Unsupported year-end write-down",
      enteredBy: "T. Okafor",
    };
    // The synthetic credit deflated GL, so the 1200 balance reflects it.
    const balances = input.glBalances.map((b) =>
      b.account === "1200" ? { ...b, amountCents: b.amountCents - 5000000 } : b,
    );
    const result = runClose({
      ...input,
      glEntries: [...input.glEntries, credit],
      glBalances: balances,
    });
    const exc = result.exceptions.find((e) =>
      e.finding.subjects.transactionNumbers?.includes("JE-TEST-NEG"),
    );
    expect(exc).toBeDefined();
    // Exposure is absolute for risk display...
    expect(exc?.finding.exposureCents).toBe(5000000);
    // ...but the reconciling item carries the true reversal direction:
    // reversing a credit entry ADDS back to GL.
    const item = result.reconciliation.items.find(
      (i) => i.relatedExceptionId === exc?.id,
    );
    expect(item?.amountCents).toBe(5000000);
    // The whole difference stays fully explained under the variation.
    expect(result.reconciliation.unexplainedCents).toBe(0);
  });
});

describe("scenario-engine boundaries", () => {
  it("a stray CONTRACT_LOCATED event cannot resolve the EXC-001 blocker", () => {
    const input = closeInputFromDataset();
    const malicious = {
      id: "SE-099",
      script: input.scenarioScript,
      seq: 99,
      occurredAt: "2027-01-06T12:00:00Z",
      eventType: "CONTRACT_LOCATED" as const,
      description: "Stray event targeting the cutoff blocker",
      subjects: { serials: ["KE-E2-1048"] },
      recordedBy: "nobody",
    };
    const result = runClose({
      ...input,
      scenarioEvents: [...input.scenarioEvents, malicious],
    });
    const exc001 = result.exceptions.find((e) => e.id === "EXC-001");
    expect(isResolvedStatus(exc001?.status ?? "ACCOUNTING_REVIEW")).toBe(false);
    expect(result.aggregates.blockerCount).toBe(7);
  });

  it("a duplicated ADJUSTMENT_PROPOSED event does not double-propose", () => {
    const input = closeInputFromDataset();
    const original = input.scenarioEvents.find((e) => e.id === "SE-003");
    expect(original).toBeDefined();
    const dup = { ...original!, id: "SE-098", seq: 98 };
    const result = runClose({
      ...input,
      scenarioEvents: [...input.scenarioEvents, dup],
    });
    expect(result.proposedAdjustments).toHaveLength(2);
    expect(result.aggregates.closeReadinessBps).toBe(8142);
  });
});

describe("missing evidence stays visible", () => {
  it("VAL-EO-001 is INCOMPLETE, not PASS, when forecast data is missing", () => {
    const input = closeInputFromDataset();
    const result = runClose({ ...input, forecasts: [] });
    const eo = result.ruleExecutions.find((e) => String(e.ruleId) === "VAL-EO-001");
    expect(eo?.result).toBe("INCOMPLETE");
    expect(eo?.coverage).toBe("PARTIAL");
  });

  it("TPI-CONF-001 flags custodian-confirmed overage as a completeness signal", () => {
    const input = closeInputFromDataset();
    const statements = input.custodianStatements.map((s) =>
      s.custodian === "Beacon Field Services" && s.lines
        ? { ...s, lines: [...s.lines, { sku: "KE-Y1", quantity: 3 }] }
        : s,
    );
    const result = runClose({ ...input, custodianStatements: statements });
    const beacon = result.exceptions.find(
      (e) =>
        e.finding.subjects.custodian === "Beacon Field Services" &&
        e.finding.reasonCodes.includes("CONFIRMED_EXCEEDS_LISTING"),
    );
    expect(beacon).toBeDefined();
    expect(beacon?.finding.assertions).toContain("COMPLETENESS");
  });
});

describe("order independence and boundaries", () => {
  it("reversing contract and statement input order changes nothing structured", () => {
    const input = closeInputFromDataset();
    const reversed = runClose({
      ...input,
      contracts: [...input.contracts].reverse(),
      custodianStatements: [...input.custodianStatements].reverse(),
    });
    const baseline = runClose(input);
    expect(reversed.exceptions).toEqual(baseline.exceptions);
    expect(reversed.aggregates).toEqual(baseline.aggregates);
    expect(reversed.reconciliation).toEqual(baseline.reconciliation);
  });

  it("management indicators never enter the exception population", () => {
    const result = runClose(closeInputFromDataset());
    expect(result.managementIndicators.length).toBeGreaterThan(0);
    expect(
      result.managementIndicators.every((f) => f.kind === "MANAGEMENT_INDICATOR"),
    ).toBe(true);
    const indicatorRules = new Set(result.managementIndicators.map((f) => f.ruleId));
    for (const rule of indicatorRules) {
      expect(rule.startsWith("CNT-CC-")).toBe(true);
      expect(result.exceptions.some((e) => e.finding.ruleId === rule)).toBe(false);
    }
  });

  it("replay equivalence covers proposals, chains, indicators, and PBC", () => {
    // The output hash must be sensitive to a proposals difference: dropping
    // the ADJUSTMENT_PROPOSED events changes proposals AND statuses; the
    // hashes must differ (previously proposals were excluded entirely).
    const input = closeInputFromDataset();
    const baseline = runClose(input);
    const noProposals = runClose({
      ...input,
      scenarioEvents: input.scenarioEvents.filter(
        (e) => e.eventType !== "ADJUSTMENT_PROPOSED",
      ),
    });
    expect(noProposals.proposedAdjustments).toHaveLength(0);
    expect(noProposals.runManifest.outputHash).not.toBe(baseline.runManifest.outputHash);
  });
});
