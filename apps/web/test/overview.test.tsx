// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach } from "vitest";
import { userByRole } from "@icg/data";
import { OverviewScreen } from "../components/OverviewScreen";
import { buildOverviewData, buildShellData } from "../lib/server/data";
import { askGaurdData } from "../lib/server/ask-view";
import { getQueries, makeContext } from "../lib/server/workspace";

/**
 * Ask Gaurd reaches its answer through a server action. Replacing the action
 * with a direct call to the same server function exercises the REAL engine
 * and the real services — only the network boundary is removed.
 */
vi.mock("../app/actions", () => ({
  setRole: vi.fn(async () => {}),
  askGaurd: async (question: string, scope: { exceptionId?: string; serial?: string }) =>
    askGaurdData(userByRole("CONTROLLER"), question, scope, "T-ASK"),
}));

function services() {
  const user = userByRole("CONTROLLER");
  return { queries: getQueries(), ctx: makeContext(user, "T-OVERVIEW") };
}

/**
 * Overview golden UI tests. The screen renders REAL service output (no
 * mocks) — these assertions pin the locked baseline all the way through the
 * formatting layer, so either logic drift or display drift fails here.
 */

afterEach(cleanup);

const noopRole = vi.fn(async () => {});

function renderAs(role: Parameters<typeof userByRole>[0]) {
  const user = userByRole(role);
  return render(
    <OverviewScreen
      shell={buildShellData(user, "T-OVERVIEW")}
      data={buildOverviewData(user, "T-OVERVIEW")}
      setRoleAction={noopRole}
    />,
  );
}

