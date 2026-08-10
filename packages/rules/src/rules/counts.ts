import type { CountResultFixture } from "@icg/domain";
import type { RuleFinding, RuleOutput } from "../engine/findings.js";
import type { Rule, RuleContext } from "../engine/rule.js";

/**
 * Year-end count controls (CANONICAL_SPEC §6) and the cycle-count
 * management lens. Cycle indicators are a management risk lens — never
 * auditor sampling or reliance logic (locked decision 3).
 */

function yeRows(ctx: RuleContext): readonly CountResultFixture[] {
  const plan = ctx.input.countPlans.find((p) => p.countType === "YEAR_END");
  if (!plan) return [];
  return ctx.input.countResults.filter((r) => r.countPlanId === plan.id);
}

function hasYePlan(ctx: RuleContext): boolean {
  return ctx.input.countPlans.some((p) => p.countType === "YEAR_END");
}

const cost = (ctx: RuleContext, sku: string): number =>
  ctx.index.skuCostCents.get(sku) ?? 0;

/** Serials with an authorized movement during the count window. */
function movedSerials(ctx: RuleContext): ReadonlySet<string> {
  return new Set(
    ctx.input.countMovements.filter((m) => m.serial).map((m) => m.serial!),
  );
}

/** CNT-EX-001 — recorded unit not found (Existence). */
export const cntEx001: Rule = {
  id: "CNT-EX-001",
  version: "1.0.0",
  controlDomain: "PHYSICAL_COUNT",
  evaluate(ctx): RuleOutput {
    if (!hasYePlan(ctx)) {
      return { result: "INCOMPLETE", coverage: "INCOMPLETE", findings: [] };
    }
    const moved = movedSerials(ctx);
    const findings: RuleFinding[] = yeRows(ctx)
      .filter(
        (r) =>
          r.serial !== undefined &&
          r.snapshotQuantity > 0 &&
          r.countQuantity === 0 &&
          !moved.has(r.serial),
      )
      .map((r) => ({
        ruleId: "CNT-EX-001",
        ruleVersion: "1.0.0",
        kind: "ACCOUNTING_EXCEPTION",
        title: "Recorded unit not found",
        whyFlagged: `Serial ${r.serial} is on the year-end listing at ${r.location} but was not found at first pass, and no authorized count-window movement explains it.`,
        reasonCodes: ["COUNT_FIRST_PASS_NOT_FOUND", "NO_MOVEMENT_RECORD"],
        assertions: ["EXISTENCE"],
        risk: "HIGH",
        exposureCents: cost(ctx, r.sku),
        subjects: { serials: [r.serial!], skus: [r.sku], locations: [r.location] },
        initialStatus: "RECOUNT_REQUIRED",
        evidenceRequirements: [
          { description: "Supervised recount locating the unit", required: true, satisfied: false },
          { description: "First-pass count record", required: true, satisfied: true, reference: r.externalCountDetailId },
        ],
      }));
    return {
      result: findings.length > 0 ? "REVIEW_REQUIRED" : "PASS",
      coverage: "COMPLETE",
      findings,
    };
  },
};

/** CNT-COMP-001 — physical unit absent from listing (Completeness). */
export const cntComp001: Rule = {
  id: "CNT-COMP-001",
  version: "1.0.0",
  controlDomain: "PHYSICAL_COUNT",
  evaluate(ctx): RuleOutput {
    if (!hasYePlan(ctx)) {
      return { result: "INCOMPLETE", coverage: "INCOMPLETE", findings: [] };
    }
    const findings: RuleFinding[] = ctx.input.countTests
      .filter(
        (t) =>
          t.direction === "FLOOR_TO_SHEET" &&
          !t.traced &&
          t.serial !== undefined &&
          !ctx.index.unitsBySerial.has(t.serial),
      )
      .map((t) => ({
        ruleId: "CNT-COMP-001",
        ruleVersion: "1.0.0",
        kind: "ACCOUNTING_EXCEPTION",
        title: "Physical unit absent from listing",
        whyFlagged: `Floor-to-sheet test ${t.id} found serial ${t.serial} in ${t.location}; the serial is not on the year-end inventory listing. It is never auto-added to inventory.`,
        reasonCodes: ["FLOOR_TO_SHEET_UNTRACED", "NOT_ON_LISTING", "NO_AUTO_ADD"],
        assertions: ["COMPLETENESS"],
        risk: "HIGH",
        exposureCents: cost(ctx, t.sku),
        subjects: { serials: [t.serial!], skus: [t.sku], locations: [t.location] },
        initialStatus: "ACCOUNTING_REVIEW",
        evidenceRequirements: [
          { description: "Origin of the physical unit (receipt or transfer trail)", required: true, satisfied: false },
          { description: "Floor-to-sheet test record", required: true, satisfied: true, reference: t.id },
        ],
      }));
    return {
      result: findings.length > 0 ? "REVIEW_REQUIRED" : "PASS",
      coverage: "COMPLETE",
      findings,
    };
  },
};

