/**
 * Canonical enums from CANONICAL_SPEC.md and docs/06_DATA_MODEL.md.
 * String values are stable identifiers persisted in fixtures, golden outputs,
 * and audit history — never rename them casually.
 */

/** CANONICAL_SPEC §10 — canonical rule results. */
export const RULE_RESULTS = [
  "PASS",
  "FAIL",
  "REVIEW_REQUIRED",
  "INCOMPLETE",
  "NOT_APPLICABLE",
] as const;
export type RuleResult = (typeof RULE_RESULTS)[number];

/** CANONICAL_SPEC §10 — evidence coverage, separate from result. */
export const RULE_COVERAGES = ["COMPLETE", "PARTIAL", "INCOMPLETE"] as const;
export type RuleCoverage = (typeof RULE_COVERAGES)[number];

/**
 * CANONICAL_SPEC §4 — source health. Scores are integer hundredths
 * (Healthy 100, Partial 75, Stale 50, Failed 0) so aggregate health stays in
 * integer arithmetic: baseline 825/900 = 91.67%.
 */
export const SOURCE_HEALTH_STATUSES = [
  "HEALTHY",
  "PARTIAL",
  "STALE",
  "FAILED",
] as const;
export type SourceHealthStatus = (typeof SOURCE_HEALTH_STATUSES)[number];

export const SOURCE_HEALTH_SCORE_HUNDREDTHS: Record<SourceHealthStatus, number> = {
  HEALTHY: 100,
  PARTIAL: 75,
  STALE: 50,
  FAILED: 0,
};

/** CANONICAL_SPEC §4 — the nine logical source domains. */
export const SOURCE_SYSTEM_IDS = [
  "NETSUITE_ERP",
  "NETSUITE_WMS",
  "FLIGHTPATH",
  "DEPLOY_OPS",
  "DEVICE_CLOUD",
  "ACCORD_VAULT",
  "RETURN_LOOP",
  "KESTREL_CRM",
  "FORECAST_PLATFORM",
] as const;
export type SourceSystemId = (typeof SOURCE_SYSTEM_IDS)[number];

/** CANONICAL_SPEC §14 — close-period lifecycle. */
export const PERIOD_STATES = [
  "OPEN",
  "SOFT_LOCKED",
  "LOCKED",
  "REOPENED",
] as const;
export type PeriodState = (typeof PERIOD_STATES)[number];

/** Baseline exception workflow statuses from CANONICAL_SPEC §9. */
export const EXCEPTION_STATUSES = [
  "WAITING_ON_CONTRACT",
  "ACCOUNTING_REVIEW",
  "RECOUNT_REQUIRED",
  "WAITING_ON_THIRD_PARTY",
  "CONTROLLER_REVIEW",
  "RESOLVED_NO_ADJUSTMENT",
  "RESOLVED_ADJUSTMENT_PROPOSED",
] as const;
export type ExceptionStatus = (typeof EXCEPTION_STATUSES)[number];

export function isResolvedStatus(status: ExceptionStatus): boolean {
  return (
    status === "RESOLVED_NO_ADJUSTMENT" ||
    status === "RESOLVED_ADJUSTMENT_PROPOSED"
  );
}

/** CANONICAL_SPEC §9 risk column. */
export const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

/** docs/03 — assertion taxonomy (Accuracy covers calculation/reconciliation/data issues). */
export const ASSERTIONS = [
  "EXISTENCE",
  "COMPLETENESS",
  "RIGHTS_AND_OBLIGATIONS",
  "CUTOFF",
  "VALUATION",
  "CLASSIFICATION",
  "ACCURACY",
] as const;
export type Assertion = (typeof ASSERTIONS)[number];

/** CANONICAL_SPEC §12 — PBC request lifecycle plus the workpaper staleness state. */
export const PBC_STATUSES = [
  "NOT_STARTED",
  "PREPARING",
  "READY",
  "PROVIDED",
  "FOLLOW_UP_REQUESTED",
  "REFRESH_REQUIRED",
] as const;
export type PbcStatus = (typeof PBC_STATUSES)[number];

/** docs/06 NetSuite count extensions. */
export const COUNT_TYPES = ["YEAR_END", "CYCLE", "SPOT"] as const;
export type CountType = (typeof COUNT_TYPES)[number];

/** CANONICAL_SPEC §14 — evidence sensitivity tiers. */
export const EVIDENCE_SENSITIVITIES = [
  "STANDARD",
  "CONFIDENTIAL",
  "RESTRICTED",
] as const;
export type EvidenceSensitivity = (typeof EVIDENCE_SENSITIVITIES)[number];

/** docs/11 — evidence-graph relationship types. */
export const EVIDENCE_LINK_TYPES = [
  "SUPPORTS",
  "CONFLICTS_WITH",
  "REQUIRED_FOR",
  "CORROBORATES",
] as const;
export type EvidenceLinkType = (typeof EVIDENCE_LINK_TYPES)[number];

/** CANONICAL_SPEC §14 — roles. Mapping to permissions lives in packages/permissions. */
export const ROLES = [
  "HEAD_OF_FINANCE",
  "CONTROLLER",
  "ACCOUNTING_MANAGER",
  "PREPARER",
  "WAREHOUSE",
  "SUPPLY_CHAIN",
  "FPA",
  "LEGAL",
  "AUDITOR_READ_ONLY",
  "SYSTEM_ADMIN",
] as const;
export type Role = (typeof ROLES)[number];

