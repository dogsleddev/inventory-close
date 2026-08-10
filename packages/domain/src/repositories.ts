import type { IsoDate } from "./dates.js";
import type {
  ClosePeriodId,
  ExceptionId,
  PbcRequestId,
  RunId,
} from "./identifiers.js";
import type {
  ClosePeriod,
  GlBalance,
  InventorySnapshot,
  Location,
  Reconciliation,
  Sku,
} from "./types/inventory.js";
import type {
  CountMovement,
  CountResult,
  CountTest,
  PhysicalCountPlan,
  ProcurementMatch,
} from "./types/netsuite.js";
import type { Evidence, EvidenceLink } from "./types/evidence.js";
import type { AccountingException } from "./types/exceptions.js";
import type { ProposedAdjustment } from "./types/adjustments.js";
import type { RuleDefinition, RuleExecution } from "./types/rules.js";
import type { PbcArtifact, PbcRequest } from "./types/pbc.js";
import type { SourceSystemHealth } from "./types/sources.js";
import type { RunManifest } from "./types/replay.js";
import type { AuditEvent, User } from "./types/security.js";

/**
 * Repository ports (docs/05: PostgreSQL-ready abstractions; the initial
 * adapter is a deterministic seed adapter in packages/data). Business logic
 * depends on these interfaces only — never directly on JSON fixture files.
 *
 * All reads are snapshot-consistent for a given dataset version; writes are
 * append-only where the record is material (evidence, audit, history).
 */

export interface InventoryRepository {
  getSkus(): Promise<readonly Sku[]>;
  getLocations(): Promise<readonly Location[]>;
  getSnapshot(asOf: IsoDate): Promise<InventorySnapshot>;
  getGlBalances(asOf: IsoDate): Promise<readonly GlBalance[]>;
  getReconciliation(asOf: IsoDate): Promise<Reconciliation>;
}

export interface CountRepository {
  getCountPlans(): Promise<readonly PhysicalCountPlan[]>;
  getCountResults(countPlanId: string): Promise<readonly CountResult[]>;
  getCountMovements(countPlanId: string): Promise<readonly CountMovement[]>;
  /** Management and auditor test-count selections (docs/06 CountResult/Test/Movement). */
  getCountTests(countPlanId: string): Promise<readonly CountTest[]>;
}

export interface ProcurementRepository {
  getProcurementMatches(): Promise<readonly ProcurementMatch[]>;
}

export interface ExceptionRepository {
  getExceptions(): Promise<readonly AccountingException[]>;
  getException(id: ExceptionId): Promise<AccountingException | undefined>;
}

export interface AdjustmentRepository {
  getProposedAdjustments(): Promise<readonly ProposedAdjustment[]>;
}

export interface EvidenceRepository {
  getEvidence(): Promise<readonly Evidence[]>;
  getEvidenceLinks(): Promise<readonly EvidenceLink[]>;
  /** Append-only: superseding or voiding adds records, never rewrites. */
  appendEvidence(evidence: Evidence): Promise<void>;
}

export interface RuleRepository {
  getRuleDefinitions(): Promise<readonly RuleDefinition[]>;
  getRuleExecutions(runId: RunId): Promise<readonly RuleExecution[]>;
  appendRuleExecution(execution: RuleExecution): Promise<void>;
}

export interface PbcRepository {
  getRequests(): Promise<readonly PbcRequest[]>;
  getArtifacts(requestId: PbcRequestId): Promise<readonly PbcArtifact[]>;
}

export interface SourceHealthRepository {
  getSourceHealth(): Promise<readonly SourceSystemHealth[]>;
}

export interface ClosePeriodRepository {
  getPeriod(id: ClosePeriodId): Promise<ClosePeriod | undefined>;
  getPeriods(): Promise<readonly ClosePeriod[]>;
}

export interface RunManifestRepository {
  getManifest(runId: RunId): Promise<RunManifest | undefined>;
  appendManifest(manifest: RunManifest): Promise<void>;
}

export interface AuditRepository {
  appendAuditEvent(event: AuditEvent): Promise<void>;
  getAuditEvents(objectRef: string): Promise<readonly AuditEvent[]>;
}

export interface UserRepository {
  getUsers(): Promise<readonly User[]>;
}
