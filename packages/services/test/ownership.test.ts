import { beforeEach, describe, expect, it } from "vitest";
import { custodyTypeFor, UNPOPULATED_CUSTODY_TYPES } from "@icg/domain";
import { userByRole } from "@icg/data";
import {
  createQueryService,
  createWorkspace,
  getConsignmentHoldings,
  getCustodyBreakdown,
  getDispositions,
  getEoMethodology,
  type ServiceContext,
  type Workspace,
} from "../src/index.js";

/**
 * Stage E — custody, consignment-in, disposition, and E&O methodology.
 *
 * Three of this stage's claims are TRUE on this dataset and would stay green
 * forever if they were written rather than measured: no consigned serial is
 * on the book, no disposed serial is on the book, and the custody cut covers
 * the whole listing. Each therefore has a test that CREATES the violating
 * condition — the baseline cannot produce one, so without them a hard-coded
 * boolean passes the entire suite.
 *
 * `createWorkspace()` calls `buildDataset()` afresh, so mutating `ws.dataset`
 * inside a test is confined to that test.
 */

const controller: ServiceContext = {
  user: userByRole("CONTROLLER"),
  correlationId: "CORR-OWN",
  sourceInterface: "TEST",
};

let ws: Workspace;

beforeEach(() => {
  ws = createWorkspace();
});

describe("physical custody", () => {
  it("accounts for every unit on the listing, and ties to the subledger", () => {
    const custody = getCustodyBreakdown(ws, controller);
    expect(custody.coversBook).toBe(true);
    expect(custody.rows.reduce((n, r) => n + r.units, 0)).toBe(1500);
    expect(custody.bookCarryingCents).toBe(480_000_000);
    expect(custody.subledgerCents).toBe(480_000_000);
    // Every unit lands somewhere, and nowhere is a blank.
    expect(custody.undeterminedUnits).toBe(0);
    expect(custody.rows.every((r) => r.units > 0)).toBe(true);
  });

  it("derives custody with the same function the master list uses", () => {
    // A second copy of this mapping is how two screens end up disagreeing
    // about who holds a unit. Compare row-for-row against the domain
    // function, over the real population.
    const custody = getCustodyBreakdown(ws, controller);
    const expected = new Map<string, number>();
    for (const u of ws.dataset.inventoryUnits) {
      const t = custodyTypeFor({
        location: u.location,
        classification: u.classification,
        ...(u.custodian !== undefined ? { custodian: u.custodian } : {}),
      });
      expected.set(t, (expected.get(t) ?? 0) + 1);
    }
    for (const row of custody.rows) {
      expect(row.units, row.custodyType).toBe(expected.get(row.custodyType));
    }
    expect(custody.rows.length).toBe(expected.size);
  });

  it("names the custody types the listing cannot produce rather than hiding them", () => {
    const custody = getCustodyBreakdown(ws, controller);
    // Representable and empty is a fact about the BOOK, and the taxonomy
    // keeps the types so the model can express them.
    expect([...custody.unpopulatedTypes].sort()).toEqual(
      [...UNPOPULATED_CUSTODY_TYPES].sort(),
    );
  });

  it("says the cut is short when a unit has no established custody", () => {
    // The baseline cannot exercise this: all 11 locations are mapped, so
    // every unit resolves and `coversBook` would stay true even if the
    // coverage check were hard-coded.
    type Unit = (typeof ws.dataset.inventoryUnits)[number];
    const victim = ws.dataset.inventoryUnits[0] as Unit;
    victim.location = "A_LOCATION_THE_MODEL_DOES_NOT_DESCRIBE";
    victim.classification = "FINISHED_HARDWARE";

    const custody = getCustodyBreakdown(ws, controller);
    expect(custody.undeterminedUnits).toBe(1);
    // Still every unit, so the population is whole — what changed is that one
    // of them has no custody answer, and the row says so rather than being
    // folded into a warehouse.
    expect(custody.rows.reduce((n, r) => n + r.units, 0)).toBe(1500);
    expect(custody.rows.some((r) => r.custodyType === "UNDETERMINED")).toBe(true);
  });
});

