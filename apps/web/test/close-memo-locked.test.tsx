// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { userByRole } from "@icg/data";
import { CloseMemoScreen } from "../components/CloseMemoScreen";
import { buildShellData } from "../lib/server/data";
import { buildCloseMemoData } from "../lib/server/memo-view";
import { getCommands, makeContext } from "../lib/server/workspace";
import type { WorkflowActionResult } from "../lib/view-model";

/**
 * A locked period is the state in which the memo screen used to instruct the
 * reader to do the one thing the service would refuse.
 *
 * The divergence panel says the close has moved since the issued version was
 * sealed — which is TRUE under a lock, because locking moves `periodState`
 * and `periodState` is inside the sealed hash. It then said "Issue a new
 * version to state the current position", while `requireMutable` refuses
 * exactly that. A stale enabled button is a nuisance; a panel that prescribes
 * a refused remedy, in the state that always produces the prescription, is a
 * dead end.
 *
 * The two cases below are the SAME branch with different tails, which is what
 * makes this a rule rather than a string pin: the remedy appears when the
 * position moved and the period allows a write, and not when it does not.
 */

const noop = vi.fn(async () => {});
const ok = async (): Promise<WorkflowActionResult> => ({
  ok: true,
  message: "ok",
  unmet: [],
});
const controller = () => userByRole("CONTROLLER");

const renderMemo = (correlationId: string) =>
  render(
    <CloseMemoScreen
      shell={buildShellData(controller(), correlationId)}
      data={buildCloseMemoData(controller(), correlationId)}
      saveDraftAction={ok}
      issueVersionAction={ok}
      setRoleAction={noop}
    />,
  );

afterEach(() => {
  cleanup();
  getCommands().resetDemo(makeContext(controller(), "T-LOCK-RESET"));
});

describe("a locked period refuses the memo, and the screen stops prescribing it", () => {
  it("names the lock beside both controls and offers no remedy it cannot honour", () => {
    const commands = getCommands();
    const ctx = makeContext(controller(), "T-LOCK");
    commands.saveMemoDraft(ctx, {
      title: "FY2026 Inventory Close Memo",
      body: "Management's assessment at the balance-sheet date.",
    });
    commands.issueMemoVersion(ctx, {});
    // Locking moves periodState, which is inside the sealed close-state hash,
    // so the position has genuinely moved — with no figure having changed.
    commands.lockPeriod(ctx, "LOCKED");

    renderMemo("T-LOCK");

    // Both controls refused, each saying the period rather than the role —
    // and each reason located relative to ITS OWN button. Counting occurrences
    // page-wide passes with one of the two reasons deleted, which is the half
    // of "beside both controls" the name actually claims.
    const reasonFor = (btn: HTMLElement): string =>
      btn.closest(".icg-action-conclude")?.querySelector(".icg-btn-reason")?.textContent ?? "";

    const save = screen.getByRole("button", { name: "Save draft" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    expect(reasonFor(save), "Save draft is refused with no reason beside it").toMatch(
      /period is locked/,
    );

    const issueBtn = screen.getByRole("button", { name: "Issue this version" });
    expect((issueBtn as HTMLButtonElement).disabled).toBe(true);
    expect(reasonFor(issueBtn), "Issue is refused with no reason beside it").toMatch(
      /period is locked/,
    );

    // The divergence detail still reports the move...
    expect(screen.getByText(/no longer in the state the issued version was sealed against/))
      .toBeTruthy();
    expect(screen.getByText(/the position below/)).toBeTruthy();
    // ...and no longer instructs a write the service will refuse.
    expect(screen.queryByText(/Issue a new version to state the current position/)).toBeNull();
  });

  it("does offer the remedy when a figure moved and the period still allows a write", () => {
    const commands = getCommands();
    const ctx = makeContext(controller(), "T-MOVED");
    commands.saveMemoDraft(ctx, {
      title: "FY2026 Inventory Close Memo",
      body: "Management's assessment at the balance-sheet date.",
    });
    commands.issueMemoVersion(ctx, {});
    // A real change to a figure the memo speaks about, with the period left
    // open. Resolving is refused while a required record is missing (D6), so
    // the requirement is answered first, by name.
    commands.submitEvidence(ctx, {
      title: "Supervised recount sheet",
      kind: "COUNT_TEST",
      content: { located: true },
      relatedObjectRef: "EXC-003",
      satisfiesRequirement: {
        exceptionId: "EXC-003",
        requirement: "Supervised recount locating the unit",
      },
    });
    commands.concludeException(ctx, {
      exceptionId: "EXC-003",
      conclusion: "RESOLVED_NO_ADJUSTMENT",
      rationale: "The recount located the unit; no adjustment is required.",
    });

    renderMemo("T-MOVED");

    expect(screen.getByText(/no longer in the state the issued version was sealed against/))
      .toBeTruthy();
    expect(
      screen.getByText(/Issue a new version to state the current position/),
      "the remedy is available and must be offered",
    ).toBeTruthy();
  });

  it("withholds the remedy from a role the command would refuse at the first gate", () => {
    // `issueMemoVersion` authorizes BEFORE it checks the period, and a
    // preparer holds memo.draft without memo.issue — so it gets the full
    // editor, no Issue panel, and, without the role half of the condition, an
    // instruction to issue with neither affordance nor reason on the page.
    //
    // Both cases above render as Controller, which is exactly why the role
    // dimension shipped uncovered.
    const commands = getCommands();
    const ctx = makeContext(controller(), "T-ROLE");
    commands.saveMemoDraft(ctx, {
      title: "FY2026 Inventory Close Memo",
      body: "Management's assessment at the balance-sheet date.",
    });
    commands.issueMemoVersion(ctx, {});
    commands.submitEvidence(ctx, {
      title: "Supervised recount sheet",
      kind: "COUNT_TEST",
      content: { located: true },
      relatedObjectRef: "EXC-003",
      satisfiesRequirement: {
        exceptionId: "EXC-003",
        requirement: "Supervised recount locating the unit",
      },
    });
    commands.concludeException(ctx, {
      exceptionId: "EXC-003",
      conclusion: "RESOLVED_NO_ADJUSTMENT",
      rationale: "The recount located the unit; no adjustment is required.",
    });

    const preparer = userByRole("PREPARER");
    render(
      <CloseMemoScreen
        shell={buildShellData(preparer, "T-ROLE")}
        data={buildCloseMemoData(preparer, "T-ROLE")}
        saveDraftAction={ok}
        issueVersionAction={ok}
        setRoleAction={noop}
      />,
    );

    // Non-vacuity: the divergence panel must actually be on screen, or the
    // absence below proves nothing.
    expect(
      screen.getByText(/no longer in the state the issued version was sealed against/),
      "the divergence panel is not rendered, so the absence below is vacuous",
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Issue this version" })).toBeNull();
    expect(screen.queryByText(/Issue a new version to state the current position/)).toBeNull();
  });
});
