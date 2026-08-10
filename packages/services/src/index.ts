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
  QueryService,
  ServiceContext,
  SourceCoverageWarning,
} from "./queries.js";
export { createCommandService, PeriodLockedError } from "./commands.js";
export type { CommandService } from "./commands.js";
