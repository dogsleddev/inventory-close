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
  /**
   * The requirement this submission answers, when it was submitted against
   * one. Named explicitly and matched exactly — an upload must never satisfy
   * a control by resembling it. Absent for evidence submitted on its own.
   */
  readonly satisfiesRequirement?: {
    readonly exceptionId: string;
    readonly requirement: string;
  };
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

/**
 * A management conclusion on an exception.
 *
 * The vocabulary is deliberately NOT `ExceptionStatus`: that enum is the
 * rules' own output (CANONICAL_SPEC §9), hashed into the run and pinned by
 * the golden baseline. A conclusion is what a person decided about the
 * rule's result, recorded beside it.
 *
 * `RESOLVED_*` may only be recorded once every required record the rule
 * asked for is in evidence — the command enforces it. Missing evidence never
 * becomes a PASS, and a human saying so does not change that; it is the one
 * rule this product does not let anyone, including its own users, talk their
 * way around.
 */
export interface RecordedConclusion {
  readonly id: string;
  readonly exceptionId: string;
  readonly conclusion:
    | "RESOLVED_NO_ADJUSTMENT"
    | "RESOLVED_ADJUSTMENT_PROPOSED"
    | "REMAINS_OPEN";
  readonly rationale: string;
  readonly byUserId: string;
  readonly at: string;
  /** The derived status at the moment of the conclusion, for the trail. */
  readonly priorStatus: string;
}

/**
 * A version of the management close memo.
 *
 * The memo is a MANAGEMENT artifact and deliberately not a twenty-second PBC
 * request (COMPLETION_PLAN decision D8). Putting it in the PBC package would
 * move the ready-item count and therefore the readiness figure, which would
 * mean writing a memo changed how ready the close is — an artifact reporting
 * on the close cannot also be a component of it.
 *
 * It lives in working state alongside conclusions, is cleared by Reset Demo,
 * and is excluded from replay equivalence: it is what people wrote, not what
 * the rules derived.
 *
 * The version vocabulary mirrors `PbcVersion` on purpose — a sealed version
 * carries the hash it was sealed with and can only be superseded, and exactly
 * one object in a history is editable. A memo that could be edited after
 * being issued would be a record of the present rather than of what was said.
 */
export interface MemoVersion {
  readonly id: string;
  /** Sequence number, from 1. The working draft has none until it seals. */
  readonly version?: number;
  readonly state: "DRAFT" | "ISSUED" | "SUPERSEDED";
  readonly title: string;
  readonly body: string;
  readonly byUserId: string;
  readonly at: string;
  /** Present only on sealed versions — a draft has nothing sealed yet. */
  readonly contentHash?: string;
  /**
   * The close state the version was sealed against, so a later divergence is
   * visible rather than silent. Derived the same way a PBC workpaper's
   * prepared state is, from the figures the memo speaks about.
   */
  readonly closeStateHash?: string;
  readonly sealed: boolean;
  /** The working draft is the only editable object in a history. */
  readonly editable: boolean;
  readonly supersededByVersion?: number;
}