describe("consignment-in", () => {
  it("reports the holdings, grouped, at the owner's stated value", () => {
    const c = getConsignmentHoldings(ws, controller);
    expect(c.units).toBe(ws.dataset.consignmentInUnits.length);
    expect(c.statedValueCents).toBe(
      ws.dataset.consignmentInUnits.reduce((n, r) => n + r.vendorStatedValueCents, 0),
    );
    expect(c.byOwner.reduce((n, o) => n + o.units, 0)).toBe(c.units);
    expect(c.byAgreement.reduce((n, a) => n + a.statedValueCents, 0)).toBe(
      c.statedValueCents,
    );
    // Never KestrelGrid: the whole point is that somebody else owns them.
    expect(c.rows.every((r) => !/KestrelGrid/i.test(r.owner))).toBe(true);
  });

  it("licenses the 'not in the subledger' claim from two measurements, not one", () => {
    const c = getConsignmentHoldings(ws, controller);
    expect(c.consignedSerialsOnBook).toEqual([]);
    expect(c.heldOffBook).toBe(true);
    // Serial exclusion alone proves nothing about VALUE. It only does so
    // because the subledger IS the sum over the book population — that is the
    // second measurement, and the flag the screen speaks from is the AND.
    expect(c.subledgerIsBookPopulation).toBe(true);
    expect(c.outsideSubledger).toBe(true);
    expect(
      ws.dataset.inventoryUnits.reduce((n, u) => n + u.unitCostCents, 0),
    ).toBe(ws.close.reconciliation.subledgerCents);
  });

  it("stops making that claim when a consigned serial reaches the book", () => {
    // Created, because the baseline cannot produce it.
    type Unit = (typeof ws.dataset.inventoryUnits)[number];
    const template = ws.dataset.inventoryUnits[0] as Unit;
    const consigned = ws.dataset.consignmentInUnits[0];
    expect(consigned).toBeDefined();
    (ws.dataset.inventoryUnits as Unit[]).push({
      ...template,
      serial: consigned?.serial ?? "",
    });

    const c = getConsignmentHoldings(ws, controller);
    expect(c.consignedSerialsOnBook).toEqual([consigned?.serial]);
    expect(c.heldOffBook).toBe(false);
    expect(c.outsideSubledger).toBe(false);
  });

  it("stops making it when the subledger is no longer the book population", () => {
    // The other half of the conjunction, broken on its own: every serial is
    // still off-book, but the subledger no longer describes the population,
    // so serial exclusion no longer establishes value exclusion.
    type Unit = (typeof ws.dataset.inventoryUnits)[number];
    const victim = ws.dataset.inventoryUnits[0] as Unit;
    victim.unitCostCents += 100;

    const c = getConsignmentHoldings(ws, controller);
    expect(c.heldOffBook).toBe(true);
    expect(c.subledgerIsBookPopulation).toBe(false);
    expect(c.outsideSubledger).toBe(false);
  });

  it("measures count coverage rather than implying it", () => {
    const c = getConsignmentHoldings(ws, controller);
    expect(c.countLinesTouchingConsignmentBins).toBe(0);
    // And the check can fire: a count line placed in a consignment bin is
    // seen. Without this, a hard-coded zero reads identically.
    const bin = ws.dataset.consignmentInUnits[0]?.bin;
    expect(bin).toBeDefined();
    type Result = (typeof ws.dataset.countResults)[number];
    const template = ws.dataset.countResults[0] as Result;
    (ws.dataset.countResults as Result[]).push({ ...template, bin: bin as string });
    expect(getConsignmentHoldings(ws, controller).countLinesTouchingConsignmentBins).toBe(1);
  });
});

