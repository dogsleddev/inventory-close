// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { userByRole } from "@icg/data";
import { FinancialLifeScreen } from "../components/FinancialLifeScreen";
import { PhysicalCountScreen } from "../components/PhysicalCountScreen";
import { ReconciliationScreen } from "../components/ReconciliationScreen";
import { buildPhysicalCountData } from "../lib/server/count-view";
import { buildShellData } from "../lib/server/data";
import { buildFinancialLifeData } from "../lib/server/financial-life-view";
import { buildReconciliationData } from "../lib/server/recon-view";
import { formatDateShort } from "../lib/format";
import { getQueries, makeContext } from "../lib/server/workspace";

/** The month a range endpoint would print — May has no trailing period. */
const formatRangeMonth = (iso: string) => formatDateShort(iso).split(" ")[0];

/**
 * Stage-06 fleet-review regressions. Each test pins a defect the adversarial
 * review confirmed, so the specific wrong behaviour cannot come back.
 */

afterEach(cleanup);
const noopRole = vi.fn(async () => {});

const services = () => ({
  queries: getQueries(),
  ctx: makeContext(userByRole("CONTROLLER"), "T-REG"),
});

function life(serial: string, role: Parameters<typeof userByRole>[0] = "CONTROLLER") {
  const user = userByRole(role);
  return render(
    <FinancialLifeScreen
      shell={buildShellData(user, "T-REG")}
      data={buildFinancialLifeData(user, serial, "T-REG")}
      setRoleAction={noopRole}
    />,
  );
}

function recon(serial = "", role: Parameters<typeof userByRole>[0] = "CONTROLLER") {
  const user = userByRole(role);
  return render(
    <ReconciliationScreen
      shell={buildShellData(user, "T-REG")}
      data={buildReconciliationData(user, serial, "T-REG")}
      setRoleAction={noopRole}
    />,
  );
}

/** The serial the year-end count looked for and did not find (EXC-003). */
const NOT_FOUND = "KE-X1-3498";
/** The serial counted in two locations (EXC-013). */
const TWO_PLACES = "KE-E2-1986";

describe("a count that found nothing is evidence of absence, not absence of evidence", () => {
  it("Financial Life states what the count found for an unlocated unit", () => {
    const { queries, ctx } = services();
    const rows = queries
      .getFinancialLife(ctx, NOT_FOUND)
      .inventoryLife.countRows.filter((r) => r.countType === "YEAR_END");
    expect(rows.some((r) => r.variance !== 0)).toBe(true);
    life(NOT_FOUND);
    expect(screen.getByText("Not found in the year-end count")).toBeTruthy();
    expect(screen.queryByText("Matched in the year-end count")).toBeNull();
    expect(screen.queryByText("No operational events in evidence")).toBeNull();
  });

  it("Serial Integrity does the same, and flags it", () => {
    recon(NOT_FOUND);
    expect(screen.getByText("Not found in the year-end count")).toBeTruthy();
    expect(screen.queryByText("Matched in the year-end count")).toBeNull();
  });

  it("a serial counted in two locations is never reported as a clean single match", () => {
    const { queries, ctx } = services();
    const rows = queries
      .getFinancialLife(ctx, TWO_PLACES)
      .inventoryLife.countRows.filter((r) => r.countType === "YEAR_END");
    // The dataset really does hold two rows, one clean and one +1.
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.variance === 0)).toHaveLength(1);

    life(TWO_PLACES);
    expect(screen.queryByText("Matched in the year-end count")).toBeNull();
    expect(screen.getByText("Found where the book does not carry it")).toBeTruthy();
    cleanup();

    recon(TWO_PLACES);
    expect(screen.queryByText("Matched in the year-end count")).toBeNull();
    expect(screen.getByText(/2 year-end rows/)).toBeTruthy();
  });

  it("renders both year-end rows without duplicate React keys", () => {
    const { queries, ctx } = services();
    void queries.getFinancialLife(ctx, TWO_PLACES);
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    life(TWO_PLACES);
    const dupKeyWarning = warn.mock.calls.some((args) =>
      String(args[0]).includes("same key"),
    );
    expect(dupKeyWarning).toBe(false);
    warn.mockRestore();
  });
});

