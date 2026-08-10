import type {
  ProcurementMatch,
  ProposedAdjustment,
  ReplayResult,
  RuleExecution,
  TransactionChain,
} from "@icg/domain";
import {
  aggregateHealthBasisPoints,
  countsAsReadyOrProvided,
  isoDateTime,
  isResolvedStatus,
  PBC_STATUSES,
  runId as mkRunId,
  ruleId as mkRuleId,
} from "@icg/domain";
import type { PbcStatus } from "@icg/domain";
import { hashValue } from "./engine/hash.js";
import type { RuleFinding, RuleOutput } from "./engine/findings.js";
import { buildIndex, type CloseInput } from "./engine/input.js";
import type { RuleContext } from "./engine/rule.js";
import { assignExceptionIds, type DerivedException } from "./exceptions.js";
import { PBC_BASELINE_V1, POLICY_V1, type ClosePolicy } from "./policy.js";
import { buildAdjustmentRegister, type AdjustmentRegisterOut } from "./adjustments.js";
import { buildReconciliation, type ReconciliationOut } from "./reconciliation.js";
import { buildValuation, type ValuationOut } from "./valuation.js";
import { computeReadiness, type ReadinessOut } from "./readiness.js";
import { ALL_RULES, RULESET_VERSION } from "./registry.js";
import { applyScenarioEvents } from "./scenario.js";

export const CONFIG_VERSION = "CONFIG-v1.0.0";

export interface PbcItemOut {
  readonly id: string;
  readonly title: string;
  readonly status: PbcStatus;
  /** Canonical role id responsible for preparing the workpaper. */
  readonly owner: string;
}

export interface CountSummaryOut {
  readonly populationUnits: number;
  readonly firstPassMatchedUnits: number;
  readonly varianceRows: number;
  readonly movements: number;
  readonly managementTests: number;
  readonly auditorTests: number;
}

export interface CloseAggregates {
  readonly exceptionCount: number;
  readonly openExceptionCount: number;
  readonly resolvedExceptionCount: number;
  readonly blockerCount: number;
  readonly blockerExposureCents: number;
  readonly designedExceptionExposureCents: number;
  readonly closeReadinessBps: number;
  readonly pbcReady: number;
  readonly pbcTotal: number;
  readonly pbcReadinessBps: number;
  readonly sourceHealthBps: number;
  readonly grossInventoryCents: number;
  readonly grossGlCents: number;
  readonly grossGlDifferenceCents: number;
}

export interface BlockerOut {
  readonly exceptionId: string;
  readonly description: string;
  readonly exposureCents: number;
}

export interface CloseRunResult {
  readonly runManifest: {
    readonly runId: string;
    readonly executedAt: string;
    readonly datasetVersion: string;
    readonly datasetHash: string;
    readonly rulesetVersion: string;
    readonly ruleVersions: Readonly<Record<string, string>>;
    readonly policyVersion: string;
    readonly configVersion: string;
    readonly scenarioScriptVersion: string;
    readonly scenarioApplied: boolean;
    readonly sourceSyncIds: Readonly<Record<string, string>>;
    readonly outputHash: string;
  };
  readonly ruleExecutions: readonly RuleExecution[];
  readonly exceptions: readonly DerivedException[];
  readonly managementIndicators: readonly RuleFinding[];
  readonly blockers: readonly BlockerOut[];
  readonly procurementMatches: readonly ProcurementMatch[];
  readonly chains: readonly TransactionChain[];
  readonly reconciliation: ReconciliationOut;
  readonly readiness: ReadinessOut;
  readonly pbc: readonly PbcItemOut[];
  readonly proposedAdjustments: readonly ProposedAdjustment[];
  /** Reconciling items paired with the entries drafted for them (stage 07). */
  readonly adjustmentRegister: AdjustmentRegisterOut;
  readonly valuation: ValuationOut;
  readonly countSummary: CountSummaryOut;
  readonly aggregates: CloseAggregates;
}

function buildCountSummary(input: CloseInput): CountSummaryOut {
  const yePlan = input.countPlans.find((p) => p.countType === "YEAR_END");
  const rows = input.countResults.filter((r) => r.countPlanId === yePlan?.id);
  const bookRows = rows.filter((r) => r.snapshotQuantity > 0);
  return {
    populationUnits: bookRows.reduce((s, r) => s + r.snapshotQuantity, 0),
    firstPassMatchedUnits: bookRows.reduce(
      (s, r) => s + Math.min(r.snapshotQuantity, r.countQuantity),
      0,
    ),
    varianceRows: rows.filter((r) => r.variance !== 0).length,
    movements: input.countMovements.length,
    managementTests: input.countTests.filter((t) => t.selectionSource === "MANAGEMENT").length,
    auditorTests: input.countTests.filter((t) => t.selectionSource === "AUDITOR").length,
  };
}

export interface RunCloseOptions {
  readonly applyScenario?: boolean;
  readonly policy?: ClosePolicy;
}

