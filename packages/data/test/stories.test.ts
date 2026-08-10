import { describe, expect, it } from "vitest";
import { buildDataset } from "../src/buildDataset.js";

/**
 * Every designed exception must exist as SOURCE FACTS the Stage 03 rules can
 * derive it from — never as a seeded outcome. These tests pin the canonical
 * identifiers, dates, and amounts from CANONICAL_SPEC §§6–9 and docs/08.
 */
const d = buildDataset();
const { story } = d;
const unit = (serial: string) => d.inventoryUnits.find((u) => u.serial === serial);

describe("EXC-001 — outbound deployment, missing contract provision", () => {
  it("keeps KE-E2-1048 and the linked unit in the Warehouse book position", () => {
    for (const serial of story.exc001Serials) {
      const u = unit(serial);
      expect(u?.location).toBe("PRIMARY_WAREHOUSE");
      expect(u?.classification).toBe("FINISHED_HARDWARE");
      expect(u?.unitCostCents).toBe(740000);
    }
    expect(story.exc001Serials[0]).toBe("KE-E2-1048");
  });

  it("has the full commercial chain with canonical identifiers", () => {
    const so = d.salesOrders.find((s) => s.transactionNumber === "SO-26184");
    expect(so?.customer).toBe("Bluewater Foods Group");
    const iff = d.itemFulfillments.find((f) => f.transactionNumber === "IF-261972");
    expect(iff?.shipDate).toBe("2026-12-27");
    expect(iff?.lines[0]?.serials).toEqual([...story.exc001Serials]);
    const inv = d.customerInvoices.find((i) => i.transactionNumber === "INV-2027-00418");
    expect(inv?.invoiceDate).toBe("2027-01-02");
    expect(inv?.salesOrderNumber).toBe("SO-26184");
  });

  it("shows delivery 12/29, installation 12/30, first online 12/30", () => {
    const ship = d.carrierShipments.find((c) => c.id === "FP-88213");
    const delivered = ship?.events.find((e) => e.eventType === "DELIVERED");
    expect(delivered?.occurredAt.startsWith("2026-12-29")).toBe(true);
    const inst = d.installations.find((i) => i.id === "INST-2688");
    expect(inst?.installedAt.startsWith("2026-12-30")).toBe(true);
    const tl = d.telemetry.find((t) => t.serial === "KE-E2-1048");
    expect(tl?.firstOnlineAt.startsWith("2026-12-30")).toBe(true);
  });

  it("cannot locate the ownership/acceptance provision", () => {
    const contract = d.contracts.find((c) => c.counterparty === "Bluewater Foods Group");
    const statuses = new Map(contract?.provisions.map((p) => [p.provisionType, p.status]));
    expect(statuses.get("OWNERSHIP_TRANSFER")).toBe("MISSING");
    expect(statuses.get("ACCEPTANCE")).toBe("MISSING");
  });
});

describe("EXC-002 — inbound GIT, receipt after year end", () => {
  it("books 3 KE-X1 ($27,600) in transit via the December bill", () => {
    const excUnits = story.exc002Serials.map(unit);
    expect(excUnits).toHaveLength(3);
    for (const u of excUnits) {
      expect(u?.location).toBe("INBOUND_TRANSIT");
      expect(u?.classification).toBe("GIT");
    }
    expect(excUnits.reduce((s, u) => s + (u?.unitCostCents ?? 0), 0)).toBe(2760000);
    const bill = d.vendorBills.find((b) => b.transactionNumber === "VB-26-2419");
    expect(bill?.purchaseOrderNumber).toBe("PO-26-1187");
    expect(bill?.billDate).toBe("2026-12-30");
  });

  it("has no FY2026 item receipt; the receipt is dated 1/4/2027", () => {
    const receipts = d.itemReceipts.filter((r) => r.purchaseOrderNumber === "PO-26-1187");
    expect(receipts).toHaveLength(1);
    expect(receipts[0]?.transactionNumber).toBe("IR-27-0007");
    expect(receipts[0]?.receiptDate).toBe("2027-01-04");
  });

  it("shows vendor shipment 12/29 still in transit, title rider missing", () => {
    const ship = d.carrierShipments.find((c) => c.id === "FP-IN-2291");
    expect(ship?.events.find((e) => e.eventType === "PICKUP")?.occurredAt.startsWith("2026-12-29")).toBe(true);
    expect(ship?.events.some((e) => e.eventType === "DELIVERED")).toBe(false);
    const rider = d.contracts.find((c) => c.title.includes("PO-26-1187"));
    expect(rider?.provisions[0]?.status).toBe("MISSING");
  });
});

