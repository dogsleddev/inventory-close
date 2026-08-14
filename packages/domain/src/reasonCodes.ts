/**
 * What KIND of finding a reason code names — an authored interpretation.
 *
 * A rule fires for two materially different reasons, and the product had been
 * treating them as one:
 *
 *   CONTRADICTION — two records that cannot both be right. A serial is on the
 *     year-end listing and the floor did not find it. A bill lands in the
 *     period and its receipt does not. Somebody must reconcile them.
 *   ABSENCE — a record the close asked for and does not hold. The custodian
 *     confirmation requested on 2026-12-28 was never answered. Nothing
 *     contradicts anything; a document is simply not there.
 *   JUDGEMENT — neither. Stock aged past a policy threshold, a forecast below
 *     holdings, an entry above a support threshold. These are triggers for a
 *     person to decide something, not disagreements between records.
 *
 * WHY THIS EXISTS. `answers.ts` filed the rule's `whyFlagged` narrative under
 * the heading CONFLICTING EVIDENCE for every open exception, keyed on
 * open-ness alone — so an auditor reading EXC-007 was told a contradictory
 * record existed and was invited to look for it, when the entire finding was
 * that a confirmation never arrived. The same sentence appeared under MISSING
 * EVIDENCE in the same answer: one absence, filed simultaneously as a conflict
 * and as a gap. EXC-011 and EXC-015 did the same.
 *
 * This is an INTERPRETATION and should be reported as one if challenged. It is
 * held here, beside the codes, for the reason `INVENTORY_ACCOUNTING_MATRIX`
 * exists: a reader who wants to disagree with this product's judgements should
 * find them in one place rather than in whichever projection needed each one
 * first. This one is about EVIDENCE TAXONOMY, not accounting treatment, which
 * is why it is not in that matrix.
 *
 * The default is deliberately asymmetric. An unclassified code is NOT a
 * contradiction, because over-claiming a conflict sends a reader looking for a
 * record that does not exist, while under-claiming one merely reports the
 * finding without the label. `reason-codes.test.ts` fails when any code a rule
 * emits is missing from the table below, so the default is a backstop rather
 * than a way to skip the decision.
 */

export type ReasonCodeKind = "CONTRADICTION" | "ABSENCE" | "JUDGEMENT";

/**
 * Every reason code the rules emit, classified.
 *
 * Keep alphabetical. A code added to a rule and not added here fails the
 * exhaustiveness test rather than silently defaulting.
 */
export const REASON_CODE_KIND: Readonly<Record<string, ReasonCodeKind>> = {
  /* Two records that cannot both be right. */
  BILL_WITHOUT_PERIOD_RECEIPT: "CONTRADICTION",
  COUNT_FIRST_PASS_NOT_FOUND: "CONTRADICTION",
  COUNT_QUANTITY_VARIANCE: "CONTRADICTION",
  COUNT_WINDOW_MOVEMENT: "CONTRADICTION",
  DUPLICATE_GL_POSTING: "CONTRADICTION",
  DUPLICATE_SERIAL_LOCATION: "CONTRADICTION",
  FLOOR_TO_SHEET_UNTRACED: "CONTRADICTION",
  NOT_ON_LISTING: "CONTRADICTION",
  RECEIPT_GL_TIMING: "CONTRADICTION",
  REPEATED_CYCLE_VARIANCE: "CONTRADICTION",
  SHIPPED_NOT_RELIEVED: "CONTRADICTION",
  VARIANCE_PENDING_RECONCILIATION: "CONTRADICTION",
  WRONG_ACCOUNT_CLASSIFICATION: "CONTRADICTION",

  /* A record the close asked for and does not hold. */
  CONFIRMATION_NOT_REQUESTED: "ABSENCE",
  CONFIRMATION_OUTSTANDING: "ABSENCE",
  CYCLE_COUNT_OVERDUE: "ABSENCE",
  DAMAGED_RETURN_UNASSESSED: "ABSENCE",
  MANUAL_ENTRY_NO_SUPPORT: "ABSENCE",
  NO_MOVEMENT_RECORD: "ABSENCE",
  OWNERSHIP_PROVISION_MISSING: "ABSENCE",
  TITLE_RETENTION_NOT_EVIDENCED: "ABSENCE",
  TITLE_TERMS_UNRESOLVED: "ABSENCE",

  /* A trigger for a person to decide, not a disagreement. */
  ABOVE_SUPPORT_THRESHOLD: "JUDGEMENT",
  AGED_NO_MOVEMENT: "JUDGEMENT",
  COUNT_LINKED_ADJUSTMENT: "JUDGEMENT",
  CYCLE_COUNT_REJECTED: "JUDGEMENT",
  DEMO_AGE_OVER_POLICY: "JUDGEMENT",
  FORECAST_BELOW_HOLDINGS: "JUDGEMENT",
  INVOICE_NOT_OWNERSHIP_EVIDENCE: "JUDGEMENT",
  NO_AUTO_ADD: "JUDGEMENT",
  PRODUCT_TRANSITION: "JUDGEMENT",
};

/**
 * Does this finding contain a genuine contradiction between records?
 *
 * ANY contradiction code is enough. A finding is routinely mixed — EXC-001 is
 * a real shipped-but-still-on-hand conflict AND a missing contract provision —
 * and the conflict does not stop being real because an absence sits beside it.
 * The narrative is the rule's own sentence and is never re-authored here.
 */
export function namesContradiction(reasonCodes: readonly string[]): boolean {
  return reasonCodes.some((c) => REASON_CODE_KIND[c] === "CONTRADICTION");
}
