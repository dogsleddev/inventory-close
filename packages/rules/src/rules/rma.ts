import type { RuleFinding, RuleOutput } from "../engine/findings.js";
import type { Rule } from "../engine/rule.js";

/**
 * RMA-DUP-001 - RMA duplicate accounting (Accuracy). A manual GL re-add
 * that duplicates an already-posted inventory adjustment for the same
 * return overstates inventory.
 */
export const rmaDup001: Rule = {
  id: "RMA-DUP-001",
  version: "1.0.0",
  controlDomain: "RMA",
  evaluate(ctx): RuleOutput {
    const findings: RuleFinding[] = [];
    for (const entry of ctx.input.glEntries) {
      if (entry.postedDate > ctx.asOf || entry.supportRef === undefined) continue;
      if (!entry.supportRef.startsWith("RMA-")) continue;
      const duplicateOf = ctx.input.inventoryAdjustments.find(
        (adj) =>
          adj.adjustmentDate <= ctx.asOf &&
          adj.reason.includes(entry.supportRef ?? "") &&
          adj.lines.reduce((sum, l) => sum + (l.amountCents ?? 0), 0) === entry.amountCents,
      );
      if (!duplicateOf) continue;
      const rma = ctx.input.rmaRecords.find((r) => r.id === entry.supportRef);
      findings.push({
        ruleId: "RMA-DUP-001",
        ruleVersion: "1.0.0",
        kind: "ACCOUNTING_EXCEPTION",
        title: "RMA duplicate accounting",
        whyFlagged: `${entry.transactionNumber} (posted ${entry.postedDate} to ${entry.account}) re-adds the same return already restocked by ${duplicateOf.transactionNumber} (${duplicateOf.glAccount}, ${duplicateOf.adjustmentDate}); the return is double-counted and account ${entry.account} is overstated.`,
        reasonCodes: ["DUPLICATE_GL_POSTING", "WRONG_ACCOUNT_CLASSIFICATION"],
        assertions: ["ACCURACY"],
        risk: "MEDIUM",
        exposureCents: Math.abs(entry.amountCents),
        signedAmountCents: entry.amountCents,
        subjects: {
          transactionNumbers: [entry.transactionNumber, duplicateOf.transactionNumber],
          documentRefs: [entry.supportRef],
          ...(rma ? { skus: [rma.sku] } : {}),
        },
        initialStatus: "ACCOUNTING_REVIEW",
        evidenceRequirements: [
          { description: "Confirmation the two postings cover the same return", required: true, satisfied: false },
          { description: "Original inventory adjustment", required: true, satisfied: true, reference: duplicateOf.transactionNumber },
          { description: "Duplicate journal entry", required: true, satisfied: true, reference: entry.transactionNumber },
        ],
      });
    }
    return {
      result: findings.length > 0 ? "REVIEW_REQUIRED" : "PASS",
      coverage: "COMPLETE",
      findings,
    };
  },
};
