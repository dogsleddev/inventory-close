import { describe, expect, it } from "vitest";
import { userByRole } from "@icg/data";
import { EXPORT_TABLES, buildCsv, isExportTable } from "../lib/server/export-csv";
import { getQueries, makeContext } from "../lib/server/workspace";

/**
 * CSV export. The risk in an export is not that it renders badly — it is
 * that it becomes a side door around the authorization the screens enforce,
 * or that it hands someone a spreadsheet with no way to tell what produced
 * it. These are regressions for both.
 */

function csv(role: Parameters<typeof userByRole>[0], table: (typeof EXPORT_TABLES)[number]) {
  return buildCsv(userByRole(role), table, "T-EXPORT");
}

describe("CSV export — provenance travels with the file", () => {
  it("names the run, the dataset and the role on every table", () => {
    const manifest = getQueries().getRunManifest(makeContext(userByRole("CONTROLLER"), "T-EXPORT"));
    for (const table of EXPORT_TABLES) {
      const out = csv("CONTROLLER", table);
      expect(out.body, table).toContain(manifest.runId);
      expect(out.body, table).toContain(manifest.datasetVersion);
      expect(out.body, table).toContain("Controller");
      // A spreadsheet outlives the tab it came from.
      expect(out.body, table).toContain("SYNTHETIC DEMO");
      expect(out.filename, table).toMatch(/^icg-.*\.csv$/);
    }
  });

  it("quotes every field so a memo with a comma cannot shift a column", () => {
    const out = csv("CONTROLLER", "adjustments");
    const dataLines = out.body.split("\r\n").filter((l) => l.length > 0);
    for (const line of dataLines) {
      expect(line.startsWith('"') || line.startsWith("﻿\""), line.slice(0, 40)).toBe(true);
    }
  });

  it("rejects a table name it does not know", () => {
    expect(isExportTable("inventory")).toBe(true);
    expect(isExportTable("payroll")).toBe(false);
  });
});

describe("CSV export — the same scope the screens have", () => {
  it("gives an auditor a narrower evidence export, and says it is narrower", () => {
    const controller = csv("CONTROLLER", "evidence");
    const auditor = csv("AUDITOR_READ_ONLY", "evidence");
    const rows = (body: string) => body.split("\r\n").filter((l) => l.startsWith('"EV-')).length;
    expect(rows(auditor.body)).toBeLessThan(rows(controller.body));
    // A shorter file must say why, or it reads as the whole population.
    expect(auditor.body).toContain("Auditor scope");
    expect(controller.body).not.toContain("Auditor scope");
  });

  it("reports withheld content as withheld rather than as an empty cell", () => {
    const preparer = csv("PREPARER", "evidence");
    expect(preparer.body).toContain("WITHHELD");
  });

  it("never exports a figure the caller's screens would not show", () => {
    // The handler reads QueryService only; this pins the consequence rather
    // than the implementation — a restricted evidence body must not appear.
    const auditor = csv("AUDITOR_READ_ONLY", "evidence");
    expect(auditor.body).not.toMatch(/ownership\/acceptance provision text/i);
  });
});

describe("CSV export — the register is readable line by line", () => {
  it("writes one row per journal-entry line with its side and account description", () => {
    const out = csv("CONTROLLER", "adjustments");
    expect(out.body).toContain("DEBIT");
    expect(out.body).toContain("CREDIT");
    expect(out.body).toContain("Inventory — Finished / Other");
    // Every row states posting status; nothing here has been posted.
    expect(out.body).toContain("NOT POSTED");
  });

  it("carries the undrafted item with its offset stated as a requirement", () => {
    const register = getQueries().getAdjustmentRegister(
      makeContext(userByRole("CONTROLLER"), "T-EXPORT"),
    );
    const undrafted = register.entries.filter((e) => e.proposal === undefined);
    expect(undrafted.length).toBeGreaterThan(0);
    const out = csv("CONTROLLER", "adjustments");
    expect(out.body).toContain("ACCOUNTING REVIEW REQUIRED");
  });
});

/**
 * The exported file is where a withheld document is least recoverable: no
 * screen wording applies, no drawer note travels with it, and an empty cell in
 * a spreadsheet reads as "there is nothing there". The review plan named this
 * the highest-value gap in its own coverage, and it was right — the scope note
 * at the top of this table already promised that "an order that keeps its row
 * loses only the cells for its own withheld documents" while those cells were
 * simply blank.
 */
describe("CSV export — a withheld document is not an absent one", () => {
  const line = (body: string, po: string): string =>
    body.split("\n").find((l) => l.startsWith(`"${po}"`)) ?? "";

  it("marks the withheld cells and leaves every derived fact agreeing", () => {
    const auditor = csv("AUDITOR_READ_ONLY", "procurement").body;
    const controller = csv("CONTROLLER", "procurement").body;
    const a = line(auditor, "PO-26-1201");
    const c = line(controller, "PO-26-1201");
    expect(a).not.toBe("");
    // The receipt this auditor may not read.
    expect(c).toContain("IR-26-2214");
    expect(a).not.toContain("IR-26-2214");
    expect(a).toContain("WITHHELD");
    // And every fact the close derived is identical: the cutoff position and
    // the exception link. A visibility-derived position wrote
    // INVOICED_NOT_RECEIVED into this cell and dropped EXC-014 beside it.
    expect(a).toContain("MATCHED_IN_PERIOD");
    expect(a).toContain("EXC-014");
    expect(c).toContain("MATCHED_IN_PERIOD");
  });

  it("does not put a manufactured cutoff row in the auditor's file", () => {
    const auditor = csv("AUDITOR_READ_ONLY", "procurement").body;
    const inr = auditor.slice(auditor.indexOf("INVOICED NOT RECEIVED"));
    const section = inr.slice(0, inr.indexOf("\n\n"));
    expect(section).toContain("PO-26-1241");
    expect(section).not.toContain("PO-26-1201");
  });

  it("counts the two kinds of omission separately and in words that fit", () => {
    const auditor = csv("AUDITOR_READ_ONLY", "procurement").body;
    // An order withheld whole has no row; a document withheld on a row that
    // stays is a different omission, and reporting only the first understated
    // the second. Both are exactly one here, which is why the plurals matter.
    expect(auditor).toContain("1 order is outside this role's scope");
    expect(auditor).toContain("1 source document is outside this role's scope");
    expect(auditor).not.toMatch(/\b1 orders\b/);
    expect(auditor).not.toMatch(/\b1 source documents\b/);
    // The Controller withholds nothing, so neither line may appear.
    expect(csv("CONTROLLER", "procurement").body).not.toContain("outside this role's scope\"");
  });
});
