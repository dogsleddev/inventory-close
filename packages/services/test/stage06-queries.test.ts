import { describe, expect, it } from "vitest";
import { createWorkspace, createQueryService } from "../src/index.js";
import type { ServiceContext } from "../src/index.js";
import { userByRole } from "@icg/data";

/**
 * Stage 06 additive queries: getFinancialLife source records, count-detail
 * adjustments, and procurement detail. All read-only projections of the
 * deterministic workspace — nothing here may change a close result.
 */

const ws = createWorkspace();
const queries = createQueryService(ws);
const ctx = (role: Parameters<typeof userByRole>[0]): ServiceContext => ({
  user: userByRole(role),
  correlationId: "T-STAGE06",
  sourceInterface: "TEST",
});

describe("getFinancialLife records (stage 06)", () => {
  it("returns the underlying source records for the flagship serial", () => {
    const life = queries.getFinancialLife(ctx("CONTROLLER"), "KE-E2-1048");
    const r = life.records;
    expect(r.purchaseOrder?.transactionNumber).toBe(life.buySide.purchaseOrder);
    expect(r.itemReceipt?.transactionNumber).toBe(life.buySide.itemReceipt);
    expect(r.vendorBill?.transactionNumber).toBe(life.buySide.vendorBill);
    expect(r.salesOrder?.transactionNumber).toBe("SO-26184");
    expect(r.itemFulfillment?.transactionNumber).toBe("IF-261972");
    expect(r.customerInvoice?.transactionNumber).toBe("INV-2027-00418");
    // The carrier record carries the real delivery event — the UI must
    // render the delivered state, never the mockup's "in transit" (§9a-2).
    expect(
      r.carrierShipment?.events.some((e) => e.eventType === "DELIVERED"),
    ).toBe(true);
    expect(life.sellSide.deliveredAt).toBeDefined();
  });

  it("returns no records where no component exists", () => {
    const offBook = ws.close.exceptions.find((e) => e.finding.ruleId === "CNT-COMP-001");
    const serial = offBook?.finding.subjects.serials?.[0];
    expect(serial).toBeDefined();
    const life = queries.getFinancialLife(ctx("CONTROLLER"), serial ?? "");
    expect(life.unit).toBeUndefined();
    expect(life.records.purchaseOrder).toBeUndefined();
    expect(life.records.salesOrder).toBeUndefined();
    // But the physical observation trail is there.
    expect(life.inventoryLife.countTests.length).toBeGreaterThan(0);
  });
});

describe("getCountDetail adjustments (stage 06)", () => {
  it("exposes inventory adjustments with their count-plan links", () => {
    const detail = queries.getCountDetail(ctx("CONTROLLER"));
    expect(detail.adjustments.length).toBeGreaterThan(0);
    expect(
      detail.adjustments.some((a) => a.relatedCountPlanId !== undefined),
    ).toBe(true);
  });

  it("still withholds the management lens from the auditor, not the facts", () => {
    const detail = queries.getCountDetail(ctx("AUDITOR_READ_ONLY"));
    expect(detail.managementIndicators).toEqual([]);
    expect(detail.adjustments.length).toBeGreaterThan(0);
    expect(detail.results.length).toBeGreaterThan(0);
  });
});

