import type { ProposedAdjustment } from "@icg/domain";
import {
  GROSS_INVENTORY_ACCOUNT_CODES,
  adjustmentImbalance,
  isResolvedStatus,
} from "@icg/domain";
import type { DerivedException } from "./exceptions.js";
import type { ReconciliationOut } from "./reconciliation.js";

/**
 * The proposed-adjustment register (prompt 07).
 *
 * Gaurd proposes and explains; it never posts. Every entry here is a
 * management proposal with balanced lines, a named preparer and reviewer,
 * and an approval that no rule can grant — `posted` is structurally `false`
 * and there is no code path that sets it otherwise.
 *
 * The register is keyed on the RECONCILING ITEMS, not on the proposals, so
 * an identified difference with no drafted entry stays visible as exactly
 * that. At the FY2026 baseline three items are identified and two carry
 * prepared entries: EXC-015's reversal cannot be drafted while the
 * exception is still in Controller Review. That 2-of-3 is the same ratio
 * the ADJUSTMENTS readiness category scores (66.67%) — the register and
 * the score read the same facts.
 */

export interface AdjustmentLineOut {
  readonly account: string;
  readonly memo: string;
  /** Positive = debit, negative = credit, integer cents. */
  readonly amountCents: number;
}

export interface ProposedAdjustmentOut {
  readonly id: string;
  readonly relatedExceptionId?: string;
  readonly description: string;
  readonly lines: readonly AdjustmentLineOut[];
  /** When the entry was drafted; absent when the source event did not say. */
  readonly proposedAt?: string;
  /** Who drafted it, as the source event names them. */
  readonly preparedByName?: string;
  /** Balanced proposals net to zero; the imbalance is reported, not assumed. */
  readonly imbalanceCents: number;
  readonly balanced: boolean;
  /** Net effect on the inventory GL accounts, integer cents. */
  readonly inventoryEffectCents: number;
  readonly preparedByRole: string;
  readonly reviewerRole: string;
  readonly approved: boolean;
  readonly approvalRequirement: string;
  /** Structurally never true — there is no posting path in this product. */
  readonly posted: false;
  readonly postedReference: null;
}

export interface AdjustmentRegisterEntry {
  readonly reconcilingItemId: string;
  readonly exceptionId: string;
  readonly description: string;
  /** Proposed effect on the GL, integer cents (signed). */
  readonly amountCents: number;
  readonly exceptionStatus: string;
  readonly exceptionOpen: boolean;
  /** Absent when no entry has been drafted for this item. */
  readonly proposal?: ProposedAdjustmentOut;
  /** Why no entry exists yet — set only when `proposal` is absent. */
  readonly undraftedReason?: string;
}

export interface AdjustmentRegisterOut {
  readonly entries: readonly AdjustmentRegisterEntry[];
  readonly identifiedCount: number;
  readonly draftedCount: number;
  readonly postedCount: 0;
  /** Sum of the drafted entries' effect on the GL, integer cents. */
  readonly draftedEffectCents: number;
  /** Sum of every identified item, drafted or not, integer cents. */
  readonly identifiedEffectCents: number;
}

/**
 * GL accounts carrying gross inventory (1290 is the reserve, held out).
 * Derived from the one chart of accounts in @icg/domain, so this set and
 * every surface that names an account cannot disagree about which accounts
 * are inventory.
 */
const INVENTORY_ACCOUNTS = new Set(GROSS_INVENTORY_ACCOUNT_CODES);

const PREPARER_ROLE = "ACCOUNTING_MANAGER";
const REVIEWER_ROLE = "CONTROLLER";

function toProposalOut(proposal: ProposedAdjustment): ProposedAdjustmentOut {
  const imbalanceCents = adjustmentImbalance(proposal);
  return {
    id: proposal.id,
    ...(proposal.relatedExceptionId !== undefined
      ? { relatedExceptionId: String(proposal.relatedExceptionId) }
      : {}),
    description: proposal.description,
    ...(proposal.proposedAt !== undefined ? { proposedAt: proposal.proposedAt } : {}),
    ...(proposal.preparedByName !== undefined
      ? { preparedByName: proposal.preparedByName }
      : {}),
    lines: proposal.lines.map((line) => ({
      account: String(line.account),
      memo: line.memo,
      amountCents: line.amount,
    })),
    imbalanceCents,
    balanced: imbalanceCents === 0,
    inventoryEffectCents: proposal.lines
      .filter((line) => INVENTORY_ACCOUNTS.has(String(line.account)))
      .reduce((sum, line) => sum + line.amount, 0),
    preparedByRole: PREPARER_ROLE,
    reviewerRole: REVIEWER_ROLE,
    // Human approval is required and has not been given. Nothing in the
    // deterministic core can flip this.
    approved: proposal.approved ?? false,
    approvalRequirement:
      "Requires Controller approval and manual posting in NetSuite. Gaurd does not post.",
    posted: false,
    postedReference: null,
  };
}

export function buildAdjustmentRegister(
  reconciliation: ReconciliationOut,
  exceptions: readonly DerivedException[],
  proposals: readonly ProposedAdjustment[],
): AdjustmentRegisterOut {
  const entries: AdjustmentRegisterEntry[] = reconciliation.items.map((item) => {
    const exception = exceptions.find((e) => e.id === item.relatedExceptionId);
    const proposal = proposals.find(
      (p) => String(p.relatedExceptionId ?? "") === item.relatedExceptionId,
    );
    const open = exception !== undefined && !isResolvedStatus(exception.status);
    return {
      reconcilingItemId: item.id,
      exceptionId: item.relatedExceptionId,
      description: item.description,
      amountCents: item.amountCents,
      exceptionStatus: exception?.status ?? "UNKNOWN",
      exceptionOpen: open,
      ...(proposal !== undefined
        ? { proposal: toProposalOut(proposal) }
        : {
            // Say why rather than rendering an empty row: an identified
            // difference with no entry is a state, not an omission.
            undraftedReason: open
              ? `No entry drafted — ${item.relatedExceptionId} has not reached a management conclusion.`
              : `No entry drafted for ${item.relatedExceptionId}.`,
          }),
    };
  });

  const drafted = entries.filter((e) => e.proposal !== undefined);
  return {
    entries,
    identifiedCount: entries.length,
    draftedCount: drafted.length,
    postedCount: 0,
    draftedEffectCents: drafted.reduce((sum, e) => sum + e.amountCents, 0),
    identifiedEffectCents: entries.reduce((sum, e) => sum + e.amountCents, 0),
  };
}
