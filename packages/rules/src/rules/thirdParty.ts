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
    let coverageIncomplete = false;
    for (const [custodian, holding] of [...custodians.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const statement = ctx.input.custodianStatements.find(
        (s) => s.custodian === custodian,
      );
      if (!statement) {
        coverageIncomplete = true;
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
      // Responded: compare confirmed lines to book holdings.
      const confirmed = new Map((statement.lines ?? []).map((l) => [l.sku, l.quantity]));
      const mismatched = [...holding.skus.entries()].filter(
        ([sku, qty]) => (confirmed.get(sku) ?? 0) !== qty,
      );
      if (mismatched.length > 0) {
        findings.push({
          ruleId: "TPI-CONF-001",
          ruleVersion: "1.0.0",
          kind: "ACCOUNTING_EXCEPTION",
          title: "Third-party confirmation variance",
          whyFlagged: `${custodian}'s confirmation does not agree with book holdings for ${mismatched.map(([sku]) => sku).join(", ")}.`,
          reasonCodes: ["CONFIRMATION_VARIANCE"],
          assertions: ["EXISTENCE", "RIGHTS_AND_OBLIGATIONS"],
          risk: "HIGH",
          exposureCents: mismatched.reduce(
            (sum, [sku, qty]) =>
              sum + Math.abs(qty - (confirmed.get(sku) ?? 0)) * (ctx.index.skuCostCents.get(sku) ?? 0),
            0,
          ),
          subjects: { custodian, skus: mismatched.map(([sku]) => sku) },
          initialStatus: "ACCOUNTING_REVIEW",
          evidenceRequirements: [
            { description: "Reconciliation of confirmed vs book holdings", required: true, satisfied: false, reference: statement.id },
          ],
        });
      }
    }
    return {
      result: findings.length > 0 ? "REVIEW_REQUIRED" : "PASS",
      coverage: coverageIncomplete ? "PARTIAL" : "COMPLETE",
      findings,
    };
  },
};
