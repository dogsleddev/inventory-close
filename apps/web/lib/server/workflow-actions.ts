import type { DemoUser } from "@icg/data";
import { EvidenceIncompleteError, effectiveClose, memoPosition } from "@icg/services";
import { formatBpsExact } from "../format";
import type { WorkflowActionResult } from "../view-model";
import { getCommands, getQueries, getWorkspace, makeContext } from "./workspace";

/**
 * The close loop's write paths (COMPLETION_PLAN Stage W).
 *
 * Each runner does exactly three things: call the command, translate the
 * outcome into something a screen can render, and nothing else. No
 * authorization decision is made here — @icg/services owns that, and a
 * refusal arrives as an exception which becomes a stated reason rather than
 * a silent no-op.
 *
 * The refusal that matters most is `EvidenceIncompleteError`: a management
 * conclusion may not resolve an exception whose rule still has a required
 * record missing. The surface repeats what is needed, so a user reads a
 * requirement rather than a rejection.
 */

function fail(error: unknown, fallback: string): WorkflowActionResult {
  if (error instanceof EvidenceIncompleteError) {
    return {
      ok: false,
      message:
        "This item cannot be concluded resolved while a required record is missing. Submit it first, or record that the item remains open.",
      unmet: [...error.unmet],
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  // Permission and period-lock refusals are real answers, not errors to hide.
  if (/lacks permission/i.test(message)) {
    return {
      ok: false,
      message: "Your demo role is not authorized to record this. Switch roles in the header to see who is.",
      unmet: [],
    };
  }
  if (/locked/i.test(message)) {
    return { ok: false, message: "The period is locked; reopen it before recording more.", unmet: [] };
  }
  return { ok: false, message: fallback, unmet: [] };
}

export function runRecordConclusion(
  user: DemoUser,
  correlationId: string,
  input: {
    exceptionId: string;
    conclusion: "RESOLVED_NO_ADJUSTMENT" | "RESOLVED_ADJUSTMENT_PROPOSED" | "REMAINS_OPEN";
    rationale: string;
  },
): WorkflowActionResult {
  const ctx = makeContext(user, correlationId);
  try {
    const record = getCommands().concludeException(ctx, input);
    const close = effectiveClose(getWorkspace());
    return {
      ok: true,
      message:
        record.conclusion === "REMAINS_OPEN"
          ? `Recorded: ${input.exceptionId} remains open. It still counts against sign-off.`
          : `Recorded: ${input.exceptionId} concluded. ${close.blockerCount} blocker${close.blockerCount === 1 ? "" : "s"} remain.`,
      unmet: [],
    };
  } catch (error) {
    return fail(error, "The conclusion could not be recorded.");
  }
}

export function runRequestEvidence(
  user: DemoUser,
  correlationId: string,
  input: { exceptionId: string; requirement: string; askedOf: string },
): WorkflowActionResult {
  const ctx = makeContext(user, correlationId);
  try {
    getCommands().requestEvidence(ctx, input);
    return {
      ok: true,
      message: `Requested from ${input.askedOf}. The record is still missing until it arrives — asking is not evidence.`,
      unmet: [],
    };
  } catch (error) {
    return fail(error, "The request could not be recorded.");
  }
}

export function runSubmitEvidence(
  user: DemoUser,
  correlationId: string,
  input: { exceptionId: string; requirement: string; title: string; note: string },
): WorkflowActionResult {
  const ctx = makeContext(user, correlationId);
  try {
    getCommands().submitEvidence(ctx, {
      title: input.title,
      kind: "MANAGEMENT_SUPPORT",
      content: { requirement: input.requirement, note: input.note },
      relatedObjectRef: input.exceptionId,
      // Named explicitly: a submission answers the requirement it says it
      // answers, never one it merely resembles.
      satisfiesRequirement: { exceptionId: input.exceptionId, requirement: input.requirement },
    });
    return {
      ok: true,
      message: "Support recorded against the requirement. It is pending review, and the conclusion is now available.",
      unmet: [],
    };
  } catch (error) {
    return fail(error, "The support could not be recorded.");
  }
}

/**
 * Save the close-memo working draft (Stage F).
 *
 * The success message reports the LIVE close position rather than echoing
 * what was typed: a draft is only worth anything if the figures it will be
 * issued against are the ones on the screen beside it.
 */
export function runSaveMemoDraft(
  user: DemoUser,
  correlationId: string,
  input: { title: string; body: string },
): WorkflowActionResult {
  const ctx = makeContext(user, correlationId);
  try {
    const draft = getCommands().saveMemoDraft(ctx, input);
    const position = memoPosition(getWorkspace());
    return {
      ok: true,
      message: `Draft saved: "${draft.title}". It is not issued, and nothing outside this page reads it. The close it would be issued against stands at ${position.blockerCount} blocker${position.blockerCount === 1 ? "" : "s"} open.`,
      unmet: [],
    };
  } catch (error) {
    return fail(error, "The draft could not be saved.");
  }
}

/**
 * Issue the working draft as a numbered version (Stage F).
 *
 * Sealing is irreversible in the sense that matters: an issued version is
 * superseded, never edited. The message says what was sealed alongside the
 * text, because the close-state hash is the half a reader would not think to
 * ask about and is what makes a later divergence visible.
 */
export function runIssueMemoVersion(
  user: DemoUser,
  correlationId: string,
  input: { note: string },
): WorkflowActionResult {
  const ctx = makeContext(user, correlationId);
  try {
    const issued = getCommands().issueMemoVersion(ctx, { note: input.note });
    const position = memoPosition(getWorkspace());
    return {
      ok: true,
      message: `Version ${issued.version} issued and sealed. It carries a hash of its text and a hash of the close position it was written against — ${formatBpsExact(position.readinessBps)} readiness, ${position.blockerCount} blocker${position.blockerCount === 1 ? "" : "s"} open. It can be superseded, never edited.`,
      unmet: [],
    };
  } catch (error) {
    return fail(error, "The version could not be issued.");
  }
}

/**
 * Sign-off. The gate is re-checked here from live state: a page held open
 * while blockers were still open must not be able to sign the period off.
 */
export function runSignOff(user: DemoUser, correlationId: string): WorkflowActionResult {
  const ctx = makeContext(user, correlationId);
  const close = effectiveClose(getWorkspace());
  if (close.blockerCount > 0) {
    return {
      ok: false,
      message: `Sign-off is unavailable while ${close.blockerCount} blocker${close.blockerCount === 1 ? "" : "s"} remain open.`,
      unmet: [],
    };
  }
  try {
    getCommands().lockPeriod(ctx, "LOCKED");
    const queries = getQueries();
    const period = queries.getPeriod(ctx);
    return {
      ok: true,
      message: `Management sign-off recorded. The period is ${String(period.state).toLowerCase().replace("_", " ")}; reopening it requires a stated reason and stays in the audit trail.`,
      unmet: [],
    };
  } catch (error) {
    return fail(error, "Sign-off could not be recorded.");
  }
}
