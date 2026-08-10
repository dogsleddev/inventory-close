import { daysBetween, isoDate } from "@icg/domain";
import type { RuleFinding, RuleOutput } from "../engine/findings.js";
import type { Rule } from "../engine/rule.js";

/**
 * VAL-EO-001 - slow-moving / excess & obsolete indicators (Valuation).
 * The rule identifies the valuation review; it never invents a reserve -
 * the reserve amount stays UNDETERMINED until management concludes.
 */
export const valEo001: Rule = {
  id: "VAL-EO-001",
  version: "1.0.0",
  controlDomain: "VALUATION",
  evaluate(ctx): RuleOutput {
    const agedBySku = new Map<string, { units: number; exposure: number }>();
    // A unit with no movement date has UNKNOWN age - that is missing aging
    // evidence, never "fresh". It degrades coverage rather than passing.
    let partial = false;
    for (const u of ctx.input.inventoryUnits) {
      if (u.lastMovementAt === undefined) {
        partial = true;
        continue;
      }
      const age = daysBetween(isoDate(u.lastMovementAt), isoDate(ctx.asOf));
      if (age < ctx.policy.slowMovingAgeDays) continue;
      const entry = agedBySku.get(u.sku) ?? { units: 0, exposure: 0 };
      entry.units += 1;
      entry.exposure += u.unitCostCents;
      agedBySku.set(u.sku, entry);
    }

    const findings: RuleFinding[] = [];
    for (const [sku, aged] of [...agedBySku.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const forecast = ctx.input.forecasts.find((f) => f.sku === sku);
      if (!forecast) {
        partial = true;
        continue;
      }
      if (forecast.forecastUnits >= aged.units) continue;
      const transition = forecast.note?.toLowerCase().includes("transition") ?? false;
      findings.push({
        ruleId: "VAL-EO-001",
        ruleVersion: "1.0.0",
        kind: "ACCOUNTING_EXCEPTION",
        title: "Slow-moving / E&O",
        whyFlagged: `${aged.units} ${sku} units have had no movement for ${ctx.policy.slowMovingAgeDays}+ days while the ${forecast.horizonMonths}-month demand forecast is ${forecast.forecastUnits} units${transition ? " and a product transition has been announced" : ""}. The rule identifies a valuation review only; the reserve remains UNDETERMINED until management concludes.`,
        reasonCodes: [
          "AGED_NO_MOVEMENT",
          "FORECAST_BELOW_HOLDINGS",
          ...(transition ? ["PRODUCT_TRANSITION"] : []),
        ],
        assertions: ["VALUATION"],
        risk: "HIGH",
        exposureCents: aged.exposure,
        subjects: { skus: [sku], documentRefs: [forecast.id] },
        initialStatus: "ACCOUNTING_REVIEW",
        evidenceRequirements: [
          { description: "Management E&O analysis and reserve conclusion", required: true, satisfied: false },
          { description: "Demand forecast", required: true, satisfied: true, reference: forecast.id },
        ],
        attributes: { reserve: "UNDETERMINED" },
      });
    }
    return {
      // Missing aging or forecast evidence never silently becomes PASS.
      result:
        findings.length > 0 ? "REVIEW_REQUIRED" : partial ? "INCOMPLETE" : "PASS",
      coverage: partial ? "PARTIAL" : "COMPLETE",
      findings,
    };
  },
};

/** VAL-DMG-001 - damaged returns awaiting valuation assessment. */
export const valDmg001: Rule = {
  id: "VAL-DMG-001",
  version: "1.0.0",
  controlDomain: "VALUATION",
  evaluate(ctx): RuleOutput {
    const findings: RuleFinding[] = [];
    for (const u of ctx.input.inventoryUnits) {
      if (u.location !== "DAMAGED_HOLD") continue;
      const rma = ctx.input.rmaRecords.find((r) => r.serial === u.serial);
      if (!rma) continue; // routine damaged stock outside the close-window story
      findings.push({
        ruleId: "VAL-DMG-001",
        ruleVersion: "1.0.0",
        kind: "ACCOUNTING_EXCEPTION",
        title: "Damaged return",
        whyFlagged: `${u.serial} came back damaged via ${rma.id} (${rma.reason}) and sits in the damaged/hold area at full carrying value pending a repair-vs-write-down assessment.`,
        reasonCodes: ["DAMAGED_RETURN_UNASSESSED"],
        assertions: ["VALUATION"],
        risk: "MEDIUM",
        exposureCents: u.unitCostCents,
        subjects: { serials: [u.serial], skus: [u.sku], documentRefs: [rma.id] },
        initialStatus: "ACCOUNTING_REVIEW",
        evidenceRequirements: [
          { description: "Damage assessment (repair estimate vs carrying value)", required: true, satisfied: false },
          { description: "RMA return record", required: true, satisfied: true, reference: rma.id },
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