describe("disposition", () => {
  it("reports each record with its own realised outcome", () => {
    const d = getDispositions(ws, controller);
    expect(d.units).toBe(ws.dataset.dispositions.length);
    for (const row of d.rows) {
      const source = ws.dataset.dispositions.find((x) => x.id === row.id);
      expect(source, row.id).toBeDefined();
      expect(row.lossCents, row.id).toBe(
        (source?.originalCostCents ?? 0) - (source?.proceedsCents ?? 0),
      );
    }
    // The methods differ sharply and must not be blended: a full-credit
    // vendor return cost nothing, and it is the largest record here.
    const returned = d.byMethod.find((m) => m.method === "RETURNED_TO_VENDOR");
    expect(returned?.lossCents).toBe(0);
    expect(d.byMethod.reduce((n, m) => n + m.originalCostCents, 0)).toBe(
      d.originalCostCents,
    );
    expect(d.lossCents).toBe(d.originalCostCents - d.proceedsCents);
  });

  it("checks the units are off the book rather than asserting it", () => {
    const d = getDispositions(ws, controller);
    expect(d.disposedSerialsOnBook).toEqual([]);
    expect(d.removedFromBook).toBe(true);
  });

  it("says so when a disposed unit is still on the listing", () => {
    // A unit disposed of AND left on the book is counted twice, and nothing
    // else in the close would show it. Created, because the fixture pipeline
    // makes it impossible by construction.
    type Unit = (typeof ws.dataset.inventoryUnits)[number];
    const template = ws.dataset.inventoryUnits[0] as Unit;
    const disposed = ws.dataset.dispositions[0];
    (ws.dataset.inventoryUnits as Unit[]).push({
      ...template,
      serial: disposed?.serial ?? "",
    });

    const d = getDispositions(ws, controller);
    expect(d.disposedSerialsOnBook).toEqual([disposed?.serial]);
    expect(d.removedFromBook).toBe(false);
  });

  it("reports named support as unresolved, from a lookup that can resolve", () => {
    const d = getDispositions(ws, controller);
    // Every row names an adjustment and a certificate; the close holds
    // neither. That is an absence to state, not to hide behind a reference
    // rendered as though it resolved.
    expect(d.rows.every((r) => r.adjustmentRef !== undefined)).toBe(true);
    expect(d.rows.every((r) => r.evidenceRef !== undefined)).toBe(true);
    expect(d.rowsWithAdjustmentOnFile).toBe(0);
    expect(d.rowsWithEvidenceOnFile).toBe(0);

    // A lookup that can only ever answer "no" is not a lookup. Both indexes
    // are non-empty, and both CAN resolve — proved against a reference each
    // index genuinely holds.
    expect(d.evidenceIndexSize).toBeGreaterThan(0);
    expect(ws.dataset.inventoryAdjustments.length).toBeGreaterThan(0);
    const realAdjustment = ws.dataset.inventoryAdjustments[0]?.transactionNumber;
    expect(realAdjustment).toBeDefined();
    type Disposition = (typeof ws.dataset.dispositions)[number];
    const first = ws.dataset.dispositions[0] as Disposition;
    first.sourceRef = { ...first.sourceRef, transactionNumber: realAdjustment as string };
    const realTitle = ws.evidenceGraph.items[0]?.title;
    expect(realTitle).toBeDefined();
    first.evidenceRef = realTitle as string;

    const after = getDispositions(ws, controller);
    expect(after.rowsWithAdjustmentOnFile).toBe(1);
    expect(after.rowsWithEvidenceOnFile).toBe(1);
    expect(after.rows[0]?.adjustmentOnFile).toBe(true);
    expect(after.rows[0]?.evidenceOnFile).toBe(true);
  });
});

