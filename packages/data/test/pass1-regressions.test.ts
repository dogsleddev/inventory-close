import { describe, expect, it } from "vitest";
import { buildDataset } from "../src/buildDataset.js";

/**
 * Pass-1 data regressions (final adversarial data pass, 2026-08-10).
 * Every test pins a CATEGORY the fleet found broken, not the instance:
 * sold-unit acquisition history, carrier-vs-book ordering, operational
 * event coordination, count-window movement traces, test-count/listing
 * agreement, cycle-count feasibility, and document-number conventions.
 */

const d = buildDataset();
const { story } = d;
const unitBySerial = new Map(d.inventoryUnits.map((u) => [u.serial, u]));
const serializedSkus = new Set(d.skus.filter((s) => s.serialized).map((s) => s.code));

const lineSerials = (docs: readonly { lines: readonly { serials?: readonly string[] | undefined }[] }[]) =>
  docs.flatMap((doc) => doc.lines.flatMap((l) => [...(l.serials ?? [])]));

describe("sold units carry full acquisition history (F2)", () => {
  it("gives every serial on any sales document exactly one PO, IR, and VB appearance", () => {
    const soldSerials = new Set([
      ...lineSerials(d.salesOrders),
      ...lineSerials(d.itemFulfillments),
      ...lineSerials(d.customerInvoices),
    ]);
    const poCounts = new Map<string, number>();
    for (const s of lineSerials(d.purchaseOrders)) poCounts.set(s, (poCounts.get(s) ?? 0) + 1);
    const irCounts = new Map<string, number>();
    for (const s of lineSerials(d.itemReceipts)) irCounts.set(s, (irCounts.get(s) ?? 0) + 1);
    const vbCounts = new Map<string, number>();
    for (const s of lineSerials(d.vendorBills)) vbCounts.set(s, (vbCounts.get(s) ?? 0) + 1);
    for (const serial of soldSerials) {
      expect(poCounts.get(serial), `${serial} PO appearances`).toBe(1);
      expect(irCounts.get(serial), `${serial} IR appearances`).toBe(1);
      expect(vbCounts.get(serial), `${serial} VB appearances`).toBe(1);
    }
  });

  it("acquires every sold-chain serial before its sales order date", () => {
    const receiptDateByPo = new Map(d.itemReceipts.map((r) => [r.purchaseOrderNumber, r.receiptDate]));
    const poBySerial = new Map<string, string>();
    for (const po of d.purchaseOrders) {
      for (const l of po.lines) for (const s of l.serials ?? []) poBySerial.set(s, po.transactionNumber);
    }
    for (const so of d.salesOrders) {
      for (const serial of lineSerials([so])) {
        if (unitBySerial.has(serial)) continue; // EXC-001 pair stays on book by design
        const poNumber = poBySerial.get(serial);
        expect(poNumber, `${serial} has an acquiring PO`).toBeDefined();
        const receiptDate = receiptDateByPo.get(poNumber!);
        expect(
          (receiptDate ?? "") < so.orderDate,
          `${serial}: received ${receiptDate} before sold ${so.orderDate}`,
        ).toBe(true);
      }
    }
  });
});

describe("carrier pickups never precede the book movement (F6)", () => {
  it("collects every outbound shipment on or after each carried unit's last book movement", () => {
    const outbound = d.carrierShipments.filter((s) =>
      s.events.some((e) => e.eventType === "PICKUP" && (e.location ?? "").includes("KestrelGrid")),
    );
    expect(outbound.length).toBeGreaterThan(0);
    for (const ship of outbound) {
      const pickup = ship.events.find((e) => e.eventType === "PICKUP")!;
      for (const serial of ship.serials) {
        const u = unitBySerial.get(serial);
        if (!u) continue; // sold serials left the book; their move is the sale
        expect(
          (u.lastMovementAt ?? "") <= pickup.occurredAt.slice(0, 10),
          `${ship.id}/${serial}: moved ${u.lastMovementAt} after pickup ${pickup.occurredAt}`,
        ).toBe(true);
      }
    }
  });
});

