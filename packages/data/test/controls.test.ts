import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { goldenBaselineSchema } from "@icg/domain";
import { buildDataset } from "../src/buildDataset.js";

/**
 * Stage 02 acceptance gate: every exact control total from CANONICAL_SPEC §5
 * and §6, restated here independently so generator drift cannot hide.
 */

const here = dirname(fileURLToPath(import.meta.url));
const golden = goldenBaselineSchema.parse(
  JSON.parse(readFileSync(join(here, "..", "..", "..", "golden", "baseline.json"), "utf8")),
);
const dataset = buildDataset();

const SKU_CONTROLS: readonly [string, number, number, number][] = [
  // [code, units, unitCostCents, valueCents]
  ["KE-I1", 105, 70000, 7350000],
  ["KE-M1", 292, 135000, 39420000],
  ["KE-S1", 124, 240000, 29760000],
  ["KE-E1", 130, 490000, 63700000],
  ["KE-E2", 177, 740000, 130980000],
  ["KE-X1", 138, 920000, 126960000],
  ["KE-Y1", 32, 1280000, 40960000],
  ["KV-D1", 186, 42500, 7905000],
  ["KV-B1", 63, 67500, 4252500],
  ["KV-F1", 43, 87500, 3762500],
  ["KV-Z1", 30, 145000, 4350000],
  ["KA-41", 115, 120000, 13800000],
  ["KR-U1", 42, 82500, 3465000],
  ["KG-K1", 23, 145000, 3335000],
];

const LOCATION_CONTROLS: readonly [string, number, number][] = [
  ["PRIMARY_WAREHOUSE", 830, 265362500],
  ["RECEIVING", 60, 17740000],
  ["STAGING", 75, 23845000],
  ["INBOUND_TRANSIT", 55, 15892500],
  ["OUTBOUND_TRANSIT", 60, 23137500],
  ["DEMO_LOANER", 80, 27840000],
  ["RMA_REPAIR", 65, 23832500],
  ["THIRD_PARTY_CUSTODY", 80, 24612500],
  ["CUSTOMER_SITE", 110, 34280000],
  ["DAMAGED_HOLD", 35, 10170000],
  ["CONTRACT_MANUFACTURER", 50, 13287500],
];

const CLASSIFICATION_CONTROLS: readonly [string, number, number][] = [
  ["FINISHED_HARDWARE", 1000, 320150000],
  ["GIT", 115, 39030000],
  ["DEMO", 75, 24207500],
  ["LOANER", 50, 15260000],
  ["RMA", 65, 23832500],
  ["DAMAGED", 35, 10170000],
  ["THIRD_PARTY", 130, 37900000],
  ["VALUATION_REVIEW", 30, 9450000],
];

describe("population controls", () => {
  it("has exactly 1,500 book units totalling $4,800,000.00", () => {
    expect(dataset.inventoryUnits).toHaveLength(1500);
    const total = dataset.inventoryUnits.reduce((s, u) => s + u.unitCostCents, 0);
    expect(total).toBe(480000000);
    expect(total).toBe(golden.gross_inventory_cents);
    expect(dataset.inventoryUnits).toHaveLength(golden.book_units);
  });

  it.each(SKU_CONTROLS)("SKU %s: %i units at %i cents = %i", (code, units, cost, value) => {
    const rows = dataset.inventoryUnits.filter((u) => u.sku === code);
    expect(rows).toHaveLength(units);
    expect(rows.every((u) => u.unitCostCents === cost)).toBe(true);
    expect(rows.reduce((s, u) => s + u.unitCostCents, 0)).toBe(value);
  });

  it.each(LOCATION_CONTROLS)("location %s: %i units / %i cents", (loc, units, value) => {
    const rows = dataset.inventoryUnits.filter((u) => u.location === loc);
    expect(rows).toHaveLength(units);
    expect(rows.reduce((s, u) => s + u.unitCostCents, 0)).toBe(value);
  });

  it.each(CLASSIFICATION_CONTROLS)("classification %s: %i units / %i cents", (cls, units, value) => {
    const rows = dataset.inventoryUnits.filter((u) => u.classification === cls);
    expect(rows).toHaveLength(units);
    expect(rows.reduce((s, u) => s + u.unitCostCents, 0)).toBe(value);
  });

  it("gives every unit a unique identifier", () => {
    const ids = new Set(dataset.inventoryUnits.map((u) => u.serial));
    expect(ids.size).toBe(1500);
  });
});

