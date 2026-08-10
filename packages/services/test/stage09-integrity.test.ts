import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { userByRole } from "@icg/data";
import { REPLAY_COMPARED_SECTIONS } from "@icg/rules";
import { AuthorizationError, hasPermission } from "@icg/permissions";
import { DEMO_USERS } from "@icg/data";
import {
  createCommandService,
  createQueryService,
  createWorkspace,
  DEMO_RESET_PERMISSION,
  pbcDependencySlices,
  type ServiceContext,
  type Workspace,
} from "../src/index.js";
import { PBC_DEPENDENCIES, pbcDependencyHash } from "../src/workspace.js";

/**
 * Stage 09 — demo reset, replay, and dependency-aware PBC refresh.
 *
 * The reset assertions compare against `golden/baseline.json` rather than
 * against numbers typed into this file: the point of Reset Demo is that the
 * baseline is re-derived from the seed, the rules and the scenario events,
 * so the check has to be against the locked control totals, not against a
 * snapshot of whatever the code produced today.
 */

const golden = JSON.parse(
  readFileSync(new URL("../../../golden/baseline.json", import.meta.url), "utf8"),
) as Record<string, number | string>;

let ws: Workspace;
let queries: ReturnType<typeof createQueryService>;
let commands: ReturnType<typeof createCommandService>;

const ctxFor = (role: Parameters<typeof userByRole>[0]): ServiceContext => ({
  user: userByRole(role),
  correlationId: "CORR-09",
  sourceInterface: "TEST",
});

const controller = () => ctxFor("CONTROLLER");

beforeEach(() => {
  ws = createWorkspace();
  queries = createQueryService(ws);
  commands = createCommandService(ws);
});

