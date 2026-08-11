import { assertNotSelfApproval, authorize } from "@icg/permissions";
import { redactRestricted } from "./redaction.js";
import type { DemoUser } from "@icg/data";
import { sha256Canonical } from "@icg/evidence";
import type { EvidenceSensitivity } from "@icg/domain";
import {
  createReview,
  mutationAllowed,
  transitionPeriod,
  transitionReview,
} from "@icg/workflows";
import type { ServiceContext } from "./queries.js";
import { effectiveStatus, unmetRequirements } from "./effective.js";
import {
  nextInstant,
  resetWorkspace,
  type Comment,
  type Draft,
  type EvidenceRequest,
  type RecordedConclusion,
  type SubmittedEvidence,
  type Workspace,
} from "./workspace.js";

/**
 * Command services (prompt 04): allowed demo workflows only. Every command
 * is authorized, blocked while the period is locked, and appends a full
 * docs/15 audit event. Nothing here mutates NetSuite records — there is no
 * write path to source fixtures at all.
 */

/**
 * Demo reset is a controlled operation, so it authorizes against the same
 * key as locking the period. Named once: a surface that offers the control
 * must gate on THIS, never on a role list that happens to match today.
 */
export const DEMO_RESET_PERMISSION = "period.lock" as const;

/**
 * Raised when a conclusion would resolve an exception whose rule still has
 * a required record missing. The unmet requirements travel with the error so
 * the surface can say what is needed rather than only that it refused.
 */
export class EvidenceIncompleteError extends Error {
  constructor(
    readonly exceptionId: string,
    readonly unmet: readonly string[],
  ) {
    super(
      `${exceptionId} cannot be concluded resolved while required evidence is missing: ${unmet.join("; ")}`,
    );
    this.name = "EvidenceIncompleteError";
  }
}

export class PeriodLockedError extends Error {
  constructor(action: string) {
    super(`Period is locked; ${action} is not allowed`);
    this.name = "PeriodLockedError";
  }
}

function requireMutable(ws: Workspace, action: string): void {
  if (!mutationAllowed(ws.period.state)) {
    throw new PeriodLockedError(action);
  }
}

/**
 * Submitted-evidence return paths apply the same restricted-content
 * redaction as the query layer — commands are not a side door either. This
 * calls the SHARED redactor rather than repeating it; the previous local
 * copy cleared `content` and spread `originalValue`, which is byte-identical
 * to it, and so disclosed exactly what it was meant to withhold.
 */
const redactFor = (user: DemoUser, item: SubmittedEvidence): SubmittedEvidence =>
  redactRestricted(user, item);