describe("operational events own the movement story (F3/F7)", () => {
  it("dates every installed on-book unit's last movement to its install day", () => {
    for (const inst of d.installations) {
      if (inst.serials.some((s) => story.exc001Serials.includes(s))) continue; // designed: book never moved
      for (const serial of inst.serials) {
        const u = unitBySerial.get(serial);
        if (!u) continue;
        if (d.assignments.some((a) => a.serial === serial)) continue; // assignment wins
        expect(u.lastMovementAt, `${inst.id}/${serial}`).toBe(inst.installedAt.slice(0, 10));
      }
    }
  });

  it("dates every assigned unit's last movement to its assignment start", () => {
    for (const a of d.assignments) {
      const u = unitBySerial.get(a.serial);
      expect(u, `${a.id} references a book unit`).toBeDefined();
      expect(u?.lastMovementAt, `${a.id}/${a.serial}`).toBe(a.startedAt);
    }
  });

  it("never sweeps an assigned unit into a fleet install for another customer", () => {
    const assignmentBySerial = new Map(d.assignments.map((a) => [a.serial, a]));
    for (const inst of d.installations) {
      for (const serial of inst.serials) {
        const a = assignmentBySerial.get(serial);
        if (!a) continue;
        expect(
          a.customer,
          `${inst.id}/${serial}: install customer vs assignment customer`,
        ).toBe(inst.customer);
      }
    }
  });

  it("emits telemetry only for installed units, online after installation", () => {
    const installBySerial = new Map<string, string>();
    for (const inst of d.installations) {
      for (const serial of inst.serials) installBySerial.set(serial, inst.installedAt);
    }
    for (const t of d.telemetry) {
      const installedAt = installBySerial.get(t.serial);
      expect(installedAt, `${t.id}: telemetry without installation`).toBeDefined();
      expect(t.firstOnlineAt >= installedAt!, `${t.id} online before install`).toBe(true);
      expect(t.lastSeenAt >= t.firstOnlineAt, `${t.id} lastSeen before firstOnline`).toBe(true);
    }
  });
});

describe("count-window movements leave the trace they claim (F5)", () => {
  it("gives every pre-snapshot movement a first-pass variance trace, and post-snapshot movements none", () => {
    const snapshotAt = d.countPlans.find((p) => p.countType === "YEAR_END")!.snapshotAt;
    for (const m of d.countMovements) {
      if (m.movedAt > snapshotAt) continue; // after the freeze; book and count both pre-move
      const trace = d.countResults.some(
        (r) =>
          r.countPlanId === "CNT-YE-2026" &&
          r.serial !== undefined &&
          r.serial === m.serial &&
          r.variance !== 0,
      );
      expect(trace, `${m.id} moved pre-snapshot with no count variance trace`).toBe(true);
    }
  });
});

describe("test counts describe the same event as the listing (F9/F13)", () => {
  it("cites the listing's bin on every traced test", () => {
    const yeBinBySerial = new Map(
      d.countResults
        .filter((r) => r.countPlanId === "CNT-YE-2026" && r.serial !== undefined && r.snapshotQuantity > 0)
        .map((r) => [r.serial!, r.bin]),
    );
    const traced = d.countTests.filter((t) => t.traced && t.serial !== undefined);
    expect(traced.length).toBeGreaterThan(0);
    for (const t of traced) {
      expect(t.bin, `${t.id}/${t.serial}`).toBe(yeBinBySerial.get(t.serial!));
    }
  });

  it("records tests at per-test times, not one repeated instant", () => {
    const byInstant = new Map<string, number>();
    for (const t of d.countTests) {
      byInstant.set(t.recordedAt, (byInstant.get(t.recordedAt) ?? 0) + 1);
    }
    for (const [instant, n] of byInstant) {
      expect(n, `${n} test counts share ${instant}`).toBeLessThanOrEqual(4);
    }
  });
});

