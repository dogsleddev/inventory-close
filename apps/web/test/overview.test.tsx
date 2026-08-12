// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach } from "vitest";
import { userByRole } from "@icg/data";
import { OverviewScreen } from "../components/OverviewScreen";
import { buildOverviewData, buildShellData } from "../lib/server/data";
import { askGaurdData } from "../lib/server/ask-view";
import { getCommands, getQueries, getWorkspace, makeContext } from "../lib/server/workspace";

/**
 * Ask Gaurd reaches its answer through a server action. Replacing the action
 * with a direct call to the same server function exercises the REAL engine
 * and the real services — only the network boundary is removed.
 */
vi.mock("../app/actions", () => ({
  setRole: vi.fn(async () => {}),
  askGaurd: async (question: string, scope: { exceptionId?: string; serial?: string }) =>
    askGaurdData(userByRole("CONTROLLER"), question, scope, "T-ASK"),
  // A factory that omits an export does NOT yield `undefined`: vitest wraps
  // the factory in a proxy that THROWS `No "<name>" export is defined` the
  // first time anything reads the missing name. So the omission is lazy, not
  // silent — it survives exactly as long as no test reaches the control, and
  // then fails loudly. The stubs below are throwing on purpose: an
  // `async () => ({})` stub would buy exhaustiveness by converting that loud
  // failure into a silent pass, rendering a result view whose every field is
  // undefined.
  //
  // `test/actions-mock.test.ts` is what keeps this list complete; this comment
  // is not an enforcement.
  recordSignOff: vi.fn(async () => ({ ok: true, message: "ok", unmet: [] })),
  resetDemo: vi.fn(async () => {
    throw new Error("resetDemo is not wired in overview.test.tsx");
  }),
  reproduceClose: vi.fn(async () => {
    throw new Error("reproduceClose is not wired in overview.test.tsx");
  }),
  recordConclusion: vi.fn(async () => {
    throw new Error("recordConclusion is not wired in overview.test.tsx");
  }),
  requestEvidence: vi.fn(async () => {
    throw new Error("requestEvidence is not wired in overview.test.tsx");
  }),
  submitEvidence: vi.fn(async () => {
    throw new Error("submitEvidence is not wired in overview.test.tsx");
  }),
  saveMemoDraft: vi.fn(async () => {
    throw new Error("saveMemoDraft is not wired in overview.test.tsx");
  }),
  issueMemoVersion: vi.fn(async () => {
    throw new Error("issueMemoVersion is not wired in overview.test.tsx");
  }),
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

  it("leads with what prevents sign-off and keeps readiness visible but secondary", () => {
    renderAs("CONTROLLER");
    // The gate answers the page's question first. Readiness is a management
    // workflow measure and must stay on the screen — demoted, never hidden.
    const gate = document.querySelector(".icg-gate-left");
    expect(gate).not.toBeNull();
    const blockers = gate!.querySelector(".icg-gate-blockers");
    expect(blockers, "the blocker count leads the gate").not.toBeNull();
    expect(blockers!.textContent).toContain("7");
    expect(blockers!.textContent).toContain("Sign-off blockers");
    expect(blockers!.getAttribute("href")).toBe("/exceptions?filter=blockers");
    expect(gate!.querySelector(".icg-gate-readiness-secondary")?.textContent).toContain("81.4%");
  });

  it("makes every headline figure open the screen that derives it", () => {
    renderAs("CONTROLLER");
    // A KPI a reader cannot open is a figure they are asked to take on trust.
    const tiles = document.querySelectorAll(".icg-gate-right > *");
    expect(tiles.length).toBe(6);
    const hrefs = [...tiles].map((t) => t.getAttribute("href"));
    expect(hrefs, "every KPI tile is a link").not.toContain(null);
    expect(hrefs).toEqual([
      "/exceptions?filter=blockers",
      "/exceptions?filter=blockers",
      "/reconciliation?tab=financial",
      "/inventory",
      "/audit-package",
      "/evidence",
    ]);
    // The accessible name says where it goes: "7" is not a destination.
    for (const tile of tiles) {
      expect(tile.getAttribute("aria-label")).toMatch(/ — open /);
    }
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
    expect(await drawer.findByText(/^Sign-off is blocked/)).toBeTruthy();
    expect(drawer.getByText(String(blockers.length))).toBeTruthy();
    for (const b of blockers) {
      expect(drawer.getAllByText(new RegExp(b.exceptionId)).length).toBeGreaterThan(0);
    }
    // No provider ran, and the drawer says so rather than implying one did.
    expect(drawer.getByText(/None — deterministic answer/)).toBeTruthy();
    expect(drawer.getByText(/Chat input is not evidence/)).toBeTruthy();
  });
});

/**
 * The Preventing Sign-Off panel counts the rows it shows.
 *
 * `blockerViews` is filtered by the LIVE blocker set; the caption and the
 * header counted `getBlockers`, the rules' baseline. So after conclusions the
 * panel read "All seven blockers shown." under an empty table, with a header
 * saying "of $198,950 across 7 blockers" over rows totalling nothing. Neither
 * branch of the caption was true — there is no reading of "all seven shown"
 * that holds above no rows.
 *
 * Mutating and resetting, following `close-memo-scope.test.ts`: the workspace
 * here is a process-global singleton, so a test that concluded without
 * restoring would move every assertion after it.
 */
describe("Overview — the blocker panel counts its own rows", () => {
  const controller = () => userByRole("CONTROLLER");
  const manager = () => userByRole("ACCOUNTING_MANAGER");

  afterEach(() => {
    getCommands().resetDemo(makeContext(controller(), "T-OV-RESET"));
  });

  const resolveEveryBlocker = () => {
    const commands = getCommands();
    const queries = getQueries();
    const ctx = makeContext(controller(), "T-OV-WORK");
    for (const blocker of [...getWorkspace().close.blockers]) {
      const id = blocker.exceptionId;
      for (const requirement of queries.getExceptionWorkflow(ctx, id).unmetRequirements) {
        const submitted = commands.submitEvidence(ctx, {
          title: `Support for ${requirement}`,
          kind: "DOCUMENT",
          content: { note: "Obtained." },
          relatedObjectRef: id,
          satisfiesRequirement: { exceptionId: id, requirement },
        });
        commands.reviewEvidence(
          makeContext(manager(), "T-OV-REVIEW"),
          submitted.id,
          "ACCEPTED",
          "Reviewed.",
        );
      }
      commands.concludeException(ctx, {
        exceptionId: id,
        conclusion: "RESOLVED_NO_ADJUSTMENT",
        rationale: "Support obtained and reviewed; no adjustment required.",
      });
    }
  };

  it("captions and totals the live rows, not the baseline", () => {
    const before = buildOverviewData(controller(), "T-OV-BEFORE");
    // Premise: the two agree until somebody does something, so the assertion
    // below has something to prove.
    expect(before.preventing?.blockerCount).toBe(7);
    expect(before.preventing?.rows.length).toBe(5);

    resolveEveryBlocker();

    const after = buildOverviewData(controller(), "T-OV-AFTER");
    expect(after.preventing?.rows.length).toBe(0);
    expect(after.preventing?.blockerCount).toBe(0);
    expect(after.preventing?.allTotal).toBe("$0");
    expect(after.preventing?.remainingNote).not.toMatch(/seven blockers shown/);
    expect(after.preventing?.shownTotal).toBe("$0");
  });

  it("links to the register with the register's own count", () => {
    // The other direction, and the trap in fixing the first: the link leads to
    // /exceptions, which lists what the RULES derived. A link reading "View all
    // 0 blockers" onto a page of seven would be this panel's defect moved one
    // click along, so the link counts its destination while the caption counts
    // these rows.
    resolveEveryBlocker();
    const after = buildOverviewData(controller(), "T-OV-LINK");
    expect(after.preventing?.blockerCount).toBe(0);
    expect(after.preventing?.registerCount).toBe(7);
  });
});