export function createCommandService(ws: Workspace) {
  const audit = (
    ctx: ServiceContext,
    action: string,
    objectRef: string,
    at: string,
    extra?: { priorState?: string; newState?: string; reason?: string; detail?: string },
  ) =>
    ws.audit.append({
      actorUserId: ctx.user.id,
      actorRole: ctx.user.roles[0] ?? "PREPARER",
      action,
      objectRef,
      sourceInterface: ctx.sourceInterface,
      correlationId: ctx.correlationId,
      at,
      ...(extra?.priorState !== undefined ? { priorState: extra.priorState } : {}),
      ...(extra?.newState !== undefined ? { newState: extra.newState } : {}),
      ...(extra?.reason !== undefined ? { reason: extra.reason } : {}),
      ...(extra?.detail !== undefined ? { detail: extra.detail } : {}),
    });

  return {
    submitEvidence(
      ctx: ServiceContext,
      input: {
        title: string;
        kind: string;
        content: unknown;
        sensitivity?: EvidenceSensitivity;
        relatedObjectRef: string;
        /**
         * The requirement this submission answers, when there is one. It is
         * named by the caller and matched exactly — evidence never satisfies
         * a control by resembling it.
         */
        satisfiesRequirement?: { exceptionId: string; requirement: string };
      },
    ): SubmittedEvidence {
      authorize(ctx.user, "evidence.submit");
      requireMutable(ws, "evidence submission");
      const at = nextInstant(ws);
      // Monotonic across demo resets: the audit log survives reset, so
      // evidence ids must never be reused by a later submission.
      ws.evidenceSeq += 1;
      const hash = sha256Canonical(input.content);
      const item: SubmittedEvidence = {
        id: `EV-S${String(ws.evidenceSeq).padStart(3, "0")}`,
        title: input.title,
        kind: input.kind,
        sensitivity: input.sensitivity ?? "STANDARD",
        contentHash: hash,
        content: input.content,
        originalValue: input.content,
        originalHash: hash,
        transformation: "IDENTITY",
        submittedByUserId: ctx.user.id,
        submittedAt: at,
        reviewState: "PENDING",
        annotations: [],
        ...(input.satisfiesRequirement !== undefined
          ? { satisfiesRequirement: input.satisfiesRequirement }
          : {}),
      };
      ws.submittedEvidence.push(item);
      audit(ctx, "EVIDENCE_SUBMITTED", item.id, at, {
        newState: "PENDING",
        detail:
          input.satisfiesRequirement !== undefined
            ? `${input.kind} for ${input.relatedObjectRef} — answers "${input.satisfiesRequirement.requirement}"`
            : `${input.kind} for ${input.relatedObjectRef}`,
      });
      return item;
    },

    reviewEvidence(
      ctx: ServiceContext,
      evidenceId: string,
      outcome: "ACCEPTED" | "RETURNED",
      note?: string,
    ): SubmittedEvidence {
      authorize(ctx.user, "evidence.review");
      requireMutable(ws, "evidence review");
      const idx = ws.submittedEvidence.findIndex((e) => e.id === evidenceId);
      const item = ws.submittedEvidence[idx];
      if (!item) throw new Error(`Unknown evidence ${evidenceId}`);
      // Reviewing your own submission is self-approval (docs/15 SOD).
      assertNotSelfApproval(ctx.user, item.submittedByUserId, evidenceId);
      // One review per submission: a decided item is superseded by a new
      // submission, never silently re-reviewed (append-only history).
      if (item.reviewState !== "PENDING") {
        throw new Error(
          `Evidence ${evidenceId} already reviewed (${item.reviewState}); supersede via a new submission instead`,
        );
      }
      const at = nextInstant(ws);
      const updated: SubmittedEvidence = {
        ...item,
        reviewState: outcome,
        reviewedByUserId: ctx.user.id,
        annotations:
          note !== undefined
            ? [...item.annotations, { byUserId: ctx.user.id, at, note }]
            : item.annotations,
      };
      ws.submittedEvidence[idx] = updated;
      audit(ctx, "EVIDENCE_REVIEWED", evidenceId, at, {
        priorState: item.reviewState,
        newState: outcome,
        ...(note !== undefined ? { detail: note } : {}),
      });
      return redactFor(ctx.user, updated);
    },

    annotateEvidence(ctx: ServiceContext, evidenceId: string, note: string): SubmittedEvidence {
      authorize(ctx.user, "evidence.submit");
      requireMutable(ws, "evidence annotation");
      const idx = ws.submittedEvidence.findIndex((e) => e.id === evidenceId);
      const item = ws.submittedEvidence[idx];
      if (!item) throw new Error(`Unknown evidence ${evidenceId}`);
      const at = nextInstant(ws);
      // Append-only: annotate, never edit or delete.
      const updated: SubmittedEvidence = {
        ...item,
        annotations: [...item.annotations, { byUserId: ctx.user.id, at, note }],
      };
      ws.submittedEvidence[idx] = updated;
      audit(ctx, "EVIDENCE_ANNOTATED", evidenceId, at);
      return redactFor(ctx.user, updated);
    },

    addComment(ctx: ServiceContext, objectRef: string, text: string): Comment {
      authorize(ctx.user, "comment.create");
      requireMutable(ws, "commenting");
      const at = nextInstant(ws);
      const comment: Comment = {
        id: `CM-${String(ws.comments.length + 1).padStart(3, "0")}`,
        objectRef,
        byUserId: ctx.user.id,
        at,
        text,
      };
      ws.comments.push(comment);
      audit(ctx, "COMMENT_ADDED", objectRef, at);
      return comment;
    },

    createDraft(ctx: ServiceContext, kind: string, objectRef: string, body: string): Draft {
      authorize(ctx.user, "draft.create");
      requireMutable(ws, "draft creation");
      const at = nextInstant(ws);
      const draft: Draft = {
        id: `DR-${String(ws.drafts.length + 1).padStart(3, "0")}`,
        kind,
        objectRef,
        byUserId: ctx.user.id,
        at,
        body,
        isApproval: false,
      };
      ws.drafts.push(draft);
      audit(ctx, "DRAFT_CREATED", objectRef, at, { detail: kind });
      return draft;
    },

    requestReview(ctx: ServiceContext, objectRef: string) {
      authorize(ctx.user, "review.request");
      requireMutable(ws, "review request");
      const at = nextInstant(ws);
      const review = transitionReview(
        createReview(`RV-${String(ws.reviews.length + 1).padStart(3, "0")}`, objectRef, ctx.user.id, at),
        "IN_REVIEW",
        ctx.user.id,
        nextInstant(ws),
      );
      ws.reviews.push(review);
      audit(ctx, "REVIEW_REQUESTED", objectRef, at, { newState: "IN_REVIEW" });
      return review;
    },

    approveReview(ctx: ServiceContext, reviewId: string) {
      authorize(ctx.user, "review.approve");
      requireMutable(ws, "approval");
      const idx = ws.reviews.findIndex((r) => r.id === reviewId);
      const review = ws.reviews[idx];
      if (!review) throw new Error(`Unknown review ${reviewId}`);
      // Preparer cannot self-approve material work (docs/15).
      assertNotSelfApproval(ctx.user, review.preparedByUserId, review.objectRef);
      const at = nextInstant(ws);
      const approved = transitionReview(review, "APPROVED", ctx.user.id, at);
      ws.reviews[idx] = approved;
      audit(ctx, "REVIEW_APPROVED", review.objectRef, at, {
        priorState: "IN_REVIEW",
        newState: "APPROVED",
      });
      return approved;
    },

    /**
     * Ask an owner for a record the close needs and does not have.
     *
     * A request is not evidence and never satisfies anything: it records
     * that someone asked, so the next person can see the item is being
     * worked rather than ignored.
     */
    requestEvidence(
      ctx: ServiceContext,
      input: { exceptionId: string; requirement: string; askedOf: string },
    ): EvidenceRequest {
      authorize(ctx.user, "evidence.request");
      requireMutable(ws, "an evidence request");
      const exception = ws.close.exceptions.find((e) => e.id === input.exceptionId);
      if (exception === undefined) {
        throw new Error(`Unknown exception ${input.exceptionId}`);
      }
      const at = nextInstant(ws);
      const request: EvidenceRequest = {
        id: `REQ-${String(ws.evidenceRequests.length + 1).padStart(3, "0")}`,
        exceptionId: input.exceptionId,
        requirement: input.requirement,
        askedOf: input.askedOf,
        byUserId: ctx.user.id,
        at,
      };
      ws.evidenceRequests.push(request);
      audit(ctx, "EVIDENCE_REQUESTED", input.exceptionId, at, {
        detail: `${input.requirement} — asked of ${input.askedOf}`,
      });
      return request;
    },

    /**
     * Record a management conclusion on an exception.
     *
     * The one rule this command will not bend: an exception whose rule still
     * has a required record missing cannot be concluded RESOLVED. Management
     * may record that it remains open and why; it may not conclude the
     * evidence question closed while the evidence is absent. Submitting the
     * record is the way through, which is exactly the order a close works in.
     */
    concludeException(
      ctx: ServiceContext,
      input: {
        exceptionId: string;
        conclusion: RecordedConclusion["conclusion"];
        rationale: string;
      },
    ): RecordedConclusion {
      authorize(ctx.user, "exception.conclude");
      requireMutable(ws, "recording a conclusion");
      const exception = ws.close.exceptions.find((e) => e.id === input.exceptionId);
      if (exception === undefined) {
        throw new Error(`Unknown exception ${input.exceptionId}`);
      }
      if (input.rationale.trim() === "") {
        throw new Error("A conclusion must state its rationale.");
      }
      const unmet = unmetRequirements(ws, exception.id);
      if (input.conclusion !== "REMAINS_OPEN" && unmet.length > 0) {
        throw new EvidenceIncompleteError(exception.id, unmet);
      }
      const at = nextInstant(ws);
      const priorStatus = effectiveStatus(ws, exception.id);
      const record: RecordedConclusion = {
        id: `CON-${String(ws.conclusions.length + 1).padStart(3, "0")}`,
        exceptionId: input.exceptionId,
        conclusion: input.conclusion,
        rationale: input.rationale.trim(),
        byUserId: ctx.user.id,
        at,
        priorStatus,
      };
      ws.conclusions.push(record);
      audit(ctx, "EXCEPTION_CONCLUSION_RECORDED", input.exceptionId, at, {
        priorState: priorStatus,
        newState: input.conclusion,
        reason: record.rationale,
      });
      return record;
    },

    lockPeriod(ctx: ServiceContext, kind: "SOFT_LOCKED" | "LOCKED") {
      authorize(ctx.user, "period.lock");
      const at = nextInstant(ws);
      const prior = ws.period.state;
      ws.period = transitionPeriod(ws.period, kind, ctx.user.id, at);
      audit(ctx, "PERIOD_LOCKED", "FY2026-CLOSE", at, { priorState: prior, newState: kind });
      return ws.period.state;
    },

    reopenPeriod(ctx: ServiceContext, reason: string) {
      authorize(ctx.user, "period.reopen");
      const at = nextInstant(ws);
      const prior = ws.period.state;
      // The workflow machine itself refuses a reopen without a reason.
      ws.period = transitionPeriod(ws.period, "REOPENED", ctx.user.id, at, reason);
      audit(ctx, "PERIOD_REOPENED", "FY2026-CLOSE", at, {
        priorState: prior,
        newState: "REOPENED",
        reason,
      });
      return ws.period.state;
    },

    /**
     * Reset Demo (CANONICAL_SPEC section 15). Rebuilds derived state from
     * the seed, the rules, and the scenario events; it hard-codes no final
     * metric, so the restored baseline is a re-derivation rather than a
     * stored snapshot. The audit trail survives on purpose — a reset is
     * itself an event, and erasing the history that records it would make
     * the log a description of the present instead of the past.
     */
    resetDemo(ctx: ServiceContext) {
      authorize(ctx.user, DEMO_RESET_PERMISSION, "demo reset is a controlled operation");
      const at = nextInstant(ws);
      const cleared = {
        comments: ws.comments.length,
        drafts: ws.drafts.length,
        submittedEvidence: ws.submittedEvidence.length,
        reviews: ws.reviews.length,
        // The close loop's working state. Reported because a reset that
        // silently discarded a management conclusion would be the one thing
        // this report exists to prevent.
        conclusions: ws.conclusions.length,
        evidenceRequests: ws.evidenceRequests.length,
        period: ws.period.state,
      };
      resetWorkspace(ws);
      audit(ctx, "DEMO_RESET", "WORKSPACE", at, {
        priorState: cleared.period,
        newState: ws.period.state,
        detail:
          `dataset ${ws.dataset.manifest.datasetVersion} rebuilt; run ${ws.close.runManifest.runId}; ` +
          `working state cleared: ${cleared.comments} comments, ${cleared.drafts} drafts, ` +
          `${cleared.submittedEvidence} submitted evidence, ${cleared.reviews} reviews, ` +
          `${cleared.conclusions} conclusions, ${cleared.evidenceRequests} evidence requests`,
      });
      return {
        aggregates: ws.close.aggregates,
        runId: ws.close.runManifest.runId,
        datasetVersion: ws.dataset.manifest.datasetVersion,
        datasetHash: ws.dataset.manifest.datasetHash,
        outputHash: ws.close.runManifest.outputHash,
        cleared,
        /** The log is append-only: this is what a reset preserved. */
        auditEventsRetained: ws.audit.count(),
      };
    },
  };
}

export type CommandService = ReturnType<typeof createCommandService>;
