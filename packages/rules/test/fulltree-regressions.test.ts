import { describe, expect, it } from "vitest";
import { buildDataset, toCloseInput } from "@icg/data";
import {
  POLICY_V1,
  REPLAY_COMPARED_SECTIONS,
  reproduceClose,
  runClose,
  type CloseInput,
} from "../src/index.js";

/**
 * Full-tree adversarial review regressions — run identity and replay
 * diagnostics (post stage 09).
 *
 * Both findings were the same shape as the UI defects this project keeps
 * catching: a field asserting more than it holds. `runId` claimed to
 * identify a run while binding only part of the controlled input, and
 * `reproduceClose` could answer MISMATCH while naming nothing that
 * differed.
 */

const input = toCloseInput(buildDataset());
const baseline = runClose(input);

describe("run identity binds every controlled input docs/16 names", () => {
  it("is stable for an identical re-run", () => {
    expect(runClose(input).runManifest.runId).toBe(baseline.runManifest.runId);
  });

  it("changes when the policy version changes", () => {
    const stricter = runClose(input, {
      policy: { ...POLICY_V1, version: "CLOSE-POLICY-v9.9.9-TEST" },
    });
    expect(stricter.runManifest.runId).not.toBe(baseline.runManifest.runId);
  });

  it("changes when the scenario is not applied", () => {
    expect(runClose(input, { applyScenario: false }).runManifest.runId).not.toBe(
      baseline.runManifest.runId,
    );
  });

  /**
   * The reproducer's exact case: strip the year-end count plan AFTER
   * `toCloseInput` built the input. `datasetHash` is a claim the caller
   * supplies, so it does not move; the row shape does, and a run whose
   * rules see different data must not wear the same run identity.
   */
  it("changes when the input's row shape changes under an unchanged dataset hash", () => {
    const mutated: CloseInput = {
      ...input,
      countPlans: input.countPlans.filter((p) => p.countType !== "YEAR_END"),
    };
    const run = runClose(mutated);
    expect(run.runManifest.datasetHash).toBe(baseline.runManifest.datasetHash);
    expect(run.runManifest.outputHash).not.toBe(baseline.runManifest.outputHash);
    expect(
      run.runManifest.runId,
      "two materially different runs shared one run identity",
    ).not.toBe(baseline.runManifest.runId);
  });

  it("carries the same identity into every rule execution of that run", () => {
    for (const execution of baseline.ruleExecutions) {
      expect(String(execution.runId)).toBe(baseline.runManifest.runId);
    }
  });
});

describe("a replay verdict always names what moved", () => {
  it("returns MATCH with no paths for a faithful re-run", () => {
    const result = reproduceClose(baseline, runClose(input));
    expect(result.outcome).toBe("MATCH");
    expect(result.mismatchPaths).toEqual([]);
  });

  /**
   * MISMATCH must never be silent. Whatever differs, at least one compared
   * section has to account for it — otherwise the reader is told the close
   * did not reproduce and given nothing to look at.
   */
  it("names at least one section for every reachable mismatch", () => {
    const variants: { label: string; run: ReturnType<typeof runClose> }[] = [
      { label: "scenario not applied", run: runClose(input, { applyScenario: false }) },
      {
        label: "row shape changed",
        run: runClose({
          ...input,
          countPlans: input.countPlans.filter((p) => p.countType !== "YEAR_END"),
        }),
      },
      {
        label: "source health degraded",
        run: runClose({
          ...input,
          sourceHealth: input.sourceHealth.map((h) => ({ ...h, status: "FAILED" as const })),
        }),
      },
    ];
    for (const { label, run } of variants) {
      const result = reproduceClose(baseline, run);
      expect(result.outcome, `${label} unexpectedly matched`).toBe("MISMATCH");
      expect(
        result.mismatchPaths.length,
        `${label}: MISMATCH named no section that differed`,
      ).toBeGreaterThan(0);
      for (const path of result.mismatchPaths) {
        expect(REPLAY_COMPARED_SECTIONS).toContain(path);
      }
    }
  });

  /**
   * The specific hole: per-rule coverage decides the verdict because it is
   * folded into the output hash, but it used to sit outside the only list
   * the diagnostic walked. A coverage-only change is exactly the case that
   * produced MISMATCH with an empty path list.
   */
  /**
   * Directly: a run differing ONLY in per-rule result/coverage. No public
   * input reaches that state today — every input change that moves a rule
   * also moves a section — which is precisely why the gap survived. The
   * diagnostic is asserted against the state itself rather than against a
   * contrived input, so the guarantee holds however the rules evolve.
   */
  it("names the per-rule section when only a rule's coverage moved", () => {
    expect(REPLAY_COMPARED_SECTIONS).toContain("ruleResults");
    const first = baseline.ruleExecutions[0];
    expect(first).toBeDefined();
    const replay = {
      ...baseline,
      ruleExecutions: [
        { ...first!, coverage: first!.coverage === "COMPLETE" ? "PARTIAL" : "COMPLETE" },
        ...baseline.ruleExecutions.slice(1),
      ],
      runManifest: { ...baseline.runManifest, outputHash: "differs-by-construction" },
    } as typeof baseline;
    const result = reproduceClose(baseline, replay);
    expect(result.outcome).toBe("MISMATCH");
    expect(
      result.mismatchPaths,
      "a coverage-only difference was reported as an unexplained MISMATCH",
    ).toEqual(["ruleResults"]);
  });
});
