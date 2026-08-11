// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userByRole } from "@icg/data";
import { getGlAccountReconciliation } from "@icg/services";
import { ReconciliationScreen } from "../components/ReconciliationScreen";
import { buildShellData } from "../lib/server/data";
import { buildReconciliationData } from "../lib/server/recon-view";
import { getQueries, getWorkspace, makeContext } from "../lib/server/workspace";
import { formatCents } from "../lib/format";

/**
 * Inventory GL accounts on the Financial tab (COMPLETION_PLAN §4).
 *
 * The product reconciled inventory to the GL in total and never per account.
 * These tests hold the three claims the table makes: every figure comes from
 * the service, the rows sum to the bridge's own totals, and the reserve is
 * presented apart from gross inventory rather than netted into it.
 */

afterEach(cleanup);

const noopRole = vi.fn(async () => {});
type Role = Parameters<typeof userByRole>[0];

function services(role: Role = "CONTROLLER") {
  const user = userByRole(role);
  return { user, queries: getQueries(), ctx: makeContext(user, "T-GLAV") };
}

function accountsView(role: Role = "CONTROLLER") {
  const { ctx } = services(role);
  return getGlAccountReconciliation(getWorkspace(), ctx);
}

function renderRecon(role: Role = "CONTROLLER") {
  const user = userByRole(role);
  return render(
    <ReconciliationScreen
      shell={buildShellData(user, "T-GLAV")}
      data={buildReconciliationData(user, "", "T-GLAV")}
      setRoleAction={noopRole}
    />,
  );
}

const panel = () =>
  screen.getByText("Inventory GL accounts").closest("section") as HTMLElement;

const dataRows = () =>
  within(panel())
    .getAllByRole("row")
    .slice(1); // drop the header row

