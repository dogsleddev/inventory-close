import { describe, expect, it } from "vitest";
import { userByRole } from "@icg/data";
import { getCustodyBreakdown } from "@icg/services";
import { buildCsv } from "../lib/server/export-csv";
import { getQueries, getWorkspace, makeContext } from "../lib/server/workspace";

/**
 * Cells that a spreadsheet reads differently from a person.
 *
 * A CSV is not a screen. An empty cell under a numeric header is not "no
 * value" to Excel — it is zero in every per-row formula and it is skipped in
 * a SUM. This file guards the cells where that difference changes what the
 * file asserts.
 */

const controller = userByRole("CONTROLLER");
const body = (table: Parameters<typeof buildCsv>[1]): string =>
  buildCsv(controller, table, "T-CSV-CELLS").body;

/** Rows of one named section, split into cells. */
function section(csv: string, heading: string): { header: string[]; rows: string[][] } {
  const lines = csv.split("\n");
  const start = lines.findIndex((l) => l.includes(heading));
  expect(start, `section not found: ${heading}`).toBeGreaterThan(-1);
  const parse = (l: string): string[] =>
    (l.match(/"((?:[^"]|"")*)"/g) ?? []).map((c) => c.slice(1, -1).replace(/""/g, '"'));
  const header = parse(lines[start + 1] as string);
  const rows: string[][] = [];
  for (const line of lines.slice(start + 2)) {
    if (line.trim() === "") break;
    rows.push(parse(line));
  }
  return { header, rows };
}

describe("G77 — the Adjusted qty column is never blank", () => {
  const COL = "Adjusted qty";

  it("marks every row the source posted no adjustment for", () => {
    const { header, rows } = section(body("physical-count"), "COUNT RESULTS");
    const i = header.indexOf(COL);
    expect(i).toBeGreaterThan(-1);

    const blank = rows.filter((r) => (r[i] ?? "") === "");
    // 905 of 906 rows carried no adjusted quantity and were emitted blank,
    // which reads as 905 lines adjusted DOWN TO ZERO in any formula.
    expect(blank, `${blank.length} blank cells in "${COL}"`).toEqual([]);
  });

  it("still emits the real figure where one exists, as a number", () => {
    // Without this the fix could have replaced every cell with prose and
    // passed the assertion above while destroying the column.
    const { header, rows } = section(body("physical-count"), "COUNT RESULTS");
    const i = header.indexOf(COL);
    const numeric = rows.filter((r) => /^[0-9]+$/.test(r[i] ?? ""));
    expect(numeric.length).toBeGreaterThan(0);
    // ...and the marker is not itself a number, or the two are
    // indistinguishable to the spreadsheet this exists to protect.
    const marked = rows.filter((r) => !/^[0-9]+$/.test(r[i] ?? ""));
    expect(marked.length).toBeGreaterThan(0);
    for (const r of marked) expect(Number.isNaN(Number(r[i]))).toBe(true);
    expect(numeric.length + marked.length).toBe(rows.length);
  });
});

describe("G78 — the book population is read, not typed", () => {
  it("states a figure the service actually holds", () => {
    const ctx = makeContext(controller, "T-CSV-CELLS");
    const bookUnits = getCustodyBreakdown(getWorkspace(), ctx).bookUnits;
    const row = body("physical-count")
      .split("\n")
      .find((l) => l.includes("Count population (units)"));
    expect(row).toBeDefined();

    // Compared against the service, so a regenerated dataset breaks this test
    // rather than leaving the cell asserting a size the close no longer holds.
    expect(row).toContain(`${bookUnits.toLocaleString("en-US")}-unit book population`);

    // And the counted population in the same row is the service's too, so the
    // two figures in one sentence cannot come from different eras.
    const summary = getQueries().getCountSummary(ctx);
    expect(row).toContain(`"${summary.populationUnits}"`);
    expect(summary.populationUnits).toBeLessThan(bookUnits);
  });
});
