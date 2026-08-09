import type { IsoDate, IsoDateTime } from "../dates.js";
import type {
  Assertion,
  RiskLevel,
  RuleCoverage,
  RuleResult,
} from "../enums.js";
import type { RuleId, RunId } from "../identifiers.js";

/**
 * docs/16: RuleDefinition has a stable ID and version, a control domain,
 * effective dates, schemas, default assertions/risk, and code/doc references.
 * Rules are versioned pure functions; historical runs retain their original
 * versions.
 */
export interface RuleDefinition {
  readonly id: RuleId;
  readonly version: string;
  readonly controlDomain: string;
  readonly title: string;
  readonly effectiveFrom: IsoDate;
  readonly effectiveTo?: IsoDate;
  readonly defaultAssertions: readonly Assertion[];
  readonly defaultRisk: RiskLevel;
  /** References to the rule's input/output schemas (docs/16 "schemas"). */
  readonly inputSchemaRef?: string;
  readonly outputSchemaRef?: string;
  readonly codeRef?: string;
  readonly docRef?: string;
}

/**
 * docs/16: RuleExecution records the run, input/output hashes, coverage,
 * result, related objects, and versions. Coverage is separate from result.
 */
export interface RuleExecution {
  readonly runId: RunId;
  readonly ruleId: RuleId;
  readonly ruleVersion: string;
  readonly executedAt: IsoDateTime;
  readonly inputHash: string;
  readonly outputHash: string;
  readonly result: RuleResult;
  readonly coverage: RuleCoverage;
  readonly relatedObjectRefs: readonly string[];
}
