import type { IsoDateTime } from "../dates.js";
import type { ReplayOutcome } from "../enums.js";
import type { RunId } from "../identifiers.js";

/**
 * CANONICAL_SPEC §15: each close run records dataset version/hash, ruleset
 * and individual rule versions, policy, configuration, scenario script,
 * source sync IDs, outputs, and hashes. Same controlled inputs must produce
 * the same structured outputs. LLM prose is excluded from replay equivalence.
 */
export interface RunManifest {
  readonly runId: RunId;
  readonly executedAt: IsoDateTime;
  readonly datasetVersion: string;
  readonly datasetHash: string;
  readonly rulesetVersion: string;
  readonly ruleVersions: Readonly<Record<string, string>>;
  readonly policyVersion: string;
  readonly configVersion: string;
  readonly scenarioScriptVersion: string;
  readonly sourceSyncIds: Readonly<Record<string, string>>;
  readonly outputHash: string;
}

export interface ReplayResult {
  readonly baselineRunId: RunId;
  readonly replayRunId: RunId;
  readonly outcome: ReplayOutcome;
  /** Structured paths that differed when outcome is MISMATCH. */
  readonly mismatchPaths: readonly string[];
}
