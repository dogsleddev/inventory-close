import type { RuleFinding, RuleOutput } from "../engine/findings.js";
import type { Rule } from "../engine/rule.js";

/** DQ-LOC-001 - one serial observed in two locations (Accuracy). */
export const dqLoc001: Rule = {
  id: "DQ-LOC-001",
  version: "1.0.0",
  controlDomain: "DATA_QUALITY",
  evaluate(ctx): RuleOutput {
    const plan = ctx.input.countPlans.find((p) => p.countType === "YEAR_END");
    if (!plan) {
      return { result: "INCOMPLETE", coverage: "INCOMPLETE", findings: [] };
    }
    const rowsBySerial = new Map<string, { locations: string[]; sku: string }>();
    for (const r of ctx.input.countResults) {
      if (r.countPlanId !== plan.id || r.serial === undefined) continue;
      const entry = rowsBySerial.get(r.serial) ?? { locations: [], sku: r.sku };
      entry.locations.push(r.location);
      rowsBySerial.set(r.serial, entry);
    }
    const findings: RuleFinding[] = [...rowsBySerial.entries()]
      .filter(([, v]) => v.locations.length > 1)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([serial, v]) => ({
        ruleId: "DQ-LOC-001",
        ruleVersion: "1.0.0",
        kind: "ACCOUNTING_EXCEPTION" as const,
        title: "Serial in two locations",
        whyFlagged: `Serial ${serial} appears in ${v.locations.length} locations in year-end count data (${[...v.locations].sort().join(", ")}); one physical unit cannot be in two places, so a duplicate record must be corrected before the population is reliable.`,
        reasonCodes: ["DUPLICATE_SERIAL_LOCATION"],
        assertions: ["ACCURACY" as const, "EXISTENCE" as const],
        risk: "LOW" as const,
        exposureCents: ctx.index.skuCostCents.get(v.sku) ?? 0,
        subjects: { serials: [serial], skus: [v.sku], locations: [...v.locations].sort() },
        initialStatus: "ACCOUNTING_REVIEW" as const,
        evidenceRequirements: [
          { description: "Physical verification of the unit's single location", required: true, satisfied: false },
          { description: "Correction of the duplicate WMS record", required: true, satisfied: false },
        ],
      }));
    return {
      result: findings.length > 0 ? "REVIEW_REQUIRED" : "PASS",
      coverage: "COMPLETE",
      findings,
    };
  },
};