describe("GL controls", () => {
  it("matches the initial gross GL by account", () => {
    const byAccount = new Map(dataset.glBalances.map((b) => [b.account, b.amountCents]));
    expect(byAccount.get("1200")).toBe(378915000);
    expect(byAccount.get("1210")).toBe(39030000);
    expect(byAccount.get("1220")).toBe(39467500);
    expect(byAccount.get("1230")).toBe(23832500);
  });

  it("totals gross GL $4,812,450.00, difference $12,450.00", () => {
    expect(dataset.manifest.controlTotals.grossGlCents).toBe(golden.gross_gl_cents);
    expect(dataset.manifest.controlTotals.grossGlDifferenceCents).toBe(
      golden.gross_gl_difference_cents,
    );
  });

  it("carries the $54,000 reserve as a separate credit", () => {
    expect(dataset.manifest.controlTotals.reserveCents).toBe(-5400000);
  });

  it("explains the whole GL difference with the three designed GL-side facts", () => {
    // Duplicate RMA re-add (+2,900) and unsupported manual entry (+18,750)
    // inflate account 1200; the delayed receipt posting (−9,200) deflates it.
    const dup = dataset.glEntries.find((e) => e.transactionNumber === "JE-2026-0790");
    const manual = dataset.glEntries.find((e) => e.transactionNumber === "JE-2026-0847");
    const timing = dataset.glEntries.find((e) => e.transactionNumber === "JE-2027-0012");
    expect(dup?.amountCents).toBe(290000);
    expect(manual?.amountCents).toBe(1875000);
    expect(timing?.amountCents).toBe(920000);
    expect((timing?.postedDate ?? "") > "2026-12-31").toBe(true);
    expect((dup?.amountCents ?? 0) + (manual?.amountCents ?? 0) - (timing?.amountCents ?? 0)).toBe(
      golden.gross_gl_difference_cents,
    );
    // All three sit in account 1200; 1210/1220/1230 reconcile exactly.
    expect([dup?.account, manual?.account, timing?.account]).toEqual(["1200", "1200", "1200"]);
  });
});

describe("year-end count controls", () => {
  const yeRows = dataset.countResults.filter((r) => r.countPlanId === "CNT-YE-2026");
  const bookRows = yeRows.filter((r) => r.snapshotQuantity > 0);

  it("covers the 1,065-unit book population", () => {
    expect(dataset.manifest.controlTotals.countPopulationUnits).toBe(1065);
    expect(bookRows.reduce((s, r) => s + r.snapshotQuantity, 0)).toBe(1065);
  });

  it("first pass matches 1,061 units with exactly 4 variance rows", () => {
    const matched = bookRows.reduce(
      (s, r) => s + Math.min(r.snapshotQuantity, r.countQuantity),
      0,
    );
    expect(matched).toBe(1061);
    expect(yeRows.filter((r) => r.variance !== 0)).toHaveLength(4);
  });

  it("records 24 management and 18 auditor test counts (10 sheet→floor / 8 floor→sheet)", () => {
    const mgmt = dataset.countTests.filter((t) => t.selectionSource === "MANAGEMENT");
    const aud = dataset.countTests.filter((t) => t.selectionSource === "AUDITOR");
    expect(mgmt).toHaveLength(24);
    expect(aud).toHaveLength(18);
    expect(aud.filter((t) => t.direction === "SHEET_TO_FLOOR")).toHaveLength(10);
    expect(aud.filter((t) => t.direction === "FLOOR_TO_SHEET")).toHaveLength(8);
  });

  it("records six controlled movements during the count window", () => {
    expect(dataset.countMovements).toHaveLength(6);
  });
});

describe("source health controls", () => {
  it("reproduces 91.67% from seven healthy, one stale, one partial", () => {
    expect(dataset.sourceHealth).toHaveLength(9);
    const byStatus = (s: string) =>
      dataset.sourceHealth.filter((h) => h.status === s).length;
    expect(byStatus("HEALTHY")).toBe(7);
    expect(byStatus("STALE")).toBe(1);
    expect(byStatus("PARTIAL")).toBe(1);
    expect(dataset.sourceHealth.find((h) => h.status === "STALE")?.sourceSystem).toBe("ACCORD_VAULT");
    expect(dataset.sourceHealth.find((h) => h.status === "PARTIAL")?.sourceSystem).toBe("RETURN_LOOP");
    expect(dataset.manifest.controlTotals.sourceHealthBasisPoints).toBe(9167);
  });
});

describe("facts-only boundary", () => {
  it("seeds no exception outcomes, close statuses, or readiness values", () => {
    const collections = { ...dataset } as Record<string, unknown>;
    delete collections["story"];
    const flat = JSON.stringify(collections);
    expect(flat).not.toMatch(/EXC-\d{3}/);
    expect(flat).not.toMatch(/closeMatchStatus/);
    expect(flat).not.toMatch(/readiness/i);
    expect(flat).not.toMatch(/blocker/i);
  });

  it("keeps the manifest identity canonical", () => {
    expect(dataset.manifest.datasetVersion).toBe("FY2026-DEMO-v1.2.0");
    expect(dataset.manifest.generatorSeed).toBe("ICG-FY2026-DEMO-002");
    expect(dataset.manifest.scenarioScript).toBe("SCENARIO-EVENTS-v1.1.0");
    expect(dataset.manifest.balanceSheetDate).toBe("2026-12-31");
  });
});
