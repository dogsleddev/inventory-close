import { beforeEach, describe, expect, it } from "vitest";
import { userByRole } from "@icg/data";
import type { Role } from "@icg/domain";
import {
  createWorkspace,
  getProcurementPopulations,
  type ServiceContext,
  type Workspace,
} from "../src/index.js";

/**
 * Procurement populations (COMPLETION_PLAN Stage C).
 *
 * The risk in this projection is not that a number renders wrong — it is that
 * it renders a SECOND number for something the close already answers. These
 * tests pin the agreements rather than the figures: the document side and the
 * book side of goods in transit describe the same units, the match statuses
 * are the rule's and not a recomputation, and price variance stays a
 * match-level attribute that never becomes an exception.
 */

let ws: Workspace;

const ctx = (role: Role): ServiceContext => ({
  user: userByRole(role),
  correlationId: `T-PROC-${role}`,
  sourceInterface: "TEST",
});

beforeEach(() => {
  ws = createWorkspace();
});

const populations = (role: Role = "CONTROLLER") =>
  getProcurementPopulations(ws, ctx(role));

describe("the match summary restates the rule, it does not recompute it", () => {
  it("reports one order per procurement match the close derived", () => {
    const p = populations();
    expect(p.orders).toHaveLength(ws.close.procurementMatches.length);
    expect(p.withheldOrderCount).toBe(0);
    expect(p.summary.orders).toBe(p.orders.length);
  });

  it("carries each order's two statuses verbatim from PROC-3WM-001", () => {
    const p = populations();
    for (const order of p.orders) {
      const match = ws.close.procurementMatches.find(
        (m) => m.purchaseOrderNumber === order.purchaseOrderNumber,
      );
      expect(match, order.purchaseOrderNumber).toBeDefined();
      expect(order.nativeNetsuiteMatchStatus).toBe(match?.nativeNetsuiteMatchStatus);
      expect(order.closeMatchStatus).toBe(match?.closeMatchStatus);
    }
  });

  it("counts the orders where the native and close views disagree", () => {
    const p = populations();
    // CANONICAL_SPEC §7 exists because these two can differ. If the dataset
    // ever stopped producing a divergence, this surface would be showing a
    // separation it no longer demonstrates.
    expect(p.summary.divergent).toBeGreaterThan(0);
    expect(p.summary.nativePass + p.summary.nativeReviewRequired + p.summary.nativeIncomplete)
      .toBe(p.summary.orders);
    expect(p.summary.closePass + p.summary.closeReviewRequired).toBe(p.summary.orders);
  });

  it("puts EXC-002 on an invoiced-not-received order under close review", () => {
    const p = populations();
    const exc002 = p.invoicedNotReceived.find((r) => r.relatedExceptionId === "EXC-002");
    expect(exc002).toBeDefined();
    expect(exc002?.closeMatchStatus).toBe("REVIEW_REQUIRED");
    expect(exc002?.relatedExceptionOpen).toBe(true);
    // Billed in period, received after it — that IS the exception.
    expect(exc002?.billDate.localeCompare(p.asOf)).toBeLessThanOrEqual(0);
    expect(exc002?.recordedReceiptDate?.localeCompare(p.asOf)).toBeGreaterThan(0);
  });
});

describe("every order sits in exactly one period-end position", () => {
  // Read as the CONTROLLER, whose scope withholds nothing, so the row's own
  // date fields ARE the documents' dates. For a scoped reader they are not —
  // the row omits a withheld document's date while the position still counts
  // it — and the role sweep below is what pins that. Deriving the expectation
  // from the row's fields for every role would have re-asserted the P1.
  it("derives the position from the documents' own dates", () => {
    const p = populations();
    for (const order of p.orders) {
      const received = order.receiptDate !== undefined && order.receiptDate <= p.asOf;
      const billed = order.billDate !== undefined && order.billDate <= p.asOf;
      const expected = received
        ? billed
          ? "MATCHED_IN_PERIOD"
          : "RECEIVED_NOT_INVOICED"
        : billed
          ? "INVOICED_NOT_RECEIVED"
          : "NEITHER_IN_PERIOD";
      expect(order.position, order.purchaseOrderNumber).toBe(expected);
    }
  });

  it("populates GRNI and invoiced-not-received from those positions and nothing else", () => {
    const p = populations();
    const grniPos = new Set(p.grni.map((r) => r.purchaseOrderNumber));
    const inrPos = new Set(p.invoicedNotReceived.map((r) => r.purchaseOrderNumber));
    for (const order of p.orders) {
      expect(grniPos.has(order.purchaseOrderNumber), order.purchaseOrderNumber).toBe(
        order.position === "RECEIVED_NOT_INVOICED",
      );
      expect(inrPos.has(order.purchaseOrderNumber), order.purchaseOrderNumber).toBe(
        order.position === "INVOICED_NOT_RECEIVED",
      );
    }
    // The two populations are disjoint by construction; if they ever
    // overlapped, a screen adding them up would double-count.
    for (const po of grniPos) expect(inrPos.has(po)).toBe(false);
  });

  it("states how long each received-not-invoiced order has been outstanding", () => {
    const p = populations();
    expect(p.grni.length).toBeGreaterThan(0);
    for (const row of p.grni) {
      expect(row.receiptDate <= p.asOf).toBe(true);
      expect(row.daysOutstanding).toBeGreaterThanOrEqual(0);
      // A bill that exists at all must be dated after period end, or the
      // order would not be in this population.
      if (row.billDate !== undefined) expect(row.billDate > p.asOf).toBe(true);
    }
  });
});

