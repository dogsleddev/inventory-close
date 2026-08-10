/**
 * Versioned close policy (CANONICAL_SPEC §15: policy is a recorded replay
 * input; changing any value here is a policy version change).
 *
 * The readiness category scores are DERIVED from close state through the
 * tier rules below — never hard-coded. With the FY2026 baseline state they
 * produce exactly the canonical 90/90/80/85/80/85/53.33/66.67 → 8142 bps.
 */

export interface ReadinessCategoryPolicy {
  readonly key: string;
  readonly label: string;
  /** Integer percent weight; all weights sum to 100. */
  readonly weightPercent: number;
}

export interface ClosePolicy {
  readonly version: string;
  /** Demo assignments older than this need review (DEMO-AGE-001). */
  readonly demoAgeThresholdDays: number;
  /** No-movement age that marks stock as slow-moving (VAL-EO-001). */
  readonly slowMovingAgeDays: number;
  /** Manual GL entries at/above this need support (GL-MAN-001), cents. */
  readonly manualEntrySupportThresholdCents: number;
  /** Open exceptions at these risk levels block sign-off. */
  readonly blockerRiskLevels: readonly string[];
  readonly readinessCategories: readonly ReadinessCategoryPolicy[];
  /** Penalty points (percent) per readiness tier condition; see readiness.ts. */
  readonly readinessPenalties: {
    readonly unadjustedGlDifference: number;
    readonly perOpenCountException: number;
    readonly perOpenCutoffException: number;
    readonly openOwnershipDetermination: number;
    readonly outstandingThirdPartyConfirmation: number;
    readonly undeterminedReserve: number;
  };
}

export const POLICY_V1: ClosePolicy = {
  version: "CLOSE-POLICY-v1.0.0",
  demoAgeThresholdDays: 180,
  slowMovingAgeDays: 365,
  manualEntrySupportThresholdCents: 1_000_000,
  blockerRiskLevels: ["HIGH", "CRITICAL"],
  readinessCategories: [
    { key: "POPULATION_GL", label: "Population / GL", weightPercent: 15 },
    { key: "PHYSICAL_COUNT", label: "Physical Count", weightPercent: 20 },
    { key: "CUTOFF", label: "Cutoff", weightPercent: 15 },
    { key: "OWNERSHIP", label: "Ownership", weightPercent: 10 },
    { key: "THIRD_PARTY", label: "Third Party", weightPercent: 10 },
    { key: "VALUATION", label: "Valuation", weightPercent: 15 },
    { key: "EXCEPTIONS", label: "Exceptions", weightPercent: 10 },
    { key: "ADJUSTMENTS", label: "Adjustments", weightPercent: 5 },
  ],
  readinessPenalties: {
    unadjustedGlDifference: 10,
    perOpenCountException: 5,
    perOpenCutoffException: 10,
    openOwnershipDetermination: 15,
    outstandingThirdPartyConfirmation: 20,
    undeterminedReserve: 15,
  },
};

/**
 * The 21 PBC requests (CANONICAL_SPEC §12) with the baseline status mapping:
 * 5 Provided, 12 Ready, 2 Preparing, 1 Follow-Up Requested, 1 Not Started
 * = 17/21.
 *
 * WHICH four are not ready is specified, not authored: `prompts/code/07`
 * ("Required baseline remaining items"), `prompts/design/06` ("Requires
 * Attention") and the approved design export `design/06_audit-ai` all name
 * the same four — PBC-002 and PBC-005 Preparing, PBC-008 Follow-Up
 * Requested, PBC-018 Not Started. Stage 03 authored a different four
 * (PBC-011/012/018/020) before those documents were read; the mix, and so
 * 17/21 = 8095 bps, was identical either way, which is why nothing caught
 * it. Corrected in stage 07 to the specified items.
 *
 * Each remaining item is blocked by close state rather than by preparation
 * effort: the GL bridge awaits the EXC-015 conclusion, count variance awaits
 * the EXC-003 recount and EXC-004 treatment, outbound cutoff carries the
 * auditor follow-up for the contract provision EXC-001 is missing, and the
 * E&O analysis cannot start while the EXC-011 reserve is UNDETERMINED.
 */
export const PBC_BASELINE_V1: readonly {
  id: string;
  title: string;
  status: string;
  /** Canonical role id (docs/15) responsible for preparing the workpaper. */
  owner: string;
}[] = [
  { id: "PBC-001", title: "Inventory Listing", status: "PROVIDED", owner: "PREPARER" },
  { id: "PBC-002", title: "Inventory-to-GL Reconciliation", status: "PREPARING", owner: "ACCOUNTING_MANAGER" },
  { id: "PBC-003", title: "Physical Count Instructions", status: "PROVIDED", owner: "WAREHOUSE" },
  { id: "PBC-004", title: "Physical Count Results", status: "PROVIDED", owner: "WAREHOUSE" },
  { id: "PBC-005", title: "Count Variance Reconciliation", status: "PREPARING", owner: "WAREHOUSE" },
  { id: "PBC-006", title: "External Auditor Test-Count Support", status: "PROVIDED", owner: "WAREHOUSE" },
  { id: "PBC-007", title: "Movement During Count", status: "PROVIDED", owner: "WAREHOUSE" },
  { id: "PBC-008", title: "Outbound Cutoff", status: "FOLLOW_UP_REQUESTED", owner: "CONTROLLER" },
  { id: "PBC-009", title: "Inbound Cutoff", status: "READY", owner: "ACCOUNTING_MANAGER" },
  { id: "PBC-010", title: "Goods in Transit", status: "READY", owner: "SUPPLY_CHAIN" },
  { id: "PBC-011", title: "Third-Party Inventory", status: "READY", owner: "SUPPLY_CHAIN" },
  { id: "PBC-012", title: "Third-Party Confirmation Tracker", status: "READY", owner: "SUPPLY_CHAIN" },
  { id: "PBC-013", title: "Customer-Site Company-Owned Inventory", status: "READY", owner: "SUPPLY_CHAIN" },
  { id: "PBC-014", title: "Demo Inventory", status: "READY", owner: "SUPPLY_CHAIN" },
  { id: "PBC-015", title: "Loaner Inventory", status: "READY", owner: "SUPPLY_CHAIN" },
  { id: "PBC-016", title: "RMA Reconciliation", status: "READY", owner: "ACCOUNTING_MANAGER" },
  { id: "PBC-017", title: "Inventory Aging", status: "READY", owner: "FPA" },
  { id: "PBC-018", title: "E&O Analysis", status: "NOT_STARTED", owner: "ACCOUNTING_MANAGER" },
  { id: "PBC-019", title: "Damaged Inventory Review", status: "READY", owner: "WAREHOUSE" },
  { id: "PBC-020", title: "Proposed Inventory Adjustments", status: "READY", owner: "CONTROLLER" },
  { id: "PBC-021", title: "Evidence and Data-Lineage Index", status: "READY", owner: "PREPARER" },
];
