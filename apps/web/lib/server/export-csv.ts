import type { DemoUser } from "@icg/data";
import { glAccountDescription } from "@icg/domain";
import {
  getConsignmentHoldings,
  getCostClassification,
  getCostStandards,
  getCustodyBreakdown,
  getDispositions,
  getEoMethodology,
  getMemo,
  getMethodology,
  getProcurementPopulations,
} from "@icg/services";
import { formatBpsExact, formatCents, plural } from "../format";
import { attempt } from "./data";
import { holderLabel } from "./humanize";
import { getQueries, getWorkspace, makeContext, roleLabel, userById } from "./workspace";

/**
 * CSV export.
 *
 * Nothing could leave this product before: an audit team could read every
 * screen and retain none of it. These handlers are the way out — and they
 * are deliberately narrow.
 *
 * Two rules govern every table below, and a reviewer should check both:
 *
 *   1. **Authorized service reads only.** No handler may touch `@icg/data`
 *      or read the workspace dataset itself. Every row comes through the
 *      same authorized service call the screens use — `QueryService`, or a
 *      services-layer projection that authorizes and scopes exactly as it
 *      does — so auditor scoping and restricted-content redaction apply to
 *      an export exactly as they apply to a page. An export that read the
 *      fixtures directly would be a side door around both.
 *   2. **No figure is computed here.** Money is formatted, never summed.
 *      A total in a spreadsheet that no screen shows is a number nobody
 *      derived.
 *
 * Every file carries a provenance header naming the run, the dataset, the
 * role that produced it, and the synthetic-data disclosure — a spreadsheet
 * outlives the tab it came from, and it must not be mistaken for real
 * financial data once it has.
 */

export interface CsvTable {
  readonly filename: string;
  readonly body: string;
}

/** RFC 4180: quote everything, double the quotes inside. */
function cell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function row(values: readonly unknown[]): string {
  return values.map(cell).join(",");
}

/**
 * A document cell that distinguishes withheld from absent.
 *
 * An empty cell in a spreadsheet reads as "there is nothing there", which is
 * the wrong reading for a document that exists and is outside the reader's
 * scope — the same reason the evidence table writes WITHHELD rather than
 * leaving the content column blank.
 */
function documentCell(value: string | undefined, withheld: boolean): string {
  return withheld ? "WITHHELD — outside this role's scope" : (value ?? "");
}

export const EXPORT_TABLES = [
  "inventory",
  "exceptions",
  "reconciliation",
  "adjustments",
  "evidence",
  "pbc",
  "procurement",
  "costing",
  "custody",
  "physical-count",
  "valuation",
  "methodology",
  "close-memo",
  "close-summary",
] as const;

export type ExportTable = (typeof EXPORT_TABLES)[number];

export function isExportTable(value: string): value is ExportTable {
  return (EXPORT_TABLES as readonly string[]).includes(value);
}

/**
 * Provenance, on every file. Naming the run and dataset makes an exported
 * figure traceable back to the close that produced it; naming the role makes
 * a scoped export legible as scoped rather than as the whole population.
 */
function header(
  user: DemoUser,
  manifest: { runId: string; datasetVersion: string } | undefined,
  table: string,
  scopeNote: string | null,
): string[] {
  return [
    row(["Inventory Close Gaurd", `${table} export`]),
    row(["Run", manifest?.runId ?? "—"]),
    row(["Dataset", manifest?.datasetVersion ?? "—"]),
    row(["Produced for role", roleLabel(user)]),
    ...(scopeNote !== null ? [row(["Scope", scopeNote])] : []),
    row([
      "SYNTHETIC DEMO",
      "KestrelGrid AI is an invented company. Every record and figure here is generated — none of it is real financial data.",
    ]),
    "",
  ];
}

/**
 * What an auditor's scope actually removes, PER TABLE.
 *
 * This used to be one sentence on every file, chosen from the viewer's role —
 * a proxy for "something was withheld" rather than the fact itself. On four
 * of these seven tables an auditor's file is byte-identical to a Controller's,
 * so the line claimed a redaction that had not happened. Absent means nothing
 * is withheld on that table, and a regression pins that reading.
 */
const AUDITOR_SCOPE_NOTES: Readonly<Record<ExportTable, string | null>> = {
  evidence:
    "Auditor scope — provided support only. Records behind workpapers that have not been provided are withheld.",
  pbc: "Auditor scope — every request is listed, but versions that were never sealed are withheld. Each row counts its own withheld versions.",
  // The count at the top is `withheldOrderCount`, which counts orders
  // withheld WHOLE. An order whose own receipt or bill is withheld keeps its
  // row, so the count does not cover it — and a note claiming the count
  // covers everything withheld would be the over-claim this table is fixing.
  procurement:
    "Auditor scope — source documents behind workpapers that have not been provided are withheld. Orders withheld in full are counted at the top of this file; an order that keeps its row loses only the cells for its own withheld documents.",
  // The cycle-count management indicators are a MANAGEMENT risk lens and are
  // never part of an auditor's provided support (`getCountDetail` returns an
  // empty list for them). The file is therefore genuinely shorter, and says so.
  "physical-count":
    "Auditor scope — the management cycle-count risk indicators are withheld. They are a management lens, not audit support, and no other section of this file is narrowed.",
  inventory: null,
  exceptions: null,
  reconciliation: null,
  adjustments: null,
  valuation: null,
  "close-summary": null,
  // Nothing in this file is a scoped record: the cost stack and the period
  // pools carry no source document, and the COGS states are rule output every
  // role reads whole. An auditor's file is byte-identical to a Controller's,
  // so claiming a redaction here would be the over-claim this map exists for.
  costing: null,
  // The consignment and disposition rows DO carry a sourceRef, so record
  // scope is applied to them — but no such record is evidence for any
  // exception, so nothing is withheld from anyone and an auditor's file is
  // byte-identical. Scoping being applied is not the same as scoping removing
  // something, and only the second would justify a note here.
  custody: null,
  // Derivations, policy values and authored judgements. Nothing here is a
  // record, nothing carries a sourceRef, and every role reads the same file.
  methodology: null,
  // The memo's UNISSUED drafts are withheld from an auditor — a draft is
  // internal management working paper, the same rule the PBC package applies
  // to unsealed workpaper versions. When no draft exists the auditor's file
  // is byte-identical to a Controller's and the note would over-claim, so it
  // is chosen from what was actually withheld rather than from the role.
  "close-memo": null,
};

/**
 * The close-memo file's absence line. Exported so a test can assert its
 * presence against the population without pinning the wording.
 */
export const MEMO_NO_VERSION_LINE = "No version exists - the memo has not been drafted";

