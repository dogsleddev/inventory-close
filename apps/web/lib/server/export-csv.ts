import type { DemoUser } from "@icg/data";
import { glAccountDescription } from "@icg/domain";
import { getProcurementPopulations } from "@icg/services";
import { formatCents } from "../format";
import { getQueries, getWorkspace, makeContext, roleLabel } from "./workspace";

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

export const EXPORT_TABLES = [
  "inventory",
  "exceptions",
  "reconciliation",
  "adjustments",
  "evidence",
  "pbc",
  "procurement",
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
  inventory: null,
  exceptions: null,
  reconciliation: null,
  adjustments: null,
};

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
    if (p.withheldOrderCount > 0) {
      lines.push(
        row([
          "Withheld",
          `${p.withheldOrderCount} orders are outside this role's scope and are not in this file`,
        ]),
      );
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
          o.itemReceiptNumber ?? "",
          o.receiptDate ?? "",
          o.vendorBillNumber ?? "",
          o.billDate ?? "",
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
          g.vendorBillNumber ?? "",
          g.billDate ?? "",
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
          i.itemReceiptNumber ?? "",
          i.recordedReceiptDate ?? "",
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
        git.inboundAgrees
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