describe("goods in transit is one population seen from two sides", () => {
  it("agrees between the invoiced-not-received documents and the inbound book units", () => {
    const git = populations().goodsInTransit;
    expect(git.documentUnits).toBe(git.inboundUnits);
    expect(git.documentCents).toBe(git.inboundCents);
    expect(git.inboundAgrees).toBe(true);
  });

  it("reports the whole of account 1210, so it cannot contradict the GL screen", () => {
    const git = populations().goodsInTransit;
    // 1210 carries BOTH directions. Reporting only the inbound half against
    // the account would put a smaller number beside the same account code on
    // another screen.
    expect(git.inboundUnits + git.outboundUnits).toBe(git.accountUnits);
    expect(git.inboundCents + git.outboundCents).toBe(git.accountCents);
    expect(git.outboundUnits).toBeGreaterThan(0);
    expect(git.glAccount).toBe("1210");
  });
});

describe("price variance is an attribute of a match, never an exception", () => {
  it("finds variances in both directions and totals them separately", () => {
    const ppv = populations().priceVariance;
    expect(ppv.rows.length).toBeGreaterThan(0);
    expect(ppv.unfavorableCents).toBeGreaterThan(0);
    expect(ppv.favorableCents).toBeLessThan(0);
    expect(ppv.netCents).toBe(ppv.unfavorableCents + ppv.favorableCents);
    expect(ppv.ordersCompared).toBeGreaterThanOrEqual(ppv.rows.length);
  });

  it("derives each variance from the two documents rather than asserting it", () => {
    for (const row of populations().priceVariance.rows) {
      expect(row.varianceCents).toBe(
        row.quantity * (row.billedUnitCents - row.orderedUnitCents),
      );
      expect(row.direction).toBe(row.varianceCents > 0 ? "UNFAVORABLE" : "FAVORABLE");
      // The order was placed at standard cost, so the variance the screen
      // shows against the order is the same one an accountant would compute
      // against standard.
      expect(row.orderedUnitCents).toBe(row.standardUnitCents);
    }
  });

  it("leaves the exception population at fifteen and the blockers at seven", () => {
    const p = populations();
    expect(p.priceVariance.rows.length).toBeGreaterThan(0);
    expect(ws.close.exceptions).toHaveLength(15);
    expect(ws.close.blockers).toHaveLength(7);
    // No order carrying a price variance may carry an exception because of
    // it: D9 requires PPV stay match-level.
    const varied = new Set(p.priceVariance.rows.map((r) => r.purchaseOrderNumber));
    for (const order of p.orders.filter((o) => varied.has(o.purchaseOrderNumber))) {
      expect(order.relatedExceptionId, order.purchaseOrderNumber).toBeUndefined();
      expect(order.closeMatchStatus).toBe("PASS");
      // A price difference is not a quantity difference; the native
      // three-way match still passes.
      expect(order.nativeNetsuiteMatchStatus).toBe("PASS");
    }
  });
});