/** CNT-VAR-001 — quantity variance on non-serialized stock. */
export const cntVar001: Rule = {
  id: "CNT-VAR-001",
  version: "1.0.0",
  controlDomain: "PHYSICAL_COUNT",
  evaluate(ctx): RuleOutput {
    if (!hasYePlan(ctx)) {
      return { result: "INCOMPLETE", coverage: "INCOMPLETE", findings: [] };
    }
    const findings: RuleFinding[] = yeRows(ctx)
      .filter((r) => r.serial === undefined && r.variance !== 0)
      .map((r) => ({
        ruleId: "CNT-VAR-001",
        ruleVersion: "1.0.0",
        kind: "ACCOUNTING_EXCEPTION",
        title: "Count variance",
        whyFlagged: `${r.sku} at ${r.location} counted ${r.countQuantity} against a snapshot of ${r.snapshotQuantity} (variance ${r.variance}).`,
        reasonCodes: ["COUNT_QUANTITY_VARIANCE"],
        assertions: ["EXISTENCE", "ACCURACY"],
        risk: "MEDIUM",
        exposureCents: Math.abs(r.variance) * cost(ctx, r.sku),
        subjects: { skus: [r.sku], locations: [r.location] },
        initialStatus: "RECOUNT_REQUIRED",
        evidenceRequirements: [
          { description: "Recount of the affected bin/location", required: true, satisfied: false },
          { description: "First-pass count record", required: true, satisfied: true, reference: r.externalCountDetailId },
        ],
      }));
    return {
      result: findings.length > 0 ? "REVIEW_REQUIRED" : "PASS",
      coverage: "COMPLETE",
      findings,
    };
  },
};

/** CNT-MOVE-001 — variance explained by authorized count-window movement. */
export const cntMove001: Rule = {
  id: "CNT-MOVE-001",
  version: "1.0.0",
  controlDomain: "PHYSICAL_COUNT",
  evaluate(ctx): RuleOutput {
    if (!hasYePlan(ctx)) {
      return { result: "INCOMPLETE", coverage: "INCOMPLETE", findings: [] };
    }
    const moved = movedSerials(ctx);
    const findings: RuleFinding[] = yeRows(ctx)
      .filter(
        (r) =>
          r.serial !== undefined && r.variance !== 0 && moved.has(r.serial),
      )
      .map((r) => {
        const movement = ctx.input.countMovements.find((m) => m.serial === r.serial);
        return {
          ruleId: "CNT-MOVE-001",
          ruleVersion: "1.0.0",
          kind: "ACCOUNTING_EXCEPTION" as const,
          title: "Movement during count",
          whyFlagged: `Serial ${r.serial} shows a first-pass variance at ${r.location}; authorized movement ${movement?.id ?? "?"} occurred during the count window and must be reconciled to the snapshot.`,
          reasonCodes: ["COUNT_WINDOW_MOVEMENT", "VARIANCE_PENDING_RECONCILIATION"],
          assertions: ["EXISTENCE" as const],
          risk: "MEDIUM" as const,
          exposureCents: cost(ctx, r.sku),
          subjects: {
            serials: [r.serial!],
            skus: [r.sku],
            documentRefs: movement ? [movement.id] : [],
          },
          initialStatus: "ACCOUNTING_REVIEW" as const,
          evidenceRequirements: [
            { description: "Authorized movement record", required: true, satisfied: movement !== undefined, reference: movement?.id },
            { description: "Snapshot-position reconciliation", required: true, satisfied: false },
          ],
        };
      });
    return {
      result: findings.length > 0 ? "REVIEW_REQUIRED" : "PASS",
      coverage: "COMPLETE",
      findings,
    };
  },
};

/** Last valid cycle count per (sku, location) cell. */
function lastValidCycleCount(
  ctx: RuleContext,
): ReadonlyMap<string, { planId: string; snapshotAt: string; nextCountDue?: string }> {
  const valid = ctx.input.countPlans.filter(
    (p) => p.countType !== "YEAR_END" && p.sourceStatus === "COMPLETED",
  );
  const byId = new Map(valid.map((p) => [p.id, p]));
  const last = new Map<string, { planId: string; snapshotAt: string; nextCountDue?: string }>();
  for (const r of ctx.input.countResults) {
    const plan = byId.get(r.countPlanId);
    if (!plan) continue;
    const key = `${r.sku}|${r.location}`;
    const prev = last.get(key);
    if (!prev || plan.snapshotAt > prev.snapshotAt) {
      last.set(key, {
        planId: plan.id,
        snapshotAt: plan.snapshotAt,
        ...(plan.nextCountDue !== undefined ? { nextCountDue: plan.nextCountDue } : {}),
      });
    }
  }
  return last;
}