/** A request for a record that does not exist yet. Never itself evidence. */
export interface EvidenceRequest {
  readonly id: string;
  readonly exceptionId: string;
  readonly requirement: string;
  readonly askedOf: string;
  readonly byUserId: string;
  readonly at: string;
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
  /**
   * Management conclusions recorded against exceptions, and requests for
   * evidence that does not exist yet.
   *
   * Both are WORKING STATE layered over the derived close, never written
   * into `close`: the rules' own result stays exactly what the rules
   * produced, and a conclusion sits beside it as the separate human act it
   * is. That separation is the product's whole argument, and it is also what
   * keeps the baseline derivation reproducible — Reset Demo clears these and
   * the close is byte-identical again.
   */
  conclusions: RecordedConclusion[];
  evidenceRequests: EvidenceRequest[];
  /**
   * Close-memo history, oldest first. Working state like the rest: the memo
   * describes the close, so it can never become part of what the close
   * derives (D8), and Reset Demo clears it.
   */
  memoVersions: MemoVersion[];
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

/* ------------------------------------------------------------------ */
/* Working state, enumerated once                                       */
/* ------------------------------------------------------------------ */

/** Every `Workspace` field that is a collection — i.e. all of the working state. */
type ArrayKeys<T> = {
  [K in keyof T]-?: T[K] extends readonly unknown[] ? K : never;
}[keyof T];
export type WorkingStateKey = ArrayKeys<Workspace>;

/**
 * The working-state collections: what PEOPLE did, as opposed to what the
 * rules derived.
 *
 * This list is the single source for four things that used to be four
 * hand-written enumerations of the same seven names — what Reset Demo
 * clears, what it reports clearing, what the audit trail records it cleared,
 * and what the reproducibility check says it does not cover. They drifted,
 * predictably and silently: the replay exclusions named four collections
 * while the workspace held six, so the one sentence whose whole job is to
 * disclose what a check skipped was itself skipping two.
 *
 * The `ArrayKeys` constraint is what makes the coupling real rather than
 * remembered: adding a collection to `Workspace` without adding it here is a
 * COMPILE error (see the exhaustiveness check below), not a sentence that
 * quietly stops being true.
 *
 * Each noun is carried in both numbers because these counts are rendered to
 * a reader. The report used to hard-code every plural, which read correctly
 * only because the demo baseline clears zero of everything — the first time
 * somebody actually did one piece of work it said "1 comments".
 */
export const WORKING_STATE_COLLECTIONS = [
  { key: "comments", singular: "comment", plural: "comments" },
  { key: "drafts", singular: "draft", plural: "drafts" },
  {
    key: "submittedEvidence",
    singular: "submitted record",
    plural: "submitted records",
  },
  { key: "reviews", singular: "review", plural: "reviews" },
  {
    key: "conclusions",
    singular: "management conclusion",
    plural: "management conclusions",
  },
  {
    key: "evidenceRequests",
    singular: "evidence request",
    plural: "evidence requests",
  },
  {
    key: "memoVersions",
    singular: "close-memo version",
    plural: "close-memo versions",
  },
] as const satisfies readonly {
  key: WorkingStateKey;
  singular: string;
  plural: string;
}[];

/**
 * Compile-time exhaustiveness. If a new collection is added to `Workspace`
 * and not to the list above, `Exclude<…>` stops being `never` and this line
 * fails to typecheck — which is the only guard that cannot be forgotten.
 */
type UnlistedWorkingState = Exclude<
  WorkingStateKey,
  (typeof WORKING_STATE_COLLECTIONS)[number]["key"]
>;
const _everyCollectionIsListed: UnlistedWorkingState extends never ? true : never = true;
void _everyCollectionIsListed;

/** "a, b and c" — an Oxford-free list, because these are read as prose. */
function joinNaturally(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** The collections by name, for a sentence that has to list all of them. */
export function workingStateNouns(): string {
  return joinNaturally(WORKING_STATE_COLLECTIONS.map((c) => c.plural));
}

/**
 * The counts as a sentence fragment, each noun agreeing with its number.
 * Shared by the audit detail and the on-screen reset report so the log and
 * the page cannot describe one reset two ways.
 */
export function describeWorkingState(
  counts: Readonly<Record<WorkingStateKey, number>>,
): string {
  return joinNaturally(
    WORKING_STATE_COLLECTIONS.map((c) => {
      const n = counts[c.key];
      return `${n} ${n === 1 ? c.singular : c.plural}`;
    }),
  );
}

/** How many of each collection the workspace is holding right now. */
export function workingStateCounts(ws: Workspace): Record<WorkingStateKey, number> {
  const counts = {} as Record<WorkingStateKey, number>;
  for (const c of WORKING_STATE_COLLECTIONS) counts[c.key] = ws[c.key].length;
  return counts;
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
    conclusions: [],
    evidenceRequests: [],
    memoVersions: [],
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
  // Every working-state collection, from the one list. A reset that missed
  // one would leave a person's work layered over a freshly derived close and
  // nothing would say so.
  for (const c of WORKING_STATE_COLLECTIONS) {
    (ws[c.key] as unknown[]).length = 0;
  }
  ws.pbcPreparedState = preparedStateFor(ws.close);
}
