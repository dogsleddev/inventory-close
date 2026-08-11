import { COST_COMPONENT_TYPES } from "@icg/domain";
import type {
  CogsState,
  CostBehavior,
  CostComponentType,
  CostTreatment,
} from "@icg/domain";
import { authorize } from "@icg/permissions";
import type { ServiceContext } from "./queries.js";
import type { Workspace } from "./workspace.js";

/**
 * Costing (COMPLETION_PLAN Stage D) — *which costs belong in inventory?*
 *
 * Two halves of one question, and they must never be added together:
 *
 * - `getCostStandards` is the **capitalized** half: the standard cost already
 *   inside the $4,800,000 subledger, decomposed into the five components the
 *   dataset generates.
 * - `getCostClassification` is the **expensed** half: the FY2026 pools kept
 *   OUT of inventory, each with the basis for keeping it out — plus how those
 *   capitalized components behave with volume, and whether the cost of a sold
 *   unit has actually left the book.
 *
 * This is a projection, not a rule. No exception, blocker or readiness input
 * is derived here, `periodCosts` and `costComponents` never reach the rule
 * engine, and no figure moves as a result of anything below.
 *
 * The load-bearing discipline in this module is that **it measures its own
 * claims instead of asserting them**:
 *
 * - The cost stack is only useful if it sums to the cost the rest of the close
 *   uses, so `stackAgrees` and `decompositionAgrees` are computed and
 *   returned. A screen may say the $4,800,000 decomposes only because this
 *   said so, never because the fixture generator promised it.
 * - A unit is only covered by its SKU's stack if it is CARRIED at that SKU's
 *   standard, so `unitsOffStandard` is counted rather than assumed to be zero.
 * - The period-cost fixtures claim to stay out of the GL that
 *   `buildReconciliation` sums. That claim is checked here against
 *   `glBalances` (`accountsInGlBalances`), not restated in prose.
 *
 * Nothing here reads a source document, so there is nothing for
 * `makeRecordScope` to narrow: `costComponents`, `periodCosts` and `skus`
 * carry no `sourceRef`, the unit population is readable under `close.read`
 * exactly as `listInventoryUnits` is, and the chain states are rule output —
 * the same close-control facts `getCommercialChains` already returns whole.
 */

/* ------------------------------------------------------------------ */
/* Cost behaviour — a management interpretation, carried with its basis */
/* ------------------------------------------------------------------ */

/**
 * How each capitalized component behaves with volume, and why.
 *
 * This is the one authored judgement in the module. It is held HERE, once,
 * rather than in the fixtures: a behaviour classification is an accounting
 * interpretation that a reader may disagree with, and putting it in the
 * dataset would make disagreeing with it a dataset regeneration. Stage F
 * folds it into `INVENTORY_ACCOUNTING_MATRIX` along with the classification →
 * GL map that currently lives in `glAccounts.ts`.
 */
export const COST_COMPONENT_BEHAVIOR: Readonly<
  Record<CostComponentType, { readonly behavior: CostBehavior; readonly basis: string }>
> = {
  DIRECT_MATERIAL: {
    behavior: "VARIABLE",
    basis:
      "Component cost is incurred per unit built and moves directly with volume.",
  },
  DIRECT_LABOR: {
    behavior: "VARIABLE",
    basis:
      "Assembly and test hours are charged at a standard rate per unit, so the cost follows the units produced.",
  },
  MANUFACTURING_OVERHEAD: {
    behavior: "FIXED",
    basis:
      "Absorbed at a standard rate set on normal capacity. The pool itself does not move with the next unit; overhead left unabsorbed is not capitalized at all, and is reported on the period side as idle capacity.",
  },
  INBOUND_FREIGHT: {
    behavior: "VARIABLE",
    basis:
      "Charged on the shipment that brings the goods in, and scales with the units shipped.",
  },
  IMPORT_DUTY: {
    behavior: "VARIABLE",
    basis: "Assessed on the declared value of the units imported.",
  },
};

/* ------------------------------------------------------------------ */
/* Shapes                                                              */
/* ------------------------------------------------------------------ */

export interface CostComponentOut {
  readonly component: CostComponentType;
  readonly amountCents: number;
  /** Where the standard came from — a roll, a price list, a rate study. */
  readonly costSource: string;
  readonly effectiveFrom: string;
  readonly behavior: CostBehavior;
}

export interface CostStandardRowOut {
  readonly sku: string;
  readonly description: string;
  /** The standard the SKU master carries — what a unit is booked at. */
  readonly standardUnitCents: number;
  readonly components: readonly CostComponentOut[];
  readonly stackTotalCents: number;
  /**
   * Whether the components sum to the standard. False is a finding: a stack
   * that almost adds up invites a reader to trust a total nobody derived.
   */
  readonly stackAgrees: boolean;
  readonly onHandUnits: number;
  /** Carried cost of those units, summed from the unit population itself. */
  readonly carriedCents: number;
  /** Units carried at something other than this SKU's standard. */
  readonly unitsOffStandard: number;
}