describe("EXC-003 / EXC-004 — existence and completeness", () => {
  it("KE-X1-3498 is on the books but not found at first pass", () => {
    expect(unit("KE-X1-3498")?.location).toBe("PRIMARY_WAREHOUSE");
    const row = d.countResults.find((r) => r.serial === "KE-X1-3498");
    expect(row?.countQuantity).toBe(0);
    expect(row?.variance).toBe(-1);
  });

  it("KE-X1-8842 is physically observed but never on the books, never auto-added", () => {
    expect(unit("KE-X1-8842")).toBeUndefined();
    expect(d.countResults.some((r) => r.serial === "KE-X1-8842")).toBe(false);
    const test = d.countTests.find((t) => t.serial === "KE-X1-8842");
    expect(test?.selectionSource).toBe("MANAGEMENT");
    expect(test?.direction).toBe("FLOOR_TO_SHEET");
    expect(test?.traced).toBe(false);
  });
});

describe("EXC-005 / EXC-006 / EXC-013 — count variances", () => {
  it("KV-Z1 at the warehouse counts two short ($2,900) and recounts clean", () => {
    const row = d.countResults.find(
      (r) => r.countPlanId === "CNT-YE-2026" && r.sku === "KV-Z1" && r.location === "PRIMARY_WAREHOUSE",
    );
    expect(row?.snapshotQuantity).toBe(19);
    expect(row?.variance).toBe(-2);
    const recount = d.scenarioEvents.find((e) => e.eventType === "RECOUNT_COMPLETED");
    expect(recount?.subjects.skus).toEqual(["KV-Z1"]);
  });

  it("the moved KE-E2 has an authorized movement and a validating event", () => {
    const row = d.countResults.find((r) => r.serial === story.exc006Serial);
    expect(row?.variance).toBe(-1);
    const mv = d.countMovements.find((m) => m.id === "MV-004");
    expect(mv?.serial).toBe(story.exc006Serial);
    expect(d.scenarioEvents.some((e) => e.eventType === "MOVEMENT_VALIDATED")).toBe(true);
  });

  it("one serial appears in two locations: matched at WH plus an extra Staging observation", () => {
    const rows = d.countResults.filter((r) => r.serial === story.exc013Serial);
    expect(rows).toHaveLength(2);
    const wh = rows.find((r) => r.location === "PRIMARY_WAREHOUSE");
    const stg = rows.find((r) => r.location === "STAGING");
    expect(wh?.variance).toBe(0);
    expect(stg?.snapshotQuantity).toBe(0);
    expect(stg?.variance).toBe(1);
  });
});

describe("EXC-007 — Redwood third-party confirmation outstanding", () => {
  it("holds exactly 14 units / $92,400 with the designed composition", () => {
    const redwood = d.inventoryUnits.filter((u) => u.custodian === "Redwood Installation Services");
    expect(redwood).toHaveLength(14);
    expect(redwood.reduce((s, u) => s + u.unitCostCents, 0)).toBe(9240000);
    const bySku = new Map<string, number>();
    for (const u of redwood) bySku.set(u.sku, (bySku.get(u.sku) ?? 0) + 1);
    expect(Object.fromEntries(bySku)).toEqual({
      "KE-S1": 1, "KE-E1": 4, "KE-X1": 6, "KE-Y1": 1, "KA-41": 2,
    });
  });

  it("has an unanswered confirmation request; the other custodians responded", () => {
    const redwood = d.custodianStatements.find((s) => s.custodian === "Redwood Installation Services");
    expect(redwood?.requestedAt.startsWith("2026-12-28")).toBe(true);
    expect(redwood?.respondedAt).toBeUndefined();
    const others = d.custodianStatements.filter((s) => s.custodian !== "Redwood Installation Services");
    expect(others).toHaveLength(2);
    expect(others.every((s) => s.respondedAt !== undefined)).toBe(true);
  });
});

