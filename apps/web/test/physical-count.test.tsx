// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { userByRole } from "@icg/data";
import { PhysicalCountScreen } from "../components/PhysicalCountScreen";
import { buildPhysicalCountData } from "../lib/server/count-view";
import { buildShellData } from "../lib/server/data";
import { getQueries, makeContext } from "../lib/server/workspace";

afterEach(cleanup);

const noopRole = vi.fn(async () => {});

function renderCount(role: Parameters<typeof userByRole>[0] = "CONTROLLER") {
  const user = userByRole(role);
  return render(
    <PhysicalCountScreen
      shell={buildShellData(user, "T-COUNT")}
      data={buildPhysicalCountData(user, "T-COUNT")}
      setRoleAction={noopRole}
    />,
  );
}

describe("Physical Count — year-end command center", () => {
  it("shows the canonical population figures from the deterministic core", () => {
    renderCount();
    // 1,065 book population · 1,061 first-pass matched · 4 differences.
    // (1,065 also appears as the location-table total — presence suffices.)
    expect(screen.getAllByText("1,065").length).toBeGreaterThan(0);
    expect(screen.getByText("1,061")).toBeTruthy();
    expect(screen.getByText("BOOK COUNT POPULATION")).toBeTruthy();
    expect(screen.getByText("INITIAL DIFFERENCES")).toBeTruthy();
    const summary = getQueries().getCountSummary(
      makeContext(userByRole("CONTROLLER"), "T-COUNT-SVC"),
    );
    expect(summary.populationUnits.toLocaleString("en-US")).toBe("1,065");
    expect(summary.firstPassMatchedUnits.toLocaleString("en-US")).toBe("1,061");
    expect(summary.varianceRows).toBe(4);
  });

  it("breaks the population down by counted location, summing to the total", () => {
    renderCount();
    const table = screen.getByText("Count population by location").closest("section");
    expect(table).not.toBeNull();
    expect(within(table as HTMLElement).getByText("Population")).toBeTruthy();
    expect(within(table as HTMLElement).getByText("1,065")).toBeTruthy();
    expect(within(table as HTMLElement).getByText("Primary Warehouse")).toBeTruthy();
  });

  it("lists exactly the first-pass variance rows with their exception state", () => {
    renderCount();
    const panel = screen.getByText("Count variance workspace").closest("section");
    const rows = within(panel as HTMLElement).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(4);
    expect(within(panel as HTMLElement).getByText("Recount Required")).toBeTruthy();
    // EXC-003's serial navigates to Financial Life; the row opens the drawer.
    const link = within(panel as HTMLElement).getByRole("link", { name: "KE-X1-3498" });
    expect(link.getAttribute("href")).toBe("/inventory/KE-X1-3498");
  });

  it("renders the floor-to-sheet discovery without adding it to inventory", () => {
    renderCount();
    expect(screen.getByText("FLOOR → SHEET DISCOVERY")).toBeTruthy();
    expect(screen.getByText(/never auto-added to inventory/)).toBeTruthy();
    const link = screen.getByRole("link", { name: "KE-X1-8842" });
    expect(link.getAttribute("href")).toBe("/inventory/KE-X1-8842");
    // The discovery is not a population row: the variance table holds only
    // the four book variances.
    const panel = screen.getByText("Count variance workspace").closest("section");
    expect(within(panel as HTMLElement).queryByText("KE-X1-8842")).toBeNull();
  });

  it("opens the exception drawer from a variance row", async () => {
    const user = userEvent.setup();
    renderCount();
    await user.click(screen.getByRole("button", { name: "Open EXC-003 summary" }));
    expect(screen.getByRole("complementary", { name: "EXC-003 summary" })).toBeTruthy();
  });
});

describe("Physical Count — auditor test counts", () => {
  it("labels the 18 auditor selections as externally supplied, with no generation control", async () => {
    const user = userEvent.setup();
    renderCount();
    await user.click(screen.getByRole("tab", { name: /Auditor Test Counts/ }));
    expect(
      screen.getByText(/Selections supplied by the external audit team/),
    ).toBeTruthy();
    expect(screen.getByText(/18 selections · 10 sheet → floor · 8 floor → sheet/)).toBeTruthy();
    expect(screen.getByText(/24 selections · 12 sheet → floor · 12 floor → sheet/)).toBeTruthy();
    // No sample-generation affordance exists anywhere on the screen.
    expect(screen.queryByRole("button", { name: /generate/i })).toBeNull();
    expect(screen.queryByText(/generate sample/i)).toBeNull();
  });

  it("keeps management and auditor selections in separate tables", async () => {
    const user = userEvent.setup();
    renderCount();
    await user.click(screen.getByRole("tab", { name: /Auditor Test Counts/ }));
    const auditorPanel = screen
      .getByText("External auditor test counts")
      .closest("section");
    const mgmtPanel = screen.getByText("Management test counts").closest("section");
    expect(within(auditorPanel as HTMLElement).getAllByRole("row").slice(1)).toHaveLength(18);
    expect(within(mgmtPanel as HTMLElement).getAllByRole("row").slice(1)).toHaveLength(24);
  });
});

describe("Physical Count — cycle count history", () => {
  it("tags the lens as management risk context with deterministic indicators", async () => {
    const user = userEvent.setup();
    renderCount();
    await user.click(screen.getByRole("tab", { name: /Cycle Count History/ }));
    expect(screen.getByText("MANAGEMENT RISK CONTEXT")).toBeTruthy();
    // CNT-CC-001 emits one indicator per overdue cell — several can exist.
    expect(screen.getAllByText("Cycle count overdue").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Repeated cycle-count variance").length).toBeGreaterThan(0);
    expect(screen.getByText("Rejected cycle count")).toBeTruthy();
    expect(screen.getByText(/implies no auditor reliance/)).toBeTruthy();
  });

  it("traces the count-linked adjustment on its history row", async () => {
    const user = userEvent.setup();
    renderCount();
    await user.click(screen.getByRole("tab", { name: /Cycle Count History/ }));
    // ADJ-2026-0058 posted from CNT-CC-2026-02 (KV-B1) — the adjustment
    // trace required by CANONICAL_SPEC §6.
    expect(screen.getAllByText("ADJ-2026-0058").length).toBeGreaterThan(0);
  });

  it("replaces the management lens with a scope notice for the auditor", async () => {
    const user = userEvent.setup();
    renderCount("AUDITOR_READ_ONLY");
    await user.click(screen.getByRole("tab", { name: /Cycle Count History/ }));
    expect(screen.getByText(/not auditor-facing/)).toBeTruthy();
    expect(screen.queryByText("Cycle count overdue")).toBeNull();
    // The factual history itself is not withheld — only the lens is.
    expect(screen.getByText("NetSuite cycle count history")).toBeTruthy();
  });
});

describe("Physical Count — movements", () => {
  it("lists the six controlled movements with authorization and reason", async () => {
    const user = userEvent.setup();
    renderCount();
    await user.click(screen.getByRole("tab", { name: /Count Movements/ }));
    const panel = screen.getByText("Count-period movements").closest("section");
    const rows = within(panel as HTMLElement).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(6);
    expect(within(panel as HTMLElement).getAllByText("S. Ibarra")).toHaveLength(6);
    // The movement behind EXC-006 links to its exception.
    expect(within(panel as HTMLElement).getByText("EXC-006")).toBeTruthy();
  });
});
