import { daysBetween, isoDate } from "@icg/domain";
import type { RuleFinding, RuleOutput } from "../engine/findings.js";
import type { Rule } from "../engine/rule.js";

/** DEMO-AGE-001 - demo assignments beyond the policy age (Valuation). */
export const demoAge001: Rule = {
  id: "DEMO-AGE-001",
  version: "1.0.0",
  controlDomain: "VALUATION",
  evaluate(ctx): RuleOutput {
    const findings: RuleFinding[] = [];
    for (const a of ctx.input.assignments) {
      if (a.kind !== "DEMO") continue;
      const age = daysBetween(isoDate(a.startedAt), isoDate(ctx.asOf));
      if (age <= ctx.policy.demoAgeThresholdDays) continue;
      const unit = ctx.index.unitsBySerial.get(a.serial);
      findings.push({
        ruleId: "DEMO-AGE-001",
        ruleVersion: "1.0.0",
        kind: "ACCOUNTING_EXCEPTION",
        title: "Long demo",
        whyFlagged: `Demo unit ${a.serial} has been on assignment${a.customer ? ` at ${a.customer}` : ""} for ${age} days (policy threshold ${ctx.policy.demoAgeThresholdDays}); condition and recoverability need management review.`,
        reasonCodes: ["DEMO_AGE_OVER_POLICY"],
        assertions: ["VALUATION", "CLASSIFICATION"],
        risk: "MEDIUM",
        exposureCents: unit?.unitCostCents ?? 0,
        subjects: {
          serials: [a.serial],
          ...(unit ? { skus: [unit.sku] } : {}),
          ...(a.contractId ? { documentRefs: [a.contractId] } : {}),
        },
        initialStatus: "ACCOUNTING_REVIEW",
        evidenceRequirements: [
          { description: "Condition/recoverability review of the demo unit", required: true, satisfied: false },
          { description: "Demo assignment record", required: true, satisfied: true, reference: a.id },
        ],
        attributes: { ageDays: String(age) },
      });
    }
    return {
      result: findings.length > 0 ? "REVIEW_REQUIRED" : "PASS",
      coverage: "COMPLETE",
      findings,
    };
  },
};
