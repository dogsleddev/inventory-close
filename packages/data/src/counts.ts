import type {
  CountMovementFixture,
  CountPlanFixture,
  CountResultFixture,
  CountTestFixture,
} from "@icg/domain";
import {
  COUNT_POPULATION_LOCATIONS,
  RETRIEVED_AT,
  SERIAL_EXC004_OFF_BOOK,
  SKU_DEFS,
} from "./constants.js";
import { atTime } from "./dateMath.js";
import { hashObject } from "./hash.js";
import { createPrng } from "./prng.js";
import type { UnitsResult } from "./units.js";

const skuByCode = new Map(SKU_DEFS.map((s) => [s.code, s]));
const YE_PLAN_ID = "CNT-YE-2026";

function wmsRef(recordType: string, internalId: number, transactionNumber: string) {
  return {
    sourceSystem: "NETSUITE_WMS" as const,
    recordType,
    internalId: String(internalId),
    transactionNumber,
    lastModifiedAt: "2027-01-05T18:00:00Z",
    retrievedAt: RETRIEVED_AT,
    sourceHash: hashObject({ recordType, internalId, transactionNumber }),
  };
}

export interface CountsResult {
  plans: CountPlanFixture[];
  results: CountResultFixture[];
  tests: CountTestFixture[];
  movements: CountMovementFixture[];
}

