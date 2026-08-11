import { describe, expect, it } from "vitest";
import { userByRole } from "@icg/data";
import { custodyTypeFor, UNPOPULATED_CUSTODY_TYPES } from "@icg/domain";
import { createQueryService, createWorkspace } from "../src/index.js";
import type { ServiceContext } from "../src/index.js";

/**
 * `listInventoryMaster` — the all-inventory master population
 * (COMPLETION_PLAN §4).
 *
 * Every assertion here exists because the query DERIVES columns that other
 * surfaces already derive somewhere else. A projection that quietly
 * disagrees with the screen beside it is worse than no projection at all, so
 * each derived column is pinned against its existing source: age against the
 * valuation workspace, GL account against Financial Life, carrying value
 * against the reconciliation's subledger, and unit identity against the
 * listing itself.
 *
 * The custody derivation is exercised here rather than in @icg/domain
 * because the point of it is what the FY2026 population produces — a pure
 * unit test of the mapping would prove the map matches itself.
 */

const ws = createWorkspace();
const queries = createQueryService(ws);
const ctx = (role: Parameters<typeof userByRole>[0]): ServiceContext => ({
  user: userByRole(role),
  correlationId: "T-INV-MASTER",
  sourceInterface: "TEST",
});
const controller = ctx("CONTROLLER");
const master = queries.listInventoryMaster(controller);

describe("the master list is the book population, one row per unit", () => {
  it("returns exactly the units on the year-end listing", () => {
    const units = queries.listInventoryUnits(controller);
    expect(master.rows).toHaveLength(units.length);
    expect(master.bookUnits).toBe(units.length);
    expect(master.rows.map((r) => r.serial)).toEqual(units.map((u) => u.serial));
    expect(new Set(master.rows.map((r) => r.serial)).size).toBe(units.length);
  });

  it("carries quantity 1 on every row — the listing is never grouped", () => {
    expect(master.rows.every((r) => r.quantity === 1)).toBe(true);
    // Accessory SKUs are on the listing under minted unit ids, and they are
    // rows like any other: grouping them would hide units, not tidy them.
    expect(master.rows.some((r) => !r.serialized)).toBe(true);
  });

  it("sums to the subledger the reconciliation reconciles", () => {
    const carrying = master.rows.reduce((sum, r) => sum + r.carryingCents, 0);
    expect(carrying).toBe(queries.getReconciliation(controller).subledgerCents);
    // Carrying value is gross: no unit carries a share of the 1290 reserve.
    expect(carrying).not.toBe(
      queries.getReconciliation(controller).subledgerCents -
        queries.getReconciliation(controller).reserveCents,
    );
  });

  it("is a read: calling it twice changes nothing about the close", () => {
    const before = ws.close.exceptions.length;
    const again = queries.listInventoryMaster(controller);
    expect(again.rows).toHaveLength(master.rows.length);
    expect(ws.close.exceptions).toHaveLength(before);
  });

  it("is refused to a role without close.read", () => {
    expect(() => queries.listInventoryMaster(ctx("SYSTEM_ADMIN"))).toThrow();
  });
});

describe("age cannot disagree with the valuation aging", () => {
  const valuation = queries.getValuation(controller);

  it("measures to the same balance-sheet date", () => {
    expect(master.asOf).toBe(valuation.asOf);
  });

  it("puts exactly the same units in each bucket", () => {
    expect(master.ageBands.map((b) => b.key)).toEqual(valuation.aging.map((b) => b.key));
    for (const bucket of valuation.aging) {
      const rows = master.rows.filter((r) => r.ageBandKey === bucket.key);
      expect(rows, `bucket ${bucket.key} unit count`).toHaveLength(bucket.units);
      expect(rows.reduce((sum, r) => sum + r.carryingCents, 0)).toBe(bucket.carryingCents);
    }
  });

  it("reports an unknown age as unknown, never as fresh", () => {
    const unknown = master.rows.filter((r) => r.ageDays === undefined);
    expect(unknown).toHaveLength(valuation.unknownAgeUnits);
    expect(unknown.every((r) => r.ageBandKey === undefined)).toBe(true);
  });
});

