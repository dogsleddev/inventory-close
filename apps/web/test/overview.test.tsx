// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach } from "vitest";
import { userByRole } from "@icg/data";
import { OverviewScreen } from "../components/OverviewScreen";
import {
  buildExceptionDetailData,
  buildExceptionsData,
  buildOverviewData,
  buildShellData,
} from "../lib/server/data";
import { askGaurdData } from "../lib/server/ask-view";
import { buildFinancialLifeData } from "../lib/server/financial-life-view";
import { buildCsv } from "../lib/server/export-csv";
import { getCommands, getQueries, getWorkspace, makeContext } from "../lib/server/workspace";
import { satisfyRequirements } from "./support/live-close";

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
      screen.getByText("EXC-003 and EXC-004 ($9,200 each) complete the seven still open."),
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

  /**
   * Every count-varying word in the panel, at the count that exposes it.
   *
   * Making these figures live is what made "1 blockers", "All one blocker
   * shown." and "EXC-004 (… each) complete the six." reachable — three
   * hard-coded agreements that were correct by construction while the count
   * was a constant seven, and that no baseline render can show. `git blame`
   * named the commit that made the figures live as the author of two of them.
   *
   * Six of the seven resolved, so the panel renders exactly one row.
   */
  const resolveAllBut = (keep: number) => {
    const commands = getCommands();
    const queries = getQueries();
    const ctx = makeContext(controller(), "T-OV-WORK");
    const blockers = [...getWorkspace().close.blockers];
    for (const blocker of blockers.slice(0, blockers.length - keep)) {
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

  it("agrees with itself at a count of one", () => {
    resolveAllBut(1);
    const data = buildOverviewData(controller(), "T-OV-ONE");
    expect(data.preventing?.blockerCount).toBe(1);
    expect(data.preventing?.rows.length).toBe(1);
    // The caption, which had "All one blocker shown."
    expect(data.preventing?.remainingNote).toBe("The one open blocker is shown.");

    // And the header beside it, which is the component's own hard-coded
    // plural — the half the data layer cannot fix.
    render(
      <OverviewScreen
        shell={buildShellData(controller(), "T-OV-ONE")}
        data={data}
        setRoleAction={vi.fn(async () => {})}
      />,
    );
    expect(screen.getByText(/across 1 blocker$/)).toBeTruthy();
    expect(screen.queryByText(/across 1 blockers/)).toBeNull();
  });

  it("stops saying the period is not ready once nothing blocks it", () => {
    // The gate headline was a constant, authored when the panel below it could
    // not move. Every figure under it is live now, so a reader who concludes
    // the last blocker was reading "NOT READY FOR MANAGEMENT SIGN-OFF" over a
    // gate offering them the sign-off control.
    const before = buildOverviewData(controller(), "T-OV-GATE-BEFORE");
    expect(before.gate?.signOff.available).toBe(false);
    render(
      <OverviewScreen
        shell={buildShellData(controller(), "T-OV-GATE-BEFORE")}
        data={before}
        setRoleAction={vi.fn(async () => {})}
      />,
    );
    expect(screen.getByText("NOT READY FOR MANAGEMENT SIGN-OFF")).toBeTruthy();
    cleanup();

    resolveEveryBlocker();

    const after = buildOverviewData(controller(), "T-OV-GATE-AFTER");
    expect(after.gate?.signOff.available).toBe(true);
    render(
      <OverviewScreen
        shell={buildShellData(controller(), "T-OV-GATE-AFTER")}
        data={after}
        setRoleAction={vi.fn(async () => {})}
      />,
    );
    expect(screen.getByText("READY FOR MANAGEMENT SIGN-OFF")).toBeTruthy();
    expect(screen.queryByText("NOT READY FOR MANAGEMENT SIGN-OFF")).toBeNull();
  });

  /**
   * The three surfaces of one conclusion must agree, and this must be checked
   * AFTER the conclusion, not before.
   *
   * Every existing test of these builders read an untouched workspace, where
   * live and baseline are identical by construction — so the product reported
   * itself clean while, one conclusion in, the Overview said "6 blockers ·
   * $189,750" and the concluded exception's own page said status "Recount
   * Required", conclusion "Open", `blocker: true`, "Exception 3 of 7 blockers"
   * and "Obtain: Supervised recount locating the unit", directly above a panel
   * reading "Resolved — no adjustment required" with `unmetRequirements: []`.
   * `getEffectiveClose` was called once in data.ts; `getBlockers` six times.
   *
   * This is the one loop the product exists for, so it is asserted end to end
   * and in both directions: the item that moved, and one that did not.
   */
  it("agrees across the Overview, the queue and the detail page after a conclusion", () => {
    const commands = getCommands();
    const queries = getQueries();
    const ctx = makeContext(controller(), "T-OV-LOOP");

    // Premise, asserted before anything is done: all three surfaces start at 7
    // and EXC-003 is one of them. Without this the assertions below could pass
    // against a build that had simply lost the blocker concept.
    expect(buildOverviewData(controller(), "T-OV-LOOP").gate?.blockerCount).toBe(7);
    const queueBefore = buildExceptionsData(controller(), "T-OV-LOOP", undefined, "blockers");
    expect(queueBefore.rows.map((r) => r.id)).toContain("EXC-003");
    expect(queueBefore.rows.length).toBe(7);
    expect(buildExceptionDetailData(controller(), "EXC-003", "T-OV-LOOP").header?.blocker).toBe(true);

    // Do the work the product is for, through the product's own verbs.
    for (const requirement of queries.getExceptionWorkflow(ctx, "EXC-003").unmetRequirements) {
      const submitted = commands.submitEvidence(ctx, {
        title: `Support for ${requirement}`,
        kind: "DOCUMENT",
        content: { note: "Obtained." },
        relatedObjectRef: "EXC-003",
        satisfiesRequirement: { exceptionId: "EXC-003", requirement },
      });
      commands.reviewEvidence(
        makeContext(manager(), "T-OV-LOOP-REVIEW"),
        submitted.id,
        "ACCEPTED",
        "Reviewed.",
      );
    }

    /**
     * The middle state, which is what actually pins the `unmet` fix.
     *
     * Evidence submitted and accepted, NO conclusion recorded. Asserting only
     * the post-conclusion state cannot see it, because `nextActionText`
     * short-circuits on a resolved status without consulting `unmet` at all —
     * so "does not say Obtain" holds after a conclusion whether the live set
     * is read or not. Here the status has not moved, so every one of these
     * surfaces is answering purely on whether it read the live requirements.
     */
    expect(queries.getExceptionWorkflow(ctx, "EXC-003").unmetRequirements).toEqual([]);
    const mid = buildExceptionDetailData(controller(), "EXC-003", "T-OV-MID");
    expect(mid.header?.status.label).toBe("Recount Required");
    expect(mid.header?.nextAction).not.toMatch(/Obtain/);
    expect(mid.whyFlagged?.state?.accountingEvidence.label).toBe("Complete");
    expect(mid.whyFlagged?.state?.accountingEvidence.note).toMatch(/Every required record/);
    // The lens that says "Until it exists, the item stays open" must be gone.
    expect(mid.lenses?.panels.map((l) => l.key)).not.toContain("needed");
    // And the drawer over the same item agrees with the page.
    const midQueue = buildExceptionsData(controller(), "T-OV-MID");
    expect(midQueue.drawers["EXC-003"]?.layers.accountingMissing).toBe(false);
    expect(midQueue.drawers["EXC-003"]?.nextAction).not.toMatch(/Obtain/);

    commands.concludeException(ctx, {
      exceptionId: "EXC-003",
      conclusion: "RESOLVED_NO_ADJUSTMENT",
      rationale: "Recount completed; no adjustment required.",
    });

    // 1. The Overview moved.
    const overview = buildOverviewData(controller(), "T-OV-LOOP");
    expect(overview.gate?.blockerCount).toBe(6);
    expect(overview.preventing?.blockerCount).toBe(6);

    // 2. The queue the Overview links to moved with it, and says why.
    const queue = buildExceptionsData(controller(), "T-OV-LOOP", undefined, "blockers");
    expect(queue.rows.map((r) => r.id)).not.toContain("EXC-003");
    expect(queue.rows.length).toBe(6);
    expect(queue.openBlockerCount).toBe(6);
    // The baseline is named rather than silently dropped — a shorter list with
    // no explanation is the same defect one step quieter.
    expect(queue.filter?.basis).toMatch(/rules raised 7/);

    /**
     * 2b. The UNFILTERED queue row, and the drawer it opens.
     *
     * The blockers filter removes the concluded row entirely, so asserting
     * only there cannot see what the row SAYS — `statusOf`/`openOf` were
     * pinned by nothing. And the drawer is assembled in the same loop as the
     * row: the first version of this fix made the row live and left the drawer
     * frozen, so one call returned a row reading "Resolved — No Adjustment"
     * and a drawer reading "Recount Required · Open · Obtain: …", with the
     * requirement painted in the ember alarm treatment. Both are asserted.
     */
    const full = buildExceptionsData(controller(), "T-OV-LOOP");
    const row = full.rows.find((r) => r.id === "EXC-003");
    expect(row?.status.label).toMatch(/Resolved/);
    expect(row?.open).toBe(false);
    expect(row?.blocker).toBe(false);
    const rowDrawer = full.drawers["EXC-003"];
    expect(rowDrawer?.status.label).toBe(row?.status.label);
    expect(rowDrawer?.conclusion).toMatch(/Resolved/);
    expect(rowDrawer?.blocker).toBe(false);
    expect(rowDrawer?.nextAction).not.toMatch(/Obtain/);
    expect(rowDrawer?.layers.accountingMissing).toBe(false);

    // 3. The item's own page agrees with the panel on it, in every field that
    //    carries the claim.
    const detail = buildExceptionDetailData(controller(), "EXC-003", "T-OV-LOOP");
    expect(detail.header?.blocker).toBe(false);
    expect(detail.header?.status.label).toMatch(/Resolved/);
    expect(detail.header?.conclusion).toMatch(/Resolved/);
    expect(detail.header?.positionLabel).toBe("Resolved exception");
    expect(detail.header?.nextAction).not.toMatch(/Obtain/);
    expect(detail.workflow?.unmetRequirements).toEqual([]);
    // Every other consumer on the same page, which the first fix left frozen.
    expect(detail.whyFlagged?.state?.accountingEvidence.label).toBe("Complete");
    expect(detail.lenses?.panels.map((l) => l.key)).not.toContain("needed");
    expect(detail.evidenceState?.missing ?? []).toEqual([]);
    // And the rules' own position stays readable, because it is the
    // reproducible artifact — superseded, not erased.
    expect(detail.header?.conclusionNote).toMatch(/rules derived this as "Recount Required"/);

    // 4. The other direction: an item nobody touched is untouched everywhere.
    const untouched = buildExceptionDetailData(controller(), "EXC-001", "T-OV-LOOP");
    expect(untouched.header?.blocker).toBe(true);
    expect(untouched.header?.conclusion).toBe("Open");
    expect(untouched.header?.nextAction).toMatch(/Obtain/);
    expect(queue.rows.map((r) => r.id)).toContain("EXC-001");
  });

  /**
   * A REMAINS_OPEN conclusion is a review decision, not a resolution.
   *
   * The complement of the test above, and the branch a live-vs-baseline fix is
   * most likely to overshoot: `effectiveStatus` deliberately does not move for
   * REMAINS_OPEN, so every surface must keep the item open and blocking while
   * still showing that a person looked at it.
   */
  it("keeps an item blocking when the conclusion recorded is that it remains open", () => {
    const commands = getCommands();
    const queries = getQueries();
    const ctx = makeContext(controller(), "T-OV-REMAIN");

    /**
     * The evidence is obtained FIRST, and that is the whole point.
     *
     * The first version of this test concluded REMAINS_OPEN on an exception
     * with an outstanding requirement — so `effectiveStatus`'s requirements
     * gate returned the derived status before the REMAINS_OPEN branch was ever
     * reached, and every assertion below was satisfied by the wrong rule.
     * Deleting the branch this test is named for could not have failed it.
     * With nothing outstanding, the gate passes and REMAINS_OPEN is the only
     * thing keeping the item open.
     */
    for (const requirement of queries.getExceptionWorkflow(ctx, "EXC-003").unmetRequirements) {
      const submitted = commands.submitEvidence(ctx, {
        title: `Support for ${requirement}`,
        kind: "DOCUMENT",
        content: { note: "Obtained." },
        relatedObjectRef: "EXC-003",
        satisfiesRequirement: { exceptionId: "EXC-003", requirement },
      });
      commands.reviewEvidence(
        makeContext(manager(), "T-OV-REMAIN-REVIEW"),
        submitted.id,
        "ACCEPTED",
        "Reviewed.",
      );
    }
    expect(queries.getExceptionWorkflow(ctx, "EXC-003").unmetRequirements).toEqual([]);

    commands.concludeException(ctx, {
      exceptionId: "EXC-003",
      conclusion: "REMAINS_OPEN",
      rationale: "Recount not yet performed.",
    });

    expect(buildOverviewData(controller(), "T-OV-REMAIN").gate?.blockerCount).toBe(7);
    const queue = buildExceptionsData(controller(), "T-OV-REMAIN", undefined, "blockers");
    expect(queue.rows.map((r) => r.id)).toContain("EXC-003");
    expect(queue.rows.length).toBe(7);
    // Nothing moved, so nothing claims a divergence.
    expect(queue.filter?.basis).not.toMatch(/rules raised/);

    const detail = buildExceptionDetailData(controller(), "EXC-003", "T-OV-REMAIN");
    expect(detail.header?.blocker).toBe(true);
    expect(detail.header?.conclusion).toBe("Open");
    expect(detail.header?.conclusionNote).not.toMatch(/rules derived this as/);
    // But the review IS recorded, and the panel below says so.
    expect(detail.workflow?.conclusionLabel).toBe("Remains open");
    // The drawer over the same item does not overshoot either — the surface
    // the previous fix left behind is asserted in this direction too.
    const drawer = buildExceptionsData(controller(), "T-OV-REMAIN").drawers["EXC-003"];
    expect(drawer?.status.label).toBe("Recount Required");
    expect(drawer?.conclusion).toBe("Open");
    expect(drawer?.blocker).toBe(true);
  });

  /**
   * The four surfaces the first two fix passes did not reach.
   *
   * Each was verified by execution before being fixed, and each is the same
   * class: a screen reading the rules' frozen close beside one reading the
   * live one. The all-concluded state is what exposes the worst of them —
   * the gate offering sign-off while the work queue beside the button still
   * prescribed five records to obtain.
   */
  it("moves every Overview figure and queue together, not just the gate", () => {
    resolveEveryBlocker();
    const ov = buildOverviewData(controller(), "T-OV-ALL");

    expect(ov.gate?.signOff.available).toBe(true);
    // The management work queue prescribed work on items it had concluded.
    expect(ov.attention?.items ?? []).toEqual([]);
    // The KPI tiles link to /exceptions?filter=blockers, which is live — a
    // tile reading 7 over a destination listing 0 is the same defect one
    // click along.
    expect(ov.gate?.stats.find((s) => s.label === "ACTIVE BLOCKERS")?.value).toBe("0");
    expect(ov.gate?.stats.find((s) => s.label === "BLOCKER EXPOSURE")?.value).toBe("$0");
    // And the Close-areas panel, which read "7 open blockers" beside a gate
    // reading 6, on one screen.
    expect(ov.gate?.categories.find((c) => c.key === "EXCEPTIONS")?.note).toBe("0 open blockers");
    // The rules' own position stays named, including that the weighted bars
    // below are still the derived scores.
    expect(ov.gate?.divergence).toMatch(/7 blockers/);
    expect(ov.gate?.divergence).toMatch(/weighted areas below are still those derived scores/);
  });

  /**
   * The state that pins the per-item lookup rather than the open filter.
   *
   * An item that is STILL OPEN but whose requirement has been submitted and
   * accepted stays in the work queue — correctly — and must stop prescribing
   * a record the product is holding. Nothing else reaches this: once an item
   * is concluded it leaves the queue entirely, so an assertion on the
   * all-concluded state alone is satisfied by the filter and never reads the
   * status or the requirements at all.
   */
  it("stops prescribing a record on an item that is still open but no longer waiting", () => {
    const commands = getCommands();
    const queries = getQueries();
    const ctx = makeContext(controller(), "T-OV-SUBMITTED");
    const before = buildOverviewData(controller(), "T-OV-SUBMITTED");
    const labelFor = (data: ReturnType<typeof buildOverviewData>, id: string) =>
      data.attention?.items.find((i) => i.ref === id)?.label ?? "";
    // Premise: it is prescribed, and prescribed as an obtain.
    expect(labelFor(before, "EXC-001")).toMatch(/Obtain/);

    for (const requirement of queries.getExceptionWorkflow(ctx, "EXC-001").unmetRequirements) {
      const submitted = commands.submitEvidence(ctx, {
        title: `Support for ${requirement}`,
        kind: "DOCUMENT",
        content: { note: "Obtained." },
        relatedObjectRef: "EXC-001",
        satisfiesRequirement: { exceptionId: "EXC-001", requirement },
      });
      commands.reviewEvidence(
        makeContext(manager(), "T-OV-SUBMITTED-R"),
        submitted.id,
        "ACCEPTED",
        "Reviewed.",
      );
    }

    const after = buildOverviewData(controller(), "T-OV-SUBMITTED");
    // Still open, still blocking, still in the queue — nothing has been
    // concluded, and the product must not pretend otherwise.
    expect(after.gate?.blockerCount).toBe(7);
    expect(after.attention?.items.some((i) => i.ref === "EXC-001")).toBe(true);
    // But it no longer asks for what it has.
    expect(labelFor(after, "EXC-001")).not.toMatch(/Obtain/);
    // And the blocker row beside it agrees.
    const row = after.preventing?.rows.find((r) => r.id === "EXC-001");
    expect(row?.nextAction).not.toMatch(/Obtain/);
  });

  it("carries the conclusion to the unit page and the export", () => {
    const commands = getCommands();
    const queries = getQueries();
    const ctx = makeContext(controller(), "T-OV-CARRY");
    for (const requirement of queries.getExceptionWorkflow(ctx, "EXC-003").unmetRequirements) {
      const submitted = commands.submitEvidence(ctx, {
        title: `Support for ${requirement}`,
        kind: "DOCUMENT",
        content: { note: "Obtained." },
        relatedObjectRef: "EXC-003",
        satisfiesRequirement: { exceptionId: "EXC-003", requirement },
      });
      commands.reviewEvidence(
        makeContext(manager(), "T-OV-CARRY-R"),
        submitted.id,
        "ACCEPTED",
        "Reviewed.",
      );
    }
    commands.concludeException(ctx, {
      exceptionId: "EXC-003",
      conclusion: "RESOLVED_NO_ADJUSTMENT",
      rationale: "Recount completed.",
    });

    // The flagship screen, which reported the item as Recount Required,
    // blocker true, and demanded a conclusion the workspace was holding.
    const life = buildFinancialLifeData(controller(), "KE-X1-3498", "T-OV-CARRY");
    expect(life.header?.close?.status?.label).toMatch(/Resolved/);
    expect(life.header?.close?.blocker).toBe(false);
    expect(life.header?.close?.body).not.toMatch(/Obtain/);

    /**
     * And the export, which carries BOTH positions in named columns. A CSV
     * outlives the tab it came from, so "which run is this?" cannot be left
     * to the reader — it emitted the frozen close with nothing saying so.
     */
    const body = buildCsv(controller(), "exceptions", "T-OV-CARRY").body;
    const header = body.split("\n").find((l) => l.includes("Blocks sign-off"));
    expect(header).toMatch(/"Status","Status the rules derived"/);
    const row = body.split("\n").find((l) => l.startsWith('"EXC-003"'));
    expect(row).toMatch(/"RESOLVED_NO_ADJUSTMENT","RECOUNT_REQUIRED","RESOLVED"/);
    // The rules' position is retained, not overwritten — it is the
    // reproducible artifact and an export is where it matters most.
    expect(row).toMatch(/RECOUNT_REQUIRED/);
  });

  it("moves none of them when the conclusion recorded moves nothing", () => {
    // The false-positive direction for all four at once. REMAINS_OPEN sets
    // `diverged` without moving a figure, and the divergence banner used to
    // announce a moved position on the strength of that flag alone.
    getCommands().concludeException(makeContext(controller(), "T-OV-NOMOVE"), {
      exceptionId: "EXC-003",
      conclusion: "REMAINS_OPEN",
      rationale: "Not yet recounted.",
    });
    const ov = buildOverviewData(controller(), "T-OV-NOMOVE");
    expect(ov.gate?.blockerCount).toBe(7);
    expect(ov.gate?.stats.find((s) => s.label === "ACTIVE BLOCKERS")?.value).toBe("7");
    expect(ov.gate?.categories.find((c) => c.key === "EXCEPTIONS")?.note).toBe("7 open blockers");
    expect(ov.attention?.items.length ?? 0).toBeGreaterThan(0);
    expect(ov.gate?.divergence).toBeNull();
  });

  /**
   * The Overview offering to lock the period beside six areas of open work.
   *
   * `categoryNote` derived its open set from `listExceptions` — frozen — and
   * fed it to PHYSICAL_COUNT, CUTOFF, OWNERSHIP, THIRD_PARTY and VALUATION.
   * Only the EXCEPTIONS case was live. So with every blocker concluded the
   * gate read "Every blocker has a management conclusion. Signing off locks
   * the period." while the panel beside it read, all warn:true: "2 open count
   * issues", "Inbound and outbound both open", "Contract support missing on 1
   * item", "$92.4K awaiting support", "Reserve undetermined".
   */
  it("moves every close-area note with the close, not just the exceptions one", () => {
    const before = buildOverviewData(controller(), "T-OV-CAT-BEFORE");
    const notesBefore = before.gate?.categories ?? [];
    // Premise: these notes exist, warn, and say the things below.
    expect(notesBefore.filter((c) => c.noteWarn).length).toBeGreaterThan(1);
    expect(notesBefore.some((c) => /open count issue/.test(c.note))).toBe(true);
    expect(notesBefore.some((c) => /Inbound and outbound both open/.test(c.note))).toBe(true);
    expect(notesBefore.some((c) => /Contract support missing/.test(c.note))).toBe(true);
    expect(notesBefore.some((c) => /awaiting support/.test(c.note))).toBe(true);
    expect(notesBefore.some((c) => /Reserve undetermined/.test(c.note))).toBe(true);

    resolveEveryBlocker();

    const after = buildOverviewData(controller(), "T-OV-CAT-AFTER");
    // The gate now offers to lock the period.
    expect(after.gate?.signOff.reason).toMatch(/Signing off locks the period/);

    /**
     * So none of the five derived from the exception set may still report
     * outstanding work. Pinned to the exact cleared strings rather than to a
     * /open|missing|awaiting/ scan, because every cleared string CONTAINS one
     * of those words — "No open count issues" matches /open/ — and a scan
     * that cannot tell "2 open count issues" from "No open count issues"
     * fails on a correct fix and passes on nothing useful.
     */
    const noteFor = (key: string) => after.gate?.categories.find((c) => c.key === key);
    expect(noteFor("PHYSICAL_COUNT")?.note).toBe("No open count issues");
    expect(noteFor("CUTOFF")?.note).toBe("No open cutoff items");
    expect(noteFor("OWNERSHIP")?.note).toBe("Ownership support on file");
    expect(noteFor("THIRD_PARTY")?.note).toBe("All custodians confirmed");
    expect(noteFor("VALUATION")?.note).toBe("No open valuation items");
    for (const key of ["PHYSICAL_COUNT", "CUTOFF", "OWNERSHIP", "THIRD_PARTY", "VALUATION"]) {
      expect(noteFor(key)?.noteWarn, key).toBe(false);
    }

    /**
     * POPULATION_GL and ADJUSTMENTS are deliberately NOT asserted clean, and
     * both still warn: "$12,450 current difference" and "2 of 3 drafted, none
     * posted". Neither is derived from the exception set, and both remain
     * literally true after every conclusion — the GL still differs from the
     * subledger and one identified item still has no drafted entry. Asserting
     * them away would be asserting that a conclusion drafts journal entries.
     */
    expect(noteFor("POPULATION_GL")?.noteWarn).toBe(true);
    expect(noteFor("ADJUSTMENTS")?.note).toBe("2 of 3 drafted, none posted");
  });

  /**
   * The gate's own count-varying words, at the count that exposes them.
   *
   * Found in the browser pass: with one blocker left, the Overview gate read
   * "Unavailable — 1 blockers open" and the summary beside it "1 blockers ·
   * $18,750". Both are LIVE figures carrying a hard-coded plural, which is the
   * same trap as the header KPI and invisible for the same reason — the count
   * is seven until somebody concludes, and no baseline render can reach one.
   */
  it("says '1 blocker' in the gate reason and summary at a count of one", () => {
    const before = buildOverviewData(controller(), "T-OV-GATE-BASE");
    expect(before.gate?.signOff.reason).toBe("Unavailable — 7 blockers open");

    resolveAllBut(1);

    const after = buildOverviewData(controller(), "T-OV-GATE-ONE");
    expect(after.gate?.signOff.reason).toBe("Unavailable — 1 blocker open");
    expect(after.gate?.blockerSummary).toMatch(/^1 blocker · /);
  });

  /**
   * OWNERSHIP, at the state where its own half of the fix is live.
   *
   * The case counts items whose CONTRACT support is still missing, and it
   * counted them from `finding.evidenceRequirements.filter(required &&
   * !satisfied)` — a literal baked by the rules engine that never moves. Once
   * everything is concluded the open set is empty and the case returns clean
   * whichever list it reads, so the test above cannot see this. The state
   * where it can is the one in between: the contract has been submitted and
   * accepted, and nobody has concluded yet.
   *
   * The subject is discovered from the workspace rather than named, so this
   * survives a dataset change instead of pinning EXC-007 by hand.
   */
  it("stops reporting contract support as missing once it is on file", () => {
    const queries = getQueries();
    const ctx = makeContext(controller(), "T-OV-OWN");
    const subject = queries
      .getEffectiveExceptions(ctx)
      .find(
        (e) =>
          e.open && e.unmetRequirements.some((r) => /contract|provision|agreement/i.test(r)),
      );
    expect(subject, "no open exception has an outstanding contract requirement").toBeDefined();

    const noteOf = (correlationId: string) =>
      buildOverviewData(controller(), correlationId).gate?.categories.find(
        (c) => c.key === "OWNERSHIP",
      );
    expect(noteOf("T-OV-OWN-BEFORE")?.note).toMatch(/Contract support missing on 1 item/);
    expect(noteOf("T-OV-OWN-BEFORE")?.noteWarn).toBe(true);

    // Submit and accept, WITHOUT concluding.
    satisfyRequirements(subject?.exception.id ?? "");

    // Still open — the item has not been concluded and nothing here claims it has.
    const after = queries
      .getEffectiveExceptions(ctx)
      .find((e) => e.exception.id === subject?.exception.id);
    expect(after?.open).toBe(true);

    expect(noteOf("T-OV-OWN-AFTER")?.note).toBe("Ownership support on file");
    expect(noteOf("T-OV-OWN-AFTER")?.noteWarn).toBe(false);
  });

  /**
   * CHANGED ASSERTION. This read `expect(after.preventing?.registerCount)
   * .toBe(7)`, on the stated rationale that "the link leads to /exceptions,
   * which lists what the RULES derived", so a link counting the live set would
   * be the panel's defect moved one click along.
   *
   * That rationale is false about the destination. `buildExceptionsData`'s
   * blocker filter is live: resolve six and /exceptions?filter=blockers
   * returns one row, `openBlockerCount` 1, under its own basis line "The rules
   * raised 7; 6 have been concluded in this session and are no longer listed."
   * So the old assertion pinned "View all 7 in the exception register →" onto
   * a page showing one — the same defect it was written to prevent, pointing
   * the other way, beside a caption that already said "complete the one still
   * open".
   *
   * The replacement asserts the link against the DESTINATION rather than
   * against a literal, so the two cannot drift apart again in either
   * direction, and it drives to one rather than zero: 0 === 0 would pass on an
   * implementation that always returned zero.
   */
  it("links to the register with the count the register actually shows", () => {
    resolveAllBut(1);
    const after = buildOverviewData(controller(), "T-OV-LINK");
    const destination = buildExceptionsData(
      controller(),
      "T-OV-LINK-DEST",
      undefined,
      "blockers",
    );

    expect(after.preventing?.blockerCount).toBe(1);
    expect(destination.openBlockerCount).toBe(1);
    expect(destination.rows.length).toBe(1);
    expect(after.preventing?.registerCount).toBe(destination.openBlockerCount);
  });

  /**
   * Item 7(b). The weighted score is the readiness POLICY's own output over
   * the rules' own population, so unlike everything else on this screen it
   * must NOT be made live — that would be a second definition of readiness.
   * What was wrong was shipping it unlabelled beside a live gate: "Weighted
   * result 81.42% · 8142 bps" on the same page as "83.1%", with nothing to
   * tell a reader they answer different questions.
   */
  it("labels the close-areas percentage as the rules' baseline", () => {
    const before = buildOverviewData(controller(), "T-OV-WR-BEFORE");
    expect(before.closeAreas?.weightedResult).toMatch(/8142 bps/);
    expect(before.gate?.readinessOverview).toBe("81.4%");

    resolveAllBut(1);

    const after = buildOverviewData(controller(), "T-OV-WR-AFTER");
    // Still the rules' figure, unmoved — that is the point of it.
    expect(after.closeAreas?.weightedResult).toMatch(/8142 bps/);
    // And no longer bare: it now says which of the two numbers it is.
    expect(after.closeAreas?.weightedResult).toMatch(
      /the rules' baseline, before this session's conclusions/,
    );
    // The gate beside it has moved, which is what made the label necessary.
    expect(after.gate?.readinessOverview).not.toBe("81.4%");
  });
});
