import type { RuleFinding, RuleOutput } from "../engine/findings.js";
import type { Rule } from "../engine/rule.js";

/** REC-GL-001 - subledger receipt whose GL posting landed after year end. */
export const recGl001: Rule = {
  id: "REC-GL-001",
  version: "1.0.0",
  controlDomain: "RECONCILIATION",
  evaluate(ctx): RuleOutput {
    const findings: RuleFinding[] = [];
    for (const entry of ctx.input.glEntries) {
      if (entry.postedDate <= ctx.asOf || entry.supportRef === undefined) continue;
      const receipt = ctx.input.itemReceipts.find(
        (r) => r.transactionNumber === entry.supportRef && r.receiptDate <= ctx.asOf,
      );
      if (!receipt) continue;
      findings.push({
        ruleId: "REC-GL-001",
        ruleVersion: "1.0.0",
        kind: "ACCOUNTING_EXCEPTION",
        title: "PO/receipt/GL timing",
        whyFlagged: `${receipt.transactionNumber} was received into the subledger ${receipt.receiptDate}, but its GL posting ${entry.transactionNumber} carries ${entry.postedDate} - the year-end GL is missing the receipt and the subledger-to-GL difference includes it as a validated timing item.`,
        reasonCodes: ["RECEIPT_GL_TIMING"],
        assertions: ["ACCURACY", "CUTOFF"],
        risk: "MEDIUM",
        exposureCents: entry.amountCents,
        subjects: {
          transactionNumbers: [receipt.transactionNumber, entry.transactionNumber],
          serials: receipt.lines.flatMap((l) => l.serials ?? []),
        },
        initialStatus: "ACCOUNTING_REVIEW",
        evidenceRequirements: [
          { description: "Validation that the January posting covers this receipt", required: true, satisfied: false },
          { description: "Subledger item receipt", required: true, satisfied: true, reference: receipt.transactionNumber },
          { description: "January GL posting", required: true, satisfied: true, reference: entry.transactionNumber },
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

/** GL-MAN-001 - unsupported manual GL entries at/above the policy threshold. */
export const glMan001: Rule = {
  id: "GL-MAN-001",
  version: "1.0.0",
  controlDomain: "RECONCILIATION",
  evaluate(ctx): RuleOutput {
    const findings: RuleFinding[] = [];
    for (const entry of ctx.input.glEntries) {
      if (entry.postedDate > ctx.asOf) continue;
      if (entry.supportRef !== undefined) continue;
      if (Math.abs(entry.amountCents) < ctx.policy.manualEntrySupportThresholdCents) continue;
      findings.push({
        ruleId: "GL-MAN-001",
        ruleVersion: "1.0.0",
        kind: "ACCOUNTING_EXCEPTION",
        title: "Unsupported manual GL entry",
        whyFlagged: `${entry.transactionNumber} posted ${entry.postedDate} to ${entry.account} ("${entry.memo}", entered by ${entry.enteredBy}) carries no supporting reference; an unsupported manual inventory entry at this size requires controller review before sign-off.`,
        reasonCodes: ["MANUAL_ENTRY_NO_SUPPORT", "ABOVE_SUPPORT_THRESHOLD"],
        assertions: ["ACCURACY"],
        risk: "CRITICAL",
        exposureCents: Math.abs(entry.amountCents),
        subjects: { transactionNumbers: [entry.transactionNumber] },
        initialStatus: "CONTROLLER_REVIEW",
        evidenceRequirements: [
          { description: "Supporting documentation for the manual entry", required: true, satisfied: false },
          { description: "Controller review and disposition", required: true, satisfied: false },
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
