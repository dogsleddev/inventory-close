import { buildDataset, toCloseInput, type IcgDataset } from "@icg/data";
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
  /** Deterministic logical clock: base instant + one minute per tick. */
  clockSeq: number;
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
  return {
    ...buildState(),
    period: createPeriodMachine("OPEN"),
    audit: createAuditLog(),
    submittedEvidence: [],
    comments: [],
    drafts: [],
    reviews: [],
    clockSeq: 0,
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
}