describe("EXC-008 / EXC-010 / EXC-012 — ownership, demo age, damage", () => {
  it("the customer-site loaner KE-Y1 ($12,800) initially lacks title evidence; SE-008 locates it", () => {
    const u = unit(story.exc008Serial);
    expect(u?.classification).toBe("LOANER");
    expect(u?.unitCostCents).toBe(1280000);
    const assignment = d.assignments.find((a) => a.serial === story.exc008Serial);
    expect(assignment?.contractId).toBe("CT-002");
    const ct002 = d.contracts.find((c) => c.id === "CT-002");
    expect(
      ct002?.provisions.find((p) => p.provisionType === "TITLE_RETENTION")?.status,
    ).toBe("MISSING");
    // Every other customer-site loaner rides the standard master with title
    // retention evidenced at year end.
    const others = d.assignments.filter(
      (a) => a.kind === "LOANER" && a.serial !== story.exc008Serial,
    );
    expect(others.every((a) => a.contractId === "CT-014")).toBe(true);
    const ct014 = d.contracts.find((c) => c.id === "CT-014");
    expect(
      ct014?.provisions.find((p) => p.provisionType === "TITLE_RETENTION")?.status,
    ).toBe("PRESENT");
    const located = d.scenarioEvents.find((e) => e.eventType === "CONTRACT_LOCATED");
    expect(located?.subjects.serials).toEqual([story.exc008Serial]);
  });

  it("the long demo KE-X1 ($9,200) started 2026-05-31 and concluded with no adjustment", () => {
    const assignment = d.assignments.find((a) => a.serial === story.exc010Serial);
    expect(assignment?.startedAt).toBe("2026-05-31");
    expect(unit(story.exc010Serial)?.unitCostCents).toBe(920000);
    expect(d.scenarioEvents.some((e) => e.eventType === "POLICY_REVIEW_CONCLUDED")).toBe(true);
  });

  it("the damaged KE-E1 ($4,900) has an RMA trail and an assessment event", () => {
    const u = unit(story.exc012Serial);
    expect(u?.location).toBe("DAMAGED_HOLD");
    expect(u?.unitCostCents).toBe(490000);
    expect(d.rmaRecords.some((r) => r.serial === story.exc012Serial)).toBe(true);
    expect(d.scenarioEvents.some((e) => e.eventType === "DAMAGE_ASSESSED")).toBe(true);
  });
});

describe("EXC-009 / EXC-014 / EXC-015 — GL-side facts", () => {
  it("the RMA re-add is posted twice: adjustment to 1230, duplicate JE to 1200", () => {
    const adj = d.inventoryAdjustments.find((a) => a.transactionNumber === "ADJ-2026-0312");
    expect(adj?.glAccount).toBe("1230");
    expect(adj?.lines[0]).toMatchObject({ sku: "KV-Z1", quantity: 2, amountCents: 290000 });
    const dup = d.glEntries.find((e) => e.transactionNumber === "JE-2026-0790");
    expect(dup?.account).toBe("1200");
    expect(dup?.amountCents).toBe(290000);
    expect(d.rmaRecords.filter((r) => ["RMA-2026-0451", "RMA-2026-0452"].includes(r.id))).toHaveLength(2);
  });

  it("the timing receipt is in the 12/31 subledger with GL posted 1/2", () => {
    const receipt = d.itemReceipts.find((r) => r.transactionNumber === "IR-26-2214");
    expect(receipt?.receiptDate).toBe("2026-12-30");
    expect(unit(story.exc014Serial)?.location).toBe("RECEIVING");
    const je = d.glEntries.find((e) => e.transactionNumber === "JE-2027-0012");
    expect(je?.postedDate).toBe("2027-01-02");
    expect(je?.supportRef).toBe("IR-26-2214");
  });

  it("the $18,750 manual entry has no support reference", () => {
    const je = d.glEntries.find((e) => e.transactionNumber === "JE-2026-0847");
    expect(je?.amountCents).toBe(1875000);
    expect(je?.postedDate).toBe("2026-12-31");
    expect(je?.supportRef).toBeUndefined();
  });
});

