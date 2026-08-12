import type { RuleResult } from "@icg/domain";
import { authorize } from "@icg/permissions";
import { makeRecordScope, type ServiceContext } from "./queries.js";
import type { Workspace } from "./workspace.js";

/**
 * The procurement populations a Controller has to be able to name at period
 * end (COMPLETION_PLAN Stage C): three-way match, received-not-invoiced,
 * invoiced-not-received, inbound goods in transit, and purchase price
 * variance.
 *
 * This is a projection, not a rule. `PROC-3WM-001` still owns both match
 * statuses and `CUT-IN-001` still owns the cutoff exception; nothing here
 * derives an exception, a blocker or a readiness input, and none of these
 * collections reaches the rule engine. Every figure is a re-cut of documents
 * the close already read.
 *
 * The one claim this module does make is an agreement, and it makes it
 * explicitly: **invoiced-not-received and inbound goods in transit are the
 * same units seen from two sides** — the document side (orders billed but not
 * received at 12/31) and the book side (units classified GIT sitting in
 * inbound transit). They are returned together, with a flag saying whether
 * they agree, precisely so no screen can present them as two populations a
 * reader would add up.
 *
 * Account 1210 is the same care in the other direction: it holds inbound AND
 * outbound goods in transit. Reporting only the inbound half against 1210
 * would contradict the GL-account screen, so the outbound half is carried
 * here too — named, not summed into the procurement answer.
 */

/** Where a purchase order stood at the balance-sheet date. */
export type PeriodEndPosition =
  | "MATCHED_IN_PERIOD"
  | "RECEIVED_NOT_INVOICED"
  | "INVOICED_NOT_RECEIVED"
  | "NEITHER_IN_PERIOD";

export interface ProcurementOrderOut {
  readonly purchaseOrderNumber: string;
  readonly vendor: string;
  readonly orderDate: string;
  readonly itemReceiptNumber?: string | undefined;
  readonly receiptDate?: string | undefined;
  readonly vendorBillNumber?: string | undefined;
  readonly billDate?: string | undefined;
  readonly nativeNetsuiteMatchStatus: RuleResult;
  readonly closeMatchStatus: RuleResult;
  readonly quantity: number;
  /** Absent when any line omits its amount — a partial sum is not a total. */
  readonly orderedCents?: number | undefined;
  readonly billedCents?: number | undefined;
  readonly position: PeriodEndPosition;
  /** The close's own exception on this order, when one exists. */
  readonly relatedExceptionId?: string | undefined;
  readonly relatedExceptionOpen?: boolean | undefined;
}

export interface ProcurementMatchSummaryOut {
  readonly orders: number;
  readonly nativePass: number;
  readonly nativeReviewRequired: number;
  readonly nativeIncomplete: number;
  readonly closePass: number;
  readonly closeReviewRequired: number;
  /**
   * Orders whose native NetSuite status and close-control status disagree —
   * the separation CANONICAL_SPEC §7 exists to make visible.
   */
  readonly divergent: number;
}

/** Received before period end, not yet invoiced: an accrued liability. */
export interface GrniRowOut {
  readonly purchaseOrderNumber: string;
  readonly vendor: string;
  readonly itemReceiptNumber: string;
  readonly receiptDate: string;
  readonly quantity: number;
  readonly receivedCents?: number | undefined;
  /** The bill, if one has since arrived — dated after the balance sheet. */
  readonly vendorBillNumber?: string | undefined;
  readonly billDate?: string | undefined;
  readonly daysOutstanding: number;
}

/** Invoiced before period end, received after it. */
export interface InvoicedNotReceivedRowOut {
  readonly purchaseOrderNumber: string;
  readonly vendor: string;
  readonly vendorBillNumber: string;
  readonly billDate: string;
  readonly quantity: number;
  readonly billedCents?: number | undefined;
  /** When the receipt was actually recorded — after period end, by definition. */
  readonly recordedReceiptDate?: string | undefined;
  readonly itemReceiptNumber?: string | undefined;
  readonly closeMatchStatus: RuleResult;
  readonly relatedExceptionId?: string | undefined;
  readonly relatedExceptionOpen?: boolean | undefined;
}

