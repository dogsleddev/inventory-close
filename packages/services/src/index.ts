/**
 * @icg/services — application services (Stage 04).
 *
 * Dependency direction (docs/05): UI / Ask Gaurd / MCP → services →
 * deterministic domain/rules → repositories/evidence. UI and AI surfaces
 * call these services; they never reimplement accounting logic.
 * Authorization happens at this layer, before data reaches any caller —
 * including the future AI adapter. There is no NetSuite write path.
 */

export {
  createWorkspace,
  describeWorkingState,
  nextInstant,
  resetWorkspace,
  workingStateCounts,
  workingStateNouns,
  WORKING_STATE_COLLECTIONS,
} from "./workspace.js";
export type { WorkingStateKey } from "./workspace.js";
export type {
  Comment,
  Draft,
  EvidenceRequest,
  MemoVersion,
  RecordedConclusion,
  SubmittedEvidence,
  Workspace,
} from "./workspace.js";
export { createQueryService } from "./queries.js";
export type {
  EvidenceView,
  ExceptionView,
  FinancialLifeView,
  PbcPackageItem,
  ProcurementDetail,
  QueryService,
  RuleSummary,
  SerialSearchHit,
  ServiceContext,
  SourceCoverageWarning,
  ThirdPartyHolding,
} from "./queries.js";
export {
  describeControls,
  pbcDependencySlices,
  replayCoverage,
  REPLAY_EXCLUSIONS,
  verifyReproduction,
} from "./integrity.js";
export type {
  CloseControl,
  PbcDependencySlice,
  ReproductionCheck,
} from "./integrity.js";
export { hasProvidedVersion, versionsFor } from "./pbc.js";
export type { PbcVersion, PbcVersionState } from "./pbc.js";
/**
 * Re-exported rule result shapes. Callers above this layer (the web app,
 * the future Ask Gaurd adapter) type against @icg/services alone — the
 * dependency direction stays UI → services → rules with no shortcut.
 */
export type {
  AdjustmentLineOut,
  AdjustmentRegisterEntry,
  AdjustmentRegisterOut,
  AgingBucketOut,
  BlockerOut,
  CloseAggregates,
  CountSummaryOut,
  DamagedUnitOut,
  PbcItemOut,
  ProposedAdjustmentOut,
  ReadinessOut,
  ReconciliationItemOut,
  ReconciliationOut,
  ValuationOut,
  ValuationPopulationOut,
} from "@icg/rules";
export {
  createCommandService,
  DEMO_RESET_PERMISSION,
  EvidenceIncompleteError,
  PeriodLockedError,
} from "./commands.js";
export {
  effectiveBlockers,
  effectiveClose,
  effectiveExceptions,
  effectiveOpenExceptionIds,
  effectiveStatus,
  latestConclusion,
  unmetRequirements,
  type EffectiveClose,
} from "./effective.js";
export type { CommandService } from "./commands.js";
export { getGlAccountReconciliation, INVENTORY_RESERVE_ACCOUNT, type GlAccountReconcilingItemOut, type GlAccountReconciliationOut, type GlAccountReconciliationState, type GlAccountRowOut, type GlReserveAccountOut } from "./glAccounts.js";
export { getCostClassification, getCostStandards } from "./costing.js";
export type {
  CogsChainRowOut,
  CostClassificationOut,
  CostComponentOut,
  CostComponentTotalOut,
  CostStandardRowOut,
  CostStandardsOut,
  PeriodCostCategoryOut,
  PeriodCostRowOut,
} from "./costing.js";
export {
  getConsignmentHoldings,
  getCustodyBreakdown,
  getDispositions,
} from "./ownership.js";
export type {
  ConsignmentGroupOut,
  ConsignmentHoldingsOut,
  ConsignmentRowOut,
  CustodyBreakdownOut,
  CustodyRowOut,
  DispositionMethodOut,
  DispositionRowOut,
  DispositionsOut,
} from "./ownership.js";
export { getEoMethodology, MONTHS_OF_SUPPLY_BASIS } from "./eoMethodology.js";
export type {
  AgingBasis,
  AgingBasisOut,
  ConditionEvidenceOut,
  EoMethodologyOut,
  EoSignalRowOut,
  RecoveryEvidenceOut,
} from "./eoMethodology.js";
export {
  getMethodology,
  INTERPRETATION_CONSTANT_NAMES,
} from "./methodology.js";
export type {
  AccountingMatrixOut,
  InterpretationOut,
  MatrixRowOut,
  MethodologyOut,
  PolicyValueOut,
  ReconciliationDerivationOut,
} from "./methodology.js";
export {
  getMemo,
  MEMO_DRAFT_PERMISSION,
  MEMO_ISSUE_PERMISSION,
  memoPosition,
} from "./memo.js";
export type { MemoOut, MemoPositionOut, MemoVersionOut } from "./memo.js";
export { createProjectionService } from "./projections.js";
export type { ProjectionService } from "./projections.js";
export { getProcurementPopulations } from "./procurement.js";
export type {
  GoodsInTransitOut,
  GrniRowOut,
  InvoicedNotReceivedRowOut,
  PeriodEndPosition,
  PriceVarianceOut,
  PriceVarianceRowOut,
  ProcurementMatchSummaryOut,
  ProcurementOrderOut,
  ProcurementPopulationsOut,
} from "./procurement.js";