describe("E&O methodology", () => {
  it("measures the aged population from the units, not from an aging band", () => {
    const eo = getEoMethodology(ws, controller);
    // The 366+ aging band and the policy threshold (365) agree on this
    // dataset ONLY because no unit is aged exactly 365 days. Reading the band
    // would produce the same number from the wrong source, so the source is
    // pinned here: recompute it independently from the unit population.
    const asOf = Date.parse(`${ws.close.reconciliation.asOf}T00:00:00Z`);
    const expected = ws.dataset.inventoryUnits.filter((u) => {
      if (u.lastMovementAt === undefined) return false;
      const days = Math.round(
        (asOf - Date.parse(`${u.lastMovementAt.slice(0, 10)}T00:00:00Z`)) / 86_400_000,
      );
      return days >= ws.close.valuation.slowMovingAgeDays;
    }).length;
    expect(eo.agingBasis.agedOnPolicyBasis).toBe(expected);
    expect(eo.agingBasis.ageBasisComplete).toBe(true);
  });

  it("discloses the alternative basis as a basis, not a bigger population", () => {
    const eo = getEoMethodology(ws, controller);
    // Far more units are OLD than are slow-moving; the difference is the
    // choice of clock, and disclosing it is the methodology.
    expect(eo.agingBasis.agedOnAcquisitionBasis).toBeGreaterThan(
      eo.agingBasis.agedOnPolicyBasis,
    );
  });

  it("reports the aged population as a floor when a date is missing", () => {
    // The unknown-age path is live but unexercised on this dataset, so a
    // projection hard-coding "aging evidence complete" passes everything.
    type Unit = (typeof ws.dataset.inventoryUnits)[number];
    const victim = ws.dataset.inventoryUnits[0] as Unit;
    delete (victim as { lastMovementAt?: string }).lastMovementAt;

    const eo = getEoMethodology(ws, controller);
    expect(eo.agingBasis.unitsWithoutMovementDate).toBe(1);
    expect(eo.agingBasis.ageBasisComplete).toBe(false);
  });

  it("reads which SKUs are under review off the exceptions, not off its own test", () => {
    const eo = getEoMethodology(ws, controller);
    // Re-deciding the rule's predicate in a projection is a second rule.
    const fromExceptions = [
      ...new Set(
        ws.close.exceptions
          .filter((e) => e.finding.attributes?.["reserve"] === "UNDETERMINED")
          .flatMap((e) => e.finding.subjects.skus ?? []),
      ),
    ].sort();
    expect([...eo.skusUnderReview]).toEqual(fromExceptions);
    expect(eo.skusUnderReview.length).toBeGreaterThan(0);

    // And the two halves of the test are reported separately, because several
    // SKUs meet one and only one meets both.
    const metAge = eo.signals.filter((s) => s.metAgeTest);
    const metBoth = eo.signals.filter((s) => s.metAgeTest && s.metForecastTest);
    expect(metAge.length).toBeGreaterThan(metBoth.length);
    expect(metBoth.map((s) => s.sku).sort()).toEqual(fromExceptions);
  });

  it("computes excess over the whole horizon, per SKU and in total", () => {
    const eo = getEoMethodology(ws, controller);
    for (const s of eo.signals) {
      if (s.forecastUnits === undefined) {
        expect(s.excessOverHorizonUnits, s.sku).toBe(0);
        continue;
      }
      expect(s.excessOverHorizonUnits, s.sku).toBe(
        Math.max(0, s.onHandUnits - s.forecastUnits),
      );
    }
    expect(eo.excessOverHorizonUnits).toBe(
      eo.signals.reduce((n, s) => n + s.excessOverHorizonUnits, 0),
    );
    // It is materially larger than the population the rule flags. That gap is
    // the point of the surface, and it must not be quietly equal.
    const agedCents = eo.signals.reduce((n, s) => n + s.agedCarryingCents, 0);
    expect(eo.excessOverHorizonCents).toBeGreaterThan(agedCents);
  });

  it("never derives a reserve, a recovery rate or a net realisable value", () => {
    const eo = getEoMethodology(ws, controller);
    expect(eo.recovery.recoveryBasisOnFile).toBe(false);
    expect(eo.recovery.costsToSellOnFile).toBe(false);
    expect(eo.recovery.nrvComputed).toBe(false);
    expect(eo.condition.conditionBasisOnFile).toBe(false);
    // A whole-object scan, the same guard packages/rules uses on ValuationOut.
    // No `estimatedReserve`, `indicativeReserve`, `recoveryRate` may appear
    // here under any name.
    const serialized = JSON.stringify(eo);
    expect(serialized).not.toMatch(/reserve/i);
    expect(serialized).not.toMatch(/writeDown|write-down|writeOff|write-off/i);
    expect(serialized).not.toMatch(/recoveryRate|blendedRecovery|nrvCents/i);
  });

  it("names the SKUs with no price evidence rather than leaving them blank", () => {
    const eo = getEoMethodology(ws, controller);
    expect(eo.recovery.skusWithoutObservedPrice.length).toBeGreaterThan(0);
    // Two of them carry slow-moving units, which is exactly why a blank cell
    // would be a claim: it would read as a price of zero on aged stock.
    const aged = new Set(eo.signals.filter((s) => s.agedUnits > 0).map((s) => s.sku));
    expect(
      eo.recovery.skusWithoutObservedPrice.some((s) => aged.has(s)),
    ).toBe(true);
  });

  it("counts condition evidence only for units still on the book", () => {
    const eo = getEoMethodology(ws, controller);
    const booked = new Set(ws.dataset.inventoryUnits.map((u) => u.serial));
    const expected = new Set(
      ws.dataset.rmaRecords
        .map((r) => r.serial)
        .filter((s): s is string => s !== undefined && booked.has(s)),
    );
    expect(eo.condition.unitsWithConditionRecord).toBe(expected.size);
    expect(
      eo.condition.unitsWithConditionRecord + eo.condition.unitsWithoutConditionRecord,
    ).toBe(booked.size);
    // The vast majority of the book has no condition evidence at all, and the
    // surface must say so rather than leave a column empty.
    expect(eo.condition.unitsWithoutConditionRecord).toBeGreaterThan(
      eo.condition.unitsWithConditionRecord,
    );
  });
});

