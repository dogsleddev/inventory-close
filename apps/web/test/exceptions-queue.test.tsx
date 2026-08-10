// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { userByRole } from "@icg/data";
import { ExceptionsScreen } from "../components/ExceptionsScreen";
import { buildExceptionsData, buildShellData } from "../lib/server/data";

afterEach(cleanup);

const noopRole = vi.fn(async () => {});

function renderQueue() {
  const user = userByRole("CONTROLLER");
  return render(
    <ExceptionsScreen
      shell={buildShellData(user, "T-QUEUE")}
      data={buildExceptionsData(user, "T-QUEUE")}
      setRoleAction={noopRole}
    />,
  );
}

describe("Exceptions queue — deterministic default sort", () => {
  it("orders open blockers, then resolved, by exposure desc with id tiebreak", () => {
    renderQueue();
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    // §4: the ID cell is the link to the full object; the row button is the
    // (unlabelled) hit area that opens the summary drawer.
    const ids = rows.map((r) => within(r).getAllByRole("link")[0]?.textContent);
    // Pinned canonical order: 7 blockers by exposure (EXC-003/004 tie at
    // $9,200 → id ascending), then the 8 resolved the same way.
    expect(ids).toEqual([
      "EXC-007",
      "EXC-002",
      "EXC-011",
      "EXC-015",
      "EXC-001",
      "EXC-003",
      "EXC-004",
      "EXC-008",
      "EXC-010",
      "EXC-014",
      "EXC-006",
      "EXC-013",
      "EXC-012",
      "EXC-005",
      "EXC-009",
    ]);
  });

  it("shows all 15 designed exceptions with 7 blockers and the exposure", () => {
    renderQueue();
    expect(screen.getByText("15 designed exceptions")).toBeTruthy();
    expect(screen.getByText(/7 blockers · \$198,950/)).toBeTruthy();
    expect(screen.getAllByText("BLOCKER")).toHaveLength(7);
  });

  it("keeps canonical statuses on the baseline rows", () => {
    renderQueue();
    expect(screen.getByText("Waiting on Contract")).toBeTruthy();
    expect(screen.getByText("Waiting on Third Party")).toBeTruthy();
    expect(screen.getByText("Recount Required")).toBeTruthy();
    expect(screen.getByText("Controller Review")).toBeTruthy();
    // Two adjustment-proposed resolutions (EXC-009, EXC-014), dashed style.
    expect(screen.getAllByText("Resolved — Adjustment Proposed")).toHaveLength(2);
    expect(screen.getAllByText("Resolved — No Adjustment")).toHaveLength(6);
  });

  it("surfaces degraded source coverage inside the affected rows", () => {
    renderQueue();
    const table = screen.getByRole("table");
    const rowFor = (id: string) => {
      const row = within(table)
        .getAllByRole("row")
        .slice(1)
        .find((r) => within(r).getAllByRole("link")[0]?.textContent === id);
      expect(row, `row ${id}`).toBeDefined();
      return within(row as HTMLElement);
    };
    // Exact, and scoped to the rows the fixture actually degrades — a chip
    // moved into a header or dropped from one row must fail this.
    for (const id of ["EXC-001", "EXC-002", "EXC-008"]) {
      expect(rowFor(id).getAllByText("ACCORDVAULT STALE")).toHaveLength(1);
    }
    for (const id of ["EXC-009", "EXC-012"]) {
      expect(rowFor(id).getAllByText("RETURNLOOP PARTIAL")).toHaveLength(1);
    }
    expect(screen.getAllByText("ACCORDVAULT STALE")).toHaveLength(3);
    expect(screen.getAllByText("RETURNLOOP PARTIAL")).toHaveLength(2);
  });

  it("§4 row activation: the ID cell navigates to the full object", () => {
    renderQueue();
    const link = screen.getByRole("link", { name: "EXC-001" });
    expect(link.getAttribute("href")).toBe("/exceptions/EXC-001");
    // The title is no longer a competing destination.
    expect(
      screen.queryByRole("link", { name: "Outbound deployment / missing contract" }),
    ).toBeNull();
  });

  it("§4 row activation: the row hit area opens the summary drawer", async () => {
    const user = userEvent.setup();
    renderQueue();
    await user.click(screen.getByRole("button", { name: "Open EXC-009 summary" }));
    const drawer = screen.getByRole("complementary", { name: "EXC-009 summary" });
    expect(within(drawer).getByText("SPLIT EVIDENCE COMPARISON")).toBeTruthy();
    expect(within(drawer).getByText(/EXC-009/)).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("complementary", { name: "EXC-009 summary" })).toBeNull();
  });
});
