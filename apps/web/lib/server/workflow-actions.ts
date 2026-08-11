import type { DemoUser } from "@icg/data";
import { EvidenceIncompleteError, effectiveClose } from "@icg/services";
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
