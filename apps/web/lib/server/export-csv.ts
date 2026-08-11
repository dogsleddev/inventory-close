import type { DemoUser } from "@icg/data";
import { glAccountDescription } from "@icg/domain";
import { formatCents } from "../format";
import { getQueries, makeContext, roleLabel } from "./workspace";

/**
 * CSV export.
 *
 * Nothing could leave this product before: an audit team could read every
 * screen and retain none of it. These handlers are the way out — and they
 * are deliberately narrow.
 *
 * Two rules govern every table below, and a reviewer should check both:
 *
 *   1. **QueryService only.** No handler may touch `@icg/data` or the raw
 *      workspace dataset. Every row comes through the same authorized reads
 *      the screens use, so auditor scoping and restricted-content redaction
 *      apply to an export exactly as they apply to a page. An export that
 *      read the fixtures directly would be a side door around both.
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

export function buildCsv(user: DemoUser, table: ExportTable, correlationId: string): CsvTable {
  const queries = getQueries();
  const ctx = makeContext(user, correlationId);
  const manifest = queries.getRunManifest(ctx);
  const auditor = user.roles.includes("AUDITOR_READ_ONLY");
  const scopeNote = auditor
    ? "Auditor scope — provided support only. Records behind workpapers that have not been provided are withheld."
    : null;
  const lines = header(user, manifest, table, scopeNote);

  if (table === "inventory") {
    lines.push(
      row(["Serial", "SKU", "Location", "Classification", "GL account", "Unit cost", "Acquired", "Last movement"]),
    );
    for (const u of queries.listInventoryUnits(ctx)) {
      const unit = u as {
        serial: string;
        sku: string;
        location: string;
        accountingClassification?: string;
        unitCostCents: number;
        acquiredAt?: string;
        lastMovementAt?: string;
        glAccount?: string;
      };
      lines.push(
        row([
          unit.serial,
          unit.sku,
          unit.location,
          unit.accountingClassification ?? "",
          unit.glAccount ?? "",
          formatCents(unit.unitCostCents),
          unit.acquiredAt ?? "",
          unit.lastMovementAt ?? "",
        ]),
      );
    }
  } else if (table === "exceptions") {
    lines.push(
      row(["ID", "Title", "Rule", "Rule version", "Risk", "Status", "Open", "Exposure", "Unmet requirements"]),
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
    lines.push(row(["Reconciling item", "Exception", "Amount"]));
    for (const item of recon.items) {
      lines.push(row([item.description, item.relatedExceptionId, formatCents(item.amountCents)]));
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
  } else {
    const pbc = queries.getPbcPackage(ctx);
    lines.push(
      row(["ID", "Request", "Owner", "State", "Versions visible", "Versions withheld", "Blocked by"]),
    );
    for (const item of pbc) {
      lines.push(
        row([
          item.id,
          item.title,
          item.owner,
          item.status,
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
    // CRLF per RFC 4180, and a BOM so Excel reads the em dashes and the
    // pound-free currency strings as UTF-8 rather than as mojibake.
    body: `﻿${lines.join("\r\n")}\r\n`,
  };
}
