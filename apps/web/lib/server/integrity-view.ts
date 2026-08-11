import type { DemoUser } from "@icg/data";
import type { CloseControl } from "@icg/services";
import { formatBpsExact, formatCents, formatInstant, shortHash } from "../format";
import type {
  PackageManifestData,
  ReplayResultView,
  ResetResultView,
} from "../view-model";
import { attempt } from "./data";
import { getCommands, getQueries, makeContext } from "./workspace";

/**
 * Close integrity surfaces (stage 09): the export package's manifest,
 * `Reproduce Close`, and `Reset Demo`.
 *
 * Everything here is a rendering of what @icg/services returned. The
 * control totals are read from the close on every request rather than
 * listed in this file — a manifest that carried its own copy of the numbers
 * would keep reading correct after the close stopped being.
 */

/** A control total formatted by the same helpers the screens use. */
function controlValue(control: CloseControl): string {
  if (control.cents !== undefined) return formatCents(control.cents);
  if (control.bps !== undefined) return formatBpsExact(control.bps);
  if (control.count !== undefined) return String(control.count);
  return control.text ?? "—";
}

const SYNTHETIC_DISCLOSURE =
  "Every figure, name, document and identifier in this package is synthetic. " +
  "KestrelGrid AI is a fictional company, the FY2026 dataset is generated from a " +
  "recorded seed, and no real company, customer, vendor or transaction is represented.";

export function buildPackageManifest(
  user: DemoUser,
  correlationId: string,
): PackageManifestData | null {
  const queries = getQueries();
  const ctx = makeContext(user, correlationId);

  const manifest = attempt(() => queries.getRunManifest(ctx));
  const controls = attempt(() => queries.getCloseControls(ctx));
  if (manifest === undefined || controls === undefined) return null;

  const slices = attempt(() => queries.getPbcDependencySlices(ctx)) ?? [];
  const coverage = attempt(() => queries.getReplayCoverage(ctx));
  const syncs = Object.entries(manifest.sourceSyncIds);

  return {
    manifest: [
      { k: "Run", v: manifest.runId },
      { k: "Executed", v: formatInstant(manifest.executedAt) },
      { k: "Dataset", v: `${manifest.datasetVersion} · ${shortHash(manifest.datasetHash)}` },
      { k: "Ruleset", v: manifest.rulesetVersion },
      { k: "Rules", v: `${Object.keys(manifest.ruleVersions).length} versioned rules` },
      { k: "Policy", v: manifest.policyVersion },
      { k: "Configuration", v: manifest.configVersion },
      {
        k: "Scenario script",
        v: `${manifest.scenarioScriptVersion} · ${manifest.scenarioApplied ? "applied" : "not applied"}`,
      },
      { k: "Source syncs", v: syncs.map(([system, id]) => `${system} ${id}`).join(" · ") },
      { k: "Output hash", v: shortHash(manifest.outputHash) },
    ],
    controls: controls.map((control) => ({
      k: control.label,
      v: controlValue(control),
    })),
    dependencies: slices.map((slice) => ({
      slice: slice.slice,
      kind: slice.kind === "EXCEPTION" ? "Close exception" : "Close state",
      hash: shortHash(slice.currentHash),
      workpapers: slice.workpapers.join(", "),
    })),
    comparedSections: coverage?.compared ?? [],
    excluded: coverage?.excluded ?? [],
    disclosure: SYNTHETIC_DISCLOSURE,
    dependencyNote:
      "Read this the way a preparer does: if the slice on the left changes after a " +
      "workpaper was prepared against it, every request on the right becomes " +
      "Refresh Required. The prepared version stays sealed — a refresh supersedes it, " +
      "it does not edit it.",
  };
}

/**
 * Run Reproduce Close. Rebuilds from the seed and compares structured
 * output only; the exclusions are named in the result rather than left for
 * the reader to assume.
 */
export function runReproduceClose(
  user: DemoUser,
  correlationId: string,
): ReplayResultView {
  const queries = getQueries();
  const ctx = makeContext(user, correlationId);
  const check = attempt(() => queries.verifyReproduction(ctx));

  if (check === undefined) {
    return {
      outcome: "DENIED",
      headline: "Your role cannot read close data, so the close cannot be reproduced here.",
      rows: [],
      mismatchPaths: [],
    };
  }

  return {
    outcome: check.outcome,
    headline:
      check.outcome === "MATCH"
        ? "MATCH — the dataset rebuilt from its seed and the rules reproduced every structured output."
        : "MISMATCH — a rebuild from the same seed and rules did not reproduce this close.",
    rows: [
      { k: "Baseline run", v: check.baselineRunId },
      { k: "Replay run", v: check.replayRunId },
      {
        k: "Dataset",
        v: check.datasetReproduced
          ? `${check.datasetVersion} reproduced · ${shortHash(check.datasetHash)}`
          : `${check.datasetVersion} DID NOT reproduce · ${shortHash(check.datasetHash)} vs ${shortHash(check.replayDatasetHash)}`,
      },
      {
        k: "Output hash",
        v:
          check.outputHash === check.replayOutputHash
            ? `${shortHash(check.outputHash)} · identical`
            : `${shortHash(check.outputHash)} vs ${shortHash(check.replayOutputHash)}`,
      },
      { k: "Compared", v: `${check.comparedSections.length} structured sections` },
      { k: "Excluded", v: check.excludedFromEquivalence.join("; ") },
      {
        k: "Versions",
        v: `${check.versions.ruleset} · ${check.versions.policy} · ${check.versions.config} · ${check.versions.scenarioScript}`,
      },
    ],
    mismatchPaths: check.mismatchPaths,
  };
}

/**
 * Run Reset Demo. The command rebuilds derived state from source facts; the
 * report says what was cleared and what survived, because a reset that
 * silently kept or dropped state would be indistinguishable from one that
 * did the opposite.
 */
export function runResetDemo(user: DemoUser, correlationId: string): ResetResultView {
  const commands = getCommands();
  const ctx = makeContext(user, correlationId);
  const result = attempt(() => commands.resetDemo(ctx));

  if (result === undefined) {
    return {
      ok: false,
      headline: "Reset refused",
      detail:
        "Reset Demo is a controlled operation and your role is not authorized to run it.",
    };
  }

  const cleared = result.cleared;
  /**
   * Counted nouns, agreeing with their count. The sentence used to hard-code
   * every plural, which read correctly only because the demo baseline clears
   * zero of everything — the moment a reader actually did one piece of work
   * it reported "1 comments".
   */
  const counted = (n: number, singular: string, plural = `${singular}s`) =>
    `${n} ${n === 1 ? singular : plural}`;
  return {
    ok: true,
    headline: `Rebuilt from ${result.datasetVersion} · run ${result.runId}`,
    detail:
      `${result.aggregates.exceptionCount} exceptions, ${result.aggregates.blockerCount} blockers and ` +
      `${formatBpsExact(result.aggregates.closeReadinessBps)} readiness were re-derived from the seed, the rules and the scenario events. ` +
      `Cleared ${counted(cleared.comments, "comment")}, ${counted(cleared.drafts, "draft")}, ` +
      `${counted(cleared.submittedEvidence, "submitted record", "submitted records")}, ` +
      `${counted(cleared.reviews, "review")}, ` +
      `${counted(cleared.conclusions, "management conclusion")}, ` +
      `${counted(cleared.evidenceRequests, "evidence request")} ` +
      `and ${counted(cleared.memoVersions, "close-memo version")}; ` +
      `the append-only audit trail kept ${result.auditEventsRetained === 1 ? "its single event" : `all ${result.auditEventsRetained} events`}, including this reset.`,
  };
}
