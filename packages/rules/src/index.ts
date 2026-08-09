/**
 * @icg/rules — versioned pure-function close-control rules (Stage 03).
 *
 * Every rule is a pure function over structured domain state returning a
 * RuleResult plus separate RuleCoverage. Missing required evidence never
 * silently becomes PASS. The registry (CANONICAL_SPEC §10) is implemented in
 * Stage 03 behind the golden-test gate; only the execution contract lives
 * here for now.
 */

import type {
  RuleCoverage,
  RuleDefinition,
  RuleResult,
} from "@icg/domain";

export interface RuleOutcome {
  readonly result: RuleResult;
  readonly coverage: RuleCoverage;
  readonly reasonCodes: readonly string[];
  readonly relatedObjectRefs: readonly string[];
}

/** A rule evaluates a typed input snapshot; implementations arrive in Stage 03. */
export interface Rule<TInput> {
  readonly definition: RuleDefinition;
  evaluate(input: TInput): RuleOutcome;
}