export interface CostComponentTotalOut {
  readonly component: CostComponentType;
  readonly behavior: CostBehavior;
  readonly basis: string;
  readonly amountCents: number;
  /** Share of the decomposed total, in basis points. */
  readonly shareBps: number;
}

export interface CostStandardsOut {
  readonly asOf: string;
  readonly rows: readonly CostStandardRowOut[];
  /** The close's own subledger figure — not a second sum of the population. */
  readonly subledgerCents: number;
  /** Carried cost of the units whose SKU has a cost stack. */
  readonly stackedCents: number;
  readonly byComponent: readonly CostComponentTotalOut[];
  readonly componentTotalCents: number;
  /**
   * Whether the five components account for the whole subledger. This is the
   * claim the screen is allowed to make, and only because it is measured.
   */
  readonly decompositionAgrees: boolean;
  readonly unitsWithoutStack: number;
  readonly skusWithoutStack: readonly string[];
  readonly unitsOffStandard: number;
  /**
   * Component types any SKU's stack actually carries, in canonical order —
   * the column set of the build-up table. Derived from the stacks rather than
   * from the enum, so a table cannot grow a column no SKU has, and taken as a
   * union rather than from one row, so it cannot describe every SKU by the
   * shape of the first.
   */
  readonly componentTypes: readonly CostComponentType[];
  /** Distinct effective dates across every stack; never assumed to be one. */
  readonly effectiveFroms: readonly string[];
}

export interface PeriodCostRowOut {
  readonly id: string;
  readonly category: string;
  readonly department: string;
  readonly fiscalYear: string;
  readonly amountCents: number;
  readonly treatment: CostTreatment;
  /** The accounting reason for keeping it out, in a workpaper's words. */
  readonly basis: string;
  readonly glAccount: string;
}

export interface PeriodCostCategoryOut {
  readonly category: string;
  readonly amountCents: number;
  readonly rowCount: number;
}

export interface CogsChainRowOut {
  readonly salesOrder: string;
  readonly state: CogsState;
  /** The chain component's own note, verbatim — rule prose is never reworded. */
  readonly note: string | null;
  /**
   * Whether units remaining on the year-end book is the EXPECTED condition
   * for this row rather than a finding.
   *
   * `O2C-CHAIN-001` emits "… still on the year-end book" whenever fulfilled
   * serials are on hand, independently of the component's state — so an order
   * with no fulfillment at all carries the same sentence, and SO-26190 carries
   * it with twenty serials. Printed beside a COGS state, that reads as twenty
   * units that failed to relieve, when in fact nothing has shipped and there
   * is nothing to relieve. The note stays as the rule wrote it; this flag is
   * what lets a surface frame it correctly instead of re-wording it.
   */
  readonly expectedOnBook: boolean;
  readonly relatedExceptionId: string | null;
  readonly relatedExceptionOpen: boolean | null;
}

export interface CostClassificationOut {
  readonly asOf: string;
  /** Fiscal years the period-cost pools cover; never assumed to be one. */
  readonly fiscalYears: readonly string[];
  readonly capitalized: {
    readonly components: readonly CostComponentTotalOut[];
    readonly totalCents: number;
    readonly variableCents: number;
    readonly fixedCents: number;
  };
  readonly period: {
    readonly rows: readonly PeriodCostRowOut[];
    readonly totalCents: number;
    readonly byCategory: readonly PeriodCostCategoryOut[];
    /**
     * Period-cost GL accounts that ALSO carry a recorded inventory balance.
     * Empty is the only correct answer — `buildReconciliation` sums every GL
     * balance except 1290, so a period cost landing there would move the
     * locked gross GL with no rule change. Measured, not promised.
     */
    readonly accountsInGlBalances: readonly string[];
    readonly keptOutOfInventory: boolean;
  };
  readonly cogs: {
    readonly rows: readonly CogsChainRowOut[];
    readonly relieved: number;
    readonly notRelieved: number;
    readonly notShipped: number;
    /**
     * Chains carrying no inventory-relief component at all. These are not
     * counted as "not shipped": a state read off a component that is not
     * there would be an absence implied rather than stated.
     */
    readonly chainsWithoutReliefComponent: number;
  };
}

/** The chain component this module reads, by the name the rule gives it. */
const RELIEF_COMPONENT = "Inventory relief";

/**
 * Components sort in the canonical enum order everywhere, per-SKU and in
 * total. A per-SKU table needs stable columns, and two tabs that rank the
 * same five things differently make a reader check whether they are the same
 * five things.
 */