describe("negative claims are only made when they are true", () => {
  // "a match whose exception is resolved never reads 'No close exception'"
  // and "rows with nothing to open are not rendered as selected" moved to
  // procurement.test.tsx with the three-way match itself in Stage C. The
  // defects they pin are properties of that table, not of this file.

  it("the adjustment card reports a check that was actually performed", () => {
    const { queries, ctx } = services();
    // No adjustment fixture line carries serials, so a serial-keyed filter
    // would always "verify empty" — the check runs on count cells instead.
    const adjustments = queries.getCountDetail(ctx).adjustments;
    expect(adjustments.some((a) => a.lines.some((l) => l.serials !== undefined))).toBe(
      false,
    );
    life("KE-E2-1048");
    expect(screen.queryByText("Verified empty — not zero-filled")).toBeNull();
    expect(
      screen.getByText(/Checked against the count-linked adjustments/),
    ).toBeTruthy();
  });
});

describe("controls tell the truth about what they do", () => {
  it("the tab bar honours the keyboard contract its role declares", async () => {
    const user = userEvent.setup();
    const u = userByRole("CONTROLLER");
    render(
      <PhysicalCountScreen
        shell={buildShellData(u, "T-REG")}
        data={buildPhysicalCountData(u, "T-REG")}
        setRoleAction={noopRole}
      />,
    );
    const tabs = screen.getAllByRole("tab");
    // One tab stop for the set, not one per tab.
    expect(tabs.filter((t) => t.getAttribute("tabindex") === "0")).toHaveLength(1);
    for (const t of tabs) expect(t.getAttribute("aria-controls")).toBe("icg-count-panel");
    expect(screen.getByRole("tabpanel")).toBeTruthy();

    tabs[0]?.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: /Cycle Count History/ }).getAttribute("aria-selected")).toBe("true");
    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: /Count Movements/ }).getAttribute("aria-selected")).toBe("true");
  });
});

describe("figures and names come from the data", () => {
  it("uses the dataset's own location names", () => {
    const u = userByRole("CONTROLLER");
    render(
      <PhysicalCountScreen
        shell={buildShellData(u, "T-REG")}
        data={buildPhysicalCountData(u, "T-REG")}
        setRoleAction={noopRole}
      />,
    );
    const { queries, ctx } = services();
    const staging = queries.listLocations(ctx).find((l) => l.id === "STAGING");
    expect(staging).toBeDefined();
    expect(screen.getAllByText(staging?.name ?? "").length).toBeGreaterThan(0);
    // The title-cased fallback must not be what the screen shows.
    expect(screen.queryByText("Staging")).toBeNull();
  });

  it("phase ranges are chronological, not array order", () => {
    const { queries, ctx } = services();
    const l = queries.getFinancialLife(ctx, "KE-E2-1048");
    // The buy side runs PO Sep. 20 → receipt Oct. 11 → bill Oct. 18, and the
    // range must be the earliest and latest of those, in that order.
    expect(l.records.purchaseOrder?.orderDate).toBe("2026-09-20");
    expect(l.records.vendorBill?.billDate).toBe("2026-10-18");
    const data = buildFinancialLifeData(userByRole("CONTROLLER"), "KE-E2-1048", "T-REG");
    const buy = data.phases.find((p) => p.name === "BUY SIDE");
    expect(buy?.range).toBe("SEP. 20 – OCT. 18");
    // A phase that legitimately crosses the year end still reads forwards.
    const sell = data.phases.find((p) => p.name === "SELL / DEPLOY SIDE");
    expect(sell?.range).toBe("DEC. 22 – JAN. 2");
  });

  it("keeps May in a range — the one month formatted without a period", () => {
    const { queries, ctx } = services();
    // A cycle-count cell counted in May proves the range filter does not
    // silently exclude it.
    const mayPlan = queries
      .getCountDetail(ctx)
      .plans.find((p) => p.snapshotAt.startsWith("2026-05"));
    expect(mayPlan).toBeDefined();
    expect(formatRangeMonth(mayPlan?.snapshotAt ?? "")).toBe("May");
  });

  it("a receipt posted after period end is not stated as the recognition date", () => {
    const { queries, ctx } = services();
    // KE-X1-9025 is EXC-002 goods in transit: on the listing at 12/31, its
    // NetSuite receipt lands in January.
    const l = queries.getFinancialLife(ctx, "KE-X1-9025");
    const receipt = l.records.itemReceipt;
    expect(receipt).toBeDefined();
    expect(receipt?.receiptDate.slice(0, 4)).toBe("2027");
    life("KE-X1-9025");
    expect(screen.queryByText("Inventory recognized")).toBeNull();
    expect(screen.getByText("NetSuite receipt posted after period end")).toBeTruthy();
  });
});
