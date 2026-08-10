import type { DemoUser } from "@icg/data";
import type {
  CarrierShipmentFixture,
  CountResultFixture,
  SourceRecordRef,
  TransactionLineFixture,
} from "@icg/domain";
import type {
  ExceptionView,
  FinancialLifeView,
  QueryService,
  ServiceContext,
} from "@icg/services";
import {
  formatCents,
  formatDate,
  formatDateShort,
  formatInstant,
  shortHash,
} from "../format";
import type {
  EvidenceRecordView,
  FinancialLifeData,
  InventorySearchData,
  LifeCycleRow,
  LifeEventCard,
  LifePhase,
} from "../view-model";
import {
  conclusionLabel,
  nextActionText,
  riskView,
  statusView,
} from "../workflow-view";
import { attempt } from "./data";
import {
  assembleEvidenceRecord,
  carrierPhrase,
  gatherExceptionContext,
} from "./exception-view";
import { kindLabel, locationLabel, sourceLabel, titleCase } from "./humanize";
import { getQueries, makeContext, roleLabel } from "./workspace";

/**
 * Financial Life of the Unit (stage 06, design 04). One serial, four
 * phases, five relationship types. Every card is a projection of a record
 * @icg/services returned — dates, amounts, and states pass through
 * unchanged, and a step with no record renders as an absence.
 */

const CONFLICT_REASON = "SHIPPED_NOT_RELIEVED";

interface Ctx {
  readonly queries: QueryService;
  readonly ctx: ServiceContext;
}

function lineQty(lines: readonly TransactionLineFixture[], sku: string | undefined): number {
  return lines
    .filter((l) => sku === undefined || l.sku === sku)
    .reduce((n, l) => n + l.quantity, 0);
}

/**
 * Document totals arrive from `getFinancialLife().recordTotals` — this layer
 * formats money, it never adds it up. An absent total renders as absent.
 */
const money = (cents: number | undefined): string | null =>
  cents === undefined ? null : formatCents(cents);

/**
 * What the year-end count actually found for one serial, stated from every
 * row rather than the first. A count that failed to locate a unit IS physical
 * evidence — it must never render as "no evidence", and one clean row does
 * not make a clean count when a second row disagrees.
 */
export function countOutcome(
  rows: readonly CountResultFixture[],
): string | undefined {
  if (rows.length === 0) return undefined;
  const short = rows.filter((r) => r.variance < 0);
  const over = rows.filter((r) => r.variance > 0);
  if (short.length > 0 && over.length > 0) return "Counted in two locations";
  if (short.length > 0) return "Not found in the year-end count";
  if (over.length > 0) return "Found where the book does not carry it";
  return undefined;
}

/** The per-row detail behind {@link countOutcome}, naming locations and bins. */
export function countOutcomeDetail(rows: readonly CountResultFixture[]): string {
  return rows
    .map((r) => {
      const where = `${locationLabel(r.location)}${r.bin !== undefined ? ` · ${r.bin}` : ""}`;
      return `${where}: book ${r.snapshotQuantity}, counted ${r.countQuantity}`;
    })
    .join(" — ");
}

/** The carrier event that represents where a shipment stands (fixture shape). */
export function shipmentPosition(
  shipment: CarrierShipmentFixture,
): { type: string; at: string; location?: string | undefined } | undefined {
  const delivered = shipment.events.find((e) => e.eventType === "DELIVERED");
  if (delivered !== undefined) {
    return {
      type: "DELIVERED",
      at: delivered.occurredAt,
      location: delivered.location,
    };
  }
  return [...shipment.events]
    .sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : 1))
    .map((e) => ({ type: e.eventType, at: e.occurredAt, location: e.location }))
    .pop();
}

/**
 * A source-record drawer payload synthesized from a dataset fixture the
 * services returned. Same shape as the evidence-record drawer so every chip
 * and card opens the one record destination (§4).
 */
function sourceRecord(opts: {
  id: string;
  kind: string;
  title: string;
  state: string;
  stateGlyph: string;
  stateVariant: EvidenceRecordView["stateVariant"];
  sourceRef: SourceRecordRef | undefined;
  occurred: string | undefined;
  rows: readonly { k: string; v: string; mono?: boolean; missing?: boolean }[];
  related: readonly string[];
  datasetVersion: string;
  viewerRole: string;
}): EvidenceRecordView {
  const retrieved = opts.sourceRef?.retrievedAt;
  return {
    id: opts.id,
    title: opts.title,
    kind: opts.kind,
    kindLabel: kindLabel(opts.kind),
    state: opts.state,
    stateGlyph: opts.stateGlyph,
    stateVariant: opts.stateVariant,
    source:
      opts.sourceRef !== undefined ? sourceLabel(opts.sourceRef.sourceSystem) : "—",
    contentWithheld: false,
    rows: [
      { k: "Record type", v: kindLabel(opts.kind) },
      opts.occurred !== undefined
        ? {
            k: "Occurred",
            v: opts.occurred.includes("T")
              ? formatInstant(opts.occurred)
              : formatDate(opts.occurred),
          }
        : { k: "Occurred", v: "— no dated event", missing: true },
      retrieved !== undefined
        ? { k: "Retrieved", v: formatInstant(retrieved) }
        : { k: "Retrieved", v: "— not recorded", missing: true },
      ...opts.rows,
      { k: "Normalized", v: "Identity transformation — original preserved", mono: true },
    ],
    related: opts.related,
    audit: [
      { k: "Record ID", v: opts.id },
      { k: "Source ID", v: opts.sourceRef?.internalId ?? "—" },
      { k: "Dataset", v: opts.datasetVersion },
      {
        k: "Source hash",
        v:
          opts.sourceRef !== undefined
            ? `sha256:${shortHash(opts.sourceRef.sourceHash)}`
            : "—",
      },
      { k: "Viewer role", v: opts.viewerRole },
      { k: "History", v: "Append-only" },
    ],
  };
}

