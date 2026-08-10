import type { CloseInput } from "./engine/input.js";
import type { DerivedException } from "./exceptions.js";

/**
 * Subledger-to-GL reconciliation (CANONICAL_SPEC section 5). Reconciling
 * items derive from the GL-side rule findings: the duplicate re-add and the
 * unsupported manual entry inflate GL; the delayed receipt posting deflates
 * it. Amounts are the proposed adjustment direction (applied to GL, the
 * difference clears). No auto-posting ever occurs.
 */
export interface ReconciliationItemOut {
  readonly id: string;
  readonly description: string;
  readonly amountCents: number;
  readonly relatedExceptionId: string;
}

export interface ReconciliationOut {
  readonly asOf: string;
  readonly subledgerCents: number;
  readonly grossGlCents: number;
  /** GL minus subledger; positive when GL is higher. */
  readonly differenceCents: number;
  readonly reserveCents: number;
  readonly items: readonly ReconciliationItemOut[];
  readonly explainedCents: number;
  readonly unexplainedCents: number;
  readonly potentialAdjustedGlCents: number;
}

/**
 * Adjustment direction applied to the SIGNED entry amount: reversing an
 * entry is -signed (correct for both debit and credit entries); recording a
 * missing entry is +signed.
 */
const RECONCILING_RULE_DIRECTION: Readonly<Record<string, 1 | -1>> = {
  "RMA-DUP-001": -1, // remove the duplicate re-add
  "GL-MAN-001": -1, // reverse the unsupported manual entry
  "REC-GL-001": 1, // record the in-period receipt the GL is missing
};

export function buildReconciliation(
  input: CloseInput,
  exceptions: readonly DerivedException[],
): ReconciliationOut {
  const subledgerCents = input.inventoryUnits.reduce(
    (sum, u) => sum + u.unitCostCents,
    0,
  );
  const grossGlCents = input.glBalances
    .filter((b) => b.account !== "1290")
    .reduce((sum, b) => sum + b.amountCents, 0);
  const reserveCents =
    input.glBalances.find((b) => b.account === "1290")?.amountCents ?? 0;
  const differenceCents = grossGlCents - subledgerCents;

  const items: ReconciliationItemOut[] = [];
  for (const exc of exceptions) {
    const direction = RECONCILING_RULE_DIRECTION[exc.finding.ruleId];
    if (direction === undefined) continue;
    const signed = exc.finding.signedAmountCents;
    if (signed === undefined) {
      // Fail visible: a reconciling rule must state the signed GL amount.
      throw new Error(`Reconciling finding ${exc.id} lacks signedAmountCents`);
    }
    items.push({
      id: `REC-${exc.id}`,
      description: exc.finding.title,
      amountCents: direction * signed,
      relatedExceptionId: exc.id,
    });
  }
  const explainedCents = items.reduce((sum, i) => sum + i.amountCents, 0);
  return {
    asOf: input.asOf,
    subledgerCents,
    grossGlCents,
    differenceCents,
    reserveCents,
    items,
    explainedCents,
    // Fully explained when applying every item clears the difference.
    unexplainedCents: differenceCents + explainedCents,
    potentialAdjustedGlCents: grossGlCents + explainedCents,
  };
}