describe("Stage E is a projection, not a rule", () => {
  it("moves no locked figure and derives no exception", () => {
    const before = createQueryService(ws).getCloseReadiness(controller).aggregates;
    getCustodyBreakdown(ws, controller);
    getConsignmentHoldings(ws, controller);
    getDispositions(ws, controller);
    getEoMethodology(ws, controller);
    const after = createQueryService(ws).getCloseReadiness(controller).aggregates;
    expect(after).toEqual(before);
    expect(after.exceptionCount).toBe(15);
    expect(after.blockerCount).toBe(7);
    expect(after.closeReadinessBps).toBe(8142);
    expect(ws.close.reconciliation.subledgerCents).toBe(480_000_000);
    expect(ws.close.reconciliation.grossGlCents).toBe(481_245_000);
  });

  it("refuses a role without close.read", () => {
    const admin: ServiceContext = {
      user: userByRole("SYSTEM_ADMIN"),
      correlationId: "CORR-OWN-DENY",
      sourceInterface: "TEST",
    };
    expect(() => getCustodyBreakdown(ws, admin)).toThrow();
    expect(() => getConsignmentHoldings(ws, admin)).toThrow();
    expect(() => getDispositions(ws, admin)).toThrow();
    expect(() => getEoMethodology(ws, admin)).toThrow();
  });

  it("shows an auditor exactly what it shows a controller, and the export says so", () => {
    // Record scope IS applied to both collections — they carry sourceRefs —
    // but no such record is evidence for any exception, so nothing is
    // withheld. The export's scope note must agree, and it is null.
    const auditor: ServiceContext = {
      user: userByRole("AUDITOR_READ_ONLY"),
      correlationId: "CORR-OWN-AUD",
      sourceInterface: "TEST",
    };
    expect(getConsignmentHoldings(ws, auditor)).toEqual(
      getConsignmentHoldings(ws, controller),
    );
    expect(getDispositions(ws, auditor)).toEqual(getDispositions(ws, controller));
    expect(getConsignmentHoldings(ws, auditor).withheldRowCount).toBe(0);
    expect(getDispositions(ws, auditor).withheldRowCount).toBe(0);
  });

  it("keeps consignment and disposition out of the rule engine", () => {
    // Structural, not incidental: neither collection is in `toCloseInput`'s
    // allowlist, so no rule can see one and no derived figure can move.
    const serialized = JSON.stringify(ws.close);
    for (const c of ws.dataset.consignmentInUnits) {
      expect(serialized, c.serial).not.toContain(c.serial);
    }
    for (const d of ws.dataset.dispositions) {
      expect(serialized, d.id).not.toContain(d.id);
      expect(serialized, d.serial).not.toContain(d.serial);
    }
  });
});
