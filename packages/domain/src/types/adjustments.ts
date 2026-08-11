import type { Cents } from "../money.js";
import type { ExceptionId, GlAccountCode, UserId } from "../identifiers.js";

/**
 * Proposed journal-entry adjustments are prepared and reviewed by humans.
 * There is no autonomous posting and no NetSuite write path in MVP.
 */
export interface ProposedAdjustmentLine {
  readonly account: GlAccountCode;
  readonly memo: string;
  /** Positive = debit, negative = credit, in integer cents. */
  readonly amount: Cents;
}

export interface ProposedAdjustment {
  readonly id: string;
  readonly relatedExceptionId?: ExceptionId;
  readonly description: string;
  readonly lines: readonly ProposedAdjustmentLine[];
  readonly preparedBy?: UserId;
  readonly reviewedBy?: UserId;
  readonly approved?: boolean;
  /**
   * When the entry was drafted. An optional additive field (versioned
   * data-model enhancement, plan D5 scope): an entry a reviewer cannot date
   * is not a workpaper anyone can act on. Recorded from the event that
   * drafted it — never invented at render time.
   *
   * The accounting PERIOD is deliberately absent here. These entries are
   * drafted after year-end and adjust the period being closed, so the draft
   * date does not imply the period; the surface reads that from the close.
   */
  readonly proposedAt?: string;
  /** The person the source event names as having drafted it. */
  readonly preparedByName?: string;
}

/** A proposed JE must balance to zero in integer cents. */
export function adjustmentImbalance(adjustment: ProposedAdjustment): number {
  return adjustment.lines.reduce((sum, line) => sum + line.amount, 0);
}

export function isBalanced(adjustment: ProposedAdjustment): boolean {
  return adjustmentImbalance(adjustment) === 0;
}
