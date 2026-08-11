// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { userByRole } from "@icg/data";
import { CostingScreen } from "../components/CostingScreen";
import { buildShellData } from "../lib/server/data";
import { buildCostingData } from "../lib/server/costing-view";
import { buildCsv } from "../lib/server/export-csv";
import { formatCents } from "../lib/format";
import { getWorkspace, makeContext } from "../lib/server/workspace";
import { getCostClassification, getCostStandards } from "@icg/services";

/**
 * Stage D — costing regressions.
 *
 * Two claims on this screen are the kind this codebase keeps re-learning not
 * to make: that the $4,800,000 decomposes into five components, and that the
 * period-cost pools never reach an inventory account. Both are TRUE on this
 * baseline, which is exactly why they are dangerous — prose asserting either
 * would pass every test forever and start lying the moment the data moved.
 * These pin that both sentences are rendered from a measurement.
 *
 * The third is narrower and was found by reading the actual output rather
 * than the code: `O2C-CHAIN-001` writes "… still on the year-end book"
 * whenever fulfilled serials are on hand, whatever the chain's state — so an
 * order that never shipped carries the same sentence, twenty serials long on
 * SO-26190. Printed beside "Not shipped" it reports twenty units as having
 * failed to relieve.
 */

afterEach(cleanup);
const noopRole = vi.fn(async () => {});
const user = (role: Parameters<typeof userByRole>[0] = "CONTROLLER") => userByRole(role);

const renderCosting = (
  role: Parameters<typeof userByRole>[0] = "CONTROLLER",
  tab?: string,
) =>
  render(
    <CostingScreen
      shell={buildShellData(user(role), "T-D")}
      data={buildCostingData(user(role), "T-D")}
      {...(tab !== undefined ? { initialTab: tab } : {})}
      setRoleAction={noopRole}
    />,
  );

const ctx = () => makeContext(user(), "T-D");
const csv = () => buildCsv(user(), "costing", "T-D").body;

/** A labelled row's cell at a given column: pins the value to its own place. */
const cellAt = (body: string, label: string, column: number): string => {
  const line = body.split("\r\n").find((l) => l.startsWith('"' + label + '"'));
  expect(line, `no row labelled ${label}`).toBeDefined();
  return (line ?? "").slice(1, -1).split('","')[column] ?? "";
};

describe("the decomposition sentence is a measurement, not a claim", () => {
  it("states agreement only because the service measured it", () => {
    const std = getCostStandards(getWorkspace(), ctx());
    expect(std.decompositionAgrees).toBe(true);
    renderCosting("CONTROLLER", "stack");
    expect(
      screen.getByText(/The five components account for the whole inventory balance\./),
    ).toBeTruthy();
    // The figures in the sentence are the service's, bound to it rather than
    // typed into it. $4,800,000 appears in several places on this screen, so
    // the assertion is made INSIDE the sentence.
    const detail = screen.getByText(/Extended over the units on the book, the standard/);
    expect(detail.textContent).toContain("$4,800,000");

    // A screen that can only say "agrees" is prose with a boolean in front of
    // it. The sentence must not be a literal in the component at all — both
    // branches live in the view builder and are CHOSEN by the measurement.
    const component = readFileSync(
      join(import.meta.dirname, "..", "components", "CostingScreen.tsx"),
      "utf8",
    );
    expect(component).not.toContain("account for the whole inventory balance");
    const view = readFileSync(
      join(import.meta.dirname, "..", "lib", "server", "costing-view.ts"),
      "utf8",
    );
    expect(view).toContain("The five components account for the whole inventory balance.");
    expect(view).toContain("The components do not account for the whole inventory balance.");
    expect(view).toContain("standards.decompositionAgrees");
    // Same rule for the containment sentence on the period tab.
    expect(component).not.toContain("reaches an inventory account");
    expect(view).toContain("classification.period.keptOutOfInventory");
  });

  it("puts every component column over its own figures", () => {
    // The first draft took the column headings from `rows[0].components`,
    // which describes fourteen SKUs by the shape of the first. Columns now
    // come from the service's union and each row is laid out against it.
    renderCosting("CONTROLLER", "stack");
    const std = getCostStandards(getWorkspace(), ctx());
    const columns = buildCostingData(user(), "T-D").stack?.componentColumns ?? [];
    // The view's columns are the service's types, one for one — not a list
    // the web layer maintains beside them.
    expect(columns.length).toBe(std.componentTypes.length);
    const table = screen.getByRole("table") as HTMLTableElement;
    const headings = [...table.querySelectorAll("thead th")].map((th) => th.textContent);
    for (const column of columns) {
      expect(headings, column).toContain(column);
    }
    // Every body row carries exactly as many cells as there are headings.
    for (const tr of table.querySelectorAll("tbody tr")) {
      expect(tr.querySelectorAll("td").length).toBe(headings.length);
    }
    // And every component cell holds that SKU's own figure for that column.
    // A blank under a component heading asserts the SKU carries none of that
    // cost; a figure in the wrong column is worse.
    const rows = [...table.querySelectorAll("tbody tr")];
    expect(rows.length).toBe(std.rows.length);
    for (const tr of rows) {
      const cells = [...tr.querySelectorAll("td")];
      const sku = cells[0]?.textContent ?? "";
      const stack = std.rows.find((r) => r.sku === sku);
      expect(stack, sku).toBeDefined();
      std.componentTypes.forEach((type, i) => {
        const cents = stack?.components.find((c) => c.component === type)?.amountCents;
        expect(cents, `${sku} ${type}`).toBeDefined();
        const shown = (cells[2 + i]?.textContent ?? "").trim();
        expect(shown, `${sku} ${type}`).toBe(formatCents(cents ?? 0));
      });
    }
  });
});