describe("an auditor's population is scoped, and says so", () => {
  it("never reports a withheld document as an absent one", () => {
    const auditor = populations("AUDITOR_READ_ONLY");
    const controller = populations();
    // Whatever the auditor's scope removes, it is counted rather than
    // silently dropped — a shorter list with no explanation reads as the
    // whole population.
    expect(auditor.orders.length + auditor.withheldOrderCount).toBe(
      controller.summary.ordersVisible,
    );
  });

  /**
   * The counts above are why the P1 below survived Stage G.
   *
   * A scope-shortened population fed four figures and a classification, and
   * every assertion in this file compared CARDINALITIES: the auditor's rows
   * plus the withheld count equalled the Controller's row count, and it did —
   * while a DIFFERENT purchase order sat in the invoiced-not-received
   * population for each role. One order left because its own record was out of
   * scope, another arrived because its RECEIPT was, so the row count was 4
   * both ways and no surface revealed the swap. These tests diff identity.
   */
  const ROLES: readonly Role[] = [
    "CONTROLLER",
    "HEAD_OF_FINANCE",
    "ACCOUNTING_MANAGER",
    "PREPARER",
    "WAREHOUSE",
    "SUPPLY_CHAIN",
    "FPA",
    "LEGAL",
    "AUDITOR_READ_ONLY",
  ];

  it("puts the same purchase orders in each population for every role", () => {
    const baseline = populations();
    const ids = (rows: readonly { purchaseOrderNumber: string }[]) =>
      rows.map((r) => r.purchaseOrderNumber);
    for (const role of ROLES) {
      const p = populations(role);
      // A row list may be SHORTER for a scoped role — withholding rows is what
      // scope is for. It may never contain an order the unscoped population
      // does not, which is what a manufactured classification produces.
      for (const key of ["grni", "invoicedNotReceived", "orders"] as const) {
        const seen = ids(p[key]);
        // Subset, order preserved: an id `seen` holds that `expected` does not
        // survives the filter on the right and fails the comparison, which is
        // the manufactured-row case.
        expect(seen, `${role} ${key}`).toEqual(ids(baseline[key]).filter((id) => seen.includes(id)));
      }
    }
    // The auditor must actually withhold something, or every assertion in this
    // describe compares a population with itself.
    expect(populations("AUDITOR_READ_ONLY").withheldOrderCount).toBeGreaterThan(0);
    expect(populations("AUDITOR_READ_ONLY").withheldDocumentCount).toBeGreaterThan(0);
  });

  it("does not classify PO-26-1201 as a cutoff exposure for the auditor who cannot see its receipt", () => {
    const auditor = populations("AUDITOR_READ_ONLY");
    const order = auditor.orders.find((o) => o.purchaseOrderNumber === "PO-26-1201");
    // The verbatim P1. The receipt IR-26-2214 is dated 2026-12-30 — inside the
    // period — and is outside an auditor's scope, so a visibility-derived
    // position printed this order on the Invoiced Not Received tab as a named
    // cutoff exposure, with EXC-014 dropped because the exception was matched
    // on the withheld receipt's number. The row count was 4 for both roles.
    expect(order?.position).toBe("MATCHED_IN_PERIOD");
    expect(order?.withheldDocuments).toEqual(["ITEM_RECEIPT"]);
    expect(order?.relatedExceptionId).toBe("EXC-014");
    expect(auditor.invoicedNotReceived.map((r) => r.purchaseOrderNumber)).not.toContain(
      "PO-26-1201",
    );
  });

  it("derives the period-end position from the documents' dates, not from the reader", () => {
    const baseline = new Map(populations().orders.map((o) => [o.purchaseOrderNumber, o]));
    for (const role of ROLES) {
      for (const order of populations(role).orders) {
        const same = baseline.get(order.purchaseOrderNumber);
        // The cutoff question — was this received in the period? — has an
        // answer about the world. For an auditor, PO-26-1201's receipt is out
        // of scope, and deriving the position from visibility classified a
        // matched order as INVOICED_NOT_RECEIVED: a control finding
        // manufactured from an access restriction, on a named order.
        expect(order.position, `${role} ${order.purchaseOrderNumber}`).toBe(same?.position);
        expect(order.relatedExceptionId, `${role} ${order.purchaseOrderNumber}`).toBe(
          same?.relatedExceptionId,
        );
      }
    }
  });

  it("reports the close's own match figures whatever the reader may read", () => {
    const baseline = populations().summary;
    for (const role of ROLES) {
      const p = populations(role);
      // Both match statuses are close-control facts. Counting them over the
      // filtered rows told an auditor ZERO orders required close review while
      // the close held one, and shortened the divergence count CANONICAL_SPEC
      // §7 exists to make visible.
      expect(p.summary, role).toEqual({ ...baseline, ordersVisible: p.summary.ordersVisible });
      expect(p.summary.orders, role).toBe(ws.close.procurementMatches.length);
      expect(p.summary.ordersVisible + p.withheldOrderCount, role).toBe(p.summary.orders);
    }
  });

  it("names every withheld document rather than leaving its cell empty", () => {
    let withheldSomewhere = 0;
    for (const role of ROLES) {
      const p = populations(role);
      let counted = 0;
      for (const o of p.orders) {
        counted += o.withheldDocuments.length;
        // The fields the row omits for a withheld document, and the inverse:
        // a document that is absent from the dataset is never called withheld.
        if (o.withheldDocuments.includes("ITEM_RECEIPT")) {
          expect(o.itemReceiptNumber, `${role} ${o.purchaseOrderNumber}`).toBeUndefined();
          expect(o.receiptDate).toBeUndefined();
        }
        if (o.withheldDocuments.includes("VENDOR_BILL")) {
          expect(o.vendorBillNumber, `${role} ${o.purchaseOrderNumber}`).toBeUndefined();
          expect(o.billedCents).toBeUndefined();
        }
      }
      expect(counted, role).toBe(p.withheldDocumentCount);
      withheldSomewhere += counted;
    }
    // If no role ever withheld a document on a row it keeps, every assertion
    // above is vacuous and this guard is decoration.
    expect(withheldSomewhere).toBeGreaterThan(0);
  });

  it("accounts for every comparison its own scope prevented", () => {
    // The CONTROLLER withholds nothing, so its `ordersCompared` is the number
    // of comparisons the data supports. Every comparison a scoped role loses
    // relative to that is one its scope prevented — an exact identity, not a
    // bound, and it is what keeps "3 of 83" from being printed as a ratio over
    // the population.
    const baseline = populations().priceVariance;
    expect(baseline.ordersNotComparedAtScope).toBe(0);
    for (const role of ROLES) {
      const v = populations(role).priceVariance;
      expect(v.ordersNotComparedAtScope, role).toBe(
        baseline.ordersCompared - v.ordersCompared,
      );
    }
  });
});
