import { describe, expect, it } from "vitest";
import { PBC_BASELINE_V1, POLICY_V1, runClose } from "../src/index.js";
import { closeInputFromDataset } from "./helpers.js";

/**
 * Stage 07 — bridge, adjustments register, valuation.
 *
 * These pin the three things stage 07 must not be able to drift: the PBC
 * baseline names the items the specification names, the register never
 * grows a proposal the scenario did not produce, and no code path puts a
 * number on the reserve.
 */

const input = closeInputFromDataset();
const result = runClose(input);

describe("PBC baseline is the specified one, not an authored substitute", () => {
  // prompts/code/07 "Required baseline remaining items", prompts/design/06
  // "Requires Attention", and design/06_audit-ai all name these four.
  it.each([
    ["PBC-002", "PREPARING"],
    ["PBC-005", "PREPARING"],
    ["PBC-008", "FOLLOW_UP_REQUESTED"],
    ["PBC-018", "NOT_STARTED"],
  ])("%s is %s", (id, status) => {
    expect(PBC_BASELINE_V1.find((i) => i.id === id)?.status).toBe(status);
  });

  it("has exactly four items that are neither Ready nor Provided", () => {
    const remaining = result.pbc.filter(
      (i) => i.status !== "READY" && i.status !== "PROVIDED",
    );
    expect(remaining.map((i) => i.id)).toEqual([
      "PBC-002",
      "PBC-005",
      "PBC-008",
      "PBC-018",
    ]);
    // The locked aggregate is unchanged by which four they are.
    expect(result.aggregates.pbcReady).toBe(17);
    expect(result.aggregates.pbcReadinessBps).toBe(8095);
  });

  it("assigns every request an owner from the canonical role set", () => {
    const roles = new Set([
      "HEAD_OF_FINANCE", "CONTROLLER", "ACCOUNTING_MANAGER", "PREPARER",
      "WAREHOUSE", "SUPPLY_CHAIN", "FPA", "LEGAL", "AUDITOR_READ_ONLY", "SYSTEM_ADMIN",
    ]);
    for (const item of result.pbc) expect(roles.has(item.owner)).toBe(true);
  });
});

describe("the reconciling bridge", () => {
  it("clears to zero when every identified item is applied", () => {
    const r = result.reconciliation;
    expect(r.grossGlCents - r.subledgerCents).toBe(r.differenceCents);
    expect(r.potentialAdjustedGlCents).toBe(r.grossGlCents + r.explainedCents);
    // Fully explained: applying all three items leaves no residual.
    expect(r.unexplainedCents).toBe(0);
    expect(r.potentialAdjustedGlCents - r.subledgerCents).toBe(0);
  });

  it("holds the reserve out of the gross bridge entirely", () => {
    // The 1290 credit is a separate balance; nothing on the bridge nets it.
    expect(result.reconciliation.reserveCents).toBeLessThan(0);
    expect(result.reconciliation.grossGlCents).not.toBe(
      result.reconciliation.grossGlCents + result.reconciliation.reserveCents,
    );
    expect(result.valuation.reserve.recordedCents).toBe(
      result.reconciliation.reserveCents,
    );
  });
});

describe("the proposed-adjustment register", () => {
  const register = result.adjustmentRegister;

  it("is keyed on reconciling items, so an undrafted one stays visible", () => {
    expect(register.identifiedCount).toBe(result.reconciliation.items.length);
    expect(register.draftedCount).toBe(result.proposedAdjustments.length);
    const undrafted = register.entries.filter((e) => e.proposal === undefined);
    expect(undrafted).toHaveLength(register.identifiedCount - register.draftedCount);
    // It says why rather than rendering an omission.
    for (const entry of undrafted) {
      expect(entry.undraftedReason).toBeTruthy();
      expect(entry.exceptionOpen).toBe(true);
    }
  });

  it("posts nothing, and no proposal is approved", () => {
    expect(register.postedCount).toBe(0);
    for (const entry of register.entries) {
      if (entry.proposal === undefined) continue;
      expect(entry.proposal.posted).toBe(false);
      expect(entry.proposal.postedReference).toBeNull();
      expect(entry.proposal.approved).toBe(false);
      expect(entry.proposal.preparedByRole).not.toBe(entry.proposal.reviewerRole);
    }
  });

  it("carries balanced lines on every drafted entry", () => {
    for (const entry of register.entries) {
      if (entry.proposal === undefined) continue;
      expect(entry.proposal.balanced).toBe(true);
      expect(entry.proposal.imbalanceCents).toBe(0);
      expect(entry.proposal.lines.length).toBeGreaterThanOrEqual(2);
      expect(
        entry.proposal.lines.reduce((s, l) => s + l.amountCents, 0),
      ).toBe(0);
    }
  });

  it("agrees with the ADJUSTMENTS readiness score — both read the same facts", () => {
    const adjustments = result.readiness.categories.find(
      (c) => c.key === "ADJUSTMENTS",
    );
    expect(adjustments?.scoreHundredths).toBe(
      Math.round((register.draftedCount / register.identifiedCount) * 10000),
    );
  });
});

describe("valuation never produces a reserve", () => {
  const valuation = result.valuation;

  it("keeps the conclusion UNDETERMINED with an open review behind it", () => {
    expect(valuation.reserve.conclusion).toBe("UNDETERMINED");
    expect(valuation.reserve.openReviews.length).toBeGreaterThan(0);
    // No field anywhere on the valuation output proposes an amount.
    expect(JSON.stringify(valuation)).not.toMatch(/proposedReserve/i);
  });

  it("counts only the aged holdings a review actually covers", () => {
    const review = valuation.reserve.openReviews.find((r) => r.exceptionId === "EXC-011");
    expect(review).toBeDefined();
    const skuTotal = input.inventoryUnits.filter((u) => review!.skus.includes(u.sku))
      .length;
    // The review's population is the aged subset, never every unit of the SKU.
    expect(review!.units).toBeGreaterThan(0);
    expect(review!.units).toBeLessThan(skuTotal);
  });

  it("buckets the whole population without losing a unit or a cent", () => {
    const units =
      valuation.aging.reduce((s, b) => s + b.units, 0) + valuation.unknownAgeUnits;
    const value =
      valuation.aging.reduce((s, b) => s + b.carryingCents, 0) +
      valuation.unknownAgeCarryingCents;
    expect(units).toBe(input.inventoryUnits.length);
    expect(value).toBe(result.reconciliation.subledgerCents);
  });

  it("treats the slow-moving band as a review population, not a write-down", () => {
    const slow = valuation.populations.find((p) => p.key === "SLOW_MOVING");
    expect(slow).toBeDefined();
    expect(valuation.slowMovingAgeDays).toBe(POLICY_V1.slowMovingAgeDays);
    expect(slow!.basis).toMatch(/policy threshold/);
  });
});