describe("Reset Demo restores the exact baseline from source facts", () => {
  it("re-derives every locked control total after the workspace has been worked in", () => {
    // Work the demo hard first: the reset must restore from facts, not from
    // a workspace that was never disturbed.
    commands.submitEvidence(controller(), {
      title: "Signed acceptance memo",
      kind: "NOTE",
      content: { note: "n" },
      relatedObjectRef: "EXC-001",
    });
    commands.addComment(controller(), "EXC-001", "chasing Legal");
    commands.createDraft(controller(), "MEMO", "EXC-001", "draft body");
    commands.requestReview(controller(), "EXC-001");
    commands.lockPeriod(controller(), "SOFT_LOCKED");

    const result = commands.resetDemo(controller());
    const a = result.aggregates;

    expect(a.exceptionCount).toBe(golden["exception_count"]);
    expect(a.openExceptionCount).toBe(golden["open_exception_count"]);
    expect(a.resolvedExceptionCount).toBe(golden["resolved_exception_count"]);
    expect(a.blockerCount).toBe(golden["blocker_count"]);
    expect(a.blockerExposureCents).toBe(golden["blocker_exposure_cents"]);
    expect(a.designedExceptionExposureCents).toBe(
      golden["designed_exception_exposure_cents"],
    );
    expect(a.grossInventoryCents).toBe(golden["gross_inventory_cents"]);
    expect(a.grossGlCents).toBe(golden["gross_gl_cents"]);
    expect(a.grossGlDifferenceCents).toBe(golden["gross_gl_difference_cents"]);
    expect(a.closeReadinessBps).toBe(golden["close_readiness_bps"]);
    expect(a.pbcReady).toBe(golden["pbc_ready"]);
    expect(a.pbcTotal).toBe(golden["pbc_total"]);
    expect(`${(a.pbcReadinessBps / 100).toFixed(2)}`).toBe(golden["pbc_readiness_percent"]);
    expect(`${(a.sourceHealthBps / 100).toFixed(2)}`).toBe(golden["source_health_percent"]);
    expect(ws.dataset.manifest.controlTotals.bookUnits).toBe(golden["book_units"]);
    expect(result.datasetVersion).toBe(golden["dataset_version"]);
  });

  it("clears working state, reopens the period, and keeps the audit trail", () => {
    commands.addComment(controller(), "EXC-002", "note");
    commands.createDraft(controller(), "MEMO", "EXC-002", "body");
    commands.lockPeriod(controller(), "LOCKED");
    const before = ws.audit.count();

    const result = commands.resetDemo(controller());

    expect(result.cleared).toMatchObject({
      comments: 1,
      drafts: 1,
      submittedEvidence: 0,
      reviews: 0,
      period: "LOCKED",
    });
    expect(ws.comments).toHaveLength(0);
    expect(ws.drafts).toHaveLength(0);
    expect(ws.period.state).toBe("OPEN");
    // Append-only: the log grew by exactly the reset event.
    expect(ws.audit.count()).toBe(before + 1);
    expect(result.auditEventsRetained).toBe(before + 1);
    const last = ws.audit.list().at(-1);
    expect(last?.action).toBe("DEMO_RESET");
    expect(last?.priorState).toBe("LOCKED");
    expect(last?.detail).toContain("rebuilt");
  });

  it("hard-codes no final metric: the reset path only rebuilds", () => {
    const source = readFileSync(new URL("../src/workspace.ts", import.meta.url), "utf8");
    // Any canonical figure appearing in the reset path would mean the
    // baseline was restored rather than re-derived.
    for (const forbidden of ["8142", "8095", "9167", "198950", "19895000", "12450"]) {
      expect(source, `workspace.ts hard-codes ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("is a controlled operation: a role without the permission is refused", () => {
    expect(() => commands.resetDemo(ctxFor("AUDITOR_READ_ONLY"))).toThrowError(
      AuthorizationError,
    );
    expect(() => commands.resetDemo(ctxFor("PREPARER"))).toThrowError(AuthorizationError);
    // Nothing happened: a refused command must not half-run.
    expect(ws.audit.count()).toBe(0);
  });

  it("offers the control to exactly the roles the command allows", () => {
    for (const user of DEMO_USERS) {
      const ctx: ServiceContext = {
        user,
        correlationId: "CORR-09",
        sourceInterface: "TEST",
      };
      let offered: boolean;
      try {
        offered = queries.getDemoCapabilities(ctx).canResetDemo;
      } catch {
        offered = false; // cannot even read the close
      }
      let allowed = true;
      try {
        createCommandService(createWorkspace()).resetDemo(ctx);
      } catch (error) {
        allowed = !(error instanceof AuthorizationError);
      }
      expect(offered, `${user.id} (${user.roles[0]}) offer/allow disagree`).toBe(allowed);
      expect(offered).toBe(hasPermission(user, DEMO_RESET_PERMISSION));
    }
  });
});

describe("Reproduce Close compares structured output and says what it skipped", () => {
  it("returns MATCH for a close rebuilt from the same seed", () => {
    const check = queries.verifyReproduction(controller());
    expect(check.outcome).toBe("MATCH");
    expect(check.mismatchPaths).toEqual([]);
    expect(check.datasetReproduced).toBe(true);
    expect(check.outputHash).toBe(check.replayOutputHash);
    // The run identity is derived from the controlled inputs, so a faithful
    // replay carries the same id.
    expect(check.replayRunId).toBe(check.baselineRunId);
  });

  it("still matches after the workspace has been mutated — replay is of the close, not the session", () => {
    commands.addComment(controller(), "EXC-001", "note");
    commands.submitEvidence(controller(), {
      title: "x",
      kind: "NOTE",
      content: { n: 1 },
      relatedObjectRef: "EXC-001",
    });
    expect(queries.verifyReproduction(controller()).outcome).toBe("MATCH");
  });

  it("names every compared section and every exclusion", () => {
    const check = queries.verifyReproduction(controller());
    expect(check.comparedSections).toEqual([...REPLAY_COMPARED_SECTIONS]);
    // The exclusions are stated rather than implied — LLM prose above all.
    expect(check.excludedFromEquivalence.join(" ")).toMatch(/narration/i);
    expect(queries.getReplayCoverage(controller()).compared).toEqual(
      check.comparedSections,
    );
  });

  it("carries the full version set a replay needs", () => {
    const check = queries.verifyReproduction(controller());
    expect(check.versions.ruleset).toBe("RULESET-v1.0.0");
    expect(check.versions.policy).toBe("CLOSE-POLICY-v1.0.0");
    expect(check.versions.scenarioApplied).toBe(true);
    expect(check.datasetVersion).toBe(golden["dataset_version"]);
  });

  it("is a read: it appends no audit event and changes no state", () => {
    const hashBefore = ws.close.runManifest.outputHash;
    queries.verifyReproduction(controller());
    expect(ws.audit.count()).toBe(0);
    expect(ws.close.runManifest.outputHash).toBe(hashBefore);
  });

  it("is denied to a role that cannot read the close", () => {
    expect(() => queries.verifyReproduction(ctxFor("SYSTEM_ADMIN"))).toThrowError(
      AuthorizationError,
    );
  });
});

describe("PBC refresh is dependency-aware, not global", () => {
  it("flags exactly the workpapers prepared against a changed slice", () => {
    // Every slice, not one example: the contract is per-dependency.
    for (const slice of pbcDependencySlices(ws.close)) {
      const fresh = createWorkspace();
      const q = createQueryService(fresh);
      // Simulate that slice moving after preparation.
      for (const [pbcId, deps] of Object.entries(PBC_DEPENDENCIES)) {
        if (deps.includes(slice.slice)) {
          fresh.pbcPreparedState.set(pbcId, `moved:${slice.slice}`);
        }
      }
      const pkg = q.getPbcPackage(controller());
      const stale = pkg.filter((i) => i.refreshRequired).map((i) => i.id);
      expect(stale.sort(), `${slice.slice} invalidated the wrong set`).toEqual(
        [...slice.workpapers].sort(),
      );
      // The prepared state stays readable underneath the refresh flag.
      for (const item of pkg.filter((i) => i.refreshRequired)) {
        expect(item.baselineStatus).not.toBe("REFRESH_REQUIRED");
        expect(item.dependsOn).toContain(slice.slice);
      }
    }
  });

  it("leaves nothing stale in the baseline, and nothing stale after a reset", () => {
    expect(queries.getPbcPackage(controller()).some((i) => i.refreshRequired)).toBe(false);
    ws.pbcPreparedState.set("PBC-008", "moved");
    expect(
      queries.getPbcPackage(controller()).find((i) => i.id === "PBC-008")?.refreshRequired,
    ).toBe(true);
    commands.resetDemo(controller());
    expect(queries.getPbcPackage(controller()).some((i) => i.refreshRequired)).toBe(false);
  });

  it("inverts the same edges getPbcPackage reads, with no second declaration", () => {
    const slices = pbcDependencySlices(ws.close);
    const fromSlices = new Map<string, string[]>();
    for (const slice of slices) {
      for (const pbc of slice.workpapers) {
        fromSlices.set(pbc, [...(fromSlices.get(pbc) ?? []), slice.slice]);
      }
    }
    for (const item of queries.getPbcPackage(controller())) {
      expect((fromSlices.get(item.id) ?? []).sort()).toEqual([...item.dependsOn].sort());
      // And the hash a slice reports is the hash the workpaper compares to.
      expect(slices.every((s) => s.currentHash === pbcDependencyHash(ws.close, [s.slice])))
        .toBe(true);
    }
  });

  it("keeps refresh out of the readiness numerator", () => {
    const before = queries.getCloseReadiness(controller()).aggregates.pbcReadinessBps;
    for (const id of Object.keys(PBC_DEPENDENCIES)) ws.pbcPreparedState.set(id, "moved");
    expect(queries.getPbcPackage(controller()).every((i) => i.refreshRequired)).toBe(true);
    // Readiness is a rule output over prepared state; a service-layer
    // staleness flag must not move a locked control total.
    expect(queries.getCloseReadiness(controller()).aggregates.pbcReadinessBps).toBe(before);
  });
});

describe("the control totals a manifest shows are read from the close", () => {
  it("matches the close aggregates figure for figure", () => {
    const controls = queries.getCloseControls(controller());
    const a = ws.close.aggregates;
    const byKey = new Map(controls.map((c) => [c.key, c]));
    expect(byKey.get("gross-gl")?.cents).toBe(a.grossGlCents);
    expect(byKey.get("gl-difference")?.cents).toBe(a.grossGlDifferenceCents);
    expect(byKey.get("blockers")?.count).toBe(a.blockerCount);
    expect(byKey.get("blocker-exposure")?.cents).toBe(a.blockerExposureCents);
    expect(byKey.get("close-readiness")?.bps).toBe(a.closeReadinessBps);
    expect(byKey.get("pbc-readiness")?.bps).toBe(a.pbcReadinessBps);
    expect(byKey.get("source-health")?.bps).toBe(a.sourceHealthBps);
    // Book units and the count population are different figures and are
    // labelled as such: 1,500 on the book, 1,065 in countable locations.
    expect(byKey.get("book-units")?.count).toBe(golden["book_units"]);
    expect(byKey.get("count-population")?.count).toBe(ws.close.countSummary.populationUnits);
    expect(byKey.get("book-units")?.count).not.toBe(byKey.get("count-population")?.count);
  });
});