const componentOrder = (c: CostComponentType): number =>
  COST_COMPONENT_TYPES.indexOf(c);

const COGS_STATE_OF: Readonly<Record<string, CogsState>> = {
  PRESENT: "RELIEVED",
  MISSING: "NOT_RELIEVED",
  NOT_APPLICABLE: "NOT_SHIPPED",
};

/**
 * Per-component totals over the whole book, computed once and shared by both
 * projections so the capitalized side cannot read differently on two tabs.
 */
function componentTotals(
  ws: Workspace,
): { totals: CostComponentTotalOut[]; totalCents: number } {
  const perSku = new Map<string, Map<CostComponentType, number>>();
  for (const c of ws.dataset.costComponents) {
    let stack = perSku.get(c.sku);
    if (stack === undefined) {
      stack = new Map<CostComponentType, number>();
      perSku.set(c.sku, stack);
    }
    stack.set(c.component, (stack.get(c.component) ?? 0) + c.amountCents);
  }

  // Extended over the units actually on the book, so the split describes the
  // subledger rather than the SKU master. A unit carried off its SKU's
  // standard is left out here and counted in `unitsOffStandard` instead:
  // spreading a cost the stack does not explain would be an invention.
  const standardOf = new Map(ws.dataset.skus.map((s) => [s.code, s.unitCostCents]));
  const summed = new Map<CostComponentType, number>();
  for (const unit of ws.dataset.inventoryUnits) {
    const stack = perSku.get(unit.sku);
    if (stack === undefined) continue;
    if (unit.unitCostCents !== standardOf.get(unit.sku)) continue;
    for (const [component, cents] of stack) {
      summed.set(component, (summed.get(component) ?? 0) + cents);
    }
  }

  const totalCents = [...summed.values()].reduce((sum, c) => sum + c, 0);
  const totals: CostComponentTotalOut[] = [...summed.entries()]
    .map(([component, amountCents]) => ({
      component,
      behavior: COST_COMPONENT_BEHAVIOR[component].behavior,
      basis: COST_COMPONENT_BEHAVIOR[component].basis,
      amountCents,
      shareBps: totalCents === 0 ? 0 : Math.round((amountCents * 10_000) / totalCents),
    }))
    .sort((a, b) => componentOrder(a.component) - componentOrder(b.component));
  return { totals, totalCents };
}

/**
 * The standard cost stack, per SKU and rolled up over the book.
 */
export function getCostStandards(ws: Workspace, ctx: ServiceContext): CostStandardsOut {
  authorize(ctx.user, "close.read");

  const componentsBySku = new Map<string, typeof ws.dataset.costComponents>();
  for (const c of ws.dataset.costComponents) {
    const list = componentsBySku.get(c.sku);
    if (list === undefined) componentsBySku.set(c.sku, [c]);
    else (list as (typeof c)[]).push(c);
  }

  const rows: CostStandardRowOut[] = [];
  let unitsWithoutStack = 0;
  let unitsOffStandard = 0;
  let stackedCents = 0;
  const skusWithoutStack: string[] = [];

  for (const sku of [...ws.dataset.skus].sort((a, b) => (a.code < b.code ? -1 : 1))) {
    const units = ws.dataset.inventoryUnits.filter((u) => u.sku === sku.code);
    const carriedCents = units.reduce((sum, u) => sum + u.unitCostCents, 0);
    const offStandard = units.filter((u) => u.unitCostCents !== sku.unitCostCents).length;
    unitsOffStandard += offStandard;

    const raw = componentsBySku.get(sku.code);
    if (raw === undefined || raw.length === 0) {
      skusWithoutStack.push(sku.code);
      unitsWithoutStack += units.length;
      continue;
    }
    stackedCents += carriedCents;

    const components: CostComponentOut[] = raw
      .map((c) => ({
        component: c.component,
        amountCents: c.amountCents,
        costSource: c.costSource,
        effectiveFrom: c.effectiveFrom,
        behavior: COST_COMPONENT_BEHAVIOR[c.component].behavior,
      }))
      .sort((a, b) => componentOrder(a.component) - componentOrder(b.component));
    const stackTotalCents = components.reduce((sum, c) => sum + c.amountCents, 0);

    rows.push({
      sku: sku.code,
      description: sku.description,
      standardUnitCents: sku.unitCostCents,
      components,
      stackTotalCents,
      stackAgrees: stackTotalCents === sku.unitCostCents,
      onHandUnits: units.length,
      carriedCents,
      unitsOffStandard: offStandard,
    });
  }

  const { totals, totalCents } = componentTotals(ws);

  return {
    asOf: ws.close.reconciliation.asOf,
    rows,
    subledgerCents: ws.close.reconciliation.subledgerCents,
    stackedCents,
    byComponent: totals,
    componentTotalCents: totalCents,
    decompositionAgrees:
      totalCents === ws.close.reconciliation.subledgerCents &&
      unitsWithoutStack === 0 &&
      unitsOffStandard === 0 &&
      rows.every((r) => r.stackAgrees),
    unitsWithoutStack,
    skusWithoutStack,
    unitsOffStandard,
    componentTypes: [
      ...new Set(rows.flatMap((r) => r.components.map((c) => c.component))),
    ].sort((a, b) => componentOrder(a) - componentOrder(b)),
    effectiveFroms: [
      ...new Set(rows.flatMap((r) => r.components.map((c) => c.effectiveFrom))),
    ].sort(),
  };
}