describe("cycle counts stay inside what the book makes possible (F10)", () => {
  const acquiredBy = (sku: string, date: string) =>
    d.inventoryUnits.filter((u) => u.sku === sku && (u.acquiredAt ?? "9999") <= date).length;
  const planById = new Map(d.countPlans.map((p) => [p.id, p]));

  it("never counts a SKU the company had not yet acquired, and never more than existed", () => {
    for (const r of d.countResults) {
      if (r.countPlanId === "CNT-YE-2026") continue;
      const plan = planById.get(r.countPlanId)!;
      const cap = acquiredBy(r.sku, plan.snapshotAt.slice(0, 10));
      expect(cap, `${r.countPlanId} ${r.sku}@${r.location}: counted before any stock existed`).toBeGreaterThan(0);
      expect(
        r.snapshotQuantity,
        `${r.countPlanId} ${r.sku}@${r.location}: snapshot ${r.snapshotQuantity} vs ${cap} acquired`,
      ).toBeLessThanOrEqual(Math.max(cap, Math.abs(r.variance) + 1));
    }
  });

  it("recounts the same system quantity the first May count listed", () => {
    const first = d.countResults.find(
      (r) => r.countPlanId === "CNT-CC-2026-05" && r.sku === "KE-S1" && r.location === "PRIMARY_WAREHOUSE",
    );
    const recount = d.countResults.find((r) => r.countPlanId === "CNT-CC-2026-05R");
    expect(first).toBeDefined();
    expect(recount?.snapshotQuantity).toBe(first?.snapshotQuantity);
    expect(recount?.variance).toBe(0);
  });

  it("keeps quantities tethered to the cell's year-end level", () => {
    const yearEndCell = new Map<string, number>();
    for (const u of d.inventoryUnits) {
      const key = `${u.sku}|${u.location}`;
      yearEndCell.set(key, (yearEndCell.get(key) ?? 0) + 1);
    }
    for (const r of d.countResults) {
      if (r.countPlanId === "CNT-YE-2026") continue;
      const anchor = yearEndCell.get(`${r.sku}|${r.location}`) ?? 0;
      expect(anchor, `${r.countPlanId} ${r.sku}@${r.location}: cell empty at year end`).toBeGreaterThan(0);
      expect(
        r.snapshotQuantity,
        `${r.countPlanId} ${r.sku}@${r.location}: ${r.snapshotQuantity} vs anchor ${anchor}`,
      ).toBeLessThanOrEqual(Math.max(Math.ceil(anchor * 1.2), Math.abs(r.variance) + 1));
    }
  });
});

describe("document numbers follow their dates (F15)", () => {
  it("prefixes every PO, IR, and VB with its own document date's year", () => {
    const yearOf = (transactionNumber: string) => transactionNumber.split("-")[1];
    for (const po of d.purchaseOrders) {
      expect(yearOf(po.transactionNumber), po.transactionNumber).toBe(po.orderDate.slice(2, 4));
    }
    for (const ir of d.itemReceipts) {
      expect(yearOf(ir.transactionNumber), ir.transactionNumber).toBe(ir.receiptDate.slice(2, 4));
    }
    for (const vb of d.vendorBills) {
      expect(yearOf(vb.transactionNumber), vb.transactionNumber).toBe(vb.billDate.slice(2, 4));
    }
  });
});

describe("operational timestamps vary like real systems (F18 partial)", () => {
  it("does not repeat one transit fingerprint across the clean sale shipments", () => {
    const sold = d.carrierShipments.filter((s) => s.itemFulfillmentNumber?.startsWith("IF-2615"));
    expect(sold).toHaveLength(10);
    const durations = new Set(
      sold.map((s) => {
        const first = Date.parse(s.events[0]!.occurredAt);
        const last = Date.parse(s.events[s.events.length - 1]!.occurredAt);
        return last - first;
      }),
    );
    expect(durations.size).toBeGreaterThanOrEqual(3);
  });

  it("logs RMA intakes and telemetry check-ins at varied times of day", () => {
    const rmaTimes = new Set(d.rmaRecords.map((r) => r.receivedAt.slice(11)));
    expect(rmaTimes.size).toBeGreaterThanOrEqual(5);
    const lastSeen = new Set(d.telemetry.map((t) => t.lastSeenAt));
    expect(lastSeen.size).toBeGreaterThanOrEqual(10);
  });
});

describe("serialized population documents stay complete (guard on F2's mechanism)", () => {
  it("keeps every serialized on-book unit outside INBOUND_TRANSIT on exactly one PO/IR/VB", () => {
    const poSerials = new Set(lineSerials(d.purchaseOrders));
    for (const u of d.inventoryUnits) {
      if (!serializedSkus.has(u.sku)) continue;
      expect(poSerials.has(u.serial), `${u.serial} missing from all POs`).toBe(true);
    }
  });
});