export function runClose(input: CloseInput, options: RunCloseOptions = {}): CloseRunResult {
  const applyScenario = options.applyScenario ?? true;
  const policy = options.policy ?? POLICY_V1;
  const ctx: RuleContext = {
    input,
    index: buildIndex(input),
    policy,
    asOf: input.asOf,
  };

  /**
   * Run identity binds EVERY controlled input docs/16 names — dataset,
   * ruleset, individual rule versions, policy, configuration and the
   * scenario script. It previously bound only the dataset hash, the policy
   * version and the scenario flag, so bumping a rule version produced a
   * materially different close under an identical run id: two runs sharing
   * one identity is the thing a run manifest exists to make impossible.
   *
   * The row shape is folded in as well. `input.datasetHash` is supplied by
   * the caller, so it is a CLAIM about the input rather than a measurement
   * of it; counting the rows actually present costs nothing and catches an
   * input mutated after `toCloseInput` built it, which the hash alone
   * cannot see.
   */
  const rowShape = Object.fromEntries(
    Object.entries(input)
      .filter(([, v]) => Array.isArray(v))
      .map(([k, v]) => [k, (v as readonly unknown[]).length]),
  );
  const inputHash = hashValue({
    datasetHash: input.datasetHash,
    datasetVersion: input.datasetVersion,
    scenarioScript: input.scenarioScript,
    rulesetVersion: RULESET_VERSION,
    ruleVersions: Object.fromEntries(ALL_RULES.map((r) => [r.id, r.version])),
    policyVersion: policy.version,
    configVersion: CONFIG_VERSION,
    applyScenario,
    asOf: input.asOf,
    rowShape,
  });
  const runIdValue = `RUN-${inputHash.slice(0, 12)}-${applyScenario ? "BASELINE" : "INITIAL"}`;

  const outputs = new Map<string, RuleOutput>();
  const ruleExecutions: RuleExecution[] = [];
  for (const rule of ALL_RULES) {
    const output = rule.evaluate(ctx);
    outputs.set(rule.id, output);
    ruleExecutions.push({
      runId: mkRunId(runIdValue),
      ruleId: mkRuleId(rule.id),
      ruleVersion: rule.version,
      executedAt: isoDateTime(input.runTimestamp),
      inputHash,
      outputHash: hashValue(output),
      result: output.result,
      coverage: output.coverage,
      relatedObjectRefs: output.findings.flatMap((f) => [
        ...(f.subjects.serials ?? []),
        ...(f.subjects.transactionNumbers ?? []),
      ]),
    });
  }

  const allFindings = [...outputs.values()].flatMap((o) => o.findings);
  const initialExceptions = assignExceptionIds(allFindings);
  const scenario = applyScenario
    ? applyScenarioEvents(initialExceptions, input.scenarioEvents)
    : { exceptions: initialExceptions, proposedAdjustments: [], appliedEventIds: [] };
  const exceptions = scenario.exceptions;

  const blockers: BlockerOut[] = exceptions
    .filter(
      (e) =>
        !isResolvedStatus(e.status) &&
        policy.blockerRiskLevels.includes(e.finding.risk),
    )
    .map((e) => ({
      exceptionId: e.id,
      description: e.finding.title,
      exposureCents: e.finding.exposureCents,
    }));

  const reconciliation = buildReconciliation(input, exceptions);
  const readiness = computeReadiness(
    exceptions,
    reconciliation,
    scenario.proposedAdjustments.length,
    policy,
  );

  const pbc: PbcItemOut[] = PBC_BASELINE_V1.map((item) => {
    if (!(PBC_STATUSES as readonly string[]).includes(item.status)) {
      throw new Error(`Invalid PBC status ${item.status}`);
    }
    return {
      id: item.id,
      title: item.title,
      status: item.status as PbcStatus,
      owner: item.owner,
    };
  });
  const pbcReady = pbc.filter((i) => countsAsReadyOrProvided(i.status)).length;
  const pbcReadinessBps = Math.round((pbcReady / pbc.length) * 10000);

  const sourceHealthBps = aggregateHealthBasisPoints(
    input.sourceHealth.map((h) => ({ sourceSystem: h.sourceSystem, status: h.status })),
  );

  const adjustmentRegister = buildAdjustmentRegister(
    reconciliation,
    exceptions,
    scenario.proposedAdjustments,
  );
  const valuation = buildValuation(input, exceptions, policy);

  const countSummary = buildCountSummary(input);
  const openExceptions = exceptions.filter((e) => !isResolvedStatus(e.status));

  const aggregates: CloseAggregates = {
    exceptionCount: exceptions.length,
    openExceptionCount: openExceptions.length,
    resolvedExceptionCount: exceptions.length - openExceptions.length,
    blockerCount: blockers.length,
    blockerExposureCents: blockers.reduce((s, b) => s + b.exposureCents, 0),
    designedExceptionExposureCents: exceptions.reduce(
      (s, e) => s + e.finding.exposureCents,
      0,
    ),
    closeReadinessBps: readiness.totalBasisPoints,
    pbcReady,
    pbcTotal: pbc.length,
    pbcReadinessBps,
    sourceHealthBps,
    grossInventoryCents: reconciliation.subledgerCents,
    grossGlCents: reconciliation.grossGlCents,
    grossGlDifferenceCents: reconciliation.differenceCents,
  };

  const procurementMatches = [...outputs.values()].flatMap((o) => o.matches ?? []);
  const chains = [...outputs.values()].flatMap((o) => o.chains ?? []);
  const managementIndicators = allFindings.filter(
    (f) => f.kind === "MANAGEMENT_INDICATOR",
  );

  // Replay equivalence covers EVERY structured financial output (docs/16):
  // proposals, chains, indicators, PBC, and per-rule results included. Only
  // LLM prose is excluded - none exists here. The projection is built by
  // `comparableSections` so the equivalence hash and the mismatch
  // diagnostic read the identical set of fields.
  const structuredOutput = comparableSections({
    exceptions,
    blockers,
    reconciliation,
    readiness,
    aggregates,
    procurementMatches,
    countSummary,
    proposedAdjustments: scenario.proposedAdjustments,
    adjustmentRegister,
    valuation,
    chains,
    managementIndicators,
    pbc,
    ruleExecutions,
  });

  return {
    runManifest: {
      runId: runIdValue,
      executedAt: input.runTimestamp,
      datasetVersion: input.datasetVersion,
      datasetHash: input.datasetHash,
      rulesetVersion: RULESET_VERSION,
      ruleVersions: Object.fromEntries(ALL_RULES.map((r) => [r.id, r.version])),
      policyVersion: policy.version,
      configVersion: CONFIG_VERSION,
      scenarioScriptVersion: input.scenarioScript,
      scenarioApplied: applyScenario,
      sourceSyncIds: Object.fromEntries(
        input.sourceHealth
          .filter((h) => h.lastSyncId !== undefined)
          .map((h) => [h.sourceSystem, h.lastSyncId ?? ""]),
      ),
      outputHash: hashValue(structuredOutput),
    },
    ruleExecutions,
    exceptions,
    managementIndicators,
    blockers,
    procurementMatches,
    chains,
    reconciliation,
    readiness,
    pbc,
    proposedAdjustments: scenario.proposedAdjustments,
    adjustmentRegister,
    valuation,
    countSummary,
    aggregates,
  };
}

