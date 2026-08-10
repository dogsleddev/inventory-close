/**
 * @icg/rules — deterministic, versioned close-control rules (Stage 03).
 *
 * Zero AI dependencies; imports @icg/domain only. Rules are pure functions:
 * same CloseInput, policy, and scenario events produce the same structured
 * exceptions, blockers, reconciliation, readiness, and hashes. Missing
 * required evidence never silently becomes PASS. The LLM may explain these
 * results; it may never create them.
 */

export { hashValue, stableStringify, fnv1a64Hex } from "./engine/hash.js";
export type { CloseIndex, CloseInput } from "./engine/input.js";
export { buildIndex } from "./engine/input.js";
export type {
  EvidenceRequirementFinding,
  FindingKind,
  FindingSubjects,
  RuleFinding,
  RuleOutput,
} from "./engine/findings.js";
export type { Rule, RuleContext } from "./engine/rule.js";
export { PBC_BASELINE_V1, POLICY_V1 } from "./policy.js";
export type { ClosePolicy, ReadinessCategoryPolicy } from "./policy.js";
export {
  ALL_RULES,
  PRIMARY_RULES,
  RULE_DEFINITIONS,
  RULESET_VERSION,
  SUPPORTING_RULES,
} from "./registry.js";
export { assignExceptionIds } from "./exceptions.js";
export type { DerivedException } from "./exceptions.js";
export { applyScenarioEvents } from "./scenario.js";
export type { ScenarioResult } from "./scenario.js";
export { buildReconciliation } from "./reconciliation.js";
export type { ReconciliationItemOut, ReconciliationOut } from "./reconciliation.js";
export { buildAdjustmentRegister } from "./adjustments.js";
export type {
  AdjustmentLineOut,
  AdjustmentRegisterEntry,
  AdjustmentRegisterOut,
  ProposedAdjustmentOut,
} from "./adjustments.js";
export { buildValuation } from "./valuation.js";
export type {
  AgingBucketOut,
  DamagedUnitOut,
  ValuationOut,
  ValuationPopulationOut,
} from "./valuation.js";
export { computeReadiness } from "./readiness.js";
export type { ReadinessCategoryOut, ReadinessOut } from "./readiness.js";
export { CONFIG_VERSION, reproduceClose, runClose } from "./close.js";
export type {
  BlockerOut,
  CloseAggregates,
  CloseRunResult,
  CountSummaryOut,
  PbcItemOut,
  RunCloseOptions,
} from "./close.js";