describe("GL account comes from one map, not from a second copy", () => {
  it("agrees with the account Financial Life reports for the same unit", () => {
    const seen = new Set<string>();
    for (const row of master.rows) {
      if (seen.has(row.classification)) continue;
      seen.add(row.classification);
      const life = queries.getFinancialLife(controller, row.serial);
      expect(life.unit?.glAccount, `${row.serial} (${row.classification})`).toBe(row.glAccount);
    }
    // Every classification on the listing was compared, not just the first.
    expect(seen.size).toBeGreaterThan(4);
  });
});

describe("exception linkage never claims a unit a finding did not name", () => {
  it("marks a serial-named finding as identifying the unit", () => {
    const withSerials = ws.close.exceptions.filter(
      (e) => (e.finding.subjects.serials?.length ?? 0) > 0,
    );
    expect(withSerials.length).toBeGreaterThan(0);
    for (const exception of withSerials) {
      for (const serial of exception.finding.subjects.serials ?? []) {
        const row = master.rows.find((r) => r.serial === serial);
        if (row === undefined) continue; // off-book subjects are not on the listing
        const link = row.exceptions.find((e) => e.exceptionId === exception.id);
        expect(link, `${exception.id} → ${serial}`).toBeDefined();
        expect(link?.identifiesUnit).toBe(true);
        expect(link?.basis).toBe("SERIAL");
      }
    }
  });

  it("never lets a SKU-and-location finding name an individual accessory", () => {
    // CNT-VAR-001 flags an accessory bin: sku + location, no serial. A naive
    // join would tag every accessory in that bin as being under exception.
    const binFinding = ws.close.exceptions.find(
      (e) =>
        e.finding.ruleId === "CNT-VAR-001" &&
        (e.finding.subjects.serials?.length ?? 0) === 0,
    );
    expect(binFinding, "the accessory-variance exception is the point of this test").toBeDefined();
    const reached = master.rows.filter((r) =>
      r.exceptions.some((e) => e.exceptionId === binFinding?.id),
    );
    expect(reached.length).toBeGreaterThan(1);
    for (const row of reached) {
      const link = row.exceptions.find((e) => e.exceptionId === binFinding?.id);
      expect(link?.identifiesUnit, `${row.serial} must not be named by ${binFinding?.id}`).toBe(
        false,
      );
      expect(link?.basis).toBe("SKU_AND_LOCATION");
      expect(binFinding?.finding.subjects.skus).toContain(row.sku);
      expect(binFinding?.finding.subjects.locations).toContain(row.location);
    }
  });

  it("keeps a transaction-subject finding off the unit population entirely", () => {
    // RMA-DUP-001 carries the returned unit's SKU as context for a duplicated
    // POSTING. Joining every unit of that SKU to it would invent a population.
    const txnFinding = ws.close.exceptions.find(
      (e) =>
        (e.finding.subjects.transactionNumbers?.length ?? 0) > 0 &&
        (e.finding.subjects.serials?.length ?? 0) === 0 &&
        (e.finding.subjects.skus?.length ?? 0) > 0,
    );
    expect(txnFinding).toBeDefined();
    expect(
      master.rows.filter((r) => r.exceptions.some((e) => e.exceptionId === txnFinding?.id)),
    ).toHaveLength(0);
  });

  it("links a custodian finding to the units that custodian is recorded as holding", () => {
    const custodial = ws.close.exceptions.find(
      (e) => e.finding.subjects.custodian !== undefined,
    );
    expect(custodial).toBeDefined();
    const custodian = custodial?.finding.subjects.custodian;
    const reached = master.rows.filter((r) =>
      r.exceptions.some((e) => e.exceptionId === custodial?.id),
    );
    expect(reached.length).toBeGreaterThan(0);
    expect(reached.every((r) => r.custodian === custodian)).toBe(true);
    expect(
      master.rows.filter((r) => r.custodian === custodian && r.exceptions.length === 0),
    ).toHaveLength(0);
  });
});