/**
 * Read-only NetSuite record types the adapter may fetch (docs/05).
 * Count details are not a standalone record type: per CANONICAL_SPEC §6 they
 * are attributes of INVENTORY_COUNT records, addressed via
 * SourceRecordRef.lineId / CountResult.externalCountDetailId.
 */
export const NETSUITE_RECORD_TYPES = [
  "ITEM",
  "PURCHASE_ORDER",
  "ITEM_RECEIPT",
  "VENDOR_BILL",
  "SALES_ORDER",
  "ITEM_FULFILLMENT",
  "CUSTOMER_INVOICE",
  "INVENTORY_COUNT",
  "INVENTORY_ADJUSTMENT",
  "GL_BALANCE",
] as const;
export type NetSuiteRecordType = (typeof NETSUITE_RECORD_TYPES)[number];

/** CANONICAL_SPEC §5 — accounting classifications of on-book inventory. */
export const ACCOUNTING_CLASSIFICATIONS = [
  "FINISHED_HARDWARE",
  "GIT",
  "DEMO",
  "LOANER",
  "RMA",
  "DAMAGED",
  "THIRD_PARTY",
  "VALUATION_REVIEW",
] as const;
export type AccountingClassification =
  (typeof ACCOUNTING_CLASSIFICATIONS)[number];

/**
 * CANONICAL_SPEC §6 — external-auditor test-count selections. Sheet→Floor
 * principally supports Existence; Floor→Sheet principally supports
 * Completeness (docs/03). Gaurd records and supports these selections; it
 * never makes them.
 */
export const COUNT_TEST_DIRECTIONS = [
  "SHEET_TO_FLOOR",
  "FLOOR_TO_SHEET",
] as const;
export type CountTestDirection = (typeof COUNT_TEST_DIRECTIONS)[number];

/**
 * docs/07 — 42 test counts total: 24 management-selected, 18 auditor-selected.
 * Management tests are a management control; auditor selections are recorded
 * and supported but never made by Gaurd.
 */
export const COUNT_TEST_SELECTION_SOURCES = ["MANAGEMENT", "AUDITOR"] as const;
export type CountTestSelectionSource =
  (typeof COUNT_TEST_SELECTION_SOURCES)[number];

/**
 * Transaction-chain completeness (CANONICAL_SPEC §2): component coverage,
 * never an accounting-confidence score.
 */
export const CHAIN_COMPONENT_STATES = [
  "PRESENT",
  "MISSING",
  "NOT_APPLICABLE",
] as const;
export type ChainComponentState = (typeof CHAIN_COMPONENT_STATES)[number];

export const CHAIN_COMPONENT_IMPORTANCE = ["REQUIRED", "CORROBORATING"] as const;
export type ChainComponentImportance =
  (typeof CHAIN_COMPONENT_IMPORTANCE)[number];

/** CANONICAL_SPEC §15 — structured replay comparison outcome. */
export const REPLAY_OUTCOMES = ["MATCH", "MISMATCH"] as const;
export type ReplayOutcome = (typeof REPLAY_OUTCOMES)[number];

/**
 * The standard-cost build-up (dataset v1.2.0). A SKU's components sum
 * EXACTLY to its `unitCostCents` — the generator refuses to emit a stack
 * that does not, because a cost stack that almost adds up is worse than no
 * cost stack at all: it invites a reader to trust a total nobody derived.
 */
export const COST_COMPONENT_TYPES = [
  "DIRECT_MATERIAL",
  "DIRECT_LABOR",
  "MANUFACTURING_OVERHEAD",
  "INBOUND_FREIGHT",
  "IMPORT_DUTY",
] as const;
export type CostComponentType = (typeof COST_COMPONENT_TYPES)[number];

/**
 * Whether a cost is carried in inventory or taken to the period.
 * CAPITALIZED_TO_INVENTORY describes the `costComponents` stack — the cost
 * already inside the $4,800,000 subledger. `periodCosts` carries the other
 * side: costs deliberately kept OUT of inventory, each with its basis.
 */
export const COST_TREATMENTS = [
  "CAPITALIZED_TO_INVENTORY",
  "EXPENSED_AS_INCURRED",
] as const;
export type CostTreatment = (typeof COST_TREATMENTS)[number];

/**
 * How a capitalized cost component behaves with volume (COMPLETION_PLAN §10,
 * Stage D). A management classification, not a control result: nothing in the
 * rule engine reads it, and the basis for each assignment travels with it so
 * a reader can disagree with the judgement rather than only with the label.
 */
export const COST_BEHAVIORS = ["VARIABLE", "FIXED"] as const;
export type CostBehavior = (typeof COST_BEHAVIORS)[number];

/**
 * Whether the cost of a sold unit has left inventory (COMPLETION_PLAN §5).
 *
 * Derived from the `O2C-CHAIN-001` inventory-relief component and nothing
 * else: the chain measures whether the fulfilled serials are still in the
 * year-end book population. That is evidence of relief, not a COGS posting
 * read from the GL, and every surface reporting these states has to say so —
 * NOT_RELIEVED means the units are still on the book, not that a journal
 * entry was checked and found missing.
 */
export const COGS_STATES = ["RELIEVED", "NOT_RELIEVED", "NOT_SHIPPED"] as const;
export type CogsState = (typeof COGS_STATES)[number];

/** How a unit left the book population before the balance-sheet date. */
export const DISPOSITION_METHODS = [
  "SCRAPPED",
  "RETURNED_TO_VENDOR",
  "SALVAGE_SALE",
] as const;
export type DispositionMethod = (typeof DISPOSITION_METHODS)[number];
