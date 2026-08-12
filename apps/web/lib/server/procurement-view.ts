import type { DemoUser } from "@icg/data";
import { getProcurementPopulations } from "@icg/services";
import type {
  ExceptionView,
  ProcurementDetail,
  ProcurementOrderOut,
} from "@icg/services";
import { formatCents, formatDate, formatDateShort } from "../format";
import type {
  ExceptionDrawerData,
  GrniRowView,
  InvoicedNotReceivedRowView,
  PriceVarianceRowView,
  ProcurementCard,
  ProcurementData,
  ProcurementLeg,
  ProcurementOrderRowView,
  TabDef,
} from "../view-model";
import { statusView } from "../workflow-view";
import { attempt } from "./data";
import { assembleDrawer, gatherExceptionContext } from "./exception-view";
import { getQueries, getWorkspace, makeContext, roleLabel } from "./workspace";

/**
 * Procurement (COMPLETION_PLAN Stage C) — the buy side of the close, in one
 * place: three-way match, received-not-invoiced, invoiced-not-received,
 * inbound goods in transit, and purchase price variance.
 *
 * The three-way match moved here from the Reconciliation screen rather than
 * being rebuilt. It was always a procurement control; hosting it under
 * "Reconciliation" made a reader look for the other four populations on a
 * screen that had never heard of them.
 *
 * This module formats and labels. Every figure — including every total —
 * arrives already summed from `getProcurementPopulations`, because a total
 * computed in the web layer is a number no service derived.
 */

/** Document totals are already summed in services; absent renders as absent. */
const money = (cents: number | undefined): string | null =>
  cents === undefined ? null : formatCents(cents);

/**
 * The close-control capsule. "No close exception" is a negative claim, so it
 * may only be made when no exception references the match at all — a match
 * whose exception is RESOLVED still has one, and it may carry an unposted
 * proposed adjustment that the reader must be able to reach.
 */
function closeCapsule(
  status: string,
  view?: ExceptionView | undefined,
): { label: string; glyph: string; variant: "frost" | "aurora" } {
  if (view !== undefined) {
    return view.open
      ? { label: statusView(view.exception.status).label, glyph: "◆", variant: "frost" }
      : { label: statusView(view.exception.status).label, glyph: "✓", variant: "aurora" };
  }
  return status === "PASS"
    ? { label: "No close exception", glyph: "✓", variant: "aurora" }
    : { label: "Review required", glyph: "◆", variant: "frost" };
}

/** How an order stood at the balance-sheet date, in a reader's words. */
const POSITION_LABELS: Readonly<Record<ProcurementOrderOut["position"], string>> = {
  MATCHED_IN_PERIOD: "Matched in period",
  RECEIVED_NOT_INVOICED: "Received, not invoiced",
  INVOICED_NOT_RECEIVED: "Invoiced, not received",
  NEITHER_IN_PERIOD: "Neither leg in period",
};

