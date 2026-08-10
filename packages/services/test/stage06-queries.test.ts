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
    expect(detail).toEqual({});
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
