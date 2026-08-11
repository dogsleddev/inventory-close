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