export function buildProcurementData(
  user: DemoUser,
  correlationId: string,
): ProcurementData {
  const queries = getQueries();
  const ctx = makeContext(user, correlationId);
  const role = roleLabel(user);

  const populations = attempt(() => getProcurementPopulations(getWorkspace(), ctx));
  if (populations === undefined) {
    return {
      restricted: true,
      roleLabel: role,
      headerNote: null,
      asOf: "",
      tabs: [],
      match: null,
      grni: null,
      inr: null,
      git: null,
      ppv: null,
      withheldNote: null,
      drawers: {},
    };
  }

  const exceptions = attempt(() => queries.listExceptions(ctx)) ?? [];
  const blockers = attempt(() => queries.getBlockers(ctx)) ?? [];
  const blockerIds = new Set(blockers.map((b) => b.exceptionId));
  const periodEnd = populations.asOf;

  const drawers: Record<string, ExceptionDrawerData> = {};
  const drawerFor = (view: ExceptionView | undefined): string | null => {
    if (view === undefined) return null;
    const id = view.exception.id;
    if (drawers[id] === undefined) {
      drawers[id] = assembleDrawer(
        gatherExceptionContext(queries, ctx, view),
        blockerIds.has(id),
      );
    }
    return id;
  };
  const viewFor = (id: string | undefined): ExceptionView | undefined =>
    id === undefined ? undefined : exceptions.find((e) => e.exception.id === id);

  /* ---------------- Three-way match ---------------- */

  const details = new Map<string, ProcurementDetail>();
  const detailFor = (po: string): ProcurementDetail => {
    let d = details.get(po);
    if (d === undefined) {
      d = attempt(() => queries.getProcurementDetail(ctx, po)) ?? { totals: {} };
      details.set(po, d);
    }
    return d;
  };

  const poLeg = (d: ProcurementDetail): ProcurementLeg => {
    const po = d.purchaseOrder;
    if (po === undefined) {
      return { label: "PURCHASE ORDER", glyph: "○", value: "No record", note: "", missing: true };
    }
    const amount = money(d.totals.purchaseOrderCents);
    const qty = d.totals.purchaseOrderQuantity;
    const skus = [...new Set(po.lines.map((l) => l.sku))].join(", ");
    return {
      label: "PURCHASE ORDER",
      glyph: "✓",
      value: `${po.transactionNumber} · ${formatDateShort(po.orderDate)}`,
      note: `${po.vendor}${qty !== undefined ? ` · ${qty} × ${skus}` : ""}${amount !== null ? ` · ${amount}` : ""}`,
      missing: false,
    };
  };
  const irLeg = (d: ProcurementDetail): ProcurementLeg => {
    const ir = d.itemReceipt;
    if (ir === undefined) {
      return {
        label: "ITEM RECEIPT",
        glyph: "○",
        value: "No record",
        note: "No item receipt references this order",
        missing: true,
      };
    }
    const inPeriod = ir.receiptDate <= periodEnd;
    return inPeriod
      ? {
          label: "ITEM RECEIPT",
          glyph: "✓",
          value: `${ir.transactionNumber} · ${formatDateShort(ir.receiptDate)}`,
          note: "Received and recorded in period",
          missing: false,
        }
      : {
          label: "ITEM RECEIPT",
          glyph: "○",
          value: `Absent at ${formatDateShort(periodEnd)}`,
          note: `Recorded ${formatDate(ir.receiptDate)}`,
          missing: true,
        };
  };
  /** Total price variance on an order, or zero — keyed on the PO number. */
  const varianceByPo = new Map<string, number>();
  for (const row of populations.priceVariance.rows) {
    varianceByPo.set(
      row.purchaseOrderNumber,
      (varianceByPo.get(row.purchaseOrderNumber) ?? 0) + row.varianceCents,
    );
  }

  const vbLeg = (d: ProcurementDetail, poNumber: string): ProcurementLeg => {
    const vb = d.vendorBill;
    if (vb === undefined) {
      return {
        label: "VENDOR BILL",
        glyph: "○",
        value: "No record",
        note: "No vendor bill references this order",
        missing: true,
      };
    }
    const amount = money(d.totals.vendorBillCents);
    const inPeriod = vb.billDate <= periodEnd;
    // A card that shows an ordered amount and a billed amount must say why
    // they differ. Without this the leg reads as a mismatch nobody explained
    // — or worse, sits under a footnote calling the cycle matched.
    const variance = varianceByPo.get(poNumber) ?? 0;
    const varianceNote =
      variance === 0
        ? ""
        : ` · ${formatCents(Math.abs(variance))} ${variance > 0 ? "above" : "below"} the price ordered`;
    return {
      label: "VENDOR BILL",
      glyph: inPeriod ? "✓" : "○",
      value: `${vb.transactionNumber} · ${formatDateShort(vb.billDate)}`,
      note: inPeriod
        ? `Received and recorded${amount !== null ? ` · ${amount}` : ""}${varianceNote}`
        : `Recorded after period end${amount !== null ? ` · ${amount}` : ""}${varianceNote}`,
      missing: !inPeriod,
    };
  };

  const buildCard = (
    order: ProcurementOrderOut,
    title: string,
    tone: "ember" | "clean" | "resolved",
  ): ProcurementCard => {
    const d = detailFor(order.purchaseOrderNumber);
    const view = viewFor(order.relatedExceptionId);
    const po = d.purchaseOrder;
    const qty = d.totals.purchaseOrderQuantity;
    const skus = po !== undefined ? [...new Set(po.lines.map((l) => l.sku))].join(", ") : "";
    const amount = money(d.totals.purchaseOrderCents);
    const f = view?.exception.finding;
    return {
      key: order.purchaseOrderNumber,
      po: order.purchaseOrderNumber,
      title,
      qtyAmount:
        qty !== undefined ? `${qty} × ${skus}${amount !== null ? ` · ${amount}` : ""}` : null,
      nsTag: `NS 3WM · ${order.nativeNetsuiteMatchStatus}`,
      close: closeCapsule(order.closeMatchStatus, view),
      ember: tone === "ember",
      legs: [poLeg(d), irLeg(d), vbLeg(d, order.purchaseOrderNumber)],
      footnote:
        view !== undefined
          ? {
              glyph: view.open ? "✕" : "✓",
              tone: view.open ? "ember" : "aurora",
              text: `${f?.whyFlagged ?? ""} ${view.exception.id} · ${f !== undefined ? formatCents(f.exposureCents) : ""} · ${statusView(view.exception.status).label}.`,
            }
          : {
              glyph: "✓",
              tone: "aurora",
              text: "All three legs present and matched before year-end, and no cutoff or ownership question arises. Native match and close control agree here — the normal case, and the reason the two are still reported separately.",
            },
      exceptionId: drawerFor(view),
    };
  };

  // Featured cards, all derived from service state: every close-open order,
  // the resolved-historical timing example, and the largest clean cycle.
  const featured: ProcurementCard[] = [];
  for (const order of populations.orders) {
    if (order.closeMatchStatus === "PASS") continue;
    const view = viewFor(order.relatedExceptionId);
    featured.push(
      buildCard(order, view?.exception.finding.title ?? "Open close question", "ember"),
    );
  }
  const resolvedHistorical = populations.orders.find(
    (o) =>
      o.closeMatchStatus === "PASS" &&
      o.relatedExceptionId !== undefined &&
      o.relatedExceptionOpen === false,
  );
  if (resolvedHistorical !== undefined) {
    const view = viewFor(resolvedHistorical.relatedExceptionId);
    featured.push(
      buildCard(
        resolvedHistorical,
        view?.exception.finding.title ?? "Resolved historical question",
        "resolved",
      ),
    );
  }
  const clean = populations.orders
    .filter(
      (o) =>
        o.nativeNetsuiteMatchStatus === "PASS" &&
        o.closeMatchStatus === "PASS" &&
        o.relatedExceptionId === undefined &&
        // A cycle billed at a price other than the one ordered is not the
        // clean example, whatever its match statuses say. The variance has a
        // tab of its own; this card is for the case with nothing to explain.
        (varianceByPo.get(o.purchaseOrderNumber) ?? 0) === 0,
    )
    .sort((a, b) =>
      (b.orderedCents ?? 0) !== (a.orderedCents ?? 0)
        ? (b.orderedCents ?? 0) - (a.orderedCents ?? 0)
        : a.purchaseOrderNumber < b.purchaseOrderNumber
          ? -1
          : 1,
    )[0];
  if (clean !== undefined) {
    featured.push(buildCard(clean, "Clean procurement cycle", "clean"));
  }

  const rows: ProcurementOrderRowView[] = populations.orders.map((o) => ({
    po: o.purchaseOrderNumber,
    vendor: o.vendor,
    ir: o.itemReceiptNumber ?? "—",
    vb: o.vendorBillNumber ?? "—",
    native: `NS 3WM · ${o.nativeNetsuiteMatchStatus}`,
    close: closeCapsule(o.closeMatchStatus, viewFor(o.relatedExceptionId)),
    position: POSITION_LABELS[o.position],
    exceptionId: drawerFor(viewFor(o.relatedExceptionId)),
  }));

  const s = populations.summary;

  /* ---------------- Received not invoiced ---------------- */

  const grniRows: GrniRowView[] = populations.grni.map((r) => ({
    po: r.purchaseOrderNumber,
    vendor: r.vendor,
    receipt: r.itemReceiptNumber,
    receiptDate: formatDateShort(r.receiptDate),
    quantity: String(r.quantity),
    value: money(r.receivedCents),
    billed:
      r.vendorBillNumber === undefined || r.billDate === undefined
        ? null
        : `${r.vendorBillNumber} · ${formatDateShort(r.billDate)}`,
    age: `${r.daysOutstanding} ${r.daysOutstanding === 1 ? "day" : "days"}`,
  }));

  /* ---------------- Invoiced not received ---------------- */

  const inrRows: InvoicedNotReceivedRowView[] = populations.invoicedNotReceived.map((r) => {
    const view = viewFor(r.relatedExceptionId);
    return {
      po: r.purchaseOrderNumber,
      vendor: r.vendor,
      bill: r.vendorBillNumber,
      billDate: formatDateShort(r.billDate),
      quantity: String(r.quantity),
      value: money(r.billedCents),
      received:
        r.recordedReceiptDate === undefined
          ? "Not yet recorded"
          : `${r.itemReceiptNumber ?? "—"} · ${formatDateShort(r.recordedReceiptDate)}`,
      close: closeCapsule(r.closeMatchStatus, view),
      exceptionId: drawerFor(view),
    };
  });

  /* ---------------- Goods in transit ---------------- */

  const git = populations.goodsInTransit;
  const gitAgrees = git.inboundAgrees;

  /* ---------------- Price variance ---------------- */

  const ppvRows: PriceVarianceRowView[] = populations.priceVariance.rows.map((r) => ({
    key: `${r.purchaseOrderNumber}-${r.sku}`,
    po: r.purchaseOrderNumber,
    vendor: r.vendor,
    bill: `${r.vendorBillNumber} · ${formatDateShort(r.billDate)}`,
    sku: r.sku,
    quantity: String(r.quantity),
    ordered: formatCents(r.orderedUnitCents),
    billed: formatCents(r.billedUnitCents),
    variance: formatCents(Math.abs(r.varianceCents)),
    direction: r.direction === "UNFAVORABLE" ? "Unfavorable" : "Favorable",
    unfavorable: r.direction === "UNFAVORABLE",
  }));
  const ppv = populations.priceVariance;

  const tabs: TabDef[] = [
    { key: "match", label: "Three-Way Match", count: String(s.orders) },
    { key: "grni", label: "Received Not Invoiced", count: String(populations.grni.length) },
    {
      key: "inr",
      label: "Invoiced Not Received",
      count: String(populations.invoicedNotReceived.length),
    },
    { key: "git", label: "Goods in Transit", count: String(git.inboundUnits) },
    { key: "ppv", label: "Price Variance", count: String(ppv.rows.length) },
  ];

  return {
    restricted: false,
    roleLabel: role,
    headerNote: null,
    asOf: formatDate(periodEnd),
    tabs,
    match: {
      nativeSummary: `${s.nativePass} / ${s.orders}`,
      closeSummary: `${s.closeReviewRequired} open`,
      divergentNote:
        s.divergent === 0
          ? "No order's native status and close-control status differ in this population."
          : `${s.divergent} of ${s.orders} orders carry a native status and a close-control status that differ. That separation is the control: a bill can be payable and the ownership question still open.`,
      featured,
      rows,
    },
    grni: {
      stats: [
        { label: "ORDERS", value: String(populations.grni.length), note: "received before year-end, not yet invoiced", ember: false },
        { label: "UNITS RECEIVED", value: String(populations.grniUnits), note: "already in the inventory subledger", ember: false },
        {
          label: "ACCRUAL POPULATION",
          value: money(populations.grniCents) ?? "Not stated",
          note: "value received without a vendor bill at Dec. 31",
          ember: false,
        },
      ],
      rows: grniRows,
      note: "These units were received before the balance-sheet date, so they are already in the 1,500-unit book population and in the inventory accounts. What is missing is the other side: the vendor's invoice. The accrual sits in accounts payable, not in inventory, which is why this population does not appear in the inventory-to-GL reconciliation.",
    },
    inr: {
      stats: [
        { label: "ORDERS", value: String(populations.invoicedNotReceived.length), note: "billed before year-end, received after it", ember: false },
        { label: "UNITS", value: String(git.documentUnits), note: "carried as inbound goods in transit", ember: false },
        {
          label: "VALUE BILLED",
          value: money(populations.invoicedNotReceivedCents) ?? "Not stated",
          note: "per the vendor bills dated on or before Dec. 31",
          ember: false,
        },
      ],
      rows: inrRows,
      note: "A vendor bill dated in the period is not by itself proof that title passed. Where the shipping terms are unresolved, the close control holds the order open even though the native three-way match has nothing to say about it — that is the EXC-002 case below, and it is a blocker.",
    },
    git: {
      stats: [
        { label: "INBOUND IN TRANSIT", value: `${git.inboundUnits} units`, note: money(git.inboundCents), ember: false },
        { label: "OUTBOUND IN TRANSIT", value: `${git.outboundUnits} units`, note: money(git.outboundCents), ember: false },
        { label: `ACCOUNT ${git.glAccount}`, value: `${git.accountUnits} units`, note: money(git.accountCents), ember: false },
      ],
      agreement: {
        agrees: gitAgrees,
        headline:
          gitAgrees === null
            ? "The two sides cannot be compared at your access scope."
            : gitAgrees
              ? "The documents and the book agree."
              : "The documents and the book do not agree.",
        // A withheld order shortens the document side and not the book side,
        // so for a scoped reader the comparison was never between the same
        // two populations. Printing its result as a finding told every
        // auditor a control figure was unexplained when the only thing
        // missing was an order their role may not see.
        detail:
          gitAgrees === null
            ? `${populations.withheldOrderCount} ${populations.withheldOrderCount === 1 ? "order is" : "orders are"} outside your role's scope, so the document side here is shorter than the orders that exist while the book side is not. The difference between ${git.documentUnits} document units and ${git.inboundUnits} book units is your scope, not a finding — and no comparison of the two sides is offered on this run.`
            : gitAgrees
              ? `The ${populations.invoicedNotReceived.length} orders billed but not received at Dec. 31 carry ${git.documentUnits} units at ${money(git.documentCents) ?? "an unstated value"}. The book shows ${git.inboundUnits} units classified as goods in transit in the inbound location, at ${money(git.inboundCents) ?? "an unstated value"}. Same population, two sides — so these are one figure, never two to add together.`
              : `The orders billed but not received carry ${git.documentUnits} units; the book shows ${git.inboundUnits} units inbound. The difference is unexplained on this screen and must be resolved before either figure is relied on.`,
      },
      accountNote: `Account ${git.glAccount} holds goods in transit in both directions: ${git.inboundUnits} units inbound (${money(git.inboundCents) ?? "—"}) and ${git.outboundUnits} outbound (${money(git.outboundCents) ?? "—"}), ${money(git.accountCents) ?? "—"} in total. Only the inbound half is a procurement question; the outbound half belongs to the commercial chain, and both are shown here so this screen and the GL-account view cannot disagree about what 1210 contains.`,
    },
    ppv: {
      stats: [
        {
          label: "UNFAVORABLE",
          value: formatCents(ppv.unfavorableCents),
          note: "billed above the price ordered",
          ember: ppv.unfavorableCents > 0,
        },
        {
          label: "FAVORABLE",
          value: formatCents(Math.abs(ppv.favorableCents)),
          note: "billed below the price ordered",
          ember: false,
        },
        {
          label: "NET VARIANCE",
          value: formatCents(Math.abs(ppv.netCents)),
          note: ppv.netCents >= 0 ? "net unfavorable" : "net favorable",
          ember: false,
        },
        {
          label: "ORDERS VARYING",
          value: `${new Set(ppv.rows.map((r) => r.purchaseOrderNumber)).size} / ${ppv.ordersCompared}`,
          note: "orders where a billed price differed from the ordered price",
          ember: false,
        },
      ],
      rows: ppvRows,
      treatment:
        "Inventory is carried at standard cost, so a price variance is expensed in the period rather than capitalized. That is why no figure on this tab appears in the inventory subledger, in the inventory accounts, or in the inventory-to-GL reconciliation.",
      note: "A price difference is not a quantity difference: the native three-way match still passes on every order in this table, and no exception is raised. These are reported as an attribute of the match so a reviewer can see them, not as a control failure.",
    },
    withheldNote:
      populations.withheldOrderCount === 0
        ? null
        : // A hard-coded plural, invisible until a role withheld exactly one:
          // the auditor is that role, and the note read "1 orders" on every
          // run. Same shape as the reset report's "1 comments" in Stage F.
          `${populations.withheldOrderCount} ${populations.withheldOrderCount === 1 ? "order is" : "orders are"} outside your role's scope in this demo and ${populations.withheldOrderCount === 1 ? "is" : "are"} not counted in the figures above.`,
    drawers,
  };
}