/**
 * The structured sections replay equivalence covers, named once so a caller
 * that reports what was compared cannot drift from what actually was. LLM
 * prose is not among them and never will be (CANONICAL_SPEC section 15).
 */
export const REPLAY_COMPARED_SECTIONS = [
  "exceptions",
  "blockers",
  "reconciliation",
  "readiness",
  "aggregates",
  "procurementMatches",
  "countSummary",
  "proposedAdjustments",
  "adjustmentRegister",
  "valuation",
  "chains",
  "managementIndicators",
  "pbc",
  // Per-rule result/coverage/output hash. It is folded into `outputHash`,
  // so it decides the verdict; leaving it out of this list meant a replay
  // whose only difference was a rule's COVERAGE reported MISMATCH and then
  // named no section that differed. A verdict that cannot say what moved
  // reads as a bug in the checker rather than a difference in the close.
  "ruleResults",
] as const;

/**
 * The comparable projection of a run, in exactly the sections above. Built
 * once and used both for the equivalence hash and for the mismatch
 * diagnostic, so the two can never disagree about what was compared.
 */
function comparableSections(
  run: Omit<CloseRunResult, "runManifest">,
): Record<string, unknown> {
  return {
    exceptions: run.exceptions,
    blockers: run.blockers,
    reconciliation: run.reconciliation,
    readiness: run.readiness,
    aggregates: run.aggregates,
    procurementMatches: run.procurementMatches,
    countSummary: run.countSummary,
    proposedAdjustments: run.proposedAdjustments,
    adjustmentRegister: run.adjustmentRegister,
    valuation: run.valuation,
    chains: run.chains,
    managementIndicators: run.managementIndicators,
    pbc: run.pbc,
    ruleResults: Object.fromEntries(
      run.ruleExecutions.map((e) => [
        String(e.ruleId),
        `${e.result}/${e.coverage}/${e.outputHash}`,
      ]),
    ),
  };
}

/**
 * Reproduce Close (CANONICAL_SPEC section 15): re-run and compare
 * structured output. LLM prose plays no part in replay equivalence.
 */
export function reproduceClose(
  baseline: CloseRunResult,
  replay: CloseRunResult,
): ReplayResult {
  const match = baseline.runManifest.outputHash === replay.runManifest.outputHash;
  const mismatchPaths: string[] = [];
  if (!match) {
    const a = comparableSections(baseline);
    const b = comparableSections(replay);
    for (const key of REPLAY_COMPARED_SECTIONS) {
      if (hashValue(a[key]) !== hashValue(b[key])) mismatchPaths.push(key);
    }
  }
  return {
    baselineRunId: mkRunId(baseline.runManifest.runId),
    replayRunId: mkRunId(replay.runManifest.runId),
    outcome: match ? "MATCH" : "MISMATCH",
    mismatchPaths,
  };
}
