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

/**
 * A restriction is never rendered as an absence — including by omission.
 *
 * For U-009, `traceLineage` returns nothing on exceptions where a Controller
 * reads five source records, so the drawer's SOURCE RECORDS block was omitted
 * outright — no heading, no sentence, nothing on the page saying why — while
 * the split-evidence PHYSICAL layer fell back to "No operational events in
 * evidence for this item". Thirteen of the fifteen drawers, on the one product
 * whose entire argument is that it never claims more than it can support.
 *
 * `evidenceOutOfScope` and `SCOPE_NOTICE` already existed and already fed two
 * other assemblers; the drawer had no channel for either.
 */
describe("Exceptions queue — a scoped reader is told what is withheld", () => {
  const renderAs = (role: Parameters<typeof userByRole>[0]) => {
    const user = userByRole(role);
    return render(
      <ExceptionsScreen
        shell={buildShellData(user, "T-QUEUE-SCOPE")}
        data={buildExceptionsData(user, "T-QUEUE-SCOPE")}
        setRoleAction={noopRole}
      />,
    );
  };

  /**
   * Over EVERY exception, in both directions, comparing the two readers.
   *
   * The first version asserted one id, and its false-positive half was
   * vacuous: the render guard's first conjunct is `sourceRecords.length === 0`
   * and every Controller drawer has at least one record, so the "no notice for
   * a Controller" assertion held no matter what `scopeNotice` contained.
   *
   * The sweep is also what catches the mirror defect, which the first fix
   * shipped: the withholding sentence claimed OPERATIONAL records exist and
   * are withheld, on eleven of the fifteen exceptions where the full-access
   * Controller sees none either. A restriction sentence may say only what the
   * flag behind it supports.
   */
  it("distinguishes withheld from absent, on every exception and both readers", () => {
    const ctl = buildExceptionsData(userByRole("CONTROLLER"), "T-Q-CTL");
    const aud = buildExceptionsData(userByRole("AUDITOR_READ_ONLY"), "T-Q-AUD");
    const ids = Object.keys(ctl.drawers);
    expect(ids.length).toBe(15);

    let withheldFromAuditor = 0;
    for (const id of ids) {
      const c = ctl.drawers[id]!;
      const a = aud.drawers[id];
      // The Controller is never told anything is withheld from them.
      expect(c.sourceRecords.length, `${id}: Controller has no source records`).toBeGreaterThan(0);
      expect(c.scopeNotice, `${id}: Controller got a scope notice`).toBeNull();
      expect(c.layers.physical, `${id}: Controller told of a restriction`).not.toMatch(
        /access scope/,
      );
      if (a === undefined) continue;

      // The notice appears exactly when the reader's scope emptied the list.
      expect(a.scopeNotice === null, `${id}: notice disagrees with the record count`).toBe(
        a.sourceRecords.length > 0,
      );
      if (a.sourceRecords.length === 0) {
        withheldFromAuditor += 1;
        // And the sentence may not assert records the close does not hold.
        // Where the Controller sees no operational events either, a sentence
        // claiming operational evidence is withheld would be false.
        if (/No operational events/.test(c.layers.physical)) {
          expect(
            a.layers.physical,
            `${id}: claims withheld operational records the close does not hold`,
          ).not.toMatch(/Operational evidence for this item is outside/);
        }
        expect(a.layers.physical).toMatch(/outside your access scope/);
      }
    }
    // Anti-vacuity: the sweep must actually have exercised the withheld case.
    expect(withheldFromAuditor, "nothing is withheld from the auditor").toBeGreaterThan(0);
  });

  it("renders the withholding to the reader it applies to", async () => {
    const user = userEvent.setup();
    renderAs("AUDITOR_READ_ONLY");
    await user.click(screen.getByRole("button", { name: "Open EXC-002 summary" }));
    const drawer = screen.getByRole("complementary", { name: "EXC-002 summary" });
    expect(within(drawer).getByText(/WITHHELD AT YOUR ACCESS SCOPE/)).toBeTruthy();
    expect(within(drawer).getByText(/restricted, not missing/)).toBeTruthy();
  });

  it("says nothing about scope to a reader nothing is withheld from", async () => {
    // The false-positive direction: a notice on every drawer would satisfy the
    // assertions above and tell every Controller their view was cut.
    const user = userEvent.setup();
    renderAs("CONTROLLER");
    await user.click(screen.getByRole("button", { name: "Open EXC-002 summary" }));
    const drawer = screen.getByRole("complementary", { name: "EXC-002 summary" });
    expect(within(drawer).queryByText(/WITHHELD AT YOUR ACCESS SCOPE/)).toBeNull();
    expect(within(drawer).getByText("SOURCE RECORDS")).toBeTruthy();
  });
});