interface Assembled {
  readonly phases: LifePhase[];
  readonly records: Record<string, EvidenceRecordView>;
  readonly range: string | null;
}

/** Build the four-phase card grid plus its record drawers. */
function assemblePhases(
  view: FinancialLifeView,
  exceptions: readonly ExceptionView[],
  opts: {
    periodEnd: string | undefined;
    grossSubledger: string | null;
    datasetVersion: string;
    viewerRole: string;
    runId: string | undefined;
    adjustmentNote: string | null;
    adjustmentRefs: readonly string[];
    evidenceRecordIds: ReadonlyMap<string, string>;
  },
): Assembled {
  const records: Record<string, EvidenceRecordView> = {};
  const r = view.records;
  const sku = view.unit?.sku;
  const serial = view.serial;
  const common = {
    datasetVersion: opts.datasetVersion,
    viewerRole: opts.viewerRole,
  };
  const related = [serial, ...view.exceptions];

  const put = (rec: EvidenceRecordView): string => {
    records[rec.id] = rec;
    return rec.id;
  };

  const dates: string[] = [];
  // Each card carries the ISO instant it happened, so ranges sort on real
  // dates rather than on the order cards were pushed or the shape of their
  // formatted label. Keys carry the index because two cards can legitimately
  // share a kind and title (a serial counted in two locations).
  let cardSeq = 0;
  const cardDates = new Map<string, string>();
  const card = (c: Omit<LifeEventCard, "key">, at?: string): LifeEventCard => {
    if (at !== undefined) dates.push(at);
    cardSeq += 1;
    const key = `${c.kind}:${c.title}:${cardSeq}`;
    if (at !== undefined) cardDates.set(key, at);
    return { ...c, key };
  };

  // The four phase columns, declared together so a card can be routed to the
  // phase its subject belongs to rather than to whichever list exists yet.
  const buy: LifeEventCard[] = [];
  const inv: LifeEventCard[] = [];
  const sell: LifeEventCard[] = [];
  const close: LifeEventCard[] = [];

  /* ---- Buy side ---- */
  if (view.buySideTracking === "BATCH") {
    buy.push(
      card({
        kind: "PROCUREMENT",
        date: "Batch",
        title: "Batch-tracked stock",
        meta: "Unit ids do not appear on transaction lines — a tracking mode, not missing paper",
        visual: "acc",
        glyph: "●",
        recordId: null,
        href: null,
      }),
    );
  }
  if (r.purchaseOrder) {
    const po = r.purchaseOrder;
    const id = put(
      sourceRecord({
        ...common,
        id: po.transactionNumber,
        kind: "PURCHASE_ORDER",
        title: po.transactionNumber,
        state: "Known",
        stateGlyph: "✓",
        stateVariant: "resolved",
        sourceRef: po.sourceRef,
        occurred: po.orderDate,
        rows: [
          { k: "Vendor", v: po.vendor },
          ...(sku !== undefined
            ? [{ k: `Quantity · ${sku}`, v: String(lineQty(po.lines, sku)) }]
            : []),
        ],
        related,
      }),
    );
    buy.push(
      card(
        {
          kind: "PURCHASE ORDER",
          date: formatDateShort(po.orderDate),
          title: `${po.transactionNumber} issued`,
          meta: `${lineQty(po.lines, sku)} × ${sku ?? "unit"} · ${po.vendor}`,
          visual: "acc",
          glyph: "●",
          recordId: id,
          href: null,
        },
        po.orderDate,
      ),
    );
  }
  if (r.itemReceipt) {
    const ir = r.itemReceipt;
    const id = put(
      sourceRecord({
        ...common,
        id: ir.transactionNumber,
        kind: "ITEM_RECEIPT",
        title: ir.transactionNumber,
        state: "Known",
        stateGlyph: "✓",
        stateVariant: "resolved",
        sourceRef: ir.sourceRef,
        occurred: ir.receiptDate,
        rows: [{ k: "Purchase order", v: ir.purchaseOrderNumber, mono: true }],
        related,
      }),
    );
    buy.push(
      card(
        {
          kind: "ITEM RECEIPT",
          date: formatDateShort(ir.receiptDate),
          title: `${ir.transactionNumber} · serial assigned`,
          meta: `${lineQty(ir.lines, sku)} × ${sku ?? "unit"}`,
          visual: "acc",
          glyph: "●",
          recordId: id,
          href: null,
        },
        ir.receiptDate,
      ),
    );
  }
  if (r.vendorBill) {
    const vb = r.vendorBill;
    const id = put(
      sourceRecord({
        ...common,
        id: vb.transactionNumber,
        kind: "VENDOR_BILL",
        title: vb.transactionNumber,
        state: "Known",
        stateGlyph: "✓",
        stateVariant: "resolved",
        sourceRef: vb.sourceRef,
        occurred: vb.billDate,
        rows:
          vb.purchaseOrderNumber !== undefined
            ? [{ k: "Purchase order", v: vb.purchaseOrderNumber, mono: true }]
            : [],
        related,
      }),
    );
    buy.push(
      card(
        {
          kind: "VENDOR BILL",
          date: formatDateShort(vb.billDate),
          title: `${vb.transactionNumber} recorded`,
          meta:
            view.unit !== undefined
              ? `Unit cost ${formatCents(view.unit.unitCostCents)}`
              : null,
          visual: "acc",
          glyph: "●",
          recordId: id,
          href: null,
        },
        vb.billDate,
      ),
    );
  }
  for (const step of view.missing) {
    if (!["Purchase Order", "Item Receipt", "Vendor Bill"].includes(step)) continue;
    buy.push(
      card({
        kind: "REQUIRED RECORD",
        date: "—",
        title: `${step} — no record`,
        meta: "No NetSuite document references this serial",
        visual: "miss",
        glyph: "○",
        recordId: null,
        href: null,
      }),
    );
  }

  /* ---- Inventory life ---- */
  if (r.itemReceipt && view.unit) {
    // A receipt posted after the balance-sheet date does not recognize the
    // unit into the year-end book — the unit is on the listing because it is
    // goods in transit, and whether title had passed is the open question.
    // Stating a post-period date as the recognition date would answer it.
    const postPeriod =
      opts.periodEnd !== undefined && r.itemReceipt.receiptDate > opts.periodEnd;
    inv.push(
      card(
        postPeriod
          ? {
              kind: "RECEIPT POSTING",
              date: formatDateShort(r.itemReceipt.receiptDate),
              title: "NetSuite receipt posted after period end",
              meta: `On the year-end listing as ${titleCase(view.unit.classification)} · GL ${view.unit.glAccount} — recognition date not concluded`,
              visual: "conf",
              glyph: "✕",
              recordId: r.itemReceipt.transactionNumber,
              href: null,
            }
          : {
              kind: "RECOGNITION",
              date: formatDateShort(r.itemReceipt.receiptDate),
              title: "Inventory recognized",
              meta: `GL ${view.unit.glAccount} · ${titleCase(view.unit.classification)}`,
              visual: "acc",
              glyph: "●",
              recordId: r.itemReceipt.transactionNumber,
              href: null,
            },
        r.itemReceipt.receiptDate,
      ),
    );
  }
  const yeRow = view.inventoryLife.countRows.find((row) => row.countType === "YEAR_END");
  if (view.unit) {
    // The ERP inventory snapshot, not an observation of the unit. Drawing it
    // as a "Physical event" would present NetSuite state as physical
    // evidence — the one distinction this screen exists to keep (§6 row 1),
    // on the very unit whose exception is that the two disagree. The count
    // rows below are the physical evidence.
    inv.push(
      card({
        kind: "NETSUITE LOCATION",
        date:
          view.unit.lastMovementAt !== undefined
            ? formatDateShort(view.unit.lastMovementAt)
            : "At 12/31",
        title: locationLabel(view.unit.location),
        meta: `Book position${yeRow?.bin !== undefined ? ` · bin ${yeRow.bin}` : ""} — ERP record, not an observation`,
        visual: "acc",
        glyph: "●",
        recordId: null,
        href: null,
      }),
    );
  }
  const countRows = view.inventoryLife.countRows;
  if (countRows.length > 0) {
    const varianceRows = countRows.filter((row) => row.variance !== 0).length;
    inv.push(
      card({
        kind: "COUNTS",
        date: "FY2026",
        title: `${countRows.length} count row${countRows.length === 1 ? "" : "s"} · ${
          varianceRows === 0 ? "no variance" : `${varianceRows} with variance`
        }`,
        meta: [...new Set(countRows.map((row) => row.countPlanId))].join(" · "),
        visual: "phy",
        glyph: "●",
        recordId: null,
        href: null,
      }),
    );
  } else {
    inv.push(
      card({
        kind: "COUNTS",
        date: "Checked",
        title: "No count rows for this serial",
        meta: "Verified empty — not zero-filled",
        visual: "acc",
        glyph: "●",
        recordId: null,
        href: null,
      }),
    );
  }
  for (const m of view.inventoryLife.movements) {
    inv.push(
      card(
        {
          kind: "MOVEMENT",
          date: formatDateShort(m.movedAt),
          title: `${locationLabel(m.fromLocation)} → ${locationLabel(m.toLocation)}`,
          meta: m.reason,
          visual: "phy",
          glyph: "●",
          recordId: null,
          href: null,
        },
        m.movedAt,
      ),
    );
  }
  const assignment = view.inventoryLife.assignment;
  if (assignment !== undefined) {
    inv.push(
      card(
        {
          kind: "ASSIGNMENT",
          date: formatDateShort(assignment.startedAt),
          title: `${titleCase(assignment.kind)}${assignment.customer !== undefined ? ` — ${assignment.customer}` : ""}`,
          meta: null,
          visual: "phy",
          glyph: "●",
          recordId: null,
          href: null,
        },
        assignment.startedAt,
      ),
    );
  }
  if (view.inventoryLife.rmaRecordId !== undefined) {
    inv.push(
      card({
        kind: "RMA",
        date: "On file",
        title: `RMA record ${view.inventoryLife.rmaRecordId}`,
        meta: null,
        visual: "phy",
        glyph: "●",
        recordId: null,
        href: null,
      }),
    );
  }
  if (opts.adjustmentNote !== null) {
    const found = opts.adjustmentRefs.length > 0;
    inv.push(
      card({
        kind: "ADJUSTMENTS",
        date: "Checked",
        title: opts.adjustmentNote,
        meta: found
          ? opts.adjustmentRefs.join(" · ")
          : "Checked against the count-linked adjustments — not zero-filled",
        visual: found ? "acc" : "acc",
        glyph: "●",
        recordId: null,
        href: null,
      }),
    );
  }

  /* ---- Sell / deploy side ---- */

  // A missing requirement belongs to the phase of the question it blocks —
  // a count gap is inventory life, a procurement gap is buy side. Filing them
  // all under sell/deploy would assert a sell life the unit may never have had.
  for (const e of exceptions) {
    const contractGapId = opts.evidenceRecordIds.get(`${e.exception.id}:REQUIRED_FOR`);
    const ruleId = e.exception.finding.ruleId;
    const target = ruleId.startsWith("CNT-")
      ? inv
      : ruleId.startsWith("CUT-IN") || ruleId.startsWith("PROC-")
        ? buy
        : ruleId.startsWith("REC-") || ruleId.startsWith("GL-") || ruleId.startsWith("VAL-")
          ? close
          : sell;
    for (const req of e.exception.finding.evidenceRequirements) {
      if (!req.required || req.satisfied) continue;
      target.push(
        card({
          kind: "REQUIRED EVIDENCE",
          date: "—",
          title: req.description,
          meta: `MISSING · required for ${ruleId}`,
          visual: "miss",
          glyph: "○",
          recordId: contractGapId ?? null,
          href: null,
        }),
      );
    }
  }
  if (r.salesOrder) {
    const so = r.salesOrder;
    const amount = money(view.recordTotals.salesOrderCents);
    const id = put(
      sourceRecord({
        ...common,
        id: so.transactionNumber,
        kind: "SALES_ORDER",
        title: so.transactionNumber,
        state: "Known",
        stateGlyph: "✓",
        stateVariant: "resolved",
        sourceRef: so.sourceRef,
        occurred: so.orderDate,
        rows: [
          { k: "Customer", v: so.customer },
          ...(amount !== null ? [{ k: "Order amount", v: amount }] : []),
        ],
        related,
      }),
    );
    sell.push(
      card(
        {
          kind: "SALES ORDER",
          date: formatDateShort(so.orderDate),
          title: so.transactionNumber,
          meta: `${lineQty(so.lines, sku)} × ${sku ?? "unit"} · ${so.customer}`,
          visual: "acc",
          glyph: "●",
          recordId: id,
          href: null,
        },
        so.orderDate,
      ),
    );
  }
  if (r.itemFulfillment) {
    const iff = r.itemFulfillment;
    const id = put(
      sourceRecord({
        ...common,
        id: iff.transactionNumber,
        kind: "ITEM_FULFILLMENT",
        title: iff.transactionNumber,
        state: "Known",
        stateGlyph: "✓",
        stateVariant: "resolved",
        sourceRef: iff.sourceRef,
        occurred: iff.shipDate,
        rows: [{ k: "Sales order", v: iff.salesOrderNumber, mono: true }],
        related,
      }),
    );
    sell.push(
      card(
        {
          kind: "ITEM FULFILLMENT",
          date: formatDateShort(iff.shipDate),
          title: iff.transactionNumber,
          meta: `${lineQty(iff.lines, sku)} × ${sku ?? "unit"} shipped`,
          visual: "acc",
          glyph: "●",
          recordId: id,
          href: null,
        },
        iff.shipDate,
      ),
    );
  }
  if (r.carrierShipment) {
    const shipment = r.carrierShipment;
    const position = shipmentPosition(shipment);
    const delivered = position?.type === "DELIVERED";
    const id = put(
      sourceRecord({
        ...common,
        id: shipment.id,
        kind: "CARRIER_SHIPMENT",
        title: shipment.id,
        state: position !== undefined ? `Known — ${carrierPhrase(position.type)}` : "Known",
        stateGlyph: "✓",
        stateVariant: "resolved",
        sourceRef: shipment.sourceRef,
        occurred: position?.at,
        rows: [
          { k: "Carrier", v: shipment.carrier },
          ...shipment.events.map((e) => ({
            k: carrierPhrase(e.eventType),
            v: `${formatInstant(e.occurredAt)}${e.location !== undefined ? ` · ${e.location}` : ""}`,
            mono: true,
          })),
        ],
        related,
      }),
    );
    sell.push(
      card(
        {
          // The carrier card states the shipment's real position — a
          // delivered shipment can never read "in transit" (§9a-2).
          kind: "CARRIER",
          date: position !== undefined ? formatDateShort(position.at) : "On file",
          title: delivered
            ? `Delivered${position?.location !== undefined ? ` — ${position.location}` : ""}`
            : position !== undefined
              ? `${carrierPhrase(position.type).replace(/^./, (c) => c.toUpperCase())}${position.location !== undefined ? ` — ${position.location}` : ""}`
              : "Carrier shipment",
          meta: `${shipment.carrier} · ${shipment.id}`,
          visual: "phy",
          glyph: "●",
          recordId: id,
          href: null,
        },
        position?.at,
      ),
    );
  }
  for (const step of view.missing) {
    if (!["Carrier shipment", "Delivery confirmation"].includes(step)) continue;
    sell.push(
      card({
        kind: "REQUIRED RECORD",
        date: "—",
        title: `${step} — no record`,
        meta: "No carrier event on file",
        visual: "miss",
        glyph: "○",
        recordId: null,
        href: null,
      }),
    );
  }
  if (r.installation) {
    const inst = r.installation;
    const id = put(
      sourceRecord({
        ...common,
        id: inst.id,
        kind: "INSTALLATION",
        title: inst.id,
        state: "Known",
        stateGlyph: "✓",
        stateVariant: "resolved",
        sourceRef: inst.sourceRef,
        occurred: inst.installedAt,
        rows: [
          { k: "Site", v: inst.siteName },
          { k: "Installed by", v: inst.installedBy },
          { k: "Status", v: titleCase(inst.status) },
        ],
        related,
      }),
    );
    sell.push(
      card(
        {
          kind: "INSTALLATION",
          date: formatDateShort(inst.installedAt),
          title: "Installation complete",
          meta: `${inst.installedBy} · ${inst.id}`,
          visual: "phy",
          glyph: "●",
          recordId: id,
          href: null,
        },
        inst.installedAt,
      ),
    );
  }
  if (r.telemetry) {
    const tel = r.telemetry;
    const id = put(
      sourceRecord({
        ...common,
        id: tel.id,
        kind: "TELEMETRY",
        title: tel.id,
        state: "Corroborating",
        stateGlyph: "≈",
        stateVariant: "review",
        sourceRef: tel.sourceRef,
        occurred: tel.firstOnlineAt,
        rows: [{ k: "Last seen", v: formatInstant(tel.lastSeenAt) }],
        related,
      }),
    );
    sell.push(
      card(
        {
          kind: "TELEMETRY",
          date: formatDateShort(tel.firstOnlineAt),
          title: "Device first online",
          meta: "Corroborating only",
          visual: "cor",
          glyph: "≈",
          recordId: id,
          href: null,
        },
        tel.firstOnlineAt,
      ),
    );
  }
  if (r.customerInvoice) {
    const invc = r.customerInvoice;
    const amount = money(view.recordTotals.customerInvoiceCents);
    const after =
      opts.periodEnd !== undefined && invc.invoiceDate > opts.periodEnd;
    const id = put(
      sourceRecord({
        ...common,
        id: invc.transactionNumber,
        kind: "CUSTOMER_INVOICE",
        title: invc.transactionNumber,
        state: "Known — billing only",
        stateGlyph: "✓",
        stateVariant: "neutral",
        sourceRef: invc.sourceRef,
        occurred: invc.invoiceDate,
        rows: [
          ...(amount !== null ? [{ k: "Invoice amount", v: amount }] : []),
          {
            k: "Establishes",
            v: "Billing evidence only — not ownership, relief, acceptance, or revenue",
          },
        ],
        related,
      }),
    );
    sell.push(
      card(
        {
          kind: "CUSTOMER INVOICE",
          date: formatDateShort(invc.invoiceDate),
          title: invc.transactionNumber,
          meta: `${amount !== null ? `${amount} · ` : ""}billing evidence only${after ? " · after period end" : ""}`,
          visual: "acc",
          glyph: "●",
          recordId: id,
          href: null,
        },
        invc.invoiceDate,
      ),
    );
  }
  if (view.missing.includes("Customer Invoice")) {
    sell.push(
      card({
        kind: "REQUIRED RECORD",
        date: "—",
        title: "Customer Invoice — no record",
        meta: "No invoice references this order",
        visual: "miss",
        glyph: "○",
        recordId: null,
        href: null,
      }),
    );
  }

  /* ---- Accounting / close ---- */
  const conflict =
    view.unit !== undefined &&
    exceptions.some((e) => e.exception.finding.reasonCodes.includes(CONFLICT_REASON));
  if (view.unit) {
    const stateRecordId =
      opts.evidenceRecordIds.get("NETSUITE_STATE") ?? null;
    close.push(
      card({
        kind: "NETSUITE STATE",
        date: opts.periodEnd !== undefined ? formatDateShort(opts.periodEnd) : "At 12/31",
        title: `${locationLabel(view.unit.location)} Inventory`,
        meta: conflict
          ? "Conflicts with deployment evidence"
          : titleCase(view.unit.classification),
        visual: conflict ? "conf" : "acc",
        glyph: conflict ? "✕" : "●",
        recordId: stateRecordId,
        href: null,
      }),
    );
    close.push(
      card({
        kind: "GL RELATIONSHIP",
        date: opts.periodEnd !== undefined ? formatDateShort(opts.periodEnd) : "At 12/31",
        title: `${view.unit.glAccount} · ${titleCase(view.unit.classification)}`,
        meta:
          opts.grossSubledger !== null
            ? `In gross subledger ${opts.grossSubledger}`
            : null,
        visual: "acc",
        glyph: "●",
        recordId: null,
        href: null,
      }),
    );
  } else {
    close.push(
      card({
        kind: "LISTING",
        date: "—",
        title: "No year-end book record",
        meta: "Observed physically; never auto-added to inventory",
        visual: "miss",
        glyph: "○",
        recordId: null,
        href: null,
      }),
    );
  }
  if (view.missing.includes("Inventory relief")) {
    close.push(
      card({
        kind: "REQUIRED RECORD",
        date: "—",
        title: "Inventory relief — no record",
        meta: "Unit is still on the year-end book after fulfillment",
        visual: "miss",
        glyph: "○",
        recordId: null,
        href: null,
      }),
    );
  }
  for (const e of exceptions) {
    const f = e.exception.finding;
    close.push(
      card({
        kind: "EXCEPTION",
        date: e.open ? "Open" : "Resolved",
        title: `${e.exception.id} · ${statusView(e.exception.status).label}`,
        meta: `Exposure ${formatCents(f.exposureCents)} · ${riskView(f.risk).label}`,
        visual: e.open ? "conf" : "acc",
        glyph: e.open ? "✕" : "●",
        recordId: null,
        href: `/exceptions/${e.exception.id}`,
      }),
    );
  }
  if (exceptions.length > 0) {
    const primary = exceptions.find((e) => e.open) ?? exceptions[0];
    if (primary !== undefined) {
      const unmet = primary.exception.finding.evidenceRequirements
        .filter((req) => req.required && !req.satisfied)
        .map((req) => req.description);
      close.push(
        card({
          kind: "CONCLUSION",
          date: conclusionLabel(primary.exception.status),
          title: `Management conclusion: ${conclusionLabel(primary.exception.status)}`,
          meta: nextActionText(primary.exception.status, unmet),
          visual: "conc",
          glyph: "◆",
          recordId: null,
          href: `/exceptions/${primary.exception.id}`,
        }),
      );
    }
  } else {
    close.push(
      card({
        kind: "EXCEPTIONS",
        date: "Checked",
        title: "No exceptions reference this serial",
        meta:
          opts.runId !== undefined
            ? `Verified against the close run ${opts.runId} — empty, not assumed`
            : "Verified empty — not assumed",
        visual: "acc",
        glyph: "●",
        recordId: null,
        href: null,
      }),
    );
  }

  const phases: LifePhase[] = [
    { name: "BUY SIDE", range: phaseRange(buy, cardDates), accent: false, events: buy },
    { name: "INVENTORY LIFE", range: phaseRange(inv, cardDates), accent: false, events: inv },
    {
      name: "SELL / DEPLOY SIDE",
      range: phaseRange(sell, cardDates),
      accent: false,
      events: sell,
    },
    {
      name: "ACCOUNTING / CLOSE",
      range: opts.periodEnd !== undefined ? `AT ${formatDate(opts.periodEnd).toUpperCase()}` : "AT PERIOD END",
      accent: true,
      events: close,
    },
  ].filter((p) => p.events.length > 0);

  const sorted = [...dates].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const range =
    first !== undefined && last !== undefined
      ? `${formatDate(first)} → ${formatDate(last)} · chain of custody for one ${view.buySideTracking === "SERIAL" ? "serialized unit" : "batch-tracked unit"}`
      : null;

  return { phases, records, range };
}