export interface GoodsInTransitOut {
  readonly glAccount: string;
  /** Every unit in the GIT classification — both directions. */
  readonly accountUnits: number;
  readonly accountCents: number;
  readonly inboundUnits: number;
  readonly inboundCents: number;
  /** Outbound transit shares account 1210 and is a commercial-chain question. */
  readonly outboundUnits: number;
  readonly outboundCents: number;
  /** Unit count and value carried by the invoiced-not-received orders. */
  readonly documentUnits: number;
  readonly documentCents?: number | undefined;
  /**
   * Whether the document side and the book side describe the same inbound
   * population. False is a finding a reader must see, not a rounding note.
   *
   * **Null when the viewer's scope withheld an order** (Stage G). The
   * document side is scope-filtered and the book side is not, so for a role
   * that cannot see every purchase order the two are not comparable — and
   * the comparison then produced `false` for every auditor, which the screen
   * printed as "The documents and the book do not agree… must be resolved
   * before either figure is relied on". A role-scoped omission was being
   * reported as an unexplained control difference, on the one screen whose
   * job is to say the two sides are one population.
   *
   * This is D8's rule about `positionMoved` applied to a second comparison: a
   * comparison that could not be made is not a negative result.
   */
  readonly inboundAgrees: boolean | null;
}

export interface PriceVarianceRowOut {
  readonly purchaseOrderNumber: string;
  readonly vendor: string;
  readonly vendorBillNumber: string;
  readonly billDate: string;
  readonly sku: string;
  readonly quantity: number;
  /** The standard cost the unit is carried at, from the SKU master. */
  readonly standardUnitCents?: number | undefined;
  readonly orderedUnitCents: number;
  readonly billedUnitCents: number;
  /** Billed less ordered, extended. Positive is unfavorable. */
  readonly varianceCents: number;
  readonly direction: "UNFAVORABLE" | "FAVORABLE";
}

export interface PriceVarianceOut {
  readonly rows: readonly PriceVarianceRowOut[];
  readonly unfavorableCents: number;
  readonly favorableCents: number;
  readonly netCents: number;
  /** Orders compared — the denominator behind "3 of 84 varied". */
  readonly ordersCompared: number;
}

export interface ProcurementPopulationsOut {
  readonly asOf: string;
  readonly summary: ProcurementMatchSummaryOut;
  readonly orders: readonly ProcurementOrderOut[];
  readonly grni: readonly GrniRowOut[];
  readonly grniCents?: number | undefined;
  readonly grniUnits: number;
  readonly invoicedNotReceived: readonly InvoicedNotReceivedRowOut[];
  readonly invoicedNotReceivedCents?: number | undefined;
  readonly goodsInTransit: GoodsInTransitOut;
  readonly priceVariance: PriceVarianceOut;
  /**
   * Documents the viewer's scope withheld. Never silently zero: an auditor
   * looking at a shorter population must be told it is shorter.
   */
  readonly withheldOrderCount: number;
}

/** Sum of line amounts, or undefined when any line has no amount. */
function documentTotalCents(
  lines: readonly { amountCents?: number | undefined }[] | undefined,
): number | undefined {
  if (lines === undefined) return undefined;
  let total = 0;
  for (const line of lines) {
    if (line.amountCents === undefined) return undefined;
    total += line.amountCents;
  }
  return total;
}

function quantityOf(lines: readonly { quantity: number }[] | undefined): number {
  return (lines ?? []).reduce((n, l) => n + l.quantity, 0);
}

