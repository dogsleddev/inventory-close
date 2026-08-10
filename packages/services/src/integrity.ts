import { buildDataset, toCloseInput } from "@icg/data";
import {
  REPLAY_COMPARED_SECTIONS,
  reproduceClose,
  runClose,
  type CloseRunResult,
} from "@icg/rules";
import { PBC_DEPENDENCIES, pbcDependencyHash } from "./workspace.js";

/**
 * Close integrity (stage 09) — the determinism surface behind `Reproduce
 * Close` and the audit package's manifest.
 *
 * Two things are asserted here and nowhere else:
 *
 * 1. **The numbers reproduce from their sources.** The check rebuilds the
 *    dataset from the seed and re-runs the rules against it; it never
 *    compares the workspace to a stored copy of itself, which would prove
 *    only that memory is stable.
 * 2. **Only structured output takes part.** Replay equivalence covers the
 *    sections `@icg/rules` names in `REPLAY_COMPARED_SECTIONS` — LLM prose
 *    is excluded by construction (CANONICAL_SPEC section 15), and the
 *    exclusion is reported rather than left to the reader to assume.
 */

/**
 * A control total, carried as the integer the core produced. Formatting
 * belongs to the caller, so a figure here and the same figure on a screen
 * cannot disagree.
 */
export interface CloseControl {
  readonly key: string;
  readonly label: string;
  readonly cents?: number;
  readonly bps?: number;
  readonly count?: number;
  readonly text?: string;
}

export interface ReproductionCheck {
  readonly outcome: "MATCH" | "MISMATCH";
  readonly baselineRunId: string;
  readonly replayRunId: string;
  /** Structured sections that differed; empty on MATCH. */
  readonly mismatchPaths: readonly string[];
  readonly datasetVersion: string;
  readonly datasetHash: string;
  readonly replayDatasetHash: string;
  /** The seed reproduced the same dataset — the first half of determinism. */
  readonly datasetReproduced: boolean;
  readonly outputHash: string;
  readonly replayOutputHash: string;
  readonly comparedSections: readonly string[];
  readonly excludedFromEquivalence: readonly string[];
  readonly versions: {
    readonly ruleset: string;
    readonly policy: string;
    readonly config: string;
    readonly scenarioScript: string;
    readonly scenarioApplied: boolean;
  };
}

/**
 * What replay equivalence deliberately leaves out. Stated as data so the
 * exclusions can be shown next to the result: an equivalence check that
 * does not say what it skipped invites the reader to assume it skipped
 * nothing.
 */
export const REPLAY_EXCLUSIONS = [
  "Ask Gaurd narration (generated prose)",
  "Working state — comments, drafts, submitted evidence, reviews",
  "The audit trail, which records what happened rather than what was derived",
] as const;

/** Coverage of the equivalence check, without paying for a rebuild. */
export function replayCoverage(): {
  readonly compared: readonly string[];
  readonly excluded: readonly string[];
} {
  return { compared: REPLAY_COMPARED_SECTIONS, excluded: REPLAY_EXCLUSIONS };
}

/**
 * Re-derive the close from the seed and compare it to the running one.
 *
 * The run id is itself derived from the controlled inputs, so a faithful
 * replay carries the SAME id as the baseline — that is the evidence, not a
 * coincidence to hide.
 */
export function verifyReproduction(close: CloseRunResult): ReproductionCheck {
  const dataset = buildDataset();
  const replay = runClose(toCloseInput(dataset));
  const result = reproduceClose(close, replay);
  return {
    outcome: result.outcome,
    baselineRunId: String(result.baselineRunId),
    replayRunId: String(result.replayRunId),
    mismatchPaths: result.mismatchPaths,
    datasetVersion: close.runManifest.datasetVersion,
    datasetHash: close.runManifest.datasetHash,
    replayDatasetHash: replay.runManifest.datasetHash,
    datasetReproduced:
      close.runManifest.datasetHash === replay.runManifest.datasetHash,
    outputHash: close.runManifest.outputHash,
    replayOutputHash: replay.runManifest.outputHash,
    comparedSections: REPLAY_COMPARED_SECTIONS,
    excludedFromEquivalence: REPLAY_EXCLUSIONS,
    versions: {
      ruleset: close.runManifest.rulesetVersion,
      policy: close.runManifest.policyVersion,
      config: close.runManifest.configVersion,
      scenarioScript: close.runManifest.scenarioScriptVersion,
      scenarioApplied: close.runManifest.scenarioApplied,
    },
  };
}

