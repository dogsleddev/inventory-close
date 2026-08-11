// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { userByRole } from "@icg/data";
import { getProcurementPopulations } from "@icg/services";
import { ProcurementScreen } from "../components/ProcurementScreen";
import { buildShellData } from "../lib/server/data";
import { buildProcurementData } from "../lib/server/procurement-view";
import { getQueries, getWorkspace, makeContext } from "../lib/server/workspace";

/**
 * Procurement (COMPLETION_PLAN Stage C).
 *
 * The three-way-match assertions here came from `reconciliation.test.tsx`
 * unchanged: the tab moved, so its regressions moved with it rather than
 * being deleted alongside it. The rest pin the four new populations, and in
 * particular the one claim this screen makes that no other screen makes —
 * that invoiced-not-received and inbound goods in transit are one population.
 */

afterEach(cleanup);

const noopRole = vi.fn(async () => {});

function renderProcurement(
  role: Parameters<typeof userByRole>[0] = "CONTROLLER",
  initialTab?: string,
) {
  const user = userByRole(role);
  return render(
    <ProcurementScreen
      shell={buildShellData(user, "T-PROC")}
      data={buildProcurementData(user, "T-PROC")}
      {...(initialTab !== undefined ? { initialTab } : {})}
      setRoleAction={noopRole}
    />,
  );
}

function services() {
  const user = userByRole("CONTROLLER");
  const ctx = makeContext(user, "T-PROC-SVC");
  return { queries: getQueries(), ctx, populations: getProcurementPopulations(getWorkspace(), ctx) };
}

async function openTab(name: RegExp) {
  await userEvent.setup().click(screen.getByRole("tab", { name }));
}

describe("Procurement — the section", () => {
  it("opens on the three-way match and carries all five populations", () => {
    renderProcurement();
    for (const name of [
      /Three-Way Match/,
      /Received Not Invoiced/,
      /Invoiced Not Received/,
      /Goods in Transit/,
      /Price Variance/,
    ]) {
      expect(screen.getByRole("tab", { name })).toBeTruthy();
    }
    expect(screen.getByText("All procurement matches")).toBeTruthy();
  });

  it("offers the population as a file, because a screen is not a workpaper", () => {
    renderProcurement();
    const link = screen.getByRole("link", { name: /Export the procurement populations as CSV/ });
    expect(link.getAttribute("href")).toBe("/api/export/procurement");
  });

  it("opens the population named in the URL", () => {
    renderProcurement("CONTROLLER", "ppv");
    expect(screen.getByRole("tab", { name: /Price Variance/ })).toHaveProperty(
      "ariaSelected",
      "true",
    );
  });
});

