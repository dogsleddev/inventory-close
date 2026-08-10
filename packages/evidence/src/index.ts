/**
 * @icg/evidence — the evidence graph (Stage 04).
 *
 * Builds Evidence items and typed EvidenceLinks for the derived exceptions
 * from the SAME source records the rules consumed, with sha-256 content
 * fingerprints. Lineage is append-only: supersede/void/annotate, never
 * destructive edits. Traversal: exception → rule execution → evidence →
 * source record.
 */

import { createHash } from "node:crypto";
import type {
  EvidenceLinkType,
  EvidenceSensitivity,
  SourceRecordRef,
} from "@icg/domain";
import type { IcgDataset } from "@icg/data";
import type { CloseRunResult, DerivedException } from "@icg/rules";

export interface EvidenceItem {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
  readonly sensitivity: EvidenceSensitivity;
  /** sha-256 over the canonical JSON of the referenced record. */
  readonly contentHash: string;
  readonly sourceRef?: SourceRecordRef;
  /** The record content; restricted content is withheld at the service layer. */
  readonly content: unknown;
  readonly supersededBy?: string;
  readonly voided?: boolean;
  readonly voidReason?: string;
}

export interface EvidenceGraphLink {
  readonly from: string;
  readonly linkType: EvidenceLinkType;
  /** Evidence id or object ref ("EXC-001", "RULE:CUT-OUT-001"). */
  readonly to: string;
}