/** Whole days between two ISO dates, on the UTC calendar. */
function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export function getProcurementPopulations(
  ws: Workspace,
  ctx: ServiceContext,
): ProcurementPopulationsOut {
  authorize(ctx.user, "close.read");
  const inScope = makeRecordScope(ws, ctx.user);
  const asOf = ws.close.reconciliation.asOf;
  const d = ws.dataset;

  const receiptByPo = new Map(d.itemReceipts.map((r) => [r.purchaseOrderNumber, r]));
  const billByPo = new Map(
    d.vendorBills
      .filter((b) => b.purchaseOrderNumber !== undefined)
      .map((b) => [b.purchaseOrderNumber as string, b]),
  );
  const skuStandard = new Map(d.skus.map((s) => [s.code, s.unitCostCents]));

  /** The close's exception on an order, matched on the finding's own subjects. */
  const exceptionFor = (
    ...refs: (string | undefined)[]
  ): { id: string; open: boolean } | undefined => {
    const found = ws.close.exceptions.find((e) =>
      refs.some(
        (ref) =>
          ref !== undefined &&
          (e.finding.subjects.transactionNumbers?.includes(ref) ?? false),
      ),
    );
    if (found === undefined) return undefined;
    return {
      id: found.id,
      open:
        found.status !== "RESOLVED_NO_ADJUSTMENT" &&
        found.status !== "RESOLVED_ADJUSTMENT_PROPOSED",
    };
  };

  const orders: ProcurementOrderOut[] = [];
  const grni: GrniRowOut[] = [];
  const invoicedNotReceived: InvoicedNotReceivedRowOut[] = [];
  const priceVarianceRows: PriceVarianceRowOut[] = [];
  let withheldOrderCount = 0;
  let ordersCompared = 0;

  for (const match of ws.close.procurementMatches) {
    const po = d.purchaseOrders.find(
      (p) => p.transactionNumber === match.purchaseOrderNumber,
    );
    // The match status is a close-control fact and stays visible; the source
    // documents behind it obey the same scoping the record projections use.
    if (po === undefined || !inScope(po.sourceRef)) {
      withheldOrderCount += 1;
      continue;
    }
    const receipt = receiptByPo.get(po.transactionNumber);
    const bill = billByPo.get(po.transactionNumber);
    const receiptVisible = receipt !== undefined && inScope(receipt.sourceRef);
    const billVisible = bill !== undefined && inScope(bill.sourceRef);
    const receivedInPeriod = receiptVisible && receipt.receiptDate <= asOf;
    const billedInPeriod = billVisible && bill.billDate <= asOf;

    const position: PeriodEndPosition = receivedInPeriod
      ? billedInPeriod
        ? "MATCHED_IN_PERIOD"
        : "RECEIVED_NOT_INVOICED"
      : billedInPeriod
        ? "INVOICED_NOT_RECEIVED"
        : "NEITHER_IN_PERIOD";

    const exception = exceptionFor(
      po.transactionNumber,
      receiptVisible ? receipt.transactionNumber : undefined,
      billVisible ? bill.transactionNumber : undefined,
    );

    orders.push({
      purchaseOrderNumber: po.transactionNumber,
      vendor: po.vendor,
      orderDate: po.orderDate,
      ...(receiptVisible
        ? { itemReceiptNumber: receipt.transactionNumber, receiptDate: receipt.receiptDate }
        : {}),
      ...(billVisible
        ? { vendorBillNumber: bill.transactionNumber, billDate: bill.billDate }
        : {}),
      nativeNetsuiteMatchStatus: match.nativeNetsuiteMatchStatus,
      closeMatchStatus: match.closeMatchStatus,
      quantity: quantityOf(po.lines),
      orderedCents: documentTotalCents(po.lines),
      ...(billVisible ? { billedCents: documentTotalCents(bill.lines) } : {}),
      position,
      ...(exception !== undefined
        ? { relatedExceptionId: exception.id, relatedExceptionOpen: exception.open }
        : {}),
    });

    if (position === "RECEIVED_NOT_INVOICED" && receiptVisible) {
      grni.push({
        purchaseOrderNumber: po.transactionNumber,
        vendor: po.vendor,
        itemReceiptNumber: receipt.transactionNumber,
        receiptDate: receipt.receiptDate,
        quantity: quantityOf(receipt.lines),
        receivedCents: documentTotalCents(receipt.lines),
        ...(billVisible
          ? { vendorBillNumber: bill.transactionNumber, billDate: bill.billDate }
          : {}),
        daysOutstanding: daysBetween(receipt.receiptDate, asOf),
      });
    }

    if (position === "INVOICED_NOT_RECEIVED" && billVisible) {
      invoicedNotReceived.push({
        purchaseOrderNumber: po.transactionNumber,
        vendor: po.vendor,
        vendorBillNumber: bill.transactionNumber,
        billDate: bill.billDate,
        quantity: quantityOf(po.lines),
        billedCents: documentTotalCents(bill.lines),
        ...(receiptVisible
          ? {
              recordedReceiptDate: receipt.receiptDate,
              itemReceiptNumber: receipt.transactionNumber,
            }
          : {}),
        closeMatchStatus: match.closeMatchStatus,
        ...(exception !== undefined
          ? { relatedExceptionId: exception.id, relatedExceptionOpen: exception.open }
          : {}),
      });
    }

    // Price variance: the same order line, ordered against billed. Compared
    // only where both documents are visible and both carry an amount — a
    // variance computed against a missing figure is not a variance.
    if (!billVisible) continue;
    ordersCompared += 1;
    for (const orderLine of po.lines) {
      const billLine = bill.lines.find((l) => l.lineId === orderLine.lineId);
      if (billLine === undefined) continue;
      if (orderLine.amountCents === undefined || billLine.amountCents === undefined) continue;
      if (orderLine.quantity !== billLine.quantity) continue; // a quantity difference, not a price one
      if (orderLine.amountCents === billLine.amountCents) continue;
      const orderedUnitCents = orderLine.amountCents / orderLine.quantity;
      const billedUnitCents = billLine.amountCents / billLine.quantity;
      const varianceCents = billLine.amountCents - orderLine.amountCents;
      priceVarianceRows.push({
        purchaseOrderNumber: po.transactionNumber,
        vendor: po.vendor,
        vendorBillNumber: bill.transactionNumber,
        billDate: bill.billDate,
        sku: orderLine.sku,
        quantity: orderLine.quantity,
        standardUnitCents: skuStandard.get(orderLine.sku),
        orderedUnitCents,
        billedUnitCents,
        varianceCents,
        direction: varianceCents > 0 ? "UNFAVORABLE" : "FAVORABLE",
      });
    }
  }

  const byPo = (a: { purchaseOrderNumber: string }, b: { purchaseOrderNumber: string }) =>
    a.purchaseOrderNumber < b.purchaseOrderNumber ? -1 : 1;
  orders.sort(byPo);
  grni.sort(byPo);
  invoicedNotReceived.sort(byPo);
  priceVarianceRows.sort(byPo);

  // Goods in transit, both sides. The book side reads the unit population;
  // the document side reads the orders above.
  const gitUnits = d.inventoryUnits.filter((u) => u.classification === "GIT");
  const inbound = gitUnits.filter((u) => u.location === "INBOUND_TRANSIT");
  const outbound = gitUnits.filter((u) => u.location !== "INBOUND_TRANSIT");
  const cents = (units: readonly { unitCostCents: number }[]) =>
    units.reduce((sum, u) => sum + u.unitCostCents, 0);
  const documentUnits = invoicedNotReceived.reduce((n, r) => n + r.quantity, 0);
  const documentCents = invoicedNotReceived.every((r) => r.billedCents !== undefined)
    ? invoicedNotReceived.reduce((sum, r) => sum + (r.billedCents ?? 0), 0)
    : undefined;
  const inboundCents = cents(inbound);

  const total = (rows: readonly { receivedCents?: number | undefined }[]) =>
    rows.every((r) => r.receivedCents !== undefined)
      ? rows.reduce((sum, r) => sum + (r.receivedCents ?? 0), 0)
      : undefined;

  return {
    asOf,
    summary: {
      orders: orders.length,
      nativePass: orders.filter((o) => o.nativeNetsuiteMatchStatus === "PASS").length,
      nativeReviewRequired: orders.filter(
        (o) => o.nativeNetsuiteMatchStatus === "REVIEW_REQUIRED",
      ).length,
      nativeIncomplete: orders.filter((o) => o.nativeNetsuiteMatchStatus === "INCOMPLETE")
        .length,
      closePass: orders.filter((o) => o.closeMatchStatus === "PASS").length,
      closeReviewRequired: orders.filter((o) => o.closeMatchStatus !== "PASS").length,
      divergent: orders.filter(
        (o) => o.nativeNetsuiteMatchStatus !== o.closeMatchStatus,
      ).length,
    },
    orders,
    grni,
    grniCents: total(grni),
    grniUnits: grni.reduce((n, r) => n + r.quantity, 0),
    invoicedNotReceived,
    invoicedNotReceivedCents: documentCents,
    goodsInTransit: {
      glAccount: "1210",
      accountUnits: gitUnits.length,
      accountCents: cents(gitUnits),
      inboundUnits: inbound.length,
      inboundCents,
      outboundUnits: outbound.length,
      outboundCents: cents(outbound),
      documentUnits,
      documentCents,
      // Not comparable while the document side is shorter than the orders
      // that exist: see the field's note.
      inboundAgrees:
        withheldOrderCount > 0
          ? null
          : documentUnits === inbound.length && documentCents === inboundCents,
    },
    priceVariance: {
      rows: priceVarianceRows,
      unfavorableCents: priceVarianceRows
        .filter((r) => r.direction === "UNFAVORABLE")
        .reduce((sum, r) => sum + r.varianceCents, 0),
      favorableCents: priceVarianceRows
        .filter((r) => r.direction === "FAVORABLE")
        .reduce((sum, r) => sum + r.varianceCents, 0),
      netCents: priceVarianceRows.reduce((sum, r) => sum + r.varianceCents, 0),
      ordersCompared,
    },
    withheldOrderCount,
  };
}