/**
 * The phase's date span, computed from the ISO instants behind its cards.
 * Reading the formatted labels instead would sort by array order and would
 * silently drop May, the one month the display format writes without a
 * trailing period.
 */
function phaseRange(
  events: readonly LifeEventCard[],
  cardDates: ReadonlyMap<string, string>,
): string {
  const dated = events
    .flatMap((e) => {
      const at = cardDates.get(e.key);
      return at !== undefined ? [at] : [];
    })
    .sort();
  const first = dated[0];
  const last = dated[dated.length - 1];
  if (first === undefined || last === undefined) return "";
  return first === last
    ? formatDateShort(first).toUpperCase()
    : `${formatDateShort(first)} – ${formatDateShort(last)}`.toUpperCase();
}

/** Count history rows for the unit's serial and its SKU × location cell. */
function cycleRows(
  view: FinancialLifeView,
  svc: Ctx,
): { rows: LifeCycleRow[]; empty: string | null } {
  const detail = attempt(() => svc.queries.getCountDetail(svc.ctx));
  if (detail === undefined) return { rows: [], empty: null };
  const planById = new Map(detail.plans.map((p) => [p.id, p]));
  const cellRows =
    view.unit !== undefined
      ? detail.results.filter(
          (row) =>
            row.countType !== "YEAR_END" &&
            row.sku === view.unit?.sku &&
            row.location === view.unit?.location,
        )
      : [];
  const all = [...view.inventoryLife.countRows, ...cellRows];
  const rows = all
    .map((row) => {
      const plan = planById.get(row.countPlanId);
      const adj = detail.adjustments.find(
        (a) =>
          a.relatedCountPlanId === row.countPlanId &&
          a.lines.some((l) => l.sku === row.sku),
      );
      const rejected = plan?.sourceStatus === "REJECTED";
      return {
        at: plan?.snapshotAt ?? "",
        row: {
          // The count-detail id is the row's own identity: a serial counted
          // in two locations has two rows in the same plan on the same date.
          key:
            row.externalCountDetailId ??
            `${row.countPlanId}|${row.sku}|${row.location}|${row.bin ?? ""}`,
          date: plan !== undefined ? formatDate(plan.snapshotAt) : row.countPlanId,
          plan: `${row.countPlanId}${row.serial !== undefined ? ` · ${locationLabel(row.location)}` : ` · ${row.sku} cell`}`,
          snapshot: String(row.snapshotQuantity),
          counted: String(row.countQuantity),
          variance: String(row.variance),
          varianceWarn: row.variance !== 0,
          approval: rejected
            ? { label: plan?.rejectedReason ?? "Rejected", glyph: "✕", tone: "ember" as const }
            : plan?.approvedBy !== undefined
              ? { label: `Approved · ${plan.approvedBy}`, glyph: "✓", tone: "aurora" as const }
              : { label: "Recorded", glyph: "○", tone: "soft" as const },
          adjustment: adj !== undefined ? adj.transactionNumber : "None",
        },
      };
    })
    .sort((a, b) => (a.at < b.at ? -1 : 1))
    .map((x) => x.row);
  const empty =
    rows.length === 0
      ? "No count rows reference this serial or its SKU × location cell — verified empty, not assumed."
      : null;
  return { rows, empty };
}

