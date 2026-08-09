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
}

/** A proposed JE must balance to zero in integer cents. */
export function adjustmentImbalance(adjustment: ProposedAdjustment): number {
  return adjustment.lines.reduce((sum, line) => sum + line.amount, 0);
}

export function isBalanced(adjustment: ProposedAdjustment): boolean {
  return adjustmentImbalance(adjustment) === 0;
}