describe("the account table renders beneath the bridge on the Financial tab", () => {
  it("appears on the default tab, after the named bridge", () => {
    renderRecon();
    const bridge = screen.getByText("Inventory subledger-to-GL reconciliation");
    const table = screen.getByText("Inventory GL accounts");
    expect(
      bridge.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("carries the seven designed columns", () => {
    renderRecon();
    const headers = within(panel())
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    expect(headers).toEqual([
      "Account",
      "Description",
      "Subledger",
      "GL",
      "Difference",
      "Related Exceptions",
      "Status",
    ]);
  });

  it("renders one row per gross account plus the gross total", () => {
    const view = accountsView();
    renderRecon();
    expect(dataRows()).toHaveLength(view.accounts.length + 1);
    for (const account of view.accounts) {
      expect(within(panel()).getByText(account.account)).toBeTruthy();
      expect(within(panel()).getByText(account.description)).toBeTruthy();
    }
  });

  it("takes every figure from the service rather than the component", () => {
    const view = accountsView();
    renderRecon();
    for (const account of view.accounts) {
      const row = within(panel()).getByText(account.account).closest("tr") as HTMLElement;
      const cells = within(row)
        .getAllByRole("cell")
        .map((c) => c.textContent ?? "");
      expect(cells[2]).toBe(formatCents(account.subledgerCents));
      expect(cells[3]).toBe(formatCents(account.glCents));
      expect(cells[4]).toBe(formatCents(account.differenceCents));
    }
  });
});

describe("the rows sum to the locked reconciliation totals", () => {
  it("prints a gross total equal to the bridge's subledger, GL and difference", () => {
    const { queries, ctx } = services();
    const bridge = queries.getReconciliation(ctx);
    renderRecon();
    const total = within(panel()).getByText("Gross inventory").closest("tr") as HTMLElement;
    const cells = within(total)
      .getAllByRole("cell")
      .map((c) => c.textContent ?? "");
    expect(cells[2]).toBe(formatCents(bridge.subledgerCents));
    expect(cells[3]).toBe(formatCents(bridge.grossGlCents));
    expect(cells[4]).toBe(formatCents(bridge.differenceCents));
  });

  it("keeps the printed rows adding up to the printed total", () => {
    // The screen is read back, so a formatting or filtering slip in the view
    // layer fails here even when the service is right.
    const view = accountsView();
    renderRecon();
    const printed = view.accounts.map((account) => {
      const row = within(panel()).getByText(account.account).closest("tr") as HTMLElement;
      return within(row)
        .getAllByRole("cell")
        .map((c) => c.textContent ?? "");
    });
    const cents = (text: string) =>
      (text.startsWith("(") ? -1 : 1) * Number(text.replace(/[^0-9.]/g, "")) * 100;
    const sum = (i: number) => printed.reduce((n, cells) => n + cents(cells[i] ?? "$0"), 0);
    const total = within(panel()).getByText("Gross inventory").closest("tr") as HTMLElement;
    const totalCells = within(total)
      .getAllByRole("cell")
      .map((c) => c.textContent ?? "");
    expect(sum(2)).toBe(cents(totalCells[2] ?? ""));
    expect(sum(3)).toBe(cents(totalCells[3] ?? ""));
    expect(sum(4)).toBe(cents(totalCells[4] ?? ""));
  });
});

describe("the reserve is presented apart from gross inventory", () => {
  it("gives 1290 its own block with a note that it is out of the gross bridge", () => {
    const view = accountsView();
    expect(view.reserve).not.toBeNull();
    renderRecon();
    // Never a row in the account table.
    const accountCells = dataRows().map(
      (r) => within(r).getAllByRole("cell")[0]?.textContent ?? "",
    );
    expect(accountCells).not.toContain(view.reserve?.account);
    // …and its own block, carrying the recorded credit balance.
    const label = within(panel()).getByText(
      new RegExp(`${view.reserve?.description}.*${view.reserve?.account}`),
    );
    expect(label).toBeTruthy();
    expect(
      within(panel()).getByText(formatCents(view.reserve?.glCents ?? 0)),
    ).toBeTruthy();
    expect(within(panel()).getByText(/excluded from the gross bridge/)).toBeTruthy();
    expect(within(panel()).getByText(/never netted into the accounts above/)).toBeTruthy();
  });

  it("never lets the reserve move the gross total", () => {
    const { queries, ctx } = services();
    const bridge = queries.getReconciliation(ctx);
    const view = accountsView();
    renderRecon();
    const netted = formatCents(bridge.grossGlCents + (view.reserve?.glCents ?? 0));
    const total = within(panel()).getByText("Gross inventory").closest("tr") as HTMLElement;
    expect(within(total).queryByText(netted)).toBeNull();
    expect(within(total).getByText(formatCents(bridge.grossGlCents))).toBeTruthy();
  });
});

describe("related exceptions are attributed, never assumed", () => {
  it("lists each account's own items and links them to the exception", () => {
    const view = accountsView();
    renderRecon();
    for (const account of view.accounts) {
      const row = within(panel()).getByText(account.account).closest("tr") as HTMLElement;
      const cell = within(row).getAllByRole("cell")[5] as HTMLElement;
      if (account.items.length === 0) {
        expect(within(cell).queryAllByRole("link")).toHaveLength(0);
        expect(cell.textContent).toMatch(/^None/);
        continue;
      }
      const links = within(cell).getAllByRole("link");
      expect(links.map((l) => l.textContent)).toEqual(
        account.items.map((i) => i.relatedExceptionId),
      );
      for (const item of account.items) {
        expect(
          within(cell).getByText(item.relatedExceptionId).getAttribute("href"),
        ).toBe(`/exceptions/${item.relatedExceptionId}`);
      }
    }
  });

  it("places every identified item on exactly one account row", () => {
    const { queries, ctx } = services();
    const bridge = queries.getReconciliation(ctx);
    renderRecon();
    const listed = dataRows().flatMap((r) => {
      const cell = within(r).getAllByRole("cell")[5];
      return cell === null || cell === undefined
        ? []
        : within(cell as HTMLElement)
            .queryAllByRole("link")
            .map((l) => l.textContent ?? "");
    });
    expect(listed.sort()).toEqual(
      bridge.items.map((i) => i.relatedExceptionId).sort(),
    );
  });
});

describe("Status is a reconciliation state, not an exception workflow status", () => {
  it("reads Reconciled or Open reconciling items, per account", () => {
    const view = accountsView();
    renderRecon();
    for (const account of view.accounts) {
      const row = within(panel()).getByText(account.account).closest("tr") as HTMLElement;
      const cell = within(row).getAllByRole("cell")[6] as HTMLElement;
      expect(cell.textContent).toContain(
        account.differenceCents === 0 ? "Reconciled" : "Open reconciling items",
      );
    }
  });

  it("never borrows the exception queue's status vocabulary", () => {
    const { queries, ctx } = services();
    renderRecon();
    const statusCells = dataRows().map(
      (r) => within(r).getAllByRole("cell")[6]?.textContent ?? "",
    );
    // Every status word the exception queue uses for these same exceptions.
    const workflowWords = new Set(
      queries.listExceptions(ctx).map((e) => String(e.exception.status)),
    );
    for (const text of statusCells) {
      for (const word of workflowWords) {
        expect(text).not.toContain(word);
      }
      expect(text).not.toMatch(/blocker/i);
    }
    // The table says what the column means rather than leaving it to be read
    // as a conclusion.
    expect(within(panel()).getByText(/It is not an exception workflow status/)).toBeTruthy();
  });

  it("adds no blocker and no exception to the close", () => {
    const { queries, ctx } = services();
    const before = {
      exceptions: queries.listExceptions(ctx).length,
      blockers: queries.getBlockers(ctx).length,
    };
    renderRecon();
    expect(queries.listExceptions(ctx)).toHaveLength(before.exceptions);
    expect(queries.getBlockers(ctx)).toHaveLength(before.blockers);
  });
});

describe("access", () => {
  it("shows the table to the auditor, who reads the same close", () => {
    renderRecon("AUDITOR_READ_ONLY");
    expect(screen.getByText("Inventory GL accounts")).toBeTruthy();
  });

  it("renders no account table for a role without close access", () => {
    renderRecon("SYSTEM_ADMIN");
    expect(screen.getByText("Access restricted")).toBeTruthy();
    expect(screen.queryByText("Inventory GL accounts")).toBeNull();
  });
});