describe("the period pools say what was checked", () => {
  it("reports containment against the recorded balances", async () => {
    const cls = getCostClassification(getWorkspace(), ctx());
    expect(cls.period.keptOutOfInventory).toBe(true);
    renderCosting("CONTROLLER", "period");
    expect(
      screen.getByText(/None of these pools reaches an inventory account\./),
    ).toBeTruthy();
    // "Checked … not assumed" is only allowed because the service checks.
    expect(screen.getByText(/Checked against the recorded balances, not assumed/)).toBeTruthy();
    // Every pool's own basis reaches the screen — the reason a cost was kept
    // out is the whole content of this tab.
    for (const row of cls.period.rows) {
      expect(screen.getByText(row.basis), row.id).toBeTruthy();
    }
  });

  it("never puts the expensed total beside the capitalized one as a sum", async () => {
    const cls = getCostClassification(getWorkspace(), ctx());
    renderCosting("CONTROLLER", "classification");
    // Both figures appear on the behaviour tab. The one thing that must never
    // appear is their total.
    const combined = formatCents(cls.capitalized.totalCents + cls.period.totalCents);
    expect(screen.queryByText(combined)).toBeNull();
    expect(screen.getByText(/Never entered inventory\. Not part of the figure beside it\./))
      .toBeTruthy();
  });
});

describe("a COGS state never reports an expected condition as a finding", () => {
  it("keeps the rule's serial list off every not-shipped row", async () => {
    const cls = getCostClassification(getWorkspace(), ctx());
    const misleading = cls.cogs.rows.filter(
      (r) => r.expectedOnBook && (r.note ?? "").includes("still on the year-end book"),
    );
    // The trap must exist in the data, or this proves nothing.
    expect(misleading.length).toBeGreaterThan(0);

    renderCosting("CONTROLLER", "cogs");
    const table = screen.getByRole("table");
    for (const row of misleading) {
      const cell = within(table).getByText(row.salesOrder).closest("tr");
      expect(cell, row.salesOrder).toBeTruthy();
      const text = cell?.textContent ?? "";
      expect(text, row.salesOrder).toContain("Not shipped");
      expect(text, row.salesOrder).toContain("nothing to relieve");
      // Neither the sentence nor the serials it names.
      expect(text, row.salesOrder).not.toContain("still on the year-end book");
      for (const serial of (row.note ?? "").split(",").slice(0, 3)) {
        const trimmed = serial.trim().split(" ")[0] ?? "";
        if (trimmed.length < 4) continue;
        expect(text, `${row.salesOrder} names ${trimmed}`).not.toContain(trimmed);
      }
    }
  });

  it("still shows the rule's own words where they ARE the finding", async () => {
    const cls = getCostClassification(getWorkspace(), ctx());
    const unrelieved = cls.cogs.rows.filter((r) => r.state === "NOT_RELIEVED");
    expect(unrelieved.length).toBeGreaterThan(0);
    renderCosting("CONTROLLER", "cogs");
    const table = screen.getByRole("table");
    for (const row of unrelieved) {
      const tr = within(table).getByText(row.salesOrder).closest("tr");
      const text = tr?.textContent ?? "";
      expect(text, row.salesOrder).toContain("Not relieved");
      // Verbatim, not paraphrased.
      expect(text, row.salesOrder).toContain(row.note ?? "");
      expect(text, row.salesOrder).toContain(row.relatedExceptionId ?? "");
    }
  });

  it("opens the close's own exception from the unrelieved row", async () => {
    const cls = getCostClassification(getWorkspace(), ctx());
    const row = cls.cogs.rows.find((r) => r.relatedExceptionId !== null);
    expect(row).toBeDefined();
    renderCosting("CONTROLLER", "cogs");
    // `.click()` does not flush React state in jsdom.
    await userEvent.click(
      screen.getByRole("button", { name: `Open ${row?.relatedExceptionId} summary` }),
    );
    expect(screen.getAllByText(new RegExp(row?.relatedExceptionId ?? "")).length).toBeGreaterThan(1);
  });
});