export function buildFinancialLifeData(
  user: DemoUser,
  serial: string,
  correlationId: string,
): FinancialLifeData {
  const queries = getQueries();
  const ctx = makeContext(user, correlationId);
  const base = { roleLabel: roleLabel(user), serial };

  const view = attempt(() => queries.getFinancialLife(ctx, serial));
  if (view === undefined) {
    return {
      ...base,
      restricted: true,
      found: false,
      onBook: false,
      range: null,
      phases: [],
      cycle: null,
      evidenceChain: [],
      chainFootnote: null,
      recordScopeNotice: null,
      accounting: null,
      records: {},
    };
  }

  const hits = attempt(() => queries.searchSerial(ctx, serial)) ?? [];
  const found =
    view.unit !== undefined ||
    Object.keys(view.records).length > 0 ||
    view.inventoryLife.countRows.length > 0 ||
    view.inventoryLife.countTests.length > 0 ||
    view.inventoryLife.movements.length > 0 ||
    view.exceptions.length > 0 ||
    hits.some((h) => h.serial === serial);
  if (!found) {
    return {
      ...base,
      restricted: false,
      found: false,
      onBook: false,
      range: null,
      phases: [],
      cycle: null,
      evidenceChain: [],
      chainFootnote: null,
      recordScopeNotice: null,
      accounting: null,
      records: {},
    };
  }

  const exceptions = (attempt(() => queries.listExceptions(ctx)) ?? []).filter((e) =>
    view.exceptions.includes(e.exception.id),
  );
  const blockers = attempt(() => queries.getBlockers(ctx)) ?? [];
  const blockerIds = new Set(blockers.map((b) => b.exceptionId));
  const readiness = attempt(() => queries.getCloseReadiness(ctx));
  const recon = attempt(() => queries.getReconciliation(ctx));
  const manifest = attempt(() => queries.getRunManifest(ctx));
  const detail = attempt(() => queries.getCountDetail(ctx));
  const periodEnd = recon?.asOf;
  const datasetVersion = manifest?.datasetVersion ?? "—";

  // Evidence-graph records for the serial's exceptions (real EV ids, with
  // role redaction intact) — the contract gap and the conflicting NetSuite
  // state open these records, exactly as the exception screen does.
  const records: Record<string, EvidenceRecordView> = {};
  const evidenceRecordIds = new Map<string, string>();
  // Whether the viewer's scope, rather than the data, emptied the evidence.
  let evidenceOutOfScope = exceptions.length > 0;
  for (const e of exceptions) {
    const context = gatherExceptionContext(queries, ctx, e);
    if (!context.evidenceOutOfScope) evidenceOutOfScope = false;
    for (const item of context.evidence) {
      records[item.id] = assembleEvidenceRecord(item, e, datasetVersion, user);
      if (item.linkType === "REQUIRED_FOR") {
        evidenceRecordIds.set(`${e.exception.id}:REQUIRED_FOR`, item.id);
      }
      if (item.linkType === "CONFLICTS_WITH") {
        evidenceRecordIds.set("NETSUITE_STATE", item.id);
      }
    }
  }

  // Inventory adjustments touching this unit. NetSuite adjustment lines are
  // recorded at SKU × count-plan level and carry no serials, so a serial can
  // only be tied to one through the count cell it was counted in — matching
  // on `line.serials` would silently find nothing and report a false
  // "verified empty". Where the unit is not on the book there is no cell to
  // match, and the card says the check could not be made rather than passing.
  const adjustmentCells = new Set(
    view.inventoryLife.countRows.map((row) => `${row.countPlanId}|${row.sku}`),
  );
  const serialAdjustments =
    view.unit === undefined
      ? []
      : (detail?.adjustments ?? []).filter(
          (a) =>
            a.relatedCountPlanId !== undefined &&
            a.lines.some((l) =>
              adjustmentCells.has(`${a.relatedCountPlanId}|${l.sku}`),
            ),
        );
  const adjustmentNote =
    detail === undefined
      ? null
      : view.unit === undefined
        ? "Adjustment history not applicable — no book record"
        : serialAdjustments.length > 0
          ? `${serialAdjustments.length} count-linked adjustment${serialAdjustments.length === 1 ? "" : "s"} on this unit's count cells`
          : "No count-linked inventory adjustments";

  const assembled = assemblePhases(view, exceptions, {
    periodEnd,
    grossSubledger:
      readiness !== undefined && view.unit !== undefined
        ? formatCents(readiness.aggregates.grossInventoryCents)
        : null,
    datasetVersion,
    viewerRole: user.roles[0] ?? "—",
    runId: manifest?.runId,
    adjustmentNote,
    adjustmentRefs: serialAdjustments.map((a) => a.transactionNumber),
    evidenceRecordIds,
  });
  Object.assign(assembled.records, records);

  /* Header */
  const primary = exceptions.find((e) => e.open) ?? exceptions[0];
  const installedAt = view.sellSide.installedAt;
  const firstOnlineAt = view.sellSide.firstOnlineAt;
  const deployedAt = installedAt ?? firstOnlineAt;
  const deployedBeforeEnd =
    deployedAt !== undefined && periodEnd !== undefined && deployedAt.slice(0, 10) <= periodEnd;
  const shipment = view.records.carrierShipment;
  const position = shipment !== undefined ? shipmentPosition(shipment) : undefined;
  const yearEndRows = view.inventoryLife.countRows.filter(
    (row) => row.countType === "YEAR_END",
  );

  const physical = deployedBeforeEnd
    ? {
        headline: "At customer site",
        sub: `Installed${firstOnlineAt !== undefined ? " and online" : ""} ${formatDateShort(deployedAt ?? "")}`,
        ember: true,
      }
    : position !== undefined && position.type !== "DELIVERED"
      ? {
          headline: `${carrierPhrase(position.type).replace(/^./, (c) => c.toUpperCase())} at period end`,
          sub: `${shipment?.carrier ?? "Carrier"} · last event ${formatDateShort(position.at)}`,
          ember: true,
        }
      : view.unit !== undefined
        ? // A count is physical evidence, and a count that failed to find the
          // unit says so. "Matched" requires that NO year-end row for this
          // serial carries a variance — one clean row is not a clean count.
          yearEndRows.length > 0 && yearEndRows.every((row) => row.variance === 0)
          ? {
              headline: locationLabel(view.unit.location),
              sub: "Matched in the year-end count",
              ember: false,
            }
          : yearEndRows.some((row) => row.variance !== 0)
            ? {
                headline: countOutcome(yearEndRows) ?? "Count variance recorded",
                sub: countOutcomeDetail(yearEndRows),
                ember: true,
              }
            : {
                headline: "No operational events in evidence",
                sub: "Nothing places this unit elsewhere",
                ember: false,
              }
        : {
            headline: "Observed off-book",
            sub:
              view.inventoryLife.countTests[0]?.location !== undefined
                ? `Physically present in ${locationLabel(view.inventoryLife.countTests[0].location)}`
                : "See count observations",
            ember: true,
          };

  const chips: { label: string; recordId: string | null; href: string | null }[] = [];
  for (const key of [
    view.buySide.purchaseOrder,
    view.buySide.itemReceipt,
    view.buySide.vendorBill,
    view.sellSide.salesOrder,
    view.sellSide.itemFulfillment,
    view.sellSide.customerInvoice,
  ]) {
    if (key !== undefined && assembled.records[key] !== undefined) {
      chips.push({ label: key, recordId: key, href: null });
    }
  }
  for (const id of view.exceptions) {
    chips.push({ label: id, recordId: null, href: `/exceptions/${id}` });
  }

  const header = {
    sku: view.unit?.sku ?? view.inventoryLife.countTests[0]?.sku ?? "—",
    skuNote:
      view.unit !== undefined
        ? view.buySideTracking === "SERIAL"
          ? "Serialized unit"
          : "Batch-tracked stock"
        : "Not on the year-end book",
    carrying: view.unit !== undefined ? formatCents(view.unit.unitCostCents) : null,
    netsuite:
      view.unit !== undefined
        ? {
            headline: `${locationLabel(view.unit.location)} Inventory`,
            sub: `${titleCase(view.unit.classification)} · GL ${view.unit.glAccount}${periodEnd !== undefined ? ` · at ${formatDate(periodEnd)}` : ""}`,
          }
        : {
            headline: "Not on the year-end listing",
            sub: "No book record exists for this serial",
          },
    physical,
    exception:
      primary !== undefined
        ? {
            id: primary.exception.id,
            note: `${formatCents(primary.exception.finding.exposureCents)} · ${riskView(primary.exception.finding.risk).label}`,
          }
        : null,
    close:
      primary !== undefined
        ? {
            status: statusView(primary.exception.status),
            blocker: blockerIds.has(primary.exception.id),
            body: `Conclusion ${conclusionLabel(primary.exception.status)} — ${nextActionText(
              primary.exception.status,
              primary.exception.finding.evidenceRequirements
                .filter((req) => req.required && !req.satisfied)
                .map((req) => req.description),
            )}`,
          }
        : {
            status: null,
            blocker: false,
            body:
              manifest !== undefined
                ? `No exception references this serial — verified against run ${manifest.runId}.`
                : "No exception references this serial.",
          },
    chips,
  };

  /* Evidence chain (right column) from the commercial chain for this SO. */
  const chains = attempt(() => queries.getCommercialChains(ctx)) ?? [];
  const chain =
    view.sellSide.salesOrder !== undefined
      ? chains.find((c) => c.subjectRef === view.sellSide.salesOrder)
      : undefined;
  const evidenceChain =
    chain !== undefined
      ? chain.components
          .filter((c) => c.state !== "NOT_APPLICABLE")
          .map((c) => {
            const missing = c.state === "MISSING";
            const corroborating = c.importance === "CORROBORATING";
            return {
              label: c.name,
              tag: missing
                ? c.importance === "REQUIRED"
                  ? "MISSING · REQUIRED"
                  : "MISSING"
                : corroborating
                  ? "CORROBORATING"
                  : "PRESENT",
              glyph: missing ? "○" : corroborating ? "≈" : "✓",
              visual: (missing
                ? "missing"
                : corroborating
                  ? "corroborating"
                  : "present") as "present" | "corroborating" | "missing" | "conflict",
              recordId:
                c.reference !== undefined && assembled.records[c.reference] !== undefined
                  ? c.reference
                  : null,
            };
          })
      : [];
  const chainFootnote =
    chain !== undefined
      ? `${chain.presentCount} of ${chain.totalCount} components present, ${chain.requiredMissingCount} required component${chain.requiredMissingCount === 1 ? "" : "s"} absent. The chain reports what exists — it is not a score and not a measure of accounting confidence.`
      : null;

  /* Accounting position */
  const accounting =
    view.unit !== undefined
      ? {
          rows: [
            { k: `Unit cost · ${view.unit.sku}`, v: formatCents(view.unit.unitCostCents) },
            { k: "Classification", v: titleCase(view.unit.classification) },
            { k: "GL account", v: view.unit.glAccount, mono: true },
            ...(readiness !== undefined
              ? [
                  {
                    k: "Included in gross subledger",
                    v: formatCents(readiness.aggregates.grossInventoryCents),
                  },
                ]
              : []),
          ],
          proposed: exceptions.some(
            (e) => e.exception.status === "RESOLVED_ADJUSTMENT_PROPOSED",
          )
            ? "Proposed — not posted"
            : "None",
          footnote:
            primary !== undefined && primary.open
              ? `No relief posted, no reclassification proposed. Any change requires a management conclusion on ${primary.exception.id} first.`
              : "No relief posted, no reclassification proposed.",
        }
      : null;

  const cycle = cycleRows(view, { queries, ctx });

  return {
    ...base,
    restricted: false,
    found: true,
    onBook: view.unit !== undefined,
    header,
    range: assembled.range,
    phases: assembled.phases,
    cycle: {
      rows: cycle.rows,
      notes: [
        "Deterministic indicators flag overdue counts, repeated variances, or repeat recounts as management risk context only. This is not an audit sampling method and implies no auditor reliance.",
      ],
      empty: cycle.empty,
    },
    evidenceChain,
    chainFootnote,
    // Said out loud where the viewer's scope, not the data, left the chain
    // without records behind it.
    recordScopeNotice:
      evidenceOutOfScope && evidenceChain.length > 0
        ? "Evidence records for this unit's exceptions are outside your scope. Provided audit support lives in the Audit Package."
        : null,
    accounting,
    records: assembled.records,
  };
}

