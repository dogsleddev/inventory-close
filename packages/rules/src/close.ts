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
import { buildReconciliation, type ReconciliationOut } from "./reconciliation.js";
import { computeReadiness, type ReadinessOut } from "./readiness.js";
import { ALL_RULES, RULESET_VERSION } from "./registry.js";
import { applyScenarioEvents } from "./scenario.js";

export const CONFIG_VERSION = "CONFIG-v1.0.0";

export interface PbcItemOut {
  readonly id: string;
  readonly title: string;
  readonly status: PbcStatus;
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

  const inputHash = hashValue({
    datasetHash: input.datasetHash,
    policyVersion: policy.version,
    applyScenario,
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
    return { id: item.id, title: item.title, status: item.status as PbcStatus };
  });
  const pbcReady = pbc.filter((i) => countsAsReadyOrProvided(i.status)).length;
  const pbcReadinessBps = Math.round((pbcReady / pbc.length) * 10000);

  const sourceHealthBps = aggregateHealthBasisPoints(
    input.sourceHealth.map((h) => ({ sourceSystem: h.sourceSystem, status: h.status })),
  );

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

  const structuredOutput = {
    exceptions,
    blockers,
    reconciliation,
    readiness,
    aggregates,
    procurementMatches,
    countSummary,
  };

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
    countSummary,
    aggregates,
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
    const keys = [
      "exceptions",
      "blockers",
      "reconciliation",
      "readiness",
      "aggregates",
      "procurementMatches",
      "countSummary",
    ] as const;
    for (const key of keys) {
      if (hashValue(baseline[key]) !== hashValue(replay[key])) {
        mismatchPaths.push(key);
      }
    }
  }
  return {
    baselineRunId: mkRunId(baseline.runManifest.runId),
    replayRunId: mkRunId(replay.runManifest.runId),
    outcome: match ? "MATCH" : "MISMATCH",
    mismatchPaths,
  };
}