describe("Procurement — three-way match", () => {
  it("keeps the native NetSuite state and the close state side by side and independent", async () => {
    const { queries, ctx } = services();
    const matches = queries.getProcurementMatches(ctx);
    renderProcurement();
    const panel = screen.getByText("All procurement matches").closest("section");
    const rows = within(panel as HTMLElement).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(matches.length);
    // Native incomplete + close open (EXC-002)…
    expect(screen.getAllByText("NS 3WM · INCOMPLETE").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Accounting Review").length).toBeGreaterThan(0);
    // …and native incomplete + no close exception (clean GIT), so neither
    // state is derived from the other.
    const incompleteNativeCleanClose = matches.some(
      (m) => m.nativeNetsuiteMatchStatus !== "PASS" && m.closeMatchStatus === "PASS",
    );
    expect(incompleteNativeCleanClose).toBe(true);
    expect(screen.getAllByText("NS 3WM · PASS").length).toBeGreaterThan(0);
    expect(screen.getAllByText("No close exception").length).toBeGreaterThan(0);
  });

  it("features the EXC-002 incomplete year-end example with its absent receipt", () => {
    renderProcurement();
    expect(screen.getByText(/Absent at Dec\. 31/)).toBeTruthy();
    expect(screen.getAllByText(/EXC-002/).length).toBeGreaterThan(0);
    expect(
      screen.getByText(/answer different questions and are reported separately/),
    ).toBeTruthy();
  });

  it("features a resolved-historical example alongside the open one", () => {
    const { populations } = services();
    const resolved = populations.orders.find(
      (o) => o.relatedExceptionId !== undefined && o.relatedExceptionOpen === false,
    );
    expect(resolved).toBeDefined();
    renderProcurement();
    expect(
      screen.getAllByText(new RegExp(resolved?.relatedExceptionId ?? "")).length,
    ).toBeGreaterThan(0);
  });

  it("a match whose exception is resolved never reads 'No close exception'", () => {
    const { queries, ctx } = services();
    // EXC-014 is resolved and rides on PO-26-1201's receipt.
    const exc = queries.listExceptions(ctx).find((e) => e.exception.id === "EXC-014");
    expect(exc?.open).toBe(false);
    renderProcurement();
    const table = screen.getByText("All procurement matches").closest("section");
    const row = within(table as HTMLElement)
      .getAllByRole("row")
      .find((r) => within(r).queryByText("PO-26-1201") !== null);
    expect(row).toBeDefined();
    expect(within(row as HTMLElement).queryByText("No close exception")).toBeNull();
    expect(within(row as HTMLElement).getByText("EXC-014")).toBeTruthy();
  });

  it("rows with nothing to open are not rendered as selected", () => {
    renderProcurement();
    const table = screen.getByText("All procurement matches").closest("section");
    const selected = within(table as HTMLElement)
      .getAllByRole("row")
      .filter((r) => r.getAttribute("data-selected") === "true");
    // Nothing is open, so nothing is selected.
    expect(selected).toEqual([]);
  });

  it("never shows an ordered amount beside a different billed amount without saying why", () => {
    const { populations } = services();
    const varied = new Set(
      populations.priceVariance.rows.map((r) => r.purchaseOrderNumber),
    );
    expect(varied.size).toBeGreaterThan(0);
    renderProcurement();
    // The clean-cycle card is the one this went wrong on: it carried a PO
    // total and a different bill total under a footnote calling the legs
    // matched. A card is only "clean" when there is nothing left to explain.
    const cleanCard = screen.getByText("Clean procurement cycle").closest("section");
    expect(cleanCard).toBeTruthy();
    const po = within(cleanCard as HTMLElement)
      .getAllByText(/^PO-/)
      .map((n) => n.textContent ?? "")[0];
    expect(varied.has((po ?? "").trim())).toBe(false);
  });

  it("names the variance on any card whose bill differs from its order", () => {
    const { populations } = services();
    const data = buildProcurementData(userByRole("CONTROLLER"), "T-PROC");
    const varied = new Set(
      populations.priceVariance.rows.map((r) => r.purchaseOrderNumber),
    );
    for (const card of data.match?.featured ?? []) {
      const billLeg = card.legs.find((l) => l.label === "VENDOR BILL");
      expect(
        /above the price ordered|below the price ordered/.test(billLeg?.note ?? ""),
        card.po,
      ).toBe(varied.has(card.po));
    }
  });

  it("states where every order stood at the balance-sheet date", () => {
    const { populations } = services();
    renderProcurement();
    const table = screen.getByText("All procurement matches").closest("section");
    // Each of the three positions the dataset actually produces is legible in
    // the table, not left for the reader to infer from two dates.
    const positions = new Set(populations.orders.map((o) => o.position));
    expect(positions.size).toBeGreaterThan(1);
    expect(within(table as HTMLElement).getAllByText("Matched in period").length).toBeGreaterThan(0);
    expect(within(table as HTMLElement).getAllByText("Received, not invoiced").length).toBe(
      populations.grni.length,
    );
    expect(within(table as HTMLElement).getAllByText("Invoiced, not received").length).toBe(
      populations.invoicedNotReceived.length,
    );
  });
});

describe("Procurement — received not invoiced", () => {
  it("renders one row per receipt awaiting a bill, with its age at period end", async () => {
    const { populations } = services();
    renderProcurement();
    await openTab(/Received Not Invoiced/);
    const panel = screen.getByText("Orders awaiting a vendor bill").closest("section");
    const rows = within(panel as HTMLElement).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(populations.grni.length);
    for (const row of populations.grni) {
      expect(within(panel as HTMLElement).getByText(row.itemReceiptNumber)).toBeTruthy();
    }
  });

  it("says why the accrual is not in the inventory reconciliation", async () => {
    renderProcurement();
    await openTab(/Received Not Invoiced/);
    // The units are already on the book; what is missing is the invoice. A
    // reader who took this for an inventory difference would double-count it.
    expect(screen.getByText(/already in the 1,500-unit book population/)).toBeTruthy();
    expect(screen.getByText(/accounts payable, not in inventory/)).toBeTruthy();
  });
});

describe("Procurement — goods in transit is one population, not two", () => {
  it("states the agreement between the document side and the book side", async () => {
    const { populations } = services();
    const git = populations.goodsInTransit;
    expect(git.inboundAgrees).toBe(true);
    renderProcurement();
    await openTab(/Goods in Transit/);
    expect(screen.getByText("The documents and the book agree.")).toBeTruthy();
    // The sentence a reader needs before they reach for a calculator.
    expect(screen.getByText(/Same population, two sides/)).toBeTruthy();
  });

  it("reports the whole of account 1210 so it cannot contradict the GL screen", async () => {
    const { populations } = services();
    const git = populations.goodsInTransit;
    renderProcurement();
    await openTab(/Goods in Transit/);
    expect(screen.getByText(`${git.inboundUnits} units`)).toBeTruthy();
    expect(screen.getByText(`${git.outboundUnits} units`)).toBeTruthy();
    expect(screen.getByText(`${git.accountUnits} units`)).toBeTruthy();
    expect(screen.getByText(/belongs to the commercial chain/)).toBeTruthy();
  });
});

describe("Procurement — price variance", () => {
  it("renders each varying line with both prices and its direction", async () => {
    const { populations } = services();
    renderProcurement();
    await openTab(/Price Variance/);
    const panel = screen
      .getByText("Lines billed at a price other than the one ordered")
      .closest("section");
    const rows = within(panel as HTMLElement).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(populations.priceVariance.rows.length);
    expect(within(panel as HTMLElement).getAllByText("Unfavorable").length).toBeGreaterThan(0);
    expect(within(panel as HTMLElement).getAllByText("Favorable").length).toBeGreaterThan(0);
  });

  it("says the variance is expensed, so no figure here belongs to inventory", async () => {
    renderProcurement();
    await openTab(/Price Variance/);
    expect(screen.getByText(/expensed in the period rather than capitalized/)).toBeTruthy();
    expect(
      screen.getByText(/native three-way match still passes on every order in this table/),
    ).toBeTruthy();
  });
});
