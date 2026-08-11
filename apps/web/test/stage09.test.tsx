// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { userByRole } from "@icg/data";
import { AuditPackageScreen } from "../components/AuditPackageScreen";
import { ExceptionsScreen } from "../components/ExceptionsScreen";
import { ExceptionDetailScreen } from "../components/ExceptionDetailScreen";
import { PhysicalCountScreen } from "../components/PhysicalCountScreen";
import { ReconciliationScreen } from "../components/ReconciliationScreen";
import { buildAuditPackageData } from "../lib/server/audit-package-view";
import { buildPhysicalCountData } from "../lib/server/count-view";
import {
  buildExceptionDetailData,
  buildExceptionsData,
  buildShellData,
  EXCEPTION_SECTIONS,
} from "../lib/server/data";
import {
  buildPackageManifest,
  runReproduceClose,
  runResetDemo,
} from "../lib/server/integrity-view";
import { buildReconciliationData } from "../lib/server/recon-view";
import { askGaurdData } from "../lib/server/ask-view";
import { getQueries, makeContext } from "../lib/server/workspace";
import { formatBpsExact, formatCents } from "../lib/format";

/**
 * Stage 09 — demo reset, replay, deep routes, and the AI-off path.
 *
 * The server actions are replaced with direct calls to the same server
 * functions, so these exercise the real services with only the network
 * boundary removed.
 */

afterEach(cleanup);

let actingRole: Parameters<typeof userByRole>[0] = "CONTROLLER";

import {
  runRecordConclusion,
  runRequestEvidence,
  runSignOff,
  runSubmitEvidence,
} from "../lib/server/workflow-actions";

vi.mock("../app/actions", () => ({
  setRole: vi.fn(async () => {}),
  askGaurd: async (question: string, scope: { exceptionId?: string; serial?: string }) =>
    askGaurdData(userByRole(actingRole), question, scope, "T-09"),
  resetDemo: async () => runResetDemo(userByRole(actingRole), "T-09"),
  reproduceClose: async () => runReproduceClose(userByRole(actingRole), "T-09"),
  // The Stage W verbs. Wired to the real runners so a test that renders the
  // exception screen exercises the same authorization the app does.
  recordConclusion: async (input: {
    exceptionId: string;
    conclusion: "RESOLVED_NO_ADJUSTMENT" | "RESOLVED_ADJUSTMENT_PROPOSED" | "REMAINS_OPEN";
    rationale: string;
  }) => runRecordConclusion(userByRole(actingRole), "T-09", input),
  requestEvidence: async (input: { exceptionId: string; requirement: string; askedOf: string }) =>
    runRequestEvidence(userByRole(actingRole), "T-09", input),
  submitEvidence: async (input: {
    exceptionId: string;
    requirement: string;
    title: string;
    note: string;
  }) => runSubmitEvidence(userByRole(actingRole), "T-09", input),
  recordSignOff: async () => runSignOff(userByRole(actingRole), "T-09"),
}));

const noopRole = vi.fn(async () => {});
type Role = Parameters<typeof userByRole>[0];

function services(role: Role = "CONTROLLER") {
  const user = userByRole(role);
  return { user, queries: getQueries(), ctx: makeContext(user, "T-09") };
}

function renderSection(section: string, role: Role = "CONTROLLER") {
  actingRole = role;
  const user = userByRole(role);
  return render(
    <ExceptionsScreen
      shell={buildShellData(user, "T-09")}
      data={buildExceptionsData(user, "T-09", section)}
      setRoleAction={noopRole}
    />,
  );
}

function renderPackage(role: Role = "CONTROLLER", pbc = "", tab?: string) {
  actingRole = role;
  const user = userByRole(role);
  return render(
    <AuditPackageScreen
      shell={buildShellData(user, "T-09")}
      data={buildAuditPackageData(user, pbc, "T-09")}
      manifest={buildPackageManifest(user, "T-09")}
      reproduceAction={async () => runReproduceClose(user, "T-09")}
      initialTab={tab}
      setRoleAction={noopRole}
    />,
  );
}

/* ------------------------------------------------------------------ */
/* Reset Demo                                                          */
/* ------------------------------------------------------------------ */

