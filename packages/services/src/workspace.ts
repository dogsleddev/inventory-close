import { buildDataset, hashObject, toCloseInput, type IcgDataset } from "@icg/data";
import { runClose, type CloseRunResult } from "@icg/rules";
import { buildEvidenceGraph, type EvidenceGraph, type EvidenceItem } from "@icg/evidence";
import { createAuditLog, type AuditLog } from "@icg/audit";
import {
  createPeriodMachine,
  type PeriodMachine,
  type ReviewRecord,
} from "@icg/workflows";

/**
 * The demo close workspace: the deterministic dataset and close run
 * (derived, never authoritative — CANONICAL_SPEC section 15) plus the
 * mutable working state commands operate on (submitted evidence, comments,
 * drafts, reviews, period machine) and the append-only audit log.
 */
export interface SubmittedEvidence extends EvidenceItem {
  readonly submittedByUserId: string;
  readonly submittedAt: string;
  readonly reviewState: "PENDING" | "ACCEPTED" | "RETURNED";
  readonly reviewedByUserId?: string;
  readonly annotations: readonly { byUserId: string; at: string; note: string }[];
}

export interface Comment {
  readonly id: string;
  readonly objectRef: string;
  readonly byUserId: string;
  readonly at: string;
  readonly text: string;
}

export interface Draft {
  readonly id: string;
  readonly kind: string;
  readonly objectRef: string;
  readonly byUserId: string;
  readonly at: string;
  readonly body: string;
  /** Drafts are drafts: never evidence, never approval (docs/09). */
  readonly isApproval: false;
}

export interface Workspace {
  dataset: IcgDataset;
  close: CloseRunResult;
  evidenceGraph: EvidenceGraph;
  period: PeriodMachine;
  audit: AuditLog;
  submittedEvidence: SubmittedEvidence[];
  comments: Comment[];
  drafts: Draft[];
  reviews: ReviewRecord[];
  /** Controlled-state hash each PBC workpaper was prepared against. */
  pbcPreparedState: Map<string, string>;
  /** Deterministic logical clock: base instant + one minute per tick. */
  clockSeq: number;
  /**
   * Submitted-evidence id sequence. Survives demo reset (like the clock and
   * the audit log) so ids referenced by surviving audit events are never
   * reused by later submissions.
   */
  evidenceSeq: number;
}

/**
 * What each PBC workpaper depends on (docs/10): exception ids plus keyed
 * close-state slices. When a dependency's state changes after preparation
 * the workpaper becomes REFRESH_REQUIRED.
 */
export const PBC_DEPENDENCIES: Readonly<Record<string, readonly string[]>> = {
  "PBC-001": ["POPULATION"],
  "PBC-002": ["RECONCILIATION", "EXC-009", "EXC-014", "EXC-015"],
  "PBC-003": ["COUNTS"],
  "PBC-004": ["COUNTS"],
  // Count variance reconciliation covers every count-variance exception, not
  // only the resolved ones: it is Preparing precisely because the EXC-003
  // recount and the EXC-004 floor-to-sheet treatment are still open.
  "PBC-005": ["COUNTS", "EXC-003", "EXC-004", "EXC-005", "EXC-006", "EXC-013"],
  "PBC-006": ["COUNTS"],
  "PBC-007": ["COUNTS", "EXC-006"],
  "PBC-008": ["EXC-001"],
  "PBC-009": ["EXC-002", "EXC-014"],
  "PBC-010": ["EXC-002"],
  "PBC-011": ["EXC-007"],
  "PBC-012": ["EXC-007"],
  "PBC-013": ["EXC-008"],
  "PBC-014": ["EXC-010"],
  "PBC-015": ["EXC-008"],
  "PBC-016": ["EXC-009", "EXC-012"],
  "PBC-017": ["POPULATION"],
  "PBC-018": ["EXC-011"],
  "PBC-019": ["EXC-012"],
  "PBC-020": ["PROPOSALS", "EXC-009", "EXC-014", "EXC-015"],
  "PBC-021": ["POPULATION", "RECONCILIATION"],
};

/** Deterministic hash of the close-state slices a workpaper depends on. */
export function pbcDependencyHash(
  close: CloseRunResult,
  dependsOn: readonly string[],
): string {
  const slices = dependsOn.map((dep) => {
    switch (dep) {
      case "POPULATION":
        return { dep, v: close.aggregates.grossInventoryCents };
      case "RECONCILIATION":
        return { dep, v: close.reconciliation };
      case "COUNTS":
        return { dep, v: close.countSummary };
      case "PROPOSALS":
        return { dep, v: close.proposedAdjustments };
      default: {
        const exc = close.exceptions.find((e) => e.id === dep);
        return { dep, v: exc ? { status: exc.status, exposure: exc.finding.exposureCents } : null };
      }
    }
  });
  return hashObject(slices);
}

function preparedStateFor(close: CloseRunResult): Map<string, string> {
  return new Map(
    close.pbc.map((item) => [
      item.id,
      pbcDependencyHash(close, PBC_DEPENDENCIES[item.id] ?? []),
    ]),
  );
}

const CLOCK_BASE_MS = Date.UTC(2027, 0, 7, 6, 0, 0);

export function nextInstant(ws: Workspace): string {
  ws.clockSeq += 1;
  return new Date(CLOCK_BASE_MS + ws.clockSeq * 60_000)
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z");
}

function buildState(): Pick<Workspace, "dataset" | "close" | "evidenceGraph"> {
  // Reset Demo rebuilds from source facts, rules, and scenario events; it
  // never hard-codes final metrics (CANONICAL_SPEC section 15).
  const dataset = buildDataset();
  const close = runClose(toCloseInput(dataset));
  const evidenceGraph = buildEvidenceGraph(dataset, close);
  return { dataset, close, evidenceGraph };
}

export function createWorkspace(): Workspace {
  const state = buildState();
  return {
    ...state,
    period: createPeriodMachine("OPEN"),
    audit: createAuditLog(),
    submittedEvidence: [],
    comments: [],
    drafts: [],
    reviews: [],
    pbcPreparedState: preparedStateFor(state.close),
    clockSeq: 0,
    evidenceSeq: 0,
  };
}

/** Rebuild derived state and clear working state; the audit log survives. */
export function resetWorkspace(ws: Workspace): void {
  const fresh = buildState();
  ws.dataset = fresh.dataset;
  ws.close = fresh.close;
  ws.evidenceGraph = fresh.evidenceGraph;
  ws.period = createPeriodMachine("OPEN");
  ws.submittedEvidence = [];
  ws.comments = [];
  ws.drafts = [];
  ws.reviews = [];
  ws.pbcPreparedState = preparedStateFor(ws.close);
}
