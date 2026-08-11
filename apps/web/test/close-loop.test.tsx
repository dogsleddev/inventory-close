// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { userByRole } from "@icg/data";
import { ConclusionPanel } from "../components/ConclusionPanel";
import { OverviewScreen } from "../components/OverviewScreen";
import { buildExceptionDetailData, buildOverviewData, buildShellData } from "../lib/server/data";
import type { ExceptionWorkflowView } from "../lib/view-model";

/**
 * The close loop on the surface (COMPLETION_PLAN Stage W).
 *
 * The service tests prove the rule; these prove a reader can SEE it. The
 * distinction matters: a control enforced only on submit is an obstacle,
 * while a control explained before the attempt is a control.
 */

afterEach(cleanup);

vi.mock("../app/actions", () => ({
  setRole: vi.fn(async () => {}),
  askGaurd: vi.fn(async () => ({})),
  resetDemo: vi.fn(async () => ({})),
  reproduceClose: vi.fn(async () => ({})),
  recordConclusion: vi.fn(async () => ({ ok: true, message: "ok", unmet: [] })),
  requestEvidence: vi.fn(async () => ({ ok: true, message: "ok", unmet: [] })),
  submitEvidence: vi.fn(async () => ({ ok: true, message: "ok", unmet: [] })),
  recordSignOff: vi.fn(async () => ({ ok: true, message: "ok", unmet: [] })),
}));

const noop = vi.fn(async () => ({ ok: true, message: "", unmet: [] as string[] }));
const actions = {
  recordConclusion: noop,
  requestEvidence: noop,
  submitEvidence: noop,
};

function workflow(overrides: Partial<ExceptionWorkflowView> = {}): ExceptionWorkflowView {
  return {
    exceptionId: "EXC-001",
    owner: "Legal",
    unmetRequirements: ["Ownership/acceptance contract provision"],
    canResolve: false,
    canConclude: true,
    canRequest: true,
    canSubmit: true,
    conclusion: null,
    conclusionLabel: "",
    conclusionBy: "",
    conclusionAt: "",
    requests: [],
    submissions: [],
    ...overrides,
  };
}

describe("the conclusion panel says what it will not let you do, before you try", () => {
  it("disables the resolved options and names what is still required", async () => {
    const user = userEvent.setup();
    render(<ConclusionPanel workflow={workflow()} actions={actions} />);
    await user.click(screen.getByRole("button", { name: "Record conclusion" }));
    const resolved = screen.getByRole("radio", { name: /Resolved — no adjustment/ });
    expect((resolved as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByRole("radio", { name: /Remains open/ })).toBeTruthy();
    expect((screen.getByRole("radio", { name: /Remains open/ }) as HTMLInputElement).disabled).toBe(
      false,
    );
    expect(
      screen.getByText(/Ownership\/acceptance contract provision/),
      "the requirement is named, not merely referred to",
    ).toBeTruthy();
  });

  it("offers the resolved options once the requirement is satisfied", async () => {
    const user = userEvent.setup();
    render(
      <ConclusionPanel
        workflow={workflow({ canResolve: true, unmetRequirements: [] })}
        actions={actions}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Record conclusion" }));
    expect(
      (screen.getByRole("radio", { name: /Resolved — no adjustment/ }) as HTMLInputElement).disabled,
    ).toBe(false);
  });

  it("shows a recorded conclusion beside the rule result, with its author", () => {
    render(
      <ConclusionPanel
        workflow={workflow({
          conclusion: { conclusion: "REMAINS_OPEN", rationale: "Legal is retrieving it." },
          conclusionLabel: "Remains open",
          conclusionBy: "M. Reyes",
          conclusionAt: "Jan. 7, 2027 06:02 UTC",
        })}
        actions={actions}
      />,
    );
    expect(screen.getByText("MANAGEMENT CONCLUSION RECORDED")).toBeTruthy();
    expect(screen.getByText("Remains open")).toBeTruthy();
    expect(screen.getByText(/Legal is retrieving it/)).toBeTruthy();
    expect(screen.getByText(/recorded beside the rule result, never over it/)).toBeTruthy();
  });

  it("offers nothing to a role that may not act", () => {
    render(
      <ConclusionPanel
        workflow={workflow({ canConclude: false, canRequest: false, canSubmit: false })}
        actions={actions}
      />,
    );
    expect(screen.queryByRole("button", { name: "Record conclusion" })).toBeNull();
    expect(screen.getByText(/may read this item but not act on it/)).toBeTruthy();
  });

  it("hides request and submit when nothing is outstanding", () => {
    render(
      <ConclusionPanel
        workflow={workflow({ canResolve: true, unmetRequirements: [] })}
        actions={actions}
      />,
    );
    expect(screen.queryByRole("button", { name: "Request evidence" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Submit support" })).toBeNull();
  });
});

describe("the exception detail carries the real verbs", () => {
  it("builds workflow state for an exception, with its unmet requirement", () => {
    const data = buildExceptionDetailData(userByRole("CONTROLLER"), "EXC-001", "T-LOOP");
    expect(data.workflow).toBeTruthy();
    expect(data.workflow?.canResolve).toBe(false);
    expect(data.workflow?.unmetRequirements.length).toBeGreaterThan(0);
    expect(data.workflow?.canConclude).toBe(true);
  });

  it("does not offer the conclusion verb to a role without the authority", () => {
    const data = buildExceptionDetailData(userByRole("WAREHOUSE"), "EXC-001", "T-LOOP");
    expect(data.workflow?.canConclude).toBe(false);
  });
});

describe("the sign-off gate is honest at baseline", () => {
  it("stays unavailable and says how many blockers are open", () => {
    const user = userByRole("CONTROLLER");
    render(
      <OverviewScreen
        shell={buildShellData(user, "T-LOOP")}
        data={buildOverviewData(user, "T-LOOP")}
        setRoleAction={vi.fn(async () => {})}
      />,
    );
    const button = screen.getByRole("button", { name: "Record management sign-off" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Unavailable — 7 blockers open/)).toBeTruthy();
  });

  it("shows no divergence note when nothing has been concluded", () => {
    const user = userByRole("CONTROLLER");
    const data = buildOverviewData(user, "T-LOOP");
    // At baseline the screen IS the rules' own position, and says nothing
    // about sessions — the note appears only once that stops being true.
    expect(data.gate?.divergence).toBeNull();
  });
});
