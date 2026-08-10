import type { RuleFinding, RuleOutput } from "../engine/findings.js";
import type { Rule } from "../engine/rule.js";

/** TPI-CONF-001 - third-party custody confirmation (Existence, Rights). */
export const tpiConf001: Rule = {
  id: "TPI-CONF-001",
  version: "1.0.0",
  controlDomain: "THIRD_PARTY",
  evaluate(ctx): RuleOutput {
    const custodians = new Map<string, { units: number; exposure: number; skus: Map<string, number> }>();
    for (const u of ctx.input.inventoryUnits) {
      if (u.custodian === undefined) continue;
      let entry = custodians.get(u.custodian);
      if (!entry) {
        entry = { units: 0, exposure: 0, skus: new Map() };
        custodians.set(u.custodian, entry);
      }
      entry.units += 1;
      entry.exposure += u.unitCostCents;
      entry.skus.set(u.sku, (entry.skus.get(u.sku) ?? 0) + 1);
    }

    const findings: RuleFinding[] = [];
    for (const [custodian, holding] of [...custodians.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const statement = ctx.input.custodianStatements.find(
        (s) => s.custodian === custodian,
      );
      if (!statement) {
        // Never requested is weaker evidence than requested-and-unanswered;
        // it must never silently become PASS (docs/16).
        findings.push({
          ruleId: "TPI-CONF-001",
          ruleVersion: "1.0.0",
          kind: "ACCOUNTING_EXCEPTION",
          title: "Third-party confirmation",
          whyFlagged: `${custodian} holds ${holding.units} company-owned units and no year-end confirmation has been requested; existence and rights at the custodian are entirely unevidenced.`,
          reasonCodes: ["CONFIRMATION_NOT_REQUESTED"],
          assertions: ["EXISTENCE", "RIGHTS_AND_OBLIGATIONS"],
          risk: "HIGH",
          exposureCents: holding.exposure,
          subjects: { custodian, skus: [...holding.skus.keys()].sort() },
          initialStatus: "WAITING_ON_THIRD_PARTY",
          evidenceRequirements: [
            { description: "Confirmation request to the custodian", required: true, satisfied: false },
            { description: "Signed custodian confirmation of holdings", required: true, satisfied: false },
          ],
        });
        continue;
      }
      if (statement.respondedAt === undefined) {
        findings.push({
          ruleId: "TPI-CONF-001",
          ruleVersion: "1.0.0",
          kind: "ACCOUNTING_EXCEPTION",
          title: "Third-party confirmation",
          whyFlagged: `${custodian} holds ${holding.units} company-owned units; the year-end confirmation requested ${statement.requestedAt.slice(0, 10)} has not been answered, so existence and rights at the custodian are unconfirmed.`,
          reasonCodes: ["CONFIRMATION_OUTSTANDING"],
          assertions: ["EXISTENCE", "RIGHTS_AND_OBLIGATIONS"],
          risk: "HIGH",
          exposureCents: holding.exposure,
          subjects: { custodian, skus: [...holding.skus.keys()].sort() },
          initialStatus: "WAITING_ON_THIRD_PARTY",
          evidenceRequirements: [
            { description: "Signed custodian confirmation of holdings", required: true, satisfied: false, reference: statement.id },
          ],
        });
        continue;
      }
      // Responded: compare over the UNION of book and confirmed SKUs, so a
      // custodian confirming more stock than the listing (a completeness
      // signal) is flagged just like a shortfall.
      const confirmed = new Map((statement.lines ?? []).map((l) => [l.sku, l.quantity]));
      const allSkus = [...new Set([...holding.skus.keys(), ...confirmed.keys()])].sort();
      const mismatched = allSkus.filter(
        (sku) => (confirmed.get(sku) ?? 0) !== (holding.skus.get(sku) ?? 0),
      );
      if (mismatched.length > 0) {
        const overage = mismatched.some(
          (sku) => (confirmed.get(sku) ?? 0) > (holding.skus.get(sku) ?? 0),
        );
        findings.push({
          ruleId: "TPI-CONF-001",
          ruleVersion: "1.0.0",
          kind: "ACCOUNTING_EXCEPTION",
          title: "Third-party confirmation variance",
          whyFlagged: `${custodian}'s confirmation does not agree with book holdings for ${mismatched.join(", ")}.`,
          reasonCodes: [
            "CONFIRMATION_VARIANCE",
            ...(overage ? ["CONFIRMED_EXCEEDS_LISTING"] : []),
          ],
          assertions: [
            "EXISTENCE",
            "RIGHTS_AND_OBLIGATIONS",
            ...(overage ? (["COMPLETENESS"] as const) : []),
          ],
          risk: "HIGH",
          exposureCents: mismatched.reduce(
            (sum, sku) =>
              sum +
              Math.abs((confirmed.get(sku) ?? 0) - (holding.skus.get(sku) ?? 0)) *
                (ctx.index.skuCostCents.get(sku) ?? 0),
            0,
          ),
          subjects: { custodian, skus: mismatched },
          initialStatus: "ACCOUNTING_REVIEW",
          evidenceRequirements: [
            { description: "Reconciliation of confirmed vs book holdings", required: true, satisfied: false, reference: statement.id },
          ],
        });
      }
    }
    return {
      result: findings.length > 0 ? "REVIEW_REQUIRED" : "PASS",
      coverage: "COMPLETE",
      findings,
    };
  },
};
