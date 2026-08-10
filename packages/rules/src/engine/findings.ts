import type {
  Assertion,
  ExceptionStatus,
  ProcurementMatch,
  RiskLevel,
  RuleCoverage,
  RuleResult,
  TransactionChain,
} from "@icg/domain";

/**
 * Exception-generation policy (prompt 03 item 5): rules emit three distinct
 * kinds of output. Only ACCOUNTING_EXCEPTION findings become the designed
 * EXC-### exceptions; management indicators are a risk lens (never auditor
 * sampling or reliance); supporting states (native match, chains) inform but
 * do not block by themselves.
 */
export type FindingKind =
  | "ACCOUNTING_EXCEPTION"
  | "DATA_QUALITY_ISSUE"
  | "MANAGEMENT_INDICATOR";

export interface FindingSubjects {
  readonly serials?: readonly string[];
  readonly skus?: readonly string[];
  readonly locations?: readonly string[];
  readonly transactionNumbers?: readonly string[];
  readonly documentRefs?: readonly string[];
  readonly custodian?: string;
}

export interface EvidenceRequirementFinding {
  readonly description: string;
  readonly required: boolean;
  readonly satisfied: boolean;
  readonly reference?: string | undefined;
}

export interface RuleFinding {
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly kind: FindingKind;
  readonly title: string;
  readonly whyFlagged: string;
  readonly reasonCodes: readonly string[];
  readonly assertions: readonly Assertion[];
  readonly risk: RiskLevel;
  readonly exposureCents: number;
  readonly subjects: FindingSubjects;
  readonly initialStatus: ExceptionStatus;
  readonly evidenceRequirements: readonly EvidenceRequirementFinding[];
  /** Attributes that stay attributes, e.g. EXC-011's reserve: UNDETERMINED. */
  readonly attributes?: Readonly<Record<string, string>>;
}

export interface RuleOutput {
  readonly result: RuleResult;
  readonly coverage: RuleCoverage;
  readonly findings: readonly RuleFinding[];
  /** Non-exception structured outputs. */
  readonly chains?: readonly TransactionChain[];
  /** Native NetSuite match state stays separate from close state (§7). */
  readonly matches?: readonly ProcurementMatch[];
  readonly notes?: readonly string[];
}
