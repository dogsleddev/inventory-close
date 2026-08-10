/**
 * @icg/workflows — close workflow state machines with append-only state
 * history (Stage 04, docs/15). Periods move OPEN → SOFT_LOCKED → LOCKED and
 * may be REOPENED only with a reason; every transition is recorded, prior
 * lock history is retained, and material review work separates preparation
 * from approval (SOD enforcement lives in @icg/permissions; the service
 * layer wires both).
 */

import type { PeriodState } from "@icg/domain";

export class InvalidTransitionError extends Error {
  constructor(from: string, to: string, detail?: string) {
    super(`Invalid transition ${from} -> ${to}${detail ? `: ${detail}` : ""}`);
    this.name = "InvalidTransitionError";
  }
}

export interface PeriodTransition {
  readonly from: PeriodState;
  readonly to: PeriodState;
  readonly at: string;
  readonly byUserId: string;
  readonly reason?: string;
}

/** Allowed period transitions; REOPEN requires a reason (checked below). */
const PERIOD_TRANSITIONS: Readonly<Record<PeriodState, readonly PeriodState[]>> = {
  OPEN: ["SOFT_LOCKED", "LOCKED"],
  SOFT_LOCKED: ["LOCKED", "OPEN"],
  LOCKED: ["REOPENED"],
  REOPENED: ["SOFT_LOCKED", "LOCKED"],
};

export interface PeriodMachine {
  readonly state: PeriodState;
  readonly history: readonly PeriodTransition[];
}

export function createPeriodMachine(initial: PeriodState = "OPEN"): PeriodMachine {
  return { state: initial, history: [] };
}

export function transitionPeriod(
  machine: PeriodMachine,
  to: PeriodState,
  byUserId: string,
  at: string,
  reason?: string,
): PeriodMachine {
  if (!PERIOD_TRANSITIONS[machine.state].includes(to)) {
    throw new InvalidTransitionError(machine.state, to);
  }
  if (to === "REOPENED" && (reason === undefined || reason.trim() === "")) {
    throw new InvalidTransitionError(machine.state, to, "reopening requires a reason");
  }
  return {
    state: to,
    // Append-only: prior lock history is always retained.
    history: [
      ...machine.history,
      { from: machine.state, to, at, byUserId, ...(reason !== undefined ? { reason } : {}) },
    ],
  };
}

/** Ordinary mutation is blocked while the period is locked. */
export function mutationAllowed(state: PeriodState): boolean {
  return state === "OPEN" || state === "SOFT_LOCKED" || state === "REOPENED";
}

/** Material review work: DRAFT → IN_REVIEW → APPROVED | RETURNED. */
export type ReviewState = "DRAFT" | "IN_REVIEW" | "APPROVED" | "RETURNED";

export interface ReviewRecord {
  readonly id: string;
  readonly objectRef: string;
  readonly state: ReviewState;
  readonly preparedByUserId: string;
  readonly approvedByUserId?: string;
  readonly history: readonly {
    readonly from: ReviewState | "NONE";
    readonly to: ReviewState;
    readonly at: string;
    readonly byUserId: string;
    readonly note?: string;
  }[];
}

const REVIEW_TRANSITIONS: Readonly<Record<ReviewState, readonly ReviewState[]>> = {
  DRAFT: ["IN_REVIEW"],
  IN_REVIEW: ["APPROVED", "RETURNED"],
  RETURNED: ["IN_REVIEW"],
  APPROVED: [],
};

export function createReview(
  id: string,
  objectRef: string,
  preparedByUserId: string,
  at: string,
): ReviewRecord {
  return {
    id,
    objectRef,
    state: "DRAFT",
    preparedByUserId,
    history: [{ from: "NONE", to: "DRAFT", at, byUserId: preparedByUserId }],
  };
}

export function transitionReview(
  review: ReviewRecord,
  to: ReviewState,
  byUserId: string,
  at: string,
  note?: string,
): ReviewRecord {
  if (!REVIEW_TRANSITIONS[review.state].includes(to)) {
    throw new InvalidTransitionError(review.state, to, review.objectRef);
  }
  return {
    ...review,
    state: to,
    ...(to === "APPROVED" ? { approvedByUserId: byUserId } : {}),
    history: [
      ...review.history,
      { from: review.state, to, at, byUserId, ...(note !== undefined ? { note } : {}) },
    ],
  };
}