describe("stage-06 fleet regressions — record scoping", () => {
  it("never hands the auditor a source document their evidence scope withholds", () => {
    const auditorTitles = new Set(
      queries.listEvidence(ctx("AUDITOR_READ_ONLY")).map((e) => e.title),
    );
    const graphTitles = new Set(ws.evidenceGraph.items.map((i) => i.title));
    const life = queries.getFinancialLife(ctx("AUDITOR_READ_ONLY"), "KE-E2-1048");
    const refs = Object.values(life.records).map(
      (r) => (r as { id?: string; transactionNumber?: string }).id ??
        (r as { transactionNumber?: string }).transactionNumber ?? "",
    );
    // A record that is evidence for some exception may only appear when that
    // evidence is in scope — `records` must not be a side door around
    // listEvidence / traceLineage.
    const leaked = refs.filter((t) => graphTitles.has(t) && !auditorTitles.has(t));
    expect(leaked).toEqual([]);
    // EXC-009's workpaper (PBC-002) has never been provided, so nothing
    // under it reaches the auditor. (EXC-001 moved INTO scope in stage 07
    // when the PBC baseline was corrected — PBC-008's versions are sealed
    // and provided; see packages/services/test/fleet-regressions.test.ts.)
    expect(queries.traceLineage(ctx("AUDITOR_READ_ONLY"), "EXC-009")).toBeUndefined();
    // The controller's scope is full: on a serial whose exception is NOT
    // under any provided workpaper, they see records the auditor does not.
    // The serial is derived, so the assertion follows the scope rather than
    // a hard-coded example that a later baseline could pull into scope.
    const outOfScope = ws.close.exceptions.find(
      (e) =>
        queries.traceLineage(ctx("AUDITOR_READ_ONLY"), e.id) === undefined &&
        (e.finding.subjects.serials?.length ?? 0) > 0,
    );
    expect(outOfScope, "no out-of-scope exception with a serial").toBeDefined();
    const serial = outOfScope!.finding.subjects.serials![0]!;
    const full = queries.getFinancialLife(ctx("CONTROLLER"), serial);
    const scoped = queries.getFinancialLife(ctx("AUDITOR_READ_ONLY"), serial);
    expect(Object.keys(full.records).length).toBeGreaterThan(
      Object.keys(scoped.records).length,
    );
    // Run the side-door check where it can actually fail. On KE-E2-1048 every
    // record is legitimately in scope now, so `leaked` there is vacuously
    // empty; on an out-of-scope serial a partial leak of even one record
    // fails here, which a count comparison alone would pass.
    const scopedRefs = Object.values(scoped.records).map(
      (r) =>
        (r as { id?: string; transactionNumber?: string }).id ??
        (r as { transactionNumber?: string }).transactionNumber ??
        "",
    );
    expect(scopedRefs.filter((t) => graphTitles.has(t) && !auditorTitles.has(t))).toEqual([]);
    // Content the auditor's scope does allow is still complete, not stubbed.
    expect(
      queries.getFinancialLife(ctx("CONTROLLER"), "KE-E2-1048").records.salesOrder
        ?.customer,
    ).toBeDefined();
  });

  it("scopes procurement documents the same way", () => {
    const auditorTitles = new Set(
      queries.listEvidence(ctx("AUDITOR_READ_ONLY")).map((e) => e.title),
    );
    const graphTitles = new Set(ws.evidenceGraph.items.map((i) => i.title));
    for (const m of queries.getProcurementMatches(ctx("AUDITOR_READ_ONLY"))) {
      const d = queries.getProcurementDetail(
        ctx("AUDITOR_READ_ONLY"),
        m.purchaseOrderNumber,
      );
      for (const ref of [
        d.purchaseOrder?.transactionNumber,
        d.itemReceipt?.transactionNumber,
        d.vendorBill?.transactionNumber,
      ]) {
        if (ref === undefined) continue;
        if (graphTitles.has(ref)) expect(auditorTitles.has(ref)).toBe(true);
      }
    }
  });

  it("sums document totals in the service so no caller adds money up", () => {
    const life = queries.getFinancialLife(ctx("CONTROLLER"), "KE-E2-1048");
    expect(life.recordTotals.salesOrderCents).toBeTypeOf("number");
    expect(life.recordTotals.customerInvoiceCents).toBeTypeOf("number");
    const match = queries
      .getProcurementMatches(ctx("CONTROLLER"))
      .find((m) => m.vendorBillNumber !== undefined);
    const d = queries.getProcurementDetail(
      ctx("CONTROLLER"),
      match?.purchaseOrderNumber ?? "",
    );
    expect(d.totals.purchaseOrderCents).toBeTypeOf("number");
    expect(d.totals.purchaseOrderQuantity).toBeTypeOf("number");
    // A withheld document carries no total either.
    const scoped = queries.getProcurementDetail(
      ctx("AUDITOR_READ_ONLY"),
      match?.purchaseOrderNumber ?? "",
    );
    if (scoped.purchaseOrder === undefined) {
      expect(scoped.totals.purchaseOrderCents).toBeUndefined();
    }
  });

  it("exposes the dataset's own location names instead of leaving them to the UI", () => {
    const locations = queries.listLocations(ctx("CONTROLLER"));
    const staging = locations.find((l) => l.id === "STAGING");
    expect(staging?.name).toBe("Shipping / Install Staging");
    expect(locations.length).toBeGreaterThan(4);
  });
});

describe("getProcurementDetail (stage 06)", () => {
  it("returns the documents behind a match", () => {
    const match = queries
      .getProcurementMatches(ctx("CONTROLLER"))
      .find((m) => m.itemReceiptNumber !== undefined && m.vendorBillNumber !== undefined);
    expect(match).toBeDefined();
    const detail = queries.getProcurementDetail(
      ctx("CONTROLLER"),
      match?.purchaseOrderNumber ?? "",
    );
    expect(detail.purchaseOrder?.transactionNumber).toBe(match?.purchaseOrderNumber);
    expect(detail.itemReceipt?.transactionNumber).toBe(match?.itemReceiptNumber);
    expect(detail.vendorBill?.transactionNumber).toBe(match?.vendorBillNumber);
  });

  it("returns nothing for an unknown purchase order", () => {
    const detail = queries.getProcurementDetail(ctx("CONTROLLER"), "PO-NONEXISTENT");
    expect(detail.purchaseOrder).toBeUndefined();
    expect(detail.itemReceipt).toBeUndefined();
    expect(detail.vendorBill).toBeUndefined();
    // No documents means no totals — never a zero, which would read as a
    // real figure.
    expect(detail.totals).toEqual({});
  });

  it("keeps the match statuses independent: an incomplete native match can carry an open close question and vice versa", () => {
    const matches = queries.getProcurementMatches(ctx("CONTROLLER"));
    // EXC-002: bill in period, receipt absent at 12/31, title unresolved.
    const open = matches.find((m) => m.closeMatchStatus !== "PASS");
    expect(open).toBeDefined();
    expect(open?.nativeNetsuiteMatchStatus).not.toBe("PASS");
    // Clean GIT chains: native incomplete at 12/31 while the close is fine.
    expect(
      matches.some(
        (m) => m.nativeNetsuiteMatchStatus !== "PASS" && m.closeMatchStatus === "PASS",
      ),
    ).toBe(true);
    // And the normal case: both pass.
    expect(
      matches.some(
        (m) => m.nativeNetsuiteMatchStatus === "PASS" && m.closeMatchStatus === "PASS",
      ),
    ).toBe(true);
  });
});