export interface EvidenceGraph {
  readonly items: readonly EvidenceItem[];
  readonly links: readonly EvidenceGraphLink[];
}

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v !== null && typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`).join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

function sha256(value: unknown): string {
  return createHash("sha256").update(canonical(value), "utf8").digest("hex");
}

/**
 * Build the evidence graph for a close run. Every exception gets evidence
 * items for the source records its finding references, linked SUPPORTS /
 * CONFLICTS_WITH / REQUIRED_FOR / CORROBORATES per the finding's structure.
 */
export function buildEvidenceGraph(
  dataset: IcgDataset,
  close: CloseRunResult,
): EvidenceGraph {
  const items: EvidenceItem[] = [];
  const links: EvidenceGraphLink[] = [];
  const seen = new Map<string, string>(); // dedupe key -> evidence id
  let seq = 0;

  const addItem = (
    kind: string,
    title: string,
    content: unknown,
    sensitivity: EvidenceSensitivity,
    sourceRef?: SourceRecordRef,
  ): string => {
    const key = `${kind}|${title}`;
    const existing = seen.get(key);
    if (existing !== undefined) return existing;
    seq += 1;
    const id = `EV-${String(seq).padStart(4, "0")}`;
    seen.set(key, id);
    items.push({
      id,
      title,
      kind,
      sensitivity,
      contentHash: sha256(content),
      ...(sourceRef ? { sourceRef } : {}),
      content,
    });
    return id;
  };

  const link = (from: string, linkType: EvidenceLinkType, to: string) => {
    links.push({ from, linkType, to });
  };

  for (const exc of close.exceptions) {
    linkExceptionEvidence(exc, dataset, addItem, link);
  }
  return { items, links };
}

function linkExceptionEvidence(
  exc: DerivedException,
  dataset: IcgDataset,
  addItem: (
    kind: string,
    title: string,
    content: unknown,
    sensitivity: EvidenceSensitivity,
    sourceRef?: SourceRecordRef,
  ) => string,
  link: (from: string, linkType: EvidenceLinkType, to: string) => void,
): void {
  const f = exc.finding;
  const txns = new Set(f.subjects.transactionNumbers ?? []);
  const serials = new Set(f.subjects.serials ?? []);
  const docs = new Set(f.subjects.documentRefs ?? []);

  // NetSuite transactions referenced by the finding.
  const txnSources: readonly {
    kind: string;
    rows: readonly { transactionNumber: string; sourceRef: SourceRecordRef }[];
  }[] = [
    { kind: "SALES_ORDER", rows: dataset.salesOrders },
    { kind: "ITEM_FULFILLMENT", rows: dataset.itemFulfillments },
    { kind: "CUSTOMER_INVOICE", rows: dataset.customerInvoices },
    { kind: "PURCHASE_ORDER", rows: dataset.purchaseOrders },
    { kind: "ITEM_RECEIPT", rows: dataset.itemReceipts },
    { kind: "VENDOR_BILL", rows: dataset.vendorBills },
    { kind: "GL_ENTRY", rows: dataset.glEntries },
    { kind: "INVENTORY_ADJUSTMENT", rows: dataset.inventoryAdjustments },
  ];
  for (const src of txnSources) {
    for (const row of src.rows) {
      if (!txns.has(row.transactionNumber)) continue;
      const id = addItem(src.kind, row.transactionNumber, row, "STANDARD", row.sourceRef);
      // An invoice corroborates billing; it never supports ownership.
      link(id, src.kind === "CUSTOMER_INVOICE" ? "CORROBORATES" : "SUPPORTS", exc.id);
    }
  }

  // Operational facts for the exception's serials.
  for (const ship of dataset.carrierShipments) {
    if (!ship.serials.some((s) => serials.has(s))) continue;
    const id = addItem("CARRIER_SHIPMENT", ship.id, ship, "STANDARD", ship.sourceRef);
    link(id, "SUPPORTS", exc.id);
  }
  for (const inst of dataset.installations) {
    if (!inst.serials.some((s) => serials.has(s))) continue;
    const id = addItem("INSTALLATION", inst.id, inst, "STANDARD", inst.sourceRef);
    link(id, "SUPPORTS", exc.id);
  }
  for (const tl of dataset.telemetry) {
    if (!serials.has(tl.serial)) continue;
    const id = addItem("TELEMETRY", tl.id, tl, "STANDARD", tl.sourceRef);
    link(id, "CORROBORATES", exc.id);
  }
  for (const rma of dataset.rmaRecords) {
    if (!(docs.has(rma.id) || (rma.serial !== undefined && serials.has(rma.serial)))) continue;
    const id = addItem("RMA_RECORD", rma.id, rma, "STANDARD", rma.sourceRef);
    link(id, "SUPPORTS", exc.id);
  }

  // Contracts are RESTRICTED (docs/15). A MISSING provision is a
  // REQUIRED_FOR gap; a document that contradicts the book position
  // CONFLICTS_WITH the exception's NetSuite story.
  for (const contract of dataset.contracts) {
    const referenced =
      docs.has(contract.id) ||
      (f.subjects.transactionNumbers ?? []).some((t) => contract.title.includes(t)) ||
      (exc.finding.ruleId === "CUT-OUT-001" &&
        dataset.salesOrders.some(
          (so) => txns.has(so.transactionNumber) && so.customer === contract.counterparty,
        ));
    if (!referenced) continue;
    const id = addItem("CONTRACT", contract.title, contract, "RESTRICTED", contract.sourceRef);
    const missing = contract.provisions.some((p) => p.status === "MISSING");
    link(id, missing ? "REQUIRED_FOR" : "SUPPORTS", exc.id);
  }

  // Custodian statements: an unanswered confirmation is a REQUIRED_FOR gap.
  if (f.subjects.custodian !== undefined) {
    for (const st of dataset.custodianStatements) {
      if (st.custodian !== f.subjects.custodian) continue;
      const id = addItem("CUSTODIAN_STATEMENT", st.id, st, "STANDARD");
      link(id, st.respondedAt === undefined ? "REQUIRED_FOR" : "SUPPORTS", exc.id);
    }
  }

  // Physical count rows conflicting with the book position.
  const countRows = dataset.countResults.filter(
    (r) => r.serial !== undefined && serials.has(r.serial) && r.variance !== 0,
  );
  for (const row of countRows) {
    const id = addItem(
      "COUNT_RESULT",
      `${row.countPlanId}/${row.externalCountDetailId ?? row.serial ?? row.sku}`,
      row,
      "STANDARD",
    );
    link(id, "CONFLICTS_WITH", exc.id);
  }
}

/**
 * Full lineage for one exception: rule execution, evidence items with
 * links, and the underlying source refs.
 */
export interface ExceptionLineage {
  readonly exceptionId: string;
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly ruleExecution: { readonly inputHash: string; readonly outputHash: string };
  readonly evidence: readonly { item: EvidenceItem; linkType: EvidenceLinkType }[];
  readonly sourceRefs: readonly SourceRecordRef[];
}

export function traceExceptionLineage(
  exceptionId: string,
  close: CloseRunResult,
  graph: EvidenceGraph,
): ExceptionLineage | undefined {
  const exc = close.exceptions.find((e) => e.id === exceptionId);
  if (!exc) return undefined;
  const execution = close.ruleExecutions.find(
    (e) => String(e.ruleId) === exc.finding.ruleId,
  );
  if (!execution) return undefined;
  const evidence = graph.links
    .filter((l) => l.to === exceptionId)
    .flatMap((l) => {
      const item = graph.items.find((i) => i.id === l.from);
      return item ? [{ item, linkType: l.linkType }] : [];
    });
  return {
    exceptionId,
    ruleId: exc.finding.ruleId,
    ruleVersion: exc.finding.ruleVersion,
    ruleExecution: { inputHash: execution.inputHash, outputHash: execution.outputHash },
    evidence,
    sourceRefs: evidence.flatMap(({ item }) => (item.sourceRef ? [item.sourceRef] : [])),
  };
}