/**
 * The control totals a reader checks a rebuild against — every one read
 * from the close the rules produced. Nothing here is authored: a wrong
 * number in this list means the close is wrong, not that the list is stale.
 */
export function describeControls(
  close: CloseRunResult,
  /** Book units come from the dataset's own control totals, not the count. */
  bookUnits?: number,
): readonly CloseControl[] {
  const a = close.aggregates;
  return [
    ...(bookUnits !== undefined
      ? [{ key: "book-units", label: "Book units", count: bookUnits }]
      : []),
    // The count population is a SUBSET of the book: countable locations
    // only. Labelling it "book units" would overstate what was counted.
    {
      key: "count-population",
      label: "Year-end count population",
      count: close.countSummary.populationUnits,
    },
    { key: "gross-inventory", label: "Gross inventory (subledger)", cents: a.grossInventoryCents },
    { key: "gross-gl", label: "Gross inventory GL", cents: a.grossGlCents },
    { key: "gl-difference", label: "GL difference", cents: a.grossGlDifferenceCents },
    { key: "exceptions", label: "Designed exceptions", count: a.exceptionCount },
    { key: "open", label: "Open exceptions", count: a.openExceptionCount },
    { key: "resolved", label: "Resolved exceptions", count: a.resolvedExceptionCount },
    { key: "blockers", label: "Blockers", count: a.blockerCount },
    { key: "blocker-exposure", label: "Blocker exposure", cents: a.blockerExposureCents },
    {
      key: "designed-exposure",
      label: "Designed exception exposure",
      cents: a.designedExceptionExposureCents,
    },
    { key: "close-readiness", label: "Close readiness", bps: a.closeReadinessBps },
    { key: "pbc-readiness", label: "PBC readiness", bps: a.pbcReadinessBps },
    { key: "pbc-ready", label: "PBC ready or provided", count: a.pbcReady },
    { key: "pbc-total", label: "PBC requests", count: a.pbcTotal },
    { key: "source-health", label: "Source health", bps: a.sourceHealthBps },
  ];
}

/** One controlled-state slice and the workpapers that depend on it. */
export interface PbcDependencySlice {
  readonly slice: string;
  /** An exception id, or a named close-state slice such as COUNTS. */
  readonly kind: "EXCEPTION" | "CLOSE_STATE";
  /** Current hash of that slice — what preparation is compared against. */
  readonly currentHash: string;
  readonly workpapers: readonly string[];
}

/**
 * The dependency map behind REFRESH_REQUIRED, read in the direction that
 * answers the question a preparer actually asks: *if this changes, what
 * needs re-providing?* The per-workpaper direction already exists on
 * `getPbcPackage`; this is the same edges inverted, never a second source.
 */
export function pbcDependencySlices(close: CloseRunResult): readonly PbcDependencySlice[] {
  const bySlice = new Map<string, string[]>();
  for (const [pbcId, deps] of Object.entries(PBC_DEPENDENCIES)) {
    for (const dep of deps) {
      const list = bySlice.get(dep) ?? [];
      list.push(pbcId);
      bySlice.set(dep, list);
    }
  }
  return [...bySlice.entries()]
    .map(([slice, workpapers]) => ({
      slice,
      kind: slice.startsWith("EXC-") ? ("EXCEPTION" as const) : ("CLOSE_STATE" as const),
      currentHash: pbcDependencyHash(close, [slice]),
      workpapers: [...workpapers].sort(),
    }))
    .sort((a, b) =>
      a.kind === b.kind ? (a.slice < b.slice ? -1 : 1) : a.kind === "CLOSE_STATE" ? -1 : 1,
    );
}