describe("EXC-011 — slow-moving KE-M1 under valuation review", () => {
  it("exactly 20 KE-M1 ($27,000) sit in valuation review, aged over a year", () => {
    const rows = d.inventoryUnits.filter(
      (u) => u.classification === "VALUATION_REVIEW" && u.sku === "KE-M1",
    );
    expect(rows).toHaveLength(20);
    expect(rows.reduce((s, u) => s + u.unitCostCents, 0)).toBe(2700000);
    for (const u of rows) {
      expect((u.lastMovementAt ?? "") < "2026-01-01").toBe(true);
    }
  });

  it("the KE-M1 forecast collapsed after the product transition", () => {
    const fc = d.forecasts.find((f) => f.sku === "KE-M1");
    expect(fc?.forecastUnits).toBeLessThan(20);
    expect(fc?.note).toContain("KE-M2 transition");
  });
});

describe("timeline coherence", () => {
  it("never moves a unit before it was acquired", () => {
    for (const u of d.inventoryUnits) {
      expect(
        (u.lastMovementAt ?? u.acquiredAt ?? "") >= (u.acquiredAt ?? ""),
        `${u.serial}: moved ${u.lastMovementAt} before acquired ${u.acquiredAt}`,
      ).toBe(true);
    }
  });

  it("never assigns or installs a unit before it was acquired", () => {
    const bySerial = new Map(d.inventoryUnits.map((u) => [u.serial, u]));
    for (const a of d.assignments) {
      const u = bySerial.get(a.serial);
      expect(a.startedAt >= (u?.acquiredAt ?? ""), `${a.id} predates acquisition`).toBe(true);
    }
    for (const inst of d.installations) {
      for (const serial of inst.serials) {
        const u = bySerial.get(serial);
        if (!u) continue; // EXC-001 units ship from stock acquired earlier
        expect(
          inst.installedAt.slice(0, 10) >= (u.acquiredAt ?? ""),
          `${inst.id}/${serial} installed before acquisition`,
        ).toBe(true);
      }
    }
  });

  it("dates RMA receipts to the unit's movement into the RMA area", () => {
    const bySerial = new Map(d.inventoryUnits.map((u) => [u.serial, u]));
    for (const r of d.rmaRecords) {
      if (!r.serial) continue;
      const u = bySerial.get(r.serial);
      if (!u || u.location !== "RMA_REPAIR") continue;
      expect(r.receivedAt.slice(0, 10)).toBe(u.lastMovementAt);
    }
  });

  it("generates every designed cycle-count story deterministically", () => {
    const row = (planId: string, sku: string, location: string) =>
      d.countResults.find(
        (r) => r.countPlanId === planId && r.sku === sku && r.location === location,
      );
    expect(row("CNT-CC-2026-02", "KV-B1", "RECEIVING")?.variance).toBe(-1);
    expect(row("CNT-CC-2026-02", "KV-B1", "RECEIVING")?.adjustedQuantity).toBeDefined();
    expect(row("CNT-CC-2026-05", "KE-S1", "PRIMARY_WAREHOUSE")?.variance).toBe(-1);
    expect(row("CNT-CC-2026-05R", "KE-S1", "PRIMARY_WAREHOUSE")?.variance).toBe(0);
    expect(row("CNT-CC-2026-09", "KV-D1", "RECEIVING")?.variance).toBe(-2);
    expect(row("CNT-CC-2026-11", "KV-D1", "RECEIVING")?.variance).toBe(-1);
    // Overdue example: KR-U1@Demo/Loaner last counted July (due 11/15).
    expect(row("CNT-CC-2026-07", "KR-U1", "DEMO_LOANER")).toBeDefined();
    for (const later of ["08", "09", "10", "11"]) {
      expect(row(`CNT-CC-2026-${later}`, "KR-U1", "DEMO_LOANER")).toBeUndefined();
    }
  });
});

describe("scenario script", () => {
  it("is SCENARIO-EVENTS-v1.1.0, ordered, and references facts rather than exceptions", () => {
    expect(d.scenarioEvents).toHaveLength(10);
    d.scenarioEvents.forEach((e, i) => {
      expect(e.script).toBe("SCENARIO-EVENTS-v1.1.0");
      expect(e.seq).toBe(i + 1);
    });
    const sorted = [...d.scenarioEvents].sort((a, b) =>
      a.occurredAt < b.occurredAt ? -1 : 1,
    );
    expect(sorted.map((e) => e.seq)).toEqual(d.scenarioEvents.map((e) => e.seq));
  });
});