describe("Reset Demo is offered only where the service would allow it", () => {
  it("shows the control to the Controller and hides it from roles the command refuses", () => {
    for (const role of ["CONTROLLER", "HEAD_OF_FINANCE"] as const) {
      cleanup();
      renderSection("cutoff", role);
      expect(
        screen.queryByRole("button", { name: "Reset Demo" }),
        `${role} should be offered the reset`,
      ).not.toBeNull();
    }
    for (const role of ["PREPARER", "AUDITOR_READ_ONLY", "WAREHOUSE", "FPA"] as const) {
      cleanup();
      renderSection("cutoff", role);
      expect(
        screen.queryByRole("button", { name: "Reset Demo" }),
        `${role} must not be offered the reset`,
      ).toBeNull();
    }
  });

  it("asks before it rebuilds, and can be cancelled", async () => {
    const user = userEvent.setup();
    renderSection("cutoff");
    await user.click(screen.getByRole("button", { name: "Reset Demo" }));
    expect(screen.getByText("Rebuild the demo from its seed?")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Rebuild the demo from its seed?")).toBeNull();
    expect(screen.queryByText(/Demo reset/)).toBeNull();
  });

  it("reports what was re-derived, what was cleared, and what the log kept", async () => {
    const user = userEvent.setup();
    renderSection("cutoff");
    await user.click(screen.getByRole("button", { name: "Reset Demo" }));
    await user.click(screen.getByRole("button", { name: "Confirm reset" }));

    const note = await screen.findByRole("status");
    expect(within(note).getByText("Demo reset")).toBeTruthy();
    expect(within(note).getByText(/re-derived from the seed, the rules and the scenario events/))
      .toBeTruthy();
    expect(within(note).getByText(/append-only audit trail kept/)).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ */
/* Package manifest and Reproduce Close                                */
/* ------------------------------------------------------------------ */

describe("the package manifest carries provenance and control totals", () => {
  it("renders each control total exactly as the close reports it", () => {
    const { queries, ctx } = services();
    const readiness = queries.getCloseReadiness(ctx);
    renderPackage();
    const panel = screen.getByText("Package manifest").closest("section") as HTMLElement;
    expect(
      within(panel).getAllByText(formatCents(readiness.aggregates.blockerExposureCents))
        .length,
    ).toBeGreaterThan(0);
    expect(
      within(panel).getAllByText(formatBpsExact(readiness.aggregates.closeReadinessBps))
        .length,
    ).toBeGreaterThan(0);
    expect(within(panel).getByText(queries.getRunManifest(ctx).runId)).toBeTruthy();
    expect(within(panel).getByText(/every figure.*synthetic|synthetic/i)).toBeTruthy();
  });

  it("states what a replay compares before one is run", () => {
    renderPackage();
    const panel = screen
      .getByRole("button", { name: "Reproduce close" })
      .closest("section") as HTMLElement;
    expect(within(panel).getByText(/Nothing has been reproduced/)).toBeTruthy();
    expect(within(panel).getByText(/never compares generated prose/)).toBeTruthy();
  });

  it("reports MATCH with the hashes and the exclusions", async () => {
    const user = userEvent.setup();
    renderPackage();
    const button = screen.getByRole("button", { name: "Reproduce close" });
    const panel = button.closest("section") as HTMLElement;
    await user.click(button);
    expect(await within(panel).findByText("MATCH")).toBeTruthy();
    expect(
      within(panel).getByText(/the dataset rebuilt from its seed/),
    ).toBeTruthy();
    // Narration is named twice on purpose: in the result's own "Excluded"
    // row and in the standing note under the panel.
    expect(within(panel).getAllByText(/narration/i).length).toBeGreaterThanOrEqual(2);
    expect(within(panel).getByText(/Deliberately outside replay equivalence/)).toBeTruthy();
  });

  it("shows which workpapers a controlled-state change invalidates", () => {
    const { queries, ctx } = services();
    const slices = queries.getPbcDependencySlices(ctx);
    renderPackage();
    const panel = screen
      .getByText("What a change invalidates")
      .closest("section") as HTMLElement;
    for (const slice of slices) {
      expect(within(panel).getAllByText(slice.slice).length).toBeGreaterThan(0);
    }
    expect(within(panel).getByText(/becomes\s+Refresh Required/)).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ */
/* Deep routes                                                         */
/* ------------------------------------------------------------------ */

describe("control-domain sections are honest filters over the queue", () => {
  it("lists exactly the exceptions whose rule belongs to the section's domains", () => {
    const { queries, ctx } = services();
    const rules = new Map(
      queries.listRuleSummaries(ctx).map((r) => [r.id, r.controlDomain]),
    );
    const all = queries.listExceptions(ctx);
    for (const [key, section] of Object.entries(EXCEPTION_SECTIONS)) {
      const expected = all
        .filter((e) =>
          section.domains.includes(rules.get(e.exception.finding.ruleId) ?? ""),
        )
        .map((e) => e.exception.id)
        .sort();
      expect(expected.length, `${key} filtered to nothing`).toBeGreaterThan(0);
      const data = buildExceptionsData(userByRole("CONTROLLER"), "T-09", key);
      expect(data.rows.map((r) => r.id).sort()).toEqual(expected);
      expect(data.filter?.shown).toBe(expected.length);
      expect(data.filter?.outOf).toBe(all.length);
    }
  });

  it("says it is a filter, so its counts are never read as the close's", () => {
    renderSection("cutoff");
    expect(screen.getByText(/CUTOFF control domain/)).toBeTruthy();
    expect(screen.getByText(/the counts on this page are the filter's/)).toBeTruthy();
  });

  it("names both domains on the ownership section rather than leaving the grouping implied", () => {
    renderSection("ownership");
    expect(screen.getByText(/OWNERSHIP or THIRD_PARTY control domains/)).toBeTruthy();
  });

  it("counts only the blockers inside the filter", () => {
    const { queries, ctx } = services();
    const blockers = queries.getBlockers(ctx);
    for (const key of Object.keys(EXCEPTION_SECTIONS)) {
      const data = buildExceptionsData(userByRole("CONTROLLER"), "T-09", key);
      const ids = new Set(data.rows.map((r) => r.id));
      expect(data.openBlockerCount).toBe(
        blockers.filter((b) => ids.has(b.exceptionId)).length,
      );
    }
  });

  it("keeps the unfiltered queue unfiltered", () => {
    const { queries, ctx } = services();
    const data = buildExceptionsData(userByRole("CONTROLLER"), "T-09");
    expect(data.filter).toBeNull();
    expect(data.rows).toHaveLength(queries.listExceptions(ctx).length);
    expect(data.openBlockerCount).toBe(queries.getBlockers(ctx).length);
  });
});

describe("a demo stop is a link, not a sequence of clicks", () => {
  it("opens the reconciliation tab named in the URL", () => {
    actingRole = "CONTROLLER";
    const user = userByRole("CONTROLLER");
    render(
      <ReconciliationScreen
        shell={buildShellData(user, "T-09")}
        data={buildReconciliationData(user, "", "T-09")}
        initialTab="procurement"
        setRoleAction={noopRole}
      />,
    );
    expect(screen.getByRole("tab", { name: /Procurement Match/ })).toHaveProperty(
      "ariaSelected",
      "true",
    );
  });

  it("opens the count tab named in the URL and ignores an unknown one", () => {
    const user = userByRole("CONTROLLER");
    const { unmount } = render(
      <PhysicalCountScreen
        shell={buildShellData(user, "T-09")}
        data={buildPhysicalCountData(user, "T-09")}
        initialTab="cycle"
        setRoleAction={noopRole}
      />,
    );
    expect(screen.getByRole("tab", { name: /Cycle Count History/ })).toHaveProperty(
      "ariaSelected",
      "true",
    );
    unmount();
    render(
      <PhysicalCountScreen
        shell={buildShellData(user, "T-09")}
        data={buildPhysicalCountData(user, "T-09")}
        initialTab="not-a-tab"
        setRoleAction={noopRole}
      />,
    );
    expect(screen.getByRole("tab", { name: /Year-End Count/ })).toHaveProperty(
      "ariaSelected",
      "true",
    );
  });

  it("opens the workpaper tab named in the URL", () => {
    renderPackage("CONTROLLER", "PBC-008", "versions");
    expect(screen.getByRole("tab", { name: /Version History/ })).toHaveProperty(
      "ariaSelected",
      "true",
    );
  });
});

/* ------------------------------------------------------------------ */
/* AI off                                                              */
/* ------------------------------------------------------------------ */

describe("the AI-off state is stated on the answer", () => {
  it("says no model contributed and that the answer is unchanged without one", async () => {
    const user = userEvent.setup();
    actingRole = "CONTROLLER";
    const acting = userByRole("CONTROLLER");
    render(
      <ExceptionDetailScreen
        shell={buildShellData(acting, "T-09")}
        data={buildExceptionDetailData(acting, "EXC-001", "T-09")}
        setRoleAction={noopRole}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Ask Gaurd" }));
    const drawer = within(await screen.findByLabelText("Ask Gaurd", { selector: "aside" }));
    await user.click(drawer.getByRole("button", { name: /still open\?$/ }));
    expect(await drawer.findByText("AI OFF — DETERMINISTIC ANSWER")).toBeTruthy();
    expect(
      drawer.getByText(/identical with AI unavailable/),
    ).toBeTruthy();
  });

  it("carries the same status on the structured result the drawer renders", () => {
    const result = askGaurdData(
      userByRole("CONTROLLER"),
      "Why is this still open?",
      { exceptionId: "EXC-001" },
      "T-09",
    );
    expect(result.aiStatus.providerBound).toBe(false);
    expect(result.aiStatus.narrationAvailable).toBe(false);
    expect(result.answer?.narration).toBeNull();
    // Every figure in the answer came from a tool result, so the answer
    // survives the provider being absent — which it always is here.
    expect(result.answer?.knownFacts.length).toBeGreaterThan(0);
    expect(result.toolsUsed.length).toBeGreaterThan(0);
  });
});