/**
 * Capitalized against expensed, and whether the cost of a sold unit has left
 * the book.
 */
export function getCostClassification(
  ws: Workspace,
  ctx: ServiceContext,
): CostClassificationOut {
  authorize(ctx.user, "close.read");

  const { totals, totalCents } = componentTotals(ws);
  const behaviorCents = (behavior: CostBehavior): number =>
    totals.filter((t) => t.behavior === behavior).reduce((sum, t) => sum + t.amountCents, 0);

  /* ---------------- The expensed side ---------------- */

  const rows: PeriodCostRowOut[] = [...ws.dataset.periodCosts]
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((c) => ({
      id: c.id,
      category: c.category,
      department: c.department,
      fiscalYear: c.fiscalYear,
      amountCents: c.amountCents,
      treatment: c.treatment,
      basis: c.basis,
      glAccount: c.glAccount,
    }));

  const byCategory = new Map<string, { amountCents: number; rowCount: number }>();
  for (const r of rows) {
    const bucket = byCategory.get(r.category) ?? { amountCents: 0, rowCount: 0 };
    bucket.amountCents += r.amountCents;
    bucket.rowCount += 1;
    byCategory.set(r.category, bucket);
  }

  // The constraint the fixtures promise, checked rather than repeated.
  const recordedAccounts = new Set(ws.dataset.glBalances.map((b) => b.account));
  const accountsInGlBalances = [
    ...new Set(rows.map((r) => r.glAccount).filter((a) => recordedAccounts.has(a))),
  ].sort();

  /* ---------------- COGS state ---------------- */

  const exceptionFor = (ref: string): { id: string; open: boolean } | undefined => {
    const found = ws.close.exceptions.find(
      (e) => e.finding.subjects.transactionNumbers?.includes(ref) ?? false,
    );
    if (found === undefined) return undefined;
    return {
      id: found.id,
      open:
        found.status !== "RESOLVED_NO_ADJUSTMENT" &&
        found.status !== "RESOLVED_ADJUSTMENT_PROPOSED",
    };
  };

  const cogsRows: CogsChainRowOut[] = [];
  let chainsWithoutReliefComponent = 0;
  for (const chain of ws.close.chains) {
    const relief = chain.components.find((c) => c.name === RELIEF_COMPONENT);
    const state = relief === undefined ? undefined : COGS_STATE_OF[relief.state];
    if (state === undefined) {
      chainsWithoutReliefComponent += 1;
      continue;
    }
    const exception = exceptionFor(chain.subjectRef);
    cogsRows.push({
      salesOrder: chain.subjectRef,
      state,
      note: relief?.note ?? null,
      expectedOnBook: state === "NOT_SHIPPED",
      relatedExceptionId: exception?.id ?? null,
      relatedExceptionOpen: exception === undefined ? null : exception.open,
    });
  }
  cogsRows.sort((a, b) => (a.salesOrder < b.salesOrder ? -1 : 1));

  return {
    asOf: ws.close.reconciliation.asOf,
    fiscalYears: [...new Set(rows.map((r) => r.fiscalYear))].sort(),
    capitalized: {
      components: totals,
      totalCents,
      variableCents: behaviorCents("VARIABLE"),
      fixedCents: behaviorCents("FIXED"),
    },
    period: {
      rows,
      totalCents: rows.reduce((sum, r) => sum + r.amountCents, 0),
      byCategory: [...byCategory.entries()]
        .map(([category, b]) => ({ category, ...b }))
        .sort((a, b) => b.amountCents - a.amountCents),
      accountsInGlBalances,
      keptOutOfInventory: accountsInGlBalances.length === 0,
    },
    cogs: {
      rows: cogsRows,
      relieved: cogsRows.filter((r) => r.state === "RELIEVED").length,
      notRelieved: cogsRows.filter((r) => r.state === "NOT_RELIEVED").length,
      notShipped: cogsRows.filter((r) => r.state === "NOT_SHIPPED").length,
      chainsWithoutReliefComponent,
    },
  };
}
