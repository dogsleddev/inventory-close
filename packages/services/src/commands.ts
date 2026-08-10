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
import {
  nextInstant,
  resetWorkspace,
  type Comment,
  type Draft,
  type SubmittedEvidence,
  type Workspace,
} from "./workspace.js";

/**
 * Command services (prompt 04): allowed demo workflows only. Every command
 * is authorized, blocked while the period is locked, and appends a full
 * docs/15 audit event. Nothing here mutates NetSuite records — there is no
 * write path to source fixtures at all.
 */

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
      };
      ws.submittedEvidence.push(item);
      audit(ctx, "EVIDENCE_SUBMITTED", item.id, at, {
        newState: "PENDING",
        detail: `${input.kind} for ${input.relatedObjectRef}`,
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

    resetDemo(ctx: ServiceContext) {
      // Reset is a controller-level demo operation; it rebuilds from source
      // facts and never hard-codes final metrics.
      authorize(ctx.user, "period.lock", "demo reset is a controlled operation");
      const at = nextInstant(ws);
      resetWorkspace(ws);
      audit(ctx, "DEMO_RESET", "WORKSPACE", at, {
        detail: `dataset ${ws.dataset.manifest.datasetVersion} rebuilt; run ${ws.close.runManifest.runId}`,
      });
      return ws.close.aggregates;
    },
  };
}

export type CommandService = ReturnType<typeof createCommandService>;
