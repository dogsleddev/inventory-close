import type { RuleFinding, RuleOutput } from "../engine/findings.js";
import type { Rule } from "../engine/rule.js";

/**
 * OWN-LOAN-001 - customer-site loaner ownership (Rights & Obligations).
 * Location is not ownership: a loaner at a customer site stays on the books
 * only if title retention is evidenced by contract.
 */
export const ownLoan001: Rule = {
  id: "OWN-LOAN-001",
  version: "1.0.0",
  controlDomain: "OWNERSHIP",
  evaluate(ctx): RuleOutput {
    const findings: RuleFinding[] = [];
    let partial = false;
    for (const a of ctx.input.assignments) {
      if (a.kind !== "LOANER") continue;
      const unit = ctx.index.unitsBySerial.get(a.serial);
      if (!unit || unit.location !== "CUSTOMER_SITE") continue;
      const contract = a.contractId
        ? ctx.index.contractsById.get(a.contractId)
        : undefined;
      if (!contract) {
        partial = true;
      }
      const title = contract?.provisions.find(
        (p) => p.provisionType === "TITLE_RETENTION",
      );
      if (title?.status === "PRESENT") continue;
      findings.push({
        ruleId: "OWN-LOAN-001",
        ruleVersion: "1.0.0",
        kind: "ACCOUNTING_EXCEPTION",
        title: "Customer-site loaner ownership",
        whyFlagged: `Loaner ${a.serial} has been at ${a.customer ?? "a customer site"} since ${a.startedAt}; the title-retention provision ${contract ? `of ${contract.title} cannot be located` : "is not evidenced by any contract"}, so company ownership at year end is not yet supported.`,
        reasonCodes: ["TITLE_RETENTION_NOT_EVIDENCED"],
        assertions: ["RIGHTS_AND_OBLIGATIONS"],
        risk: "MEDIUM",
        exposureCents: unit.unitCostCents,
        subjects: {
          serials: [a.serial],
          skus: [unit.sku],
          ...(contract ? { documentRefs: [contract.id] } : {}),
        },
        initialStatus: "ACCOUNTING_REVIEW",
        evidenceRequirements: [
          { description: "Title-retention provision for the loaner", required: true, satisfied: false, reference: contract?.id },
          { description: "Loaner assignment record", required: true, satisfied: true, reference: a.id },
        ],
      });
    }
    return {
      result: findings.length > 0 ? "REVIEW_REQUIRED" : "PASS",
      coverage: partial ? "PARTIAL" : "COMPLETE",
      findings,
    };
  },
};