describe("the costing file carries what the screen shows", () => {
  it("writes both halves and never totals them", () => {
    const body = csv();
    const std = getCostStandards(getWorkspace(), ctx());
    const cls = getCostClassification(getWorkspace(), ctx());
    for (const heading of [
      "STANDARD COST STACK — CAPITALIZED, ALREADY IN THE INVENTORY BALANCE",
      "DECOMPOSITION OF THE INVENTORY BALANCE",
      "PERIOD COSTS — EXPENSED, NEVER IN THE INVENTORY BALANCE",
      "COST OF SALES — INVENTORY RELIEF BY SALES ORDER",
    ]) {
      expect(body, heading).toContain(heading);
    }
    // Bound to their own labels and columns. "$4,800,000" appears several
    // times in this file, so a bare toContain proves nothing about where it
    // sits — the amount column of this section is index 2.
    expect(cellAt(body, "Inventory subledger", 2)).toBe("$4,800,000");
    expect(cellAt(body, "Decomposed total", 2)).toBe(formatCents(std.componentTotalCents));
    expect(cellAt(body, "Components account for the whole balance", 2)).toBe("YES");
    expect(cellAt(body, "Period total", 6)).toBe(formatCents(cls.period.totalCents));
    // The two halves are never added.
    expect(body).not.toContain(
      formatCents(std.componentTotalCents + cls.period.totalCents),
    );
  });

  it("carries every SKU's every component with its rate source", () => {
    const body = csv();
    const std = getCostStandards(getWorkspace(), ctx());
    const expected = std.rows.reduce((n, r) => n + r.components.length, 0);
    const dataRows = body
      .split("\r\n")
      .filter((l) => /^"K[EVAGR]-/.test(l) && l.includes('","'));
    expect(dataRows.length).toBe(expected);
    // The source behind each rate is the evidence a cost stack is worth
    // anything at all; the screen says the file carries it, so it must.
    for (const row of std.rows) {
      for (const c of row.components) {
        expect(body, `${row.sku} ${c.component}`).toContain(c.costSource);
      }
    }
  });

  it("gives the not-shipped rows the same framing the screen gives them", () => {
    const body = csv();
    const cls = getCostClassification(getWorkspace(), ctx());
    const section = body.slice(body.indexOf("COST OF SALES"));
    for (const row of cls.cogs.rows.filter((r) => r.expectedOnBook)) {
      const line = section.split("\r\n").find((l) => l.startsWith('"' + row.salesOrder + '"'));
      expect(line, row.salesOrder).toBeDefined();
      expect(line, row.salesOrder).toContain("nothing to relieve");
      expect(line, row.salesOrder).not.toContain("still on the year-end book");
    }
    // And the unrelieved one keeps the rule's words.
    for (const row of cls.cogs.rows.filter((r) => r.state === "NOT_RELIEVED")) {
      const line = section.split("\r\n").find((l) => l.startsWith('"' + row.salesOrder + '"'));
      expect(line, row.salesOrder).toContain(row.note ?? "");
    }
  });

  it("states the basis for the COGS states rather than implying a GL check", () => {
    // "Not relieved" must never read as "we looked at the general ledger and
    // found no cost-of-sales entry". The basis is the chain component.
    const body = csv();
    expect(body).toContain("evidence of relief, not a cost-of-sales journal entry");
    renderCosting("CONTROLLER", "cogs");
    expect(
      screen.getByText(/evidence of relief, not a cost-of-sales journal entry/),
    ).toBeTruthy();
  });
});