/** CNT-CC-001 — overdue cycle counts (management indicator). */
export const cntCc001: Rule = {
  id: "CNT-CC-001",
  version: "1.0.0",
  controlDomain: "CYCLE_COUNT_LENS",
  evaluate(ctx): RuleOutput {
    const findings: RuleFinding[] = [];
    for (const [key, last] of [...lastValidCycleCount(ctx).entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (last.nextCountDue !== undefined && last.nextCountDue < ctx.asOf) {
        const [sku, location] = key.split("|") as [string, string];
        findings.push({
          ruleId: "CNT-CC-001",
          ruleVersion: "1.0.0",
          kind: "MANAGEMENT_INDICATOR",
          title: "Cycle count overdue",
          whyFlagged: `${sku} at ${location} was last cycle-counted under ${last.planId}; the next count came due ${last.nextCountDue} with no later completed count. Management risk lens only — not an auditor reliance or sampling conclusion.`,
          reasonCodes: ["CYCLE_COUNT_OVERDUE"],
          assertions: ["EXISTENCE"],
          risk: "LOW",
          exposureCents: 0,
          subjects: { skus: [sku], locations: [location], documentRefs: [last.planId] },
          initialStatus: "ACCOUNTING_REVIEW",
          evidenceRequirements: [],
        });
      }
    }
    return { result: findings.length > 0 ? "REVIEW_REQUIRED" : "PASS", coverage: "COMPLETE", findings };
  },
};

/** CNT-CC-002 — repeated cycle-count variance in the same cell. */
export const cntCc002: Rule = {
  id: "CNT-CC-002",
  version: "1.0.0",
  controlDomain: "CYCLE_COUNT_LENS",
  evaluate(ctx): RuleOutput {
    const cyclePlanIds = new Set(
      ctx.input.countPlans
        .filter((p) => p.countType !== "YEAR_END" && p.sourceStatus === "COMPLETED")
        .map((p) => p.id),
    );
    const varianceCounts = new Map<string, number>();
    for (const r of ctx.input.countResults) {
      if (!cyclePlanIds.has(r.countPlanId) || r.variance === 0) continue;
      const key = `${r.sku}|${r.location}`;
      varianceCounts.set(key, (varianceCounts.get(key) ?? 0) + 1);
    }
    const findings: RuleFinding[] = [...varianceCounts.entries()]
      .filter(([, n]) => n >= 2)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, n]) => {
        const [sku, location] = key.split("|") as [string, string];
        return {
          ruleId: "CNT-CC-002",
          ruleVersion: "1.0.0",
          kind: "MANAGEMENT_INDICATOR" as const,
          title: "Repeated cycle-count variance",
          whyFlagged: `${sku} at ${location} had ${n} cycle-count variances during FY2026 — a recurring accuracy signal for management attention.`,
          reasonCodes: ["REPEATED_CYCLE_VARIANCE"],
          assertions: ["ACCURACY" as const],
          risk: "LOW" as const,
          exposureCents: 0,
          subjects: { skus: [sku], locations: [location] },
          initialStatus: "ACCOUNTING_REVIEW" as const,
          evidenceRequirements: [],
        };
      });
    return { result: findings.length > 0 ? "REVIEW_REQUIRED" : "PASS", coverage: "COMPLETE", findings };
  },
};

/** CNT-CC-003 — count-linked adjustments and rejected counts. */
export const cntCc003: Rule = {
  id: "CNT-CC-003",
  version: "1.0.0",
  controlDomain: "CYCLE_COUNT_LENS",
  evaluate(ctx): RuleOutput {
    const findings: RuleFinding[] = [];
    for (const adj of ctx.input.inventoryAdjustments) {
      if (adj.relatedCountPlanId === undefined) continue;
      findings.push({
        ruleId: "CNT-CC-003",
        ruleVersion: "1.0.0",
        kind: "MANAGEMENT_INDICATOR",
        title: "Prior count adjustment",
        whyFlagged: `Inventory adjustment ${adj.transactionNumber} was posted from count ${adj.relatedCountPlanId} — prior count-driven book corrections are a management risk signal.`,
        reasonCodes: ["COUNT_LINKED_ADJUSTMENT"],
        assertions: ["ACCURACY"],
        risk: "LOW",
        exposureCents: 0,
        subjects: { transactionNumbers: [adj.transactionNumber], documentRefs: [adj.relatedCountPlanId] },
        initialStatus: "ACCOUNTING_REVIEW",
        evidenceRequirements: [],
      });
    }
    for (const plan of ctx.input.countPlans) {
      if (plan.countType === "YEAR_END" || plan.sourceStatus !== "REJECTED") continue;
      findings.push({
        ruleId: "CNT-CC-003",
        ruleVersion: "1.0.0",
        kind: "MANAGEMENT_INDICATOR",
        title: "Rejected cycle count",
        whyFlagged: `Cycle count ${plan.id} was rejected (${plan.rejectedReason ?? "no reason recorded"}) — control-execution signal for management attention.`,
        reasonCodes: ["CYCLE_COUNT_REJECTED"],
        assertions: ["EXISTENCE"],
        risk: "LOW",
        exposureCents: 0,
        subjects: { documentRefs: [plan.id] },
        initialStatus: "ACCOUNTING_REVIEW",
        evidenceRequirements: [],
      });
    }
    return { result: findings.length > 0 ? "REVIEW_REQUIRED" : "PASS", coverage: "COMPLETE", findings };
  },
};