describe("Overview — 10-second acceptance (canonical figures above the fold)", () => {
  it("shows the sign-off gate with every locked metric", () => {
    renderAs("CONTROLLER");
    // 81.4% at overview scale, 8142 bps where the weighted calc is shown.
    expect(screen.getByText("81.4%")).toBeTruthy();
    expect(screen.getByText(/8142 bps · weighted management metric/)).toBeTruthy();
    expect(screen.getByText("NOT READY FOR MANAGEMENT SIGN-OFF")).toBeTruthy();
    // 7 blockers · $198,950 · $12,450 difference.
    expect(screen.getAllByText("$198,950").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$12,450").length).toBeGreaterThan(0);
    // Gross subledger / GL at overview scale with the book unit count.
    expect(screen.getByText("$4.80M / $4.812M")).toBeTruthy();
    expect(screen.getByText("1,500 book units")).toBeTruthy();
    // PBC 17/21 = 80.95% and data health 91.67%.
    expect(screen.getByText("80.95%")).toBeTruthy();
    expect(screen.getByText("17 of 21 ready or provided")).toBeTruthy();
    expect(screen.getAllByText("91.67%").length).toBeGreaterThan(0);
  });

  it("keeps the sign-off action visible but disabled with its reason", () => {
    renderAs("CONTROLLER");
    const btn = screen.getByRole("button", { name: "Record management sign-off" });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(btn.className).toContain("icg-btn--disabled");
    expect(screen.getByText("Unavailable — 7 blockers open")).toBeTruthy();
  });

  it("routes the primary CTA to EXC-001 (the 60-second demo path)", () => {
    renderAs("CONTROLLER");
    // "Signature", not "highest-risk": the product's own ranked panels put
    // EXC-002 above EXC-001 on this very screen, so the superlative was a
    // claim the screen itself contradicted one scroll below.
    const cta = screen.getByRole("link", { name: "Review the signature cutoff item" });
    expect(cta.getAttribute("href")).toBe("/exceptions/EXC-001");
  });
});

describe("Overview — Preventing Sign-Off", () => {
  it("shows the top five blockers by exposure with the remainder note", () => {
    renderAs("CONTROLLER");
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row").slice(1); // minus header
    expect(rows).toHaveLength(5);
    const ids = rows.map((r) => within(r).getAllByRole("link")[0]?.textContent);
    expect(ids).toEqual(["EXC-007", "EXC-002", "EXC-011", "EXC-015", "EXC-001"]);
    expect(within(rows[0]!).getByText("$92,400")).toBeTruthy();
    expect(screen.getByText("$180,550 shown")).toBeTruthy();
    expect(
      screen.getByText("EXC-003 and EXC-004 ($9,200 each) complete the seven."),
    ).toBeTruthy();
  });

  it("uses real table semantics with column headers", () => {
    renderAs("CONTROLLER");
    const table = screen.getByRole("table");
    const headers = within(table).getAllByRole("columnheader");
    expect(headers.length).toBeGreaterThanOrEqual(5);
    for (const th of headers) expect(th.getAttribute("scope")).toBe("col");
  });

  it("§4 row activation: the ID cell navigates, the row opens the drawer", () => {
    renderAs("CONTROLLER");
    const table = screen.getByRole("table");
    const link = within(table).getByRole("link", { name: "EXC-001" });
    expect(link.getAttribute("href")).toBe("/exceptions/EXC-001");
    expect(within(table).getByRole("button", { name: "Open EXC-001 summary" })).toBeTruthy();
  });

  it("opens the object drawer from the row button and closes it again", async () => {
    const user = userEvent.setup();
    renderAs("CONTROLLER");
    await user.click(screen.getByRole("button", { name: "Open EXC-001 summary" }));
    expect(screen.getByText("SPLIT EVIDENCE COMPARISON")).toBeTruthy();
    expect(screen.getByText("NETSUITE SAYS")).toBeTruthy();
    expect(screen.getByText(/Required: Ownership\/acceptance contract provision/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Close drawer" }));
    expect(screen.queryByText("SPLIT EVIDENCE COMPARISON")).toBeNull();
  });

  it("arbitrates drawers: opening Ask Gaurd closes the object drawer", async () => {
    const user = userEvent.setup();
    renderAs("CONTROLLER");
    await user.click(screen.getByRole("button", { name: "Open EXC-001 summary" }));
    expect(screen.getByText("SPLIT EVIDENCE COMPARISON")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Ask Gaurd" }));
    expect(screen.queryByText("SPLIT EVIDENCE COMPARISON")).toBeNull();
    expect(screen.getByText("SUGGESTED")).toBeTruthy();
  });
});

describe("Overview — close areas and reconciliation", () => {
  it("derives the eight close areas with canonical scores", () => {
    renderAs("CONTROLLER");
    expect(screen.getByText(/Weighted result 81\.42% · 8142 bps/)).toBeTruthy();
    expect(screen.getByText("53.33%")).toBeTruthy();
    expect(screen.getByText("66.67%")).toBeTruthy();
    expect(screen.getByText("Reserve undetermined")).toBeTruthy();
    expect(screen.getByText("$92.4K awaiting support")).toBeTruthy();
    expect(screen.getByText("Inbound and outbound both open")).toBeTruthy();
  });

  it("ties GL to subledger with the potential adjusted difference at $0", () => {
    renderAs("CONTROLLER");
    expect(screen.getByText("$4,812,450")).toBeTruthy();
    expect(screen.getByText("$4,800,000")).toBeTruthy();
    // Read from the register, not written as a literal: the previous
    // version of this line pinned "3 proposed", which called the identified
    // count by the product's word for a DRAFTED entry and so kept the
    // overstatement green for four stages.
    const register = getQueries().getAdjustmentRegister(makeContext(userByRole("CONTROLLER"), "T-OV"));
    expect(
      screen.getAllByText(
        new RegExp(
          `${register.identifiedCount} identified,\\s*${register.draftedCount} drafted, none posted`,
        ),
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("$0")).toBeTruthy();
  });
});

describe("Overview — role-aware surfaces (fail-visible, never silently empty)", () => {
  it("renders the restricted state for the system admin, not zeros", () => {
    renderAs("SYSTEM_ADMIN");
    expect(screen.getByText("Access restricted")).toBeTruthy();
    expect(screen.getAllByText(/System Admin/).length).toBeGreaterThan(0);
    expect(screen.queryByText("81.4%")).toBeNull();
    expect(screen.queryByText("$198,950")).toBeNull();
  });

  it("shows the warehouse role its recount item but a restricted PBC panel", () => {
    renderAs("WAREHOUSE");
    expect(screen.getByText("EXC-003")).toBeTruthy();
    expect(screen.getByText(/cannot view the PBC package/)).toBeTruthy();
  });

  it("tells the auditor the work queue is not auditor-facing", () => {
    renderAs("AUDITOR_READ_ONLY");
    expect(screen.getByText(/not auditor-facing/)).toBeTruthy();
  });
});

describe("Overview — Ask Gaurd answers deterministically", () => {
  it("answers the sign-off question from the close's own figures", async () => {
    const user = userEvent.setup();
    const { queries, ctx } = services();
    const blockers = queries.getBlockers(ctx);
    renderAs("CONTROLLER");
    await user.click(screen.getByRole("button", { name: "Ask Gaurd" }));
    await user.click(screen.getByRole("button", { name: "What prevents Controller sign-off?" }));

    const drawer = within(await screen.findByLabelText("Ask Gaurd", { selector: "aside" }));
    expect(await drawer.findByText("Sign-off is blocked")).toBeTruthy();
    expect(drawer.getByText(String(blockers.length))).toBeTruthy();
    for (const b of blockers) {
      expect(drawer.getAllByText(new RegExp(b.exceptionId)).length).toBeGreaterThan(0);
    }
    // No provider ran, and the drawer says so rather than implying one did.
    expect(drawer.getByText(/None — deterministic answer/)).toBeTruthy();
    expect(drawer.getByText(/Chat input is not evidence/)).toBeTruthy();
  });
});