export function buildCounts(seed: string, unitsResult: UnitsResult): CountsResult {
  const { units, story } = unitsResult;
  const prng = createPrng(`${seed}:counts`);
  const bin = (loc: string) => `${loc.slice(0, 3)}-${String(prng.int(1, 20)).padStart(2, "0")}`;

  const plans: CountPlanFixture[] = [];
  const results: CountResultFixture[] = [];
  const tests: CountTestFixture[] = [];
  const movements: CountMovementFixture[] = [];

  // ---- Year-end physical count (CANONICAL_SPEC §6) ----
  plans.push({
    id: YE_PLAN_ID,
    countType: "YEAR_END",
    sourceRef: wmsRef("INVENTORY_COUNT", 60001, "IC-26-0412"),
    externalId: "IC-26-0412",
    snapshotAt: "2026-12-31T23:59:00Z",
    sourceStatus: "COMPLETED",
    approvedBy: "R. Calloway",
    approvedAt: "2027-01-05T18:00:00Z",
  });

  const population = units.filter((u) =>
    COUNT_POPULATION_LOCATIONS.includes(u.location),
  );
  let detailSeq = 0;
  const detailId = () => `CD-${String(++detailSeq).padStart(4, "0")}`;

  // Serialized units: one count row per serial. First-pass variances:
  // EXC-003 (recorded, not found) and EXC-006 (moved during count). The bin
  // recorded for each serial is remembered so a test count tracing the same
  // listing row cites the same bin.
  const yeBinBySerial = new Map<string, string>();
  for (const u of population) {
    if (!skuByCode.get(u.sku)?.serialized) continue;
    const missing = u.serial === story.exc003Serial || u.serial === story.exc006Serial;
    const rowBin = bin(u.location);
    yeBinBySerial.set(u.serial, rowBin);
    results.push({
      countPlanId: YE_PLAN_ID,
      countType: "YEAR_END",
      sku: u.sku,
      location: u.location,
      bin: rowBin,
      serial: u.serial,
      snapshotQuantity: 1,
      countQuantity: missing ? 0 : 1,
      variance: missing ? -1 : 0,
      externalCountDetailId: detailId(),
    });
  }

  // Non-serialized SKUs: one row per SKU × location. EXC-005: the warehouse
  // KV-Z1 pool first-pass counts two short ($2,900).
  const accessoryCells = new Map<string, number>();
  for (const u of population) {
    if (skuByCode.get(u.sku)?.serialized) continue;
    const key = `${u.sku}|${u.location}`;
    accessoryCells.set(key, (accessoryCells.get(key) ?? 0) + 1);
  }
  for (const [key, quantity] of [...accessoryCells.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const [sku, location] = key.split("|") as [string, string];
    const shortTwo = sku === "KV-Z1" && location === "PRIMARY_WAREHOUSE";
    results.push({
      countPlanId: YE_PLAN_ID,
      countType: "YEAR_END",
      sku,
      location,
      bin: bin(location),
      snapshotQuantity: quantity,
      countQuantity: shortTwo ? quantity - 2 : quantity,
      variance: shortTwo ? -2 : 0,
      externalCountDetailId: detailId(),
    });
  }

  // EXC-013: the same serial also observed in Staging — an extra observation
  // row; the book unit itself matched at the warehouse.
  results.push({
    countPlanId: YE_PLAN_ID,
    countType: "YEAR_END",
    sku: "KE-E2",
    location: "STAGING",
    bin: "STA-04",
    serial: story.exc013Serial,
    snapshotQuantity: 0,
    countQuantity: 1,
    variance: 1,
    externalCountDetailId: detailId(),
  });

  // ---- Test counts: 24 management + 18 auditor (docs/07) ----
  const serializedPopulation = population.filter(
    (u) => skuByCode.get(u.sku)?.serialized && u.serial !== story.exc003Serial,
  );
  const testPick = createPrng(`${seed}:counttests`);
  const pickUnit = () =>
    serializedPopulation[testPick.int(0, serializedPopulation.length - 1)]!;
  // Each test is recorded when its team actually performed it — a table of
  // 42 tests sharing one instant reads as fabricated. Separate stream so the
  // unit picks stay put.
  const testTime = createPrng(`${seed}:counttesttimes`);
  const testRecordedAt = (day: string, startMinute: number, endMinute: number): string => {
    const m = testTime.int(startMinute, endMinute);
    return atTime(day, `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`);
  };

  for (let i = 1; i <= 24; i++) {
    const direction = i <= 12 ? "SHEET_TO_FLOOR" : "FLOOR_TO_SHEET";
    // Management floor-to-sheet test #7 is the EXC-004 discovery: a physical
    // KE-X1 in Receiving that is not on the year-end listing.
    if (i === 19) {
      tests.push({
        id: `MGT-${String(i).padStart(2, "0")}`,
        countPlanId: YE_PLAN_ID,
        selectionSource: "MANAGEMENT",
        direction,
        sku: "KE-X1",
        location: "RECEIVING",
        bin: "REC-07",
        serial: SERIAL_EXC004_OFF_BOOK,
        selectedBy: "Controller's Office",
        recordedAt: "2027-01-02T20:40:00Z",
        observation: `Serial ${SERIAL_EXC004_OFF_BOOK} present in Receiving; serial is not on the year-end inventory listing`,
        traced: false,
      });
      continue;
    }
    const u = pickUnit();
    tests.push({
      id: `MGT-${String(i).padStart(2, "0")}`,
      countPlanId: YE_PLAN_ID,
      selectionSource: "MANAGEMENT",
      direction,
      sku: u.sku,
      location: u.location,
      // A traced test cites the bin the year-end listing recorded — the test
      // and the listing describe one count event.
      bin: yeBinBySerial.get(u.serial) ?? bin(u.location),
      serial: u.serial,
      selectedBy: "Controller's Office",
      recordedAt: testRecordedAt("2027-01-02", 13 * 60 + 30, 19 * 60 + 45),
      observation:
        direction === "SHEET_TO_FLOOR"
          ? "Selected from listing; unit located and verified on floor"
          : "Selected from floor; unit traced to year-end listing",
      traced: true,
    });
  }
  for (let i = 1; i <= 18; i++) {
    const direction = i <= 10 ? "SHEET_TO_FLOOR" : "FLOOR_TO_SHEET";
    const u = pickUnit();
    tests.push({
      id: `AUD-${String(i).padStart(2, "0")}`,
      countPlanId: YE_PLAN_ID,
      selectionSource: "AUDITOR",
      direction,
      sku: u.sku,
      location: u.location,
      bin: yeBinBySerial.get(u.serial) ?? bin(u.location),
      serial: u.serial,
      selectedBy: "External audit team",
      recordedAt: testRecordedAt("2027-01-03", 14 * 60 + 15, 19 * 60 + 30),
      observation:
        direction === "SHEET_TO_FLOOR"
          ? "Auditor selection from listing; observed on floor"
          : "Auditor selection from floor; traced to listing",
      traced: true,
    });
  }

  // ---- Six controlled movements during the count window ----
  // Only MV-004 (the designed EXC-006 story) moves before the 12/31 23:59
  // snapshot — its count variance is the trace it leaves. Every other
  // authorized movement happens after the snapshot froze, which is why the
  // 12/31 book and the first-pass count both show the pre-move positions.
  const moves: readonly {
    id: string;
    serial?: string;
    sku: string;
    quantity: number;
    from: string;
    to: string;
    movedAt: string;
    reason: string;
  }[] = [
    { id: "MV-001", sku: "KV-D1", quantity: 4, from: "RECEIVING", to: "PRIMARY_WAREHOUSE", movedAt: "2027-01-02T17:20:00Z", reason: "Putaway of late December receipt" },
    { id: "MV-002", sku: "KV-B1", quantity: 2, from: "RECEIVING", to: "PRIMARY_WAREHOUSE", movedAt: "2027-01-02T18:05:00Z", reason: "Putaway of late December receipt" },
    { id: "MV-003", sku: "KA-41", quantity: 3, from: "PRIMARY_WAREHOUSE", to: "STAGING", movedAt: "2027-01-03T16:45:00Z", reason: "Pick for January install project" },
    { id: "MV-004", serial: story.exc006Serial, sku: "KE-E2", quantity: 1, from: "PRIMARY_WAREHOUSE", to: "STAGING", movedAt: "2026-12-31T21:15:00Z", reason: "Staged for January installation — customer project" },
    { id: "MV-005", sku: "KV-F1", quantity: 1, from: "RMA_REPAIR", to: "PRIMARY_WAREHOUSE", movedAt: "2027-01-02T16:10:00Z", reason: "Repair complete — return to stock" },
    { id: "MV-006", sku: "KR-U1", quantity: 2, from: "STAGING", to: "PRIMARY_WAREHOUSE", movedAt: "2027-01-04T15:30:00Z", reason: "Project descoped — return to stock" },
  ];
  for (const m of moves) {
    movements.push({
      id: m.id,
      ...(m.serial ? { serial: m.serial } : {}),
      sku: m.sku,
      quantity: m.quantity,
      fromLocation: m.from,
      toLocation: m.to,
      movedAt: m.movedAt,
      authorizedBy: "S. Ibarra",
      reason: m.reason,
    });
  }

  // ---- Cycle-count history (mostly normal; docs/07) ----
  // Snapshot quantities anchor on what the cell actually holds at year end,
  // capped by how many units of the SKU the company had acquired by the
  // count date — a cycle count can never record stock that did not exist.
  const cyclePrng = createPrng(`${seed}:cyclecounts`);
  const yearEndCellUnits = new Map<string, number>();
  for (const u of units) {
    const key = `${u.sku}|${u.location}`;
    yearEndCellUnits.set(key, (yearEndCellUnits.get(key) ?? 0) + 1);
  }
  const acquiredDatesBySku = new Map<string, string[]>();
  for (const u of units) {
    const list = acquiredDatesBySku.get(u.sku);
    if (list) list.push(u.acquiredAt ?? "9999-12-31");
    else acquiredDatesBySku.set(u.sku, [u.acquiredAt ?? "9999-12-31"]);
  }
  const acquiredBy = (sku: string, date: string): number =>
    (acquiredDatesBySku.get(sku) ?? []).filter((d) => d <= date).length;
  // The May KE-S1 first-count quantity, reused by the 05R recount row.
  let mayKeS1Snapshot = 0;
  const cycleCells: readonly { sku: string; location: string }[] = [
    { sku: "KV-D1", location: "PRIMARY_WAREHOUSE" },
    { sku: "KV-B1", location: "RECEIVING" },
    { sku: "KV-F1", location: "STAGING" },
    { sku: "KV-Z1", location: "PRIMARY_WAREHOUSE" },
    { sku: "KA-41", location: "PRIMARY_WAREHOUSE" },
    { sku: "KR-U1", location: "DEMO_LOANER" },
    { sku: "KG-K1", location: "PRIMARY_WAREHOUSE" },
    { sku: "KV-D1", location: "RECEIVING" },
    { sku: "KE-M1", location: "PRIMARY_WAREHOUSE" },
    { sku: "KE-S1", location: "PRIMARY_WAREHOUSE" },
    { sku: "KE-E2", location: "PRIMARY_WAREHOUSE" },
    { sku: "KV-B1", location: "RMA_REPAIR" },
  ];
  for (let month = 1; month <= 11; month++) {
    const mm = String(month).padStart(2, "0");
    const planId = `CNT-CC-2026-${mm}`;
    const rejected = month === 8;
    plans.push({
      id: planId,
      countType: "CYCLE",
      sourceRef: wmsRef("INVENTORY_COUNT", 61000 + month, `IC-26-0${100 + month}`),
      externalId: `IC-26-0${100 + month}`,
      snapshotAt: `2026-${mm}-15T06:00:00Z`,
      sourceStatus: rejected ? "REJECTED" : "COMPLETED",
      ...(rejected
        ? { rejectedReason: "Blind count protocol not followed; recount scheduled" }
        : {
            approvedBy: "R. Calloway",
            approvedAt: `2026-${mm}-20T18:00:00Z`,
          }),
      // The KR-U1 demo/loaner cell was last cycle-counted in July and came
      // due 11/15 with no later count — the overdue-cycle-count example.
      nextCountDue:
        month === 7 ? "2026-11-15" : `2026-${String(Math.min(month + 3, 12)).padStart(2, "0")}-15`,
    });
    // Designed rows are placed explicitly so the stories always generate:
    // February KV-B1 variance (adjusted via ADJ-2026-0058), May KE-S1
    // variance (the 05R recount resolves it), July KR-U1@Demo/Loaner clean
    // count (its LAST count — the overdue example, due 11/15 with no later
    // count), September + November KV-D1@Receiving (repeat variance cell).
    const designed: readonly { sku: string; location: string; variance: number }[] =
      month === 2
        ? [{ sku: "KV-B1", location: "RECEIVING", variance: -1 }]
        : month === 5
          ? [{ sku: "KE-S1", location: "PRIMARY_WAREHOUSE", variance: -1 }]
          : month === 7
            ? [{ sku: "KR-U1", location: "DEMO_LOANER", variance: 0 }]
            : month === 9
              ? [{ sku: "KV-D1", location: "RECEIVING", variance: -2 }]
              : month === 11
                ? [{ sku: "KV-D1", location: "RECEIVING", variance: -1 }]
                : [];
    const snapshotDate = `2026-${mm}-15`;
    const rowCount = cyclePrng.int(8, 12);
    const rows: { sku: string; location: string; variance: number }[] = [...designed];
    const used = new Set(designed.map((c) => `${c.sku}|${c.location}`));
    for (let r = 0; rows.length < rowCount && r < cycleCells.length; r++) {
      const cell = cycleCells[(month + r) % cycleCells.length]!;
      const key = `${cell.sku}|${cell.location}`;
      if (used.has(key)) continue;
      // Keep the overdue example true: KR-U1@Demo/Loaner is never cycle-
      // counted after July.
      if (cell.sku === "KR-U1" && cell.location === "DEMO_LOANER" && month > 7) continue;
      // Feasibility: a cell is only listed once the company had acquired
      // stock of the SKU and the cell holds stock at year end.
      if ((yearEndCellUnits.get(key) ?? 0) === 0) continue;
      if (acquiredBy(cell.sku, snapshotDate) === 0) continue;
      used.add(key);
      rows.push({ ...cell, variance: 0 });
    }
    for (const row of rows) {
      const anchor = Math.max(1, yearEndCellUnits.get(`${row.sku}|${row.location}`) ?? 1);
      const cap = acquiredBy(row.sku, snapshotDate);
      const scaled = Math.max(1, Math.round(anchor * (0.75 + cyclePrng.next() * 0.4)));
      let snapshotQuantity = Math.max(1, Math.min(scaled, Math.max(cap, 1)));
      if (row.variance !== 0) {
        // A designed variance needs a quantity it can vary against.
        snapshotQuantity = Math.max(snapshotQuantity, Math.abs(row.variance) + 1);
      }
      if (planId === "CNT-CC-2026-05" && row.sku === "KE-S1" && row.variance !== 0) {
        mayKeS1Snapshot = snapshotQuantity;
      }
      results.push({
        countPlanId: planId,
        countType: "CYCLE",
        sku: row.sku,
        location: row.location,
        bin: bin(row.location),
        snapshotQuantity,
        countQuantity: snapshotQuantity + row.variance,
        ...(month === 2 && row.variance !== 0
          ? { adjustedQuantity: snapshotQuantity + row.variance }
          : {}),
        variance: row.variance,
        externalCountDetailId: detailId(),
      });
    }
  }
  // May recount plan: the KE-S1 variance clears on recount — the recount
  // re-examines the same system quantity the first count listed.
  plans.push({
    id: "CNT-CC-2026-05R",
    countType: "SPOT",
    sourceRef: wmsRef("INVENTORY_COUNT", 61500, "IC-26-0155"),
    externalId: "IC-26-0155",
    snapshotAt: "2026-05-22T06:00:00Z",
    sourceStatus: "COMPLETED",
    approvedBy: "R. Calloway",
    approvedAt: "2026-05-24T18:00:00Z",
  });
  results.push({
    countPlanId: "CNT-CC-2026-05R",
    countType: "SPOT",
    sku: "KE-S1",
    location: "PRIMARY_WAREHOUSE",
    bin: "PRI-09",
    snapshotQuantity: mayKeS1Snapshot,
    countQuantity: mayKeS1Snapshot,
    variance: 0,
    externalCountDetailId: detailId(),
  });

  return { plans, results, tests, movements };
}