export function buildCsv(user: DemoUser, table: ExportTable, correlationId: string): CsvTable {
  const queries = getQueries();
  const ctx = makeContext(user, correlationId);
  const manifest = queries.getRunManifest(ctx);
  const auditor = user.roles.includes("AUDITOR_READ_ONLY");
  const scopeNote = auditor ? AUDITOR_SCOPE_NOTES[table] : null;
  const lines = header(user, manifest, table, scopeNote);

  if (table === "inventory") {
    // Reads `listInventoryMaster`, the same query the screen's master table
    // reads — not `listInventoryUnits`.
    //
    // The first version of this handler read the raw fixture and asked it for
    // `accountingClassification` and `glAccount`. Neither field exists on
    // `InventoryItemFixture`: the classification is `classification`, and the
    // GL account is DERIVED in the services layer. So both columns emitted an
    // empty cell on all 1,500 rows — a header asserting that no unit in the
    // population has a GL account. An absence must be stated, never implied,
    // and this one was implied AND false.
    const master = queries.listInventoryMaster(ctx);
    lines.push(
      row([
        "Serial",
        "SKU",
        "Product",
        "Location",
        "Custodian",
        "Custody",
        "Classification",
        "GL account",
        "Ownership",
        "Unit cost",
        "Carrying value",
        "Acquired",
        "Last movement",
        "Age (days)",
        "Last count",
        "Count basis",
        // Two variance columns, not one. `InventoryMasterCount.basis` says
        // whether the count line NAMED this serial or covered its SKU and
        // location as a quantity; a single "Count variance" column put a
        // bin-level figure beside a serial and read as that unit's variance.
        // The screen makes the same split in words ("SKU / bin line — unit
        // not named"); the file makes it in columns.
        "Unit variance",
        "SKU / bin line variance",
        "Exceptions naming this unit",
      ]),
    );
    for (const unit of master.rows) {
      lines.push(
        row([
          unit.serial,
          unit.sku,
          unit.product,
          unit.location,
          unit.custodian ?? "",
          unit.custodyType,
          unit.classification,
          unit.glAccount,
          unit.ownership,
          formatCents(unit.unitCostCents),
          formatCents(unit.carryingCents),
          unit.acquiredAt ?? "",
          unit.lastMovementAt ?? "",
          unit.ageDays ?? "",
          unit.lastCount === undefined ? "No count line covers it" : unit.lastCount.planId,
          unit.lastCount === undefined
            ? ""
            : unit.lastCount.basis === "UNIT"
              ? "Unit named on the count line"
              : "SKU and location counted as a quantity — unit not named",
          unit.lastCount?.basis === "UNIT" ? unit.lastCount.variance : "",
          unit.lastCount !== undefined && unit.lastCount.basis === "SKU_LOCATION"
            ? unit.lastCount.variance
            : "",
          // Only exceptions that NAME this unit. A finding whose subject is a
          // SKU or a location covers a population the unit sits in; listing
          // those here would assert the unit is under exception when no rule
          // said so.
          unit.exceptions
            .filter((e) => e.identifiesUnit)
            .map((e) => e.exceptionId)
            .join("; "),
        ]),
      );
    }
  } else if (table === "exceptions") {
    // Blocker is its own column, read from `getBlockers`. Open and blocking
    // are different facts that happen to coincide on this baseline — all 7
    // open exceptions are blockers — and a file carrying only "OPEN" invites
    // a reader to treat the coincidence as the definition.
    const blocking = new Set(queries.getBlockers(ctx).map((b) => b.exceptionId));
    lines.push(
      row(["ID", "Title", "Rule", "Rule version", "Risk", "Status", "Open", "Blocks sign-off", "Exposure", "Unmet requirements"]),
    );
    for (const view of queries.listExceptions(ctx)) {
      const f = view.exception.finding;
      lines.push(
        row([
          view.exception.id,
          f.title,
          f.ruleId,
          f.ruleVersion,
          f.risk,
          view.exception.status,
          view.open ? "OPEN" : "RESOLVED",
          blocking.has(view.exception.id) ? "BLOCKER" : "",
          formatCents(f.exposureCents),
          f.evidenceRequirements
            .filter((r) => r.required && !r.satisfied)
            .map((r) => r.description)
            .join("; "),
        ]),
      );
    }
  } else if (table === "reconciliation") {
    const recon = queries.getReconciliation(ctx);
    lines.push(row(["Line", "Exception", "Amount"]));
    lines.push(row(["Gross subledger", "", formatCents(recon.subledgerCents)]));
    lines.push(row(["Gross GL", "", formatCents(recon.grossGlCents)]));
    lines.push(
      row([
        recon.differenceCents >= 0 ? "GL exceeds subledger" : "Subledger exceeds GL",
        "",
        formatCents(Math.abs(recon.differenceCents)),
      ]),
    );
    lines.push("");
    // Every reconciling item states that it is unposted, on its own row. The
    // screen makes the proposed/posted distinction with a literal tag rather
    // than a colour; a file that dropped the tag would make the unqualified
    // claim the screen exists to prevent.
    lines.push(row(["Reconciling item", "Exception", "Amount", "Posted"]));
    for (const item of recon.items) {
      lines.push(
        row([
          item.description,
          item.relatedExceptionId,
          formatCents(item.amountCents),
          "NOT POSTED",
        ]),
      );
    }
  } else if (table === "adjustments") {
    // One row per LINE, not per entry: a journal entry that cannot be read
    // line by line is not a journal entry a reviewer can check.
    lines.push(
      row([
        "Entry",
        "Exception",
        "Description",
        "Account",
        "Account description",
        "Memo",
        "Side",
        "Amount",
        "Balanced",
        "Approval",
        "Posted",
      ]),
    );
    for (const entry of queries.getAdjustmentRegister(ctx).entries) {
      const p = entry.proposal;
      if (p === undefined) {
        lines.push(
          row([
            "",
            entry.exceptionId,
            entry.description,
            "ACCOUNTING REVIEW REQUIRED",
            "The evidence on file does not establish which account carries the other side",
            entry.undraftedReason ?? "No entry drafted",
            "",
            formatCents(entry.amountCents),
            "",
            "Not drafted",
            "NOT POSTED",
          ]),
        );
        continue;
      }
      for (const line of p.lines) {
        lines.push(
          row([
            p.id,
            entry.exceptionId,
            p.description,
            line.account,
            glAccountDescription(line.account) ?? "",
            line.memo,
            line.amountCents >= 0 ? "DEBIT" : "CREDIT",
            formatCents(Math.abs(line.amountCents)),
            p.balanced ? "Balanced" : `Out of balance by ${formatCents(p.imbalanceCents)}`,
            p.approved ? "Approved" : "Not approved",
            "NOT POSTED",
          ]),
        );
      }
    }
  } else if (table === "evidence") {
    lines.push(row(["ID", "Title", "Kind", "Source", "Internal ID", "Sensitivity", "Content", "Hash"]));
    for (const item of queries.listEvidence(ctx)) {
      lines.push(
        row([
          item.id,
          item.title,
          item.kind,
          item.sourceRef?.sourceSystem ?? "",
          item.sourceRef?.internalId ?? "",
          item.sensitivity,
          // Withheld content is reported as withheld, never as blank: a blank
          // cell in a spreadsheet reads as "nothing there".
          item.contentWithheld ? "WITHHELD — restricted for this role" : "Readable",
          item.contentHash,
        ]),
      );
    }
  } else if (table === "procurement") {
    // One file, five populations, each under its own heading — a purchase
    // order can sit in more than one of them, and splitting them across
    // sheets would let a reader add up totals that overlap.
    const p = getProcurementPopulations(getWorkspace(), ctx);
    if (p.withheldOrderCount > 0 || p.withheldDocumentCount > 0) {
      // Two different omissions, reported separately: an order withheld whole
      // has no row at all, while an order that keeps its row can still be
      // missing a document. Reporting only the first understated the second.
      // The plurals are counted, not assumed — the auditor withholds exactly
      // one order, so a hard-coded "orders are" read "1 orders are" on every
      // run of this export.
      if (p.withheldOrderCount > 0) {
        lines.push(
          row([
            "Withheld",
            `${p.withheldOrderCount} ${plural(p.withheldOrderCount, "order is", "orders are")} outside this role's scope and ${plural(p.withheldOrderCount, "is", "are")} not in this file. The three-way match summary on the Procurement screen still counts the close's whole population of ${p.summary.orders} ${plural(p.summary.orders, "order")}.`,
          ]),
        );
      }
      if (p.withheldDocumentCount > 0) {
        lines.push(
          row([
            "Withheld",
            `${p.withheldDocumentCount} source ${p.withheldDocumentCount === 1 ? "document is" : "documents are"} outside this role's scope on ${p.withheldDocumentCount === 1 ? "an order that keeps its row" : "orders that keep their rows"}. Those cells read WITHHELD, never blank.`,
          ]),
        );
      }
      lines.push("");
    }
    lines.push(row(["THREE-WAY MATCH"]));
    lines.push(
      row([
        "Purchase order",
        "Vendor",
        "Order date",
        "Item receipt",
        "Receipt date",
        "Vendor bill",
        "Bill date",
        "Units",
        "Ordered",
        "Billed",
        "Position at period end",
        "Native NetSuite",
        "Close control",
        "Exception",
      ]),
    );
    for (const o of p.orders) {
      lines.push(
        row([
          o.purchaseOrderNumber,
          o.vendor,
          o.orderDate,
          documentCell(o.itemReceiptNumber, o.withheldDocuments.includes("ITEM_RECEIPT")),
          documentCell(o.receiptDate, o.withheldDocuments.includes("ITEM_RECEIPT")),
          documentCell(o.vendorBillNumber, o.withheldDocuments.includes("VENDOR_BILL")),
          documentCell(o.billDate, o.withheldDocuments.includes("VENDOR_BILL")),
          o.quantity,
          o.orderedCents === undefined ? "" : formatCents(o.orderedCents),
          o.billedCents === undefined ? "" : formatCents(o.billedCents),
          o.position,
          o.nativeNetsuiteMatchStatus,
          o.closeMatchStatus,
          o.relatedExceptionId ?? "",
        ]),
      );
    }
    lines.push("");
    lines.push(row(["RECEIVED NOT INVOICED"]));
    lines.push(
      row([
        "Purchase order",
        "Vendor",
        "Item receipt",
        "Received",
        "Units",
        "Value received",
        "Days outstanding at period end",
        "Bill since received",
        "Bill date",
      ]),
    );
    for (const g of p.grni) {
      lines.push(
        row([
          g.purchaseOrderNumber,
          g.vendor,
          g.itemReceiptNumber,
          g.receiptDate,
          g.quantity,
          g.receivedCents === undefined ? "" : formatCents(g.receivedCents),
          g.daysOutstanding,
          documentCell(g.vendorBillNumber, g.withheldDocuments.includes("VENDOR_BILL")),
          documentCell(g.billDate, g.withheldDocuments.includes("VENDOR_BILL")),
        ]),
      );
    }
    lines.push("");
    lines.push(row(["INVOICED NOT RECEIVED"]));
    lines.push(
      row([
        "Purchase order",
        "Vendor",
        "Vendor bill",
        "Billed",
        "Units",
        "Value billed",
        "Item receipt",
        "Receipt recorded",
        "Close control",
        "Exception",
      ]),
    );
    for (const i of p.invoicedNotReceived) {
      lines.push(
        row([
          i.purchaseOrderNumber,
          i.vendor,
          i.vendorBillNumber,
          i.billDate,
          i.quantity,
          i.billedCents === undefined ? "" : formatCents(i.billedCents),
          documentCell(i.itemReceiptNumber, i.withheldDocuments.includes("ITEM_RECEIPT")),
          documentCell(i.recordedReceiptDate, i.withheldDocuments.includes("ITEM_RECEIPT")),
          i.closeMatchStatus,
          i.relatedExceptionId ?? "",
        ]),
      );
    }
    lines.push("");
    lines.push(row(["GOODS IN TRANSIT"]));
    lines.push(row(["Side", "Units", "Value", "Note"]));
    const git = p.goodsInTransit;
    lines.push(
      row([
        "Documents — invoiced not received",
        git.documentUnits,
        git.documentCents === undefined ? "" : formatCents(git.documentCents),
        "Orders billed on or before the balance-sheet date whose receipt was recorded after it",
      ]),
    );
    lines.push(
      row([
        "Book — inbound in transit",
        git.inboundUnits,
        formatCents(git.inboundCents),
        // The two sides are one population; the file says so, because a
        // spreadsheet with both rows and no note invites a sum.
        git.inboundAgrees === null
          ? "NOT COMPARABLE at your access scope — the document side above is shorter than the orders that exist, and the book side is not scoped"
          : git.inboundAgrees
            ? "The same units as the row above, not an addition to them"
            : "DOES NOT AGREE with the document side above",
      ]),
    );
    lines.push(
      row([
        "Book — outbound in transit",
        git.outboundUnits,
        formatCents(git.outboundCents),
        "Shares account 1210; a commercial-chain population, not a procurement one",
      ]),
    );
    lines.push(
      row([
        `Account ${git.glAccount} total`,
        git.accountUnits,
        formatCents(git.accountCents),
        "Inbound plus outbound",
      ]),
    );
    lines.push("");
    lines.push(row(["PURCHASE PRICE VARIANCE"]));
    lines.push(
      row([
        "Purchase order",
        "Vendor",
        "Vendor bill",
        "Bill date",
        "SKU",
        "Units",
        "Standard / unit",
        "Ordered / unit",
        "Billed / unit",
        "Variance",
        "Direction",
      ]),
    );
    for (const v of p.priceVariance.rows) {
      lines.push(
        row([
          v.purchaseOrderNumber,
          v.vendor,
          v.vendorBillNumber,
          v.billDate,
          v.sku,
          v.quantity,
          v.standardUnitCents === undefined ? "" : formatCents(v.standardUnitCents),
          formatCents(v.orderedUnitCents),
          formatCents(v.billedUnitCents),
          formatCents(Math.abs(v.varianceCents)),
          v.direction,
        ]),
      );
    }
    lines.push("");
    lines.push(
      row([
        "Treatment",
        "Inventory is carried at standard cost, so purchase price variance is expensed in the period. No figure in this section is in the inventory subledger, the inventory accounts, or the inventory-to-GL reconciliation.",
      ]),
    );
  } else if (table === "costing") {
    // One file, both halves of "which costs belong in inventory" — and the
    // two halves must never be added. The capitalized side is already inside
    // the inventory balance; the period side never entered it. Each section
    // says which it is, in its own heading and again in its total row.
    const standards = getCostStandards(getWorkspace(), ctx);
    const classification = getCostClassification(getWorkspace(), ctx);

    lines.push(row(["STANDARD COST STACK — CAPITALIZED, ALREADY IN THE INVENTORY BALANCE"]));
    lines.push(
      row([
        "SKU",
        "Product",
        "Component",
        "Behaviour",
        "Amount / unit",
        "Rate source",
        "Effective from",
        "Standard / unit",
        "Units on hand",
        "Carried value",
        "Stack ties to standard",
      ]),
    );
    for (const r of standards.rows) {
      for (const c of r.components) {
        lines.push(
          row([
            r.sku,
            r.description,
            c.component,
            c.behavior,
            formatCents(c.amountCents),
            c.costSource,
            c.effectiveFrom,
            formatCents(r.standardUnitCents),
            r.onHandUnits,
            formatCents(r.carriedCents),
            // Measured per SKU, not asserted once for the file. A stack that
            // does not tie is the finding this column exists to carry.
            r.stackAgrees ? "YES" : `NO — components sum to ${formatCents(r.stackTotalCents)}`,
          ]),
        );
      }
    }
    lines.push("");
    lines.push(row(["DECOMPOSITION OF THE INVENTORY BALANCE"]));
    lines.push(row(["Component", "Behaviour", "Amount", "Share", "Basis for the behaviour"]));
    for (const t of standards.byComponent) {
      lines.push(
        row([
          t.component,
          t.behavior,
          formatCents(t.amountCents),
          `${(t.shareBps / 100).toFixed(2)}%`,
          t.basis,
        ]),
      );
    }
    lines.push(
      row([
        "Decomposed total",
        "",
        formatCents(standards.componentTotalCents),
        "",
        "Components extended over the units on the book",
      ]),
    );
    lines.push(
      row([
        "Inventory subledger",
        "",
        formatCents(standards.subledgerCents),
        "",
        "The close's own figure, reconciled to the general ledger",
      ]),
    );
    lines.push(
      row([
        "Components account for the whole balance",
        "",
        standards.decompositionAgrees ? "YES" : "NO",
        "",
        standards.decompositionAgrees
          ? "Every SKU's components tie to the standard it is carried at, no SKU is without a stack, and no unit is carried off standard"
          : `${standards.unitsWithoutStack} units belong to a SKU with no cost stack; ${standards.unitsOffStandard} units are carried off their SKU's standard`,
      ]),
    );
    lines.push("");
    lines.push(row(["PERIOD COSTS — EXPENSED, NEVER IN THE INVENTORY BALANCE"]));
    lines.push(
      row([
        "Pool",
        "Category",
        "Department",
        "Fiscal year",
        "GL account",
        "Treatment",
        "Amount",
        "Basis for exclusion",
      ]),
    );
    for (const r of classification.period.rows) {
      lines.push(
        row([
          r.id,
          r.category,
          r.department,
          r.fiscalYear,
          r.glAccount,
          r.treatment,
          formatCents(r.amountCents),
          r.basis,
        ]),
      );
    }
    lines.push(
      row([
        "Period total",
        "",
        "",
        "",
        "",
        "",
        formatCents(classification.period.totalCents),
        // The constraint is checked against the recorded balances, not
        // restated: this cell reports a measurement.
        classification.period.keptOutOfInventory
          ? "No account carrying one of these pools holds a recorded inventory balance, so none of this figure is inside the inventory-to-GL reconciliation"
          : `${classification.period.accountsInGlBalances.join(", ")} carries a period cost AND a recorded inventory balance — this amount is inside the gross GL figure`,
      ]),
    );
    lines.push("");
    lines.push(row(["COST OF SALES — INVENTORY RELIEF BY SALES ORDER"]));
    lines.push(row(["Sales order", "COGS state", "What the book shows", "Exception"]));
    for (const r of classification.cogs.rows) {
      lines.push(
        row([
          r.salesOrder,
          r.state,
          // The rule writes "… still on the year-end book" whenever fulfilled
          // serials are on hand, whatever the state — so an unshipped order
          // carries it too, with twenty serials on SO-26190. Printed beside
          // NOT_SHIPPED that reads as twenty units that failed to relieve.
          r.expectedOnBook
            ? "No fulfillment posted at the balance-sheet date, so there is nothing to relieve"
            : (r.note ?? "No fulfilled serial remains on the year-end book"),
          r.relatedExceptionId ?? "",
        ]),
      );
    }
    lines.push(
      row([
        "Basis",
        "",
        "Read from the O2C-CHAIN-001 inventory-relief component — whether the serials on a fulfillment are still in the year-end book population. That is evidence of relief, not a cost-of-sales journal entry read from the general ledger.",
        "",
      ]),
    );
  } else if (table === "custody") {
    // Three populations in one file, and the headings say which is which,
    // because the whole risk on this subject is a reader adding company-owned
    // stock held elsewhere to vendor-owned stock held here.
    //
    // Section headings use A–Z, space, parentheses, slash and hyphen only:
    // the affordance test's section splitter recognises nothing else as a
    // boundary, so a heading with an ampersand silently extends the section
    // above it.
    const custody = getCustodyBreakdown(getWorkspace(), ctx);
    const consignment = getConsignmentHoldings(getWorkspace(), ctx);
    const dispositions = getDispositions(getWorkspace(), ctx);

    lines.push(row(["PHYSICAL CUSTODY (COMPANY-OWNED STOCK)"]));
    lines.push(
      row([
        "Custody",
        "Held by",
        "Locations",
        "Named holders",
        "Units without a named holder",
        "Units",
        "Carrying value",
      ]),
    );
    for (const r of custody.rows) {
      lines.push(
        row([
          r.custodyType,
          holderLabel(r.heldBy),
          r.locations.join(" / "),
          r.custodians.length > 0 ? r.custodians.join(" / ") : "None recorded",
          r.unitsWithoutCustodian,
          r.units,
          formatCents(r.carryingCents),
        ]),
      );
    }
    lines.push(
      row([
        "Total on the listing",
        "",
        "",
        "",
        "",
        custody.bookUnits,
        formatCents(custody.bookCarryingCents),
      ]),
    );
    lines.push(
      row([
        "Custody accounts for the whole listing",
        custody.coversBook ? "YES" : "NO",
        "",
        "",
        "",
        "",
        custody.coversBook
          ? "Every unit resolves to exactly one custody answer and the rows total the inventory subledger"
          : `${custody.undeterminedUnits} units have no established custody`,
      ]),
    );
    lines.push("");
    // No comma and no digits: the suite's section splitter recognises only
    // A–Z, space, parentheses, slash and hyphen, so "CONSIGNMENT IN
    // (VENDOR-OWNED, NOT COMPANY INVENTORY)" and "… IN FY2026" were invisible
    // to it as boundaries — which is exactly what the comment above the
    // custody branch warns about, broken by the branch it annotates.
    lines.push(row(["CONSIGNMENT IN (VENDOR-OWNED / NOT COMPANY INVENTORY)"]));
    if (consignment.withheldRowCount > 0) {
      lines.push(
        row([
          "Withheld",
          `${consignment.withheldRowCount} holdings are outside this role's scope and are not in this file`,
        ]),
      );
    }
    lines.push(
      row([
        "Serial",
        "SKU",
        "Owner",
        "Agreement",
        "Location",
        "Bin",
        "Received",
        "Owner's stated value",
      ]),
    );
    for (const r of consignment.rows) {
      lines.push(
        row([
          r.serial,
          r.sku,
          r.owner,
          r.agreementRef,
          r.location,
          r.bin ?? "No bin recorded",
          r.receivedAt,
          formatCents(r.statedValueCents),
        ]),
      );
    }
    // The unit count goes in the label, not under "Received": this section's
    // header has no Units column, and a count sitting under a date heading is
    // a figure filed against the wrong fact.
    lines.push(
      row([
        `Total held on consignment (${consignment.units} units)`,
        "",
        "",
        "",
        "",
        "",
        "",
        formatCents(consignment.statedValueCents),
      ]),
    );
    lines.push(
      row([
        "Outside the inventory subledger",
        consignment.outsideSubledger ? "YES" : "NO",
        "",
        "",
        "",
        "",
        "",
        consignment.outsideSubledger
          ? "No serial held here appears on the year-end listing, and the listing is exactly what the close reports as the subledger - so none of this value is inside it"
          : `${consignment.consignedSerialsOnBook.join(", ")} appears both here and on the year-end listing`,
      ]),
    );
    // Branched on the measurement, like the screen. An unbranched sentence
    // saying the units were out of scope would contradict any non-zero count
    // in the cell beside it.
    lines.push(
      row([
        "Count lines reaching a consignment bin",
        consignment.countLinesTouchingConsignmentBins,
        "",
        "",
        "",
        "",
        "",
        consignment.countLinesTouchingConsignmentBins === 0
          ? "Nothing in the year-end count corroborates or contradicts these holdings. The counted population is drawn from book locations and these units are not on the book - but the count also runs floor-to-sheet tests that start from the floor, so this states what the count recorded, not what it could not have reached"
          : "The count recorded lines in a consignment bin, so it reached stock the company does not own",
      ]),
    );
    lines.push("");
    lines.push(row(["DISPOSITION (UNITS THAT LEFT THE BOOK IN THE YEAR)"]));
    if (dispositions.withheldRowCount > 0) {
      lines.push(
        row([
          "Withheld",
          `${dispositions.withheldRowCount} disposition records are outside this role's scope and are not in this file`,
        ]),
      );
    }
    lines.push(
      row([
        "Record",
        "Serial",
        "SKU",
        "Method",
        "Disposed",
        "Original cost",
        "Recovered",
        "Not recovered",
        "Authorised by",
        "Adjustment named",
        "Adjustment on file",
        "Certificate named",
        "Certificate on file",
        "Reason",
      ]),
    );
    for (const r of dispositions.rows) {
      lines.push(
        row([
          r.id,
          r.serial,
          r.sku,
          r.method,
          r.disposedAt,
          formatCents(r.originalCostCents),
          formatCents(r.proceedsCents),
          formatCents(r.lossCents),
          r.authorizedBy,
          r.adjustmentRef ?? "None named",
          // The reference and whether it resolves are two different facts, so
          // they are two different columns. A file that printed the number
          // alone would claim the close holds a record it does not.
          r.adjustmentOnFile ? "YES" : "NO",
          r.evidenceRef ?? "None named",
          r.evidenceOnFile ? "YES" : "NO",
          r.reason,
        ]),
      );
    }
    lines.push(
      row([
        "Total disposed",
        "",
        "",
        "",
        "",
        formatCents(dispositions.originalCostCents),
        formatCents(dispositions.proceedsCents),
        formatCents(dispositions.lossCents),
        "",
        "",
        String(dispositions.rowsWithAdjustmentOnFile),
        "",
        String(dispositions.rowsWithEvidenceOnFile),
        "Counts are the records whose named support the close actually holds",
      ]),
    );
    lines.push(
      row([
        "None of these units is on the listing",
        dispositions.removedFromBook ? "YES" : "NO",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        dispositions.removedFromBook
          ? "Checked against the year-end listing - a disposed unit left on the book would be counted twice"
          : `${dispositions.disposedSerialsOnBook.join(", ")} was disposed of and is still on the year-end listing`,
      ]),
    );
    lines.push("");
    lines.push(row(["BY METHOD"]));
    lines.push(row(["Method", "Units", "Original cost", "Recovered", "Not recovered"]));
    for (const m of dispositions.byMethod) {
      lines.push(
        row([
          m.method,
          m.units,
          formatCents(m.originalCostCents),
          formatCents(m.proceedsCents),
          formatCents(m.lossCents),
        ]),
      );
    }
    lines.push(
      row([
        "Note",
        "What each disposal realised is a fact about that unit. It is not a recovery rate, and no figure here is applied to anything still on the year-end listing.",
      ]),
    );
  } else if (table === "methodology") {
    // Section headings use A–Z, space, parentheses, slash and hyphen only:
    // the affordance test's section splitter recognises nothing else as a
    // boundary, so a heading with an ampersand or a digit silently extends
    // the section above it.
    const m = getMethodology(getWorkspace(), ctx);

    lines.push(row(["READINESS DERIVATION"]));
    lines.push(
      row([
        "Category",
        "Weight",
        "Score",
        "Weighted contribution",
        "Basis",
        "Term",
        "What the close state was",
        "Points removed",
        "Exceptions counted",
      ]),
    );
    for (const c of m.readiness.categories) {
      for (const [i, t] of c.terms.entries()) {
        lines.push(
          row([
            // The category identity travels on its first term only; a repeated
            // label under a "Category" heading reads as a second category.
            i === 0 ? c.label : "",
            i === 0 ? `${c.weightPercent}%` : "",
            i === 0 ? formatBpsExact(c.scoreHundredths) : "",
            // Read, never recomputed: the module header's rule is that no
            // figure is derived in this file, and the product of the two cells
            // to the left is a derivation even when it agrees.
            i === 0 ? c.weightedContribution : "",
            i === 0 ? c.basis : "",
            t.rule,
            t.observed,
            t.penaltyPercent === 0 ? "None" : t.penaltyPercent,
            t.drivingExceptionIds.length === 0 ? "" : t.drivingExceptionIds.join(" / "),
          ]),
        );
      }
    }
    lines.push(
      row([
        "Weighted sum",
        "",
        "",
        m.readiness.weightedSum,
        m.readiness.roundingRule,
        "",
        "",
        "",
        "",
      ]),
    );
    lines.push(
      row([
        // The unit is in the label, as it already is for the same figure in
        // the close-memo table: this cell sits under a "Weighted contribution"
        // header and is not one, and it stays a bare integer so a reader can
        // still check the division in a spreadsheet.
        "Close readiness (basis points)",
        "",
        "",
        m.readiness.totalBasisPoints,
        m.readinessDiverged
          ? `Live position. The rules on their own derived ${m.baselineReadinessBps} basis points; a management conclusion or a submitted record has moved it.`
          : "The derived baseline. Nothing recorded in this session has moved it.",
        "",
        "",
        "",
        "",
      ]),
    );
    lines.push(
      row([
        "Weights total",
        `${m.readiness.weightPercentTotal}%`,
        "",
        "",
        m.readiness.weightPercentTotal === 100
          ? "The weights total 100, so dividing the weighted sum by 100 yields basis points"
          : "The weights do NOT total 100, so the total above is not on the basis-point scale it claims",
        "",
        "",
        "",
        "",
      ]),
    );

    lines.push("");
    lines.push(row(["SUBLEDGER TO GENERAL LEDGER"]));
    lines.push(row(["Measure", "Value", "Basis"]));
    lines.push(
      row([
        "Subledger",
        formatCents(m.reconciliation.subledgerCents),
        `Unit cost of every unit on the year-end listing, summed over ${m.reconciliation.subledgerUnits} units`,
      ]),
    );
    lines.push(
      row([
        "Gross general ledger",
        formatCents(m.reconciliation.grossGlCents),
        `Recorded balances on accounts ${m.reconciliation.grossAccounts.join(" / ")}`,
      ]),
    );
    lines.push(
      row([
        "Excluded from gross",
        m.reconciliation.excludedAccount,
        `${m.reconciliation.excludedAccountDescription} - a reserve netted into gross inventory would understate the population being reconciled`,
      ]),
    );
    lines.push(
      row([
        "Difference",
        formatCents(m.reconciliation.differenceCents),
        m.reconciliation.signConvention,
      ]),
    );
    lines.push(
      row([
        "Explained by identified items",
        formatCents(m.reconciliation.explainedCents),
        `${m.reconciliation.items.length} items, derived from GL-side rule findings`,
      ]),
    );
    lines.push(
      row([
        "Unexplained",
        formatCents(m.reconciliation.unexplainedCents),
        m.reconciliation.fullyExplained
          ? "Applying every identified item would clear the difference exactly. Identified is not drafted, and drafted is not posted."
          : "Part of the difference has no identified reconciling item behind it.",
      ]),
    );
    lines.push("");
    lines.push(row(["RECONCILING ITEMS"]));
    lines.push(row(["Item", "Description", "Exception", "Effect on the ledger"]));
    for (const i of m.reconciliation.items) {
      lines.push(
        row([i.id, i.description, i.relatedExceptionId, formatCents(i.amountCents)]),
      );
    }

    lines.push("");
    lines.push(row(["INVENTORY ACCOUNTING MATRIX"]));
    lines.push(row(["Column", "Question", "Source", "Basis"]));
    for (const d of m.matrix.dimensions) {
      lines.push(row([d.label, d.question, d.provenance, d.basis]));
    }
    lines.push("");
    lines.push(row(["MATRIX ROWS"]));
    lines.push(
      row([
        "Classification",
        "GL account",
        "Units",
        "Carrying value",
        "Expected custody",
        "Observed custody",
        "Custody difference",
        "Ownership assertion",
        "Cost relief",
        "Cost relief basis",
        "Establishing record",
      ]),
    );
    for (const r of m.matrix.rows) {
      const difference = [
        r.unexpectedCustody.length > 0
          ? `resolves to ${r.unexpectedCustody.join(" / ")}, not expected`
          : "",
        r.unobservedCustody.length > 0
          ? `expects ${r.unobservedCustody.join(" / ")}, not reached`
          : "",
      ]
        .filter((s) => s !== "")
        .join("; ");
      lines.push(
        row([
          r.classification,
          `${r.glAccount} ${r.glAccountDescription}`,
          r.units,
          formatCents(r.carryingCents),
          r.expectedCustody.join(" / "),
          r.observedCustody.length === 0
            ? "No unit of this classification is on the listing"
            : r.observedCustody.join(" / "),
          difference === "" ? "As expected" : difference,
          r.ownershipAssertion,
          r.cogsRelief,
          r.cogsBasis,
          r.establishingRecord,
        ]),
      );
    }
    lines.push(
      row([
        "Custody expectation holds",
        m.matrix.custodyExpectationHolds ? "YES" : "NO",
        "",
        "",
        "",
        "",
        m.matrix.custodyExpectationHolds
          ? "Measured in both directions: no unit resolves to a custody type its row does not name, and no row names a custody type nothing reaches"
          : `Unexpected on ${m.matrix.rowsWithUnexpectedCustody.join(" / ") || "none"}; unreached expectation on ${m.matrix.rowsWithUnobservedCustody.join(" / ") || "none"}`,
        "",
        "",
        "",
        "",
      ]),
    );

    lines.push("");
    lines.push(row(["AUTHORED JUDGEMENTS"]));
    lines.push(row(["Question", "About", "The judgement", "Basis", "Held in"]));
    for (const i of m.interpretations) {
      lines.push(row([i.dimension, i.subject, i.answer, i.basis, i.heldIn]));
    }

    lines.push("");
    lines.push(row(["POLICY VALUES"]));
    lines.push(row(["Setting", "Value", "What it governs"]));
    for (const p of m.policyValues) {
      lines.push(row([p.key, p.value, p.governs]));
    }

    lines.push("");
    lines.push(row(["NOT COVERED BY THE REPRODUCIBILITY CHECK"]));
    lines.push(row(["Exclusion"]));
    for (const x of m.replayExclusions) {
      lines.push(row([x]));
    }
  } else if (table === "close-memo") {
    const memo = getMemo(getWorkspace(), ctx);

    lines.push(row(["CLOSE POSITION THIS MEMO DESCRIBES"]));
    lines.push(row(["Measure", "Value"]));
    lines.push(row(["Balance-sheet date", memo.position.asOf]));
    lines.push(row(["Units on the listing", memo.position.bookUnits]));
    lines.push(row(["Inventory subledger", formatCents(memo.position.subledgerCents)]));
    lines.push(row(["Gross inventory in the general ledger", formatCents(memo.position.grossGlCents)]));
    lines.push(row(["Difference", formatCents(memo.position.differenceCents)]));
    lines.push(row(["Reconciling items identified", memo.position.reconcilingItemCount]));
    lines.push(row(["Unexplained", formatCents(memo.position.unexplainedCents)]));
    lines.push(row(["Exceptions raised", memo.position.exceptionCount]));
    lines.push(row(["Exceptions open", memo.position.openExceptionCount]));
    lines.push(row(["Blockers", memo.position.blockerCount]));
    lines.push(row(["Blocker exposure", formatCents(memo.position.blockerExposureCents)]));
    lines.push(row(["Close readiness (basis points)", memo.position.readinessBps]));
    lines.push(row(["Audit requests ready", `${memo.position.pbcReady} of ${memo.position.pbcTotal}`]));
    lines.push(row(["Period", memo.position.periodState]));
    lines.push(row(["Note", memo.notPartOfClose]));

    lines.push("");
    lines.push(row(["VERSION HISTORY"]));
    // Stated from what was actually withheld, never from the viewer's role: at
    // baseline no draft exists, so an auditor's file is byte-identical to a
    // Controller's and a scope line here would claim a redaction that did not
    // happen.
    if (memo.withheldNote !== null) {
      lines.push(row(["Withheld", memo.withheldNote]));
    }
    // `memo.versions` is the ROLE-SCOPED list, so `length === 0` means
    // "nothing you may see", not "nothing exists". Conjoined with
    // `withheldDraftCount === 0` it is exactly `ws.memoVersions.length === 0`,
    // so the absence is stated from the population rather than from the view —
    // and the column header is emitted only when there is a row for it,
    // because a header over nothing is the same over-claim one row smaller.
    if (memo.versions.length === 0 && memo.withheldDraftCount === 0) {
      lines.push(row([MEMO_NO_VERSION_LINE]));
    } else if (memo.versions.length > 0) {
      lines.push(
        row(["Version", "State", "Lock", "Title", "Recorded at", "By", "Content hash", "Close-state hash"]),
      );
      for (const v of memo.versions) {
        lines.push(
          row([
            v.label,
            v.state,
            v.sealed ? "SEALED" : v.editable ? "EDITABLE" : "ARCHIVED",
            v.title,
            v.at,
            // The same wording the screen uses. A file naming "U-002" beside
            // a screen naming "M. Reyes · Controller" is two surfaces
            // describing one fact differently, which is a finding even when
            // both are individually defensible.
            `${userById(v.byUserId).displayName} · ${roleLabel(userById(v.byUserId))}`,
            v.contentHash ?? "Not sealed",
            v.closeStateHash ?? "Not sealed",
          ]),
        );
      }
    }

    lines.push("");
    lines.push(row(["ISSUED TEXT"]));
    if (memo.issued === null) {
      lines.push(row(["No version has been issued"]));
    } else {
      lines.push(row(["Title", memo.issued.title]));
      // One cell, newlines intact: RFC 4180 quoting carries them, and
      // splitting the body into rows would invent paragraph boundaries the
      // writer did not put there.
      lines.push(row(["Memo", memo.issued.body]));
      lines.push(
        row([
          "Still describes this close",
          memo.positionMoved === null
            ? "Not compared"
            : memo.positionMoved
              ? "NO - the close has moved since this version was sealed"
              : "YES - the close position still hashes to what was sealed",
        ]),
      );
    }
  } else if (table === "physical-count") {
    const summary = queries.getCountSummary(ctx);
    const detail = queries.getCountDetail(ctx);
    // The summary is the YEAR-END count only (CANONICAL_SPEC §6); the
    // sections below carry every plan, cycle counts included. Two different
    // populations under one heading is how "4 variance rows" ends up beside
    // a results block holding more, so each block names its own scope.
    const yearEndPlans = detail.plans.filter((p) => p.countType === "YEAR_END");
    lines.push(row(["COUNT SUMMARY — YEAR-END COUNT ONLY"]));
    lines.push(row(["Measure", "Value", "Scope"]));
    lines.push(row(["Count population (units)", summary.populationUnits, "Year-end count, counted locations only — not the 1,500-unit book population"]));
    lines.push(row(["First-pass matched (units)", summary.firstPassMatchedUnits, "Year-end count"]));
    lines.push(row(["First-pass variance rows", summary.varianceRows, "Year-end count"]));
    lines.push(row(["Controlled movements during the count", summary.movements, "Year-end count window"]));
    lines.push(row(["Management-selected test counts", summary.managementTests, "Year-end count"]));
    lines.push(row(["Auditor-selected test counts", summary.auditorTests, "Year-end count"]));
    lines.push(
      row([
        "Count plans in this file",
        detail.plans.length,
        `${yearEndPlans.length} year-end, ${detail.plans.length - yearEndPlans.length} cycle/spot — the sections below span ALL of them, so their row counts exceed the year-end figures above`,
      ]),
    );
    lines.push("");
    lines.push(row(["COUNT PLANS — ALL PLANS"]));
    lines.push(
      row(["Plan", "Type", "Snapshot", "Source status", "Approved by", "Approved at", "Next count due", "Rejected reason"]),
    );
    for (const p of detail.plans) {
      lines.push(
        row([
          p.id,
          p.countType,
          p.snapshotAt,
          p.sourceStatus ?? "",
          p.approvedBy ?? "",
          p.approvedAt ?? "",
          // The overdue indicators below cite this date; without it the file
          // asserts a cell is overdue against a due date it does not contain.
          p.nextCountDue ?? "",
          p.rejectedReason ?? "",
        ]),
      );
    }
    lines.push("");
    lines.push(row(["COUNT RESULTS — ALL PLANS"]));
    lines.push(
      row(["Plan", "Plan type", "SKU", "Location", "Bin", "Serial", "Snapshot qty", "Counted qty", "Adjusted qty", "Variance"]),
    );
    const planType = new Map(detail.plans.map((p) => [p.id, p.countType]));
    for (const r of detail.results) {
      lines.push(
        row([
          r.countPlanId,
          planType.get(r.countPlanId) ?? "",
          r.sku,
          r.location,
          r.bin ?? "",
          // A count line that names no serial counted a SKU and location as a
          // quantity. Blank would read as "this line has no serial recorded";
          // the line genuinely does not identify one.
          r.serial ?? "Not serial-identified",
          r.snapshotQuantity,
          r.countQuantity,
          r.adjustedQuantity ?? "",
          r.variance,
        ]),
      );
    }
    lines.push("");
    lines.push(row(["TEST COUNTS"]));
    lines.push(
      row(["ID", "Plan", "Selected by", "Selection source", "Direction", "SKU", "Location", "Bin", "Serial", "Recorded at", "Observation", "Traced"]),
    );
    for (const t of detail.tests) {
      lines.push(
        row([
          t.id,
          t.countPlanId,
          // Recorded verbatim; for auditor selections this is the external
          // auditor, never a Gaurd user. Gaurd records these, it never makes
          // them.
          t.selectedBy,
          t.selectionSource,
          t.direction,
          t.sku,
          t.location,
          t.bin ?? "",
          t.serial ?? "Not serial-identified",
          t.recordedAt,
          // What the tester actually saw, and whether it traced. Without
          // these the one test that did NOT trace — the floor-to-sheet
          // discovery behind EXC-004 — is indistinguishable from the rest.
          t.observation,
          t.traced ? "TRACED" : "DID NOT TRACE",
        ]),
      );
    }
    lines.push("");
    lines.push(row(["MOVEMENTS DURING THE COUNT WINDOW"]));
    lines.push(
      row(["ID", "Serial", "SKU", "Quantity", "From", "To", "Moved at", "Authorized by", "Reason"]),
    );
    for (const m of detail.movements) {
      lines.push(
        row([
          m.id,
          // Five of the six movements name no serial. Without the quantity
          // beside it such a row carries neither an identity nor a size.
          m.serial ?? "Not serial-identified",
          m.sku,
          m.quantity,
          m.fromLocation,
          m.toLocation,
          m.movedAt,
          m.authorizedBy,
          m.reason,
        ]),
      );
    }
    lines.push("");
    lines.push(row(["COUNT-LINKED INVENTORY ADJUSTMENTS"]));
    lines.push(row(["Adjustment", "Date", "GL account", "Count plan", "Reason", "SKU", "Quantity", "Amount"]));
    for (const a of detail.adjustments) {
      for (const l of a.lines) {
        lines.push(
          row([
            a.transactionNumber,
            a.adjustmentDate,
            a.glAccount,
            a.relatedCountPlanId ?? "Not linked to a count plan",
            a.reason,
            l.sku,
            l.quantity,
            l.amountCents === undefined ? "" : formatCents(l.amountCents),
          ]),
        );
      }
    }
    lines.push("");
    lines.push(row(["MANAGEMENT CYCLE-COUNT INDICATORS"]));
    if (detail.managementIndicators.length === 0) {
      lines.push(
        row([
          auditor
            ? "Withheld — a management risk lens, not audit support"
            : "None raised on this population",
        ]),
      );
    } else {
      // These are RuleFindings, not a bespoke indicator shape. The first
      // draft cast them to {countPlanId, kind, note} and would have written
      // three empty cells per row — a table of blanks asserting the
      // indicators carry nothing.
      lines.push(
        row(["Rule", "Rule version", "Indicator", "Why flagged", "Risk", "SKUs", "Locations"]),
      );
      for (const i of detail.managementIndicators) {
        lines.push(
          row([
            i.ruleId,
            i.ruleVersion,
            i.title,
            i.whyFlagged,
            i.risk,
            (i.subjects.skus ?? []).join("; "),
            (i.subjects.locations ?? []).join("; "),
          ]),
        );
      }
    }
    lines.push("");
    lines.push(
      row([
        "Note",
        "These are management indicators, not auditor reliance or sampling conclusions. Gaurd records the external auditor's test-count selections; it never makes them.",
      ]),
    );
  } else if (table === "valuation") {
    const v = queries.getValuation(ctx);
    lines.push(row(["RESERVE POSITION"]));
    lines.push(row(["Measure", "Value"]));
    lines.push(row(["Recorded reserve (GL 1290)", formatCents(v.reserve.recordedCents)]));
    // The literal type in ValuationOut forbids a rule emitting an amount.
    // The file must not be the place one appears.
    lines.push(row(["This period's conclusion", v.reserve.conclusion]));
    lines.push(row(["Basis", v.reserve.conclusionNote]));
    lines.push(row(["Slow-moving threshold (days)", v.slowMovingAgeDays]));
    lines.push("");
    lines.push(row(["INVENTORY AGING"]));
    lines.push(row(["Band", "From (days)", "To (days)", "Units", "Carrying value"]));
    for (const b of v.aging) {
      lines.push(
        row([
          b.label,
          b.fromDays ?? "",
          b.toDays ?? "",
          b.units,
          formatCents(b.carryingCents),
        ]),
      );
    }
    // Unknown age is its own row and is never folded into a band: a unit
    // whose age cannot be established is not a fresh one.
    lines.push(
      row([
        "Age not established",
        "",
        "",
        v.unknownAgeUnits,
        formatCents(v.unknownAgeCarryingCents),
      ]),
    );
    lines.push("");
    lines.push(row(["REVIEW POPULATIONS"]));
    lines.push(
      row([
        "Each row is an independent filter over the same book, so a unit can appear in more than one. These rows are lenses, not segments: do not total them.",
      ]),
    );
    lines.push(row(["Population", "Basis", "Units", "Carrying value"]));
    for (const p of v.populations) {
      lines.push(row([p.label, p.basis, p.units, formatCents(p.carryingCents)]));
    }
    lines.push("");
    // Selected by LOCATION alone — the RMA/Repair area is a different
    // location and is NOT in this section. The heading used to say "DAMAGED
    // AND RMA UNITS", naming a population the rows do not contain.
    lines.push(row(["DAMAGED / HOLD UNITS"]));
    lines.push(
      row([
        "Selected by location in the inventory listing. A unit appears here because of where it sits, not because an assessment is outstanding — each row states its own.",
      ]),
    );
    lines.push(
      row(["Serial", "SKU", "Carrying value", "RMA", "Reason", "Exception", "Assessment"]),
    );
    const exceptionsById = new Map(
      queries.listExceptions(ctx).map((e) => [e.exception.id, e]),
    );
    for (const d of v.damaged) {
      const view = d.exceptionId === undefined ? undefined : exceptionsById.get(d.exceptionId);
      lines.push(
        row([
          d.serial,
          d.sku,
          formatCents(d.carryingCents),
          // Absences stated, never blank: a unit with no RMA record has none,
          // and a unit no rule evaluated has no assessment to report.
          d.rmaId ?? "No RMA record",
          d.reason ?? "No reason recorded",
          d.exceptionId ?? "",
          view === undefined
            ? "No assessment on file"
            : view.open
              ? "Assessment outstanding"
              : "Assessment concluded",
        ]),
      );
    }
    lines.push("");
    lines.push(row(["OPEN VALUATION REVIEWS"]));
    lines.push(row(["Exception", "Title", "Exposure", "Status", "SKUs", "Units"]));
    for (const r of v.reserve.openReviews) {
      lines.push(
        row([
          r.exceptionId,
          r.title,
          formatCents(r.exposureCents),
          r.status,
          r.skus.join("; "),
          r.units,
        ]),
      );
    }
    lines.push("");
    // This note closes the RESERVE-RELATED sections above it, and it is
    // scoped to them by name. It used to be the file's last row, and Stage E
    // inserted three methodology sections between it and what it described —
    // so a file-level sentence calling every carrying value "gross exposure"
    // ended up sitting under a figure the same file explicitly says is not an
    // exposure. A closing note has to name what it closes.
    lines.push(
      row([
        "Note on the sections above",
        "Every population in the aging, review and damaged sections identifies stock for review. None of them is a write-down, and their carrying values are gross exposure — never a proposed reserve. No rule in this product can emit a reserve amount.",
      ]),
    );
    lines.push("");
    // Stage E's methodology sections go HERE — after every reserve-related
    // block, never between them. The affordance test slices RESERVE POSITION
    // to the next heading matching /"[A-Z][A-Z ()\/—-]{6,}"/, so a section
    // inserted above with a heading that regex does not recognise would
    // silently extend the reserve block and its dollar figures with it.
    const eo = getEoMethodology(getWorkspace(), ctx);
    lines.push(row(["OBSOLESCENCE INDICATORS BY SKU"]));
    lines.push(
      row([
        "SKU",
        "Product",
        "On hand",
        "Slow-moving units",
        "Carrying value of slow-moving units",
        "Forecast units",
        "Horizon months",
        "Months of supply",
        "Units beyond the horizon",
        "Carrying value beyond the horizon",
        "Met the age test",
        "Met the demand test",
        "Under review",
        "Forecast note",
      ]),
    );
    for (const s of eo.signals) {
      lines.push(
        row([
          s.sku,
          s.description,
          s.onHandUnits,
          s.agedUnits,
          formatCents(s.agedCarryingCents),
          // An absent forecast is stated. An empty cell would read as zero
          // demand, which is a far stronger claim than "not on file".
          s.forecastUnits === undefined ? "No forecast on file" : s.forecastUnits,
          s.horizonMonths ?? "",
          s.monthsOfSupply === undefined ? "Not derivable" : s.monthsOfSupply.toFixed(1),
          s.excessOverHorizonUnits,
          formatCents(s.excessOverHorizonCents),
          s.metAgeTest ? "YES" : "NO",
          s.metForecastTest ? "YES" : "NO",
          s.underReview ? "YES" : "NO",
          s.forecastNote ?? "",
        ]),
      );
    }
    lines.push(
      row([
        "Beyond the horizon",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        eo.excessOverHorizonUnits,
        formatCents(eo.excessOverHorizonCents),
        "",
        "",
        "",
        "Carrying value of a population, NOT an exposure and not a proposed write-down. No recovery rate has been applied to it because none is on file.",
      ]),
    );
    lines.push(row(["Basis", eo.basisNote]));
    lines.push("");
    lines.push(row(["AGING BASIS"]));
    lines.push(row(["Measure", "Value"]));
    lines.push(row(["Policy basis", "Last movement to the balance-sheet date"]));
    lines.push(row(["Threshold days", eo.agingBasis.thresholdDays]));
    lines.push(row(["Units aged on the policy basis", eo.agingBasis.agedOnPolicyBasis]));
    lines.push(
      row([
        "Units aged measured from acquisition instead",
        eo.agingBasis.agedOnAcquisitionBasis,
      ]),
    );
    lines.push(
      row(["Units with no last-movement date", eo.agingBasis.unitsWithoutMovementDate]),
    );
    lines.push(
      row(["Units with no acquisition date", eo.agingBasis.unitsWithoutAcquisitionDate]),
    );
    lines.push(
      row([
        "Aging evidence complete",
        eo.agingBasis.ageBasisComplete ? "YES" : "NO",
        eo.agingBasis.ageBasisComplete
          ? "Every unit carries the date the policy basis needs, so the aged population is a measurement rather than a floor"
          : "Some units carry no last-movement date, so the aged population is a floor",
      ]),
    );
    lines.push("");
    lines.push(row(["CONDITION AND RECOVERY EVIDENCE"]));
    lines.push(row(["Measure", "Value", "Note"]));
    lines.push(
      row([
        "Units with a condition record",
        eo.condition.unitsWithConditionRecord,
        eo.condition.source,
      ]),
    );
    lines.push(row(["Units with none", eo.condition.unitsWithoutConditionRecord, ""]));
    lines.push(
      row(["Condition reasons recorded", eo.condition.recordedReasons.join("; "), ""]),
    );
    lines.push(
      row([
        "SKUs with an observed FY2026 selling price",
        eo.recovery.skusWithObservedPrice,
        "",
      ]),
    );
    lines.push(
      row([
        "SKUs with no observed selling price",
        eo.recovery.skusWithoutObservedPrice.join("; ") || "None",
        "Named rather than left blank - a blank cell would read as a price of zero",
      ]),
    );
    lines.push(
      row([
        "Costs to complete and sell on file",
        eo.recovery.costsToSellOnFile ? "YES" : "NO",
        "Net realisable value needs both a price and the costs to sell",
      ]),
    );
    lines.push(
      row([
        "Net realisable value computed",
        eo.recovery.nrvComputed ? "YES" : "NO",
        "No recovery rate is applied to anything on the year-end listing",
      ]),
    );
    lines.push("");
    lines.push(
      row([
        "Note on the methodology sections",
        "These sections describe HOW this close looks at obsolescence. Nothing in them is a reserve, a reserve range, a recovery rate or a net realisable value, and the carrying values here are what a population is carried at — not an exposure and not a proposed write-down. The reserve conclusion is UNDETERMINED and is management's. No rule in this product can emit a reserve amount.",
      ]),
    );
  } else if (table === "close-summary") {
    // The Overview's own figures. Each population below is exported IN FULL
    // by another table; this file is the one-page management summary, and it
    // says so rather than letting a reader take it for the whole close.
    const readiness = queries.getCloseReadiness(ctx);
    const recon = queries.getReconciliation(ctx);
    const health = queries.getSourceHealth(ctx);
    const agg = readiness.aggregates;
    lines.push(row(["SIGN-OFF POSITION"]));
    lines.push(row(["Measure", "Value", "Basis"]));
    lines.push(
      row([
        "Sign-off blockers",
        agg.blockerCount,
        "Open exceptions that prevent management sign-off",
      ]),
    );
    lines.push(row(["Blocker exposure", formatCents(agg.blockerExposureCents), "Open blockers only"]));
    lines.push(
      row([
        "Close readiness",
        `${agg.closeReadinessBps} bps`,
        "A management workflow measure — not audit assurance and not a statement of financial-statement accuracy",
      ]),
    );
    lines.push(row(["Readiness policy", readiness.policyVersion, "The weighting this score was computed under"]));
    lines.push("");
    lines.push(row(["CLOSE AREAS"]));
    lines.push(row(["Area", "Weight (%)", "Score (hundredths of a percent)"]));
    for (const c of readiness.categories) {
      lines.push(row([c.label, c.weightPercent, c.scoreHundredths]));
    }
    lines.push("");
    lines.push(row(["EXCEPTION POPULATION"]));
    lines.push(row(["Measure", "Value"]));
    lines.push(row(["Designed exceptions", agg.exceptionCount]));
    lines.push(row(["Open", agg.openExceptionCount]));
    lines.push(row(["Resolved", agg.resolvedExceptionCount]));
    lines.push(row(["Total designed exposure", formatCents(agg.designedExceptionExposureCents)]));
    lines.push("");
    lines.push(row(["BLOCKERS"]));
    lines.push(row(["Exception", "Description", "Exposure"]));
    for (const b of queries.getBlockers(ctx)) {
      lines.push(row([b.exceptionId, b.description, formatCents(b.exposureCents)]));
    }
    lines.push("");
    lines.push(row(["INVENTORY TO GL — GROSS"]));
    lines.push(row(["Measure", "Value"]));
    lines.push(row(["Gross subledger", formatCents(recon.subledgerCents)]));
    lines.push(row(["Gross GL", formatCents(recon.grossGlCents)]));
    lines.push(
      row([
        recon.differenceCents >= 0 ? "GL exceeds subledger" : "Subledger exceeds GL",
        formatCents(Math.abs(recon.differenceCents)),
      ]),
    );
    lines.push(row(["Recorded reserve (1290, reconciled separately)", formatCents(recon.reserveCents)]));
    lines.push("");
    lines.push(row(["PBC PACKAGE"]));
    lines.push(row(["Measure", "Value"]));
    lines.push(row(["Ready or provided", `${agg.pbcReady} of ${agg.pbcTotal}`]));
    lines.push(row(["PBC readiness", `${agg.pbcReadinessBps} bps`]));
    lines.push("");
    lines.push(row(["SOURCE AND CONTROL HEALTH"]));
    lines.push(row(["Source system", "State", "Last sync", "Note"]));
    for (const s of health.sources) {
      lines.push(row([s.sourceSystem, s.status, s.lastSyncAt ?? "", s.note ?? ""]));
    }
    // Every domain divides by the same 100 (`aggregateHealthBasisPoints`) —
    // the nine carry EQUAL weight. "Weighted" here, thirty lines under a
    // table whose own column is headed "Weight (%)", read as though the
    // domains were weighted like the close areas. They are not.
    lines.push(
      row([
        "Aggregate",
        `${health.aggregateBasisPoints} bps`,
        "",
        "Mean across the nine source domains, each counting equally",
      ]),
    );
    lines.push("");
    // Whether THIS reader can fetch the pbc table, asked of the same
    // authorized service that table calls rather than of a role list here.
    // Warehouse, Supply Chain and Legal hold close.read but not pbc.read: the
    // two counts above are the only PBC figures they ever see, and
    // /api/export/pbc answers them 403. A note sending them there would
    // promise an availability that does not exist.
    const pbcReadable = attempt(() => queries.getPbcPackage(ctx)) !== undefined;
    lines.push(
      row([
        "Note",
        pbcReadable
          ? "A summary. Every population counted here is exported in full by its own table — exceptions, reconciliation, adjustments, evidence, pbc, inventory, procurement, physical-count and valuation."
          : "A summary. Every population counted here is exported in full by its own table — exceptions, reconciliation, adjustments, evidence, inventory, procurement, physical-count and valuation — except the PBC package, which is outside your role's scope: the two counts above are all of it you can read.",
      ]),
    );
  } else {
    const pbc = queries.getPbcPackage(ctx);
    // "Latest sealed version" is the figure the screen renders, and it is NOT
    // `versions.length`: an unsealed working draft counts in the array and is
    // not a provided version. The file said "1 version" on the fourteen rows
    // whose screen said "None provided". The sealed figure comes first, and
    // the raw count keeps its own column so neither has to stand in for the
    // other.
    lines.push(
      row([
        "ID",
        "Request",
        "Owner",
        "State",
        "Latest sealed version",
        "Versions visible",
        "Versions withheld",
        "Blocked by",
      ]),
    );
    for (const item of pbc) {
      lines.push(
        row([
          item.id,
          item.title,
          item.owner,
          item.status,
          // The screen's own words for the absent case, so the two agree.
          item.latestVersion === undefined ? "None provided" : `v${item.latestVersion}`,
          item.versions.length,
          // Never silently zero: a scope that hid versions says how many.
          item.withheldVersionCount,
          item.blockedBy.join("; "),
        ]),
      );
    }
  }

  return {
    filename: `icg-${table}-${manifest?.runId ?? "run"}.csv`,
    // CRLF per RFC 4180, and a BOM so Excel reads the em dashes as UTF-8
    // rather than as mojibake. Written as an escape, never as a literal
    // zero-width character in source nobody can see.
    body: `\uFEFF${lines.join("\r\n")}\r\n`,
  };
}