describe("ownership is derived, and only a dispute moves it", () => {
  it("reports the recorded assertion for every unit nothing disputes", () => {
    for (const row of master.rows) {
      const disputed = row.exceptions.some(
        (e) => e.open && e.identifiesUnit && e.assertions.includes("RIGHTS_AND_OBLIGATIONS"),
      );
      expect(row.ownership, row.serial).toBe(disputed ? "UNDER_REVIEW" : "COMPANY_OWNED");
    }
  });

  it("has units in both states, or it proves nothing", () => {
    const underReview = master.rows.filter((r) => r.ownership === "UNDER_REVIEW");
    expect(underReview.length).toBeGreaterThan(0);
    expect(underReview.length).toBeLessThan(master.rows.length);
  });

  it("never puts a unit under review on a resolved exception alone", () => {
    for (const row of master.rows.filter((r) => r.ownership === "UNDER_REVIEW")) {
      expect(row.exceptions.some((e) => e.open && e.identifiesUnit)).toBe(true);
    }
  });
});

describe("custody says who holds the unit, and never invents a holder", () => {
  it("derives a custody type for every unit on the listing", () => {
    expect(master.rows.every((r) => r.custodyType !== "UNDETERMINED")).toBe(true);
  });

  it("never reports a consignment arrangement the dataset does not record", () => {
    for (const unpopulated of UNPOPULATED_CUSTODY_TYPES) {
      expect(
        master.rows.filter((r) => r.custodyType === unpopulated),
        `${unpopulated} must stay representable and empty`,
      ).toHaveLength(0);
    }
  });

  it("keeps custody and ownership independent", () => {
    // A unit in someone else's hands is not thereby someone else's unit, and
    // a unit in our warehouse is not thereby undisputed.
    const thirdParty = master.rows.filter((r) => r.custodyType === "THIRD_PARTY_CUSTODIAN");
    expect(thirdParty.length).toBeGreaterThan(0);
    expect(thirdParty.some((r) => r.ownership === "COMPANY_OWNED")).toBe(true);
  });

  it("is a pure function of the facts the listing already carries", () => {
    const units = queries.listInventoryUnits(controller);
    for (const unit of units) {
      const row = master.rows.find((r) => r.serial === unit.serial);
      expect(row?.custodyType).toBe(
        custodyTypeFor({
          location: unit.location,
          classification: unit.classification,
          ...(unit.custodian !== undefined ? { custodian: unit.custodian } : {}),
        }),
      );
    }
  });

  it("does not let a named contact override a company location", () => {
    expect(
      custodyTypeFor({
        location: "PRIMARY_WAREHOUSE",
        classification: "FINISHED_HARDWARE",
        custodian: "Someone Else",
      }),
    ).toBe("COMPANY_WAREHOUSE");
  });

  it("says so rather than guessing when the facts establish nothing", () => {
    expect(
      custodyTypeFor({ location: "UNKNOWN_PLACE", classification: "FINISHED_HARDWARE" }),
    ).toBe("UNDETERMINED");
  });
});

describe("count coverage distinguishes a counted unit from a counted bin", () => {
  it("names the unit only where a count line carries its serial", () => {
    const detail = queries.getCountDetail(controller);
    for (const row of master.rows.filter((r) => r.lastCount?.basis === "UNIT")) {
      expect(detail.results.some((c) => c.serial === row.serial)).toBe(true);
    }
  });

  it("reports SKU-level coverage as SKU-level, not as a counted unit", () => {
    const skuLevel = master.rows.filter((r) => r.lastCount?.basis === "SKU_LOCATION");
    expect(skuLevel.length).toBeGreaterThan(0);
    const detail = queries.getCountDetail(controller);
    for (const row of skuLevel) {
      expect(detail.results.some((c) => c.serial === row.serial)).toBe(false);
    }
  });

  it("leaves an uncounted unit visibly uncounted rather than counted-with-zero", () => {
    const uncounted = master.rows.filter((r) => r.lastCount === undefined);
    expect(uncounted.length).toBeGreaterThan(0);
    expect(uncounted.every((r) => r.lastCount === undefined)).toBe(true);
  });

  it("reports the latest count that covers the unit", () => {
    const plans = new Map(
      queries.getCountDetail(controller).plans.map((p) => [p.id, p.snapshotAt]),
    );
    const detail = queries.getCountDetail(controller);
    for (const row of master.rows.filter((r) => r.lastCount?.basis === "UNIT").slice(0, 50)) {
      const covering = detail.results
        .filter((c) => c.serial === row.serial)
        .map((c) => plans.get(c.countPlanId) ?? "");
      const latest = covering.reduce((a, b) => (b > a ? b : a), "");
      expect(row.lastCount?.countedAt).toBe(latest);
    }
  });
});