export function buildInventorySearchData(
  user: DemoUser,
  query: string,
  correlationId: string,
): InventorySearchData {
  const queries = getQueries();
  const ctx = makeContext(user, correlationId);
  const units = attempt(() => queries.listInventoryUnits(ctx));
  if (units === undefined) {
    return {
      restricted: true,
      roleLabel: roleLabel(user),
      query,
      bookCountNote: null,
      hits: null,
      notable: [],
    };
  }
  const trimmed = query.trim();
  const hits =
    trimmed === ""
      ? null
      : (attempt(() => queries.searchSerial(ctx, trimmed)) ?? []).map((h) => {
          const unit = h.unit as
            | { sku?: string; location?: string }
            | undefined;
          return {
            serial: h.serial,
            onBook: h.onBook,
            foundIn: h.foundIn,
            sku: unit?.sku ?? null,
            location: unit?.location !== undefined ? locationLabel(unit.location) : null,
          };
        });

  const exceptions = attempt(() => queries.listExceptions(ctx)) ?? [];
  const notable = exceptions
    .filter((e) => e.open)
    .flatMap((e) =>
      (e.exception.finding.subjects.serials ?? []).slice(0, 1).map((serial) => ({
        serial,
        note: `${e.exception.id} · ${statusView(e.exception.status).label}`,
      })),
    );

  return {
    restricted: false,
    roleLabel: roleLabel(user),
    query: trimmed,
    bookCountNote: `${units.length.toLocaleString("en-US")} units on the year-end book listing`,
    hits,
    notable,
  };
}
