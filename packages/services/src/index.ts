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
  resetWorkspace,
  nextInstant,
} from "./workspace.js";
export type {
  Comment,
  Draft,
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
export { createCommandService, DEMO_RESET_PERMISSION, PeriodLockedError } from "./commands.js";
export type { CommandService } from "./commands.js";
export { getGlAccountReconciliation, INVENTORY_RESERVE_ACCOUNT, type GlAccountReconcilingItemOut, type GlAccountReconciliationOut, type GlAccountReconciliationState, type GlAccountRowOut, type GlReserveAccountOut } from "./glAccounts.js";
