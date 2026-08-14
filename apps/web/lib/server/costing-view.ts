import type { DemoUser } from "@icg/data";
import type { CostComponentType } from "@icg/domain";
import { getCostClassification, getCostStandards } from "@icg/services";
import type {
  CogsChainRowOut,
  CostComponentTotalOut,
  ExceptionView,
} from "@icg/services";
import { formatBpsExact, formatCents, formatDate } from "../format";
import type {
  CogsRowView,
  CostComponentTotalView,
  CostStandardRowView,
  CostingData,
  ExceptionDrawerData,
  PeriodCostRowView,
  ProcurementStat,
} from "../view-model";
import { attempt } from "./data";
import { assembleDrawer, gatherExceptionContext, liveExceptionViews } from "./exception-view";
import { getQueries, getWorkspace, makeContext, roleLabel } from "./workspace";

/**
 * Why a COGS row shows no product lines, when it shows none.
 *
 * Three different facts, and none may stand in for another: the order is
 * unreadable here, the close carries no such order, or the order is real and
 * empty. Returning null for the ordinary case keeps the cell blank when there
 * ARE lines to show.
 */
function cogsLinesNote(
  order: { readonly lines: readonly unknown[]; readonly withheld: boolean } | undefined,
): string | null {
  if (order === undefined) return "No sales order under this chain's subject in the close.";
  if (order.withheld) return "Order lines withheld — outside this role's scope.";
  if (order.lines.length === 0) return "This order carries no product lines.";
  return null;
}

/**
 * Costing (COMPLETION_PLAN Stage D) — which costs belong in inventory.
 *
 * Four tabs over two services calls: the standard cost stack, how those
 * capitalized components behave with volume, the FY2026 pools deliberately
 * kept out of inventory, and whether the cost of a sold unit has left the
 * book.
 *
 * This module formats and labels. Every figure — including every total and
 * every share — arrives already derived from `getCostStandards` /
 * `getCostClassification`, because a figure computed in the web layer is one
 * no service derived and no test of the close can move.
 *
 * Two sentences on this screen are claims, and both are rendered from a
 * measured boolean rather than written as prose:
 *
 * - that the inventory subledger decomposes into the five components
 *   (`decompositionAgrees`);
 * - that the period-cost pools stay out of the GL the reconciliation bridge
 *   sums (`keptOutOfInventory`).
 *
 * If either ever becomes false, the screen says the opposite. Neither is
 * written as a statement of fact that happens to be true today.
 */

/**
 * Cost component → its display label, for every SCREEN that names one.
 *
 * Exported because the Methodology register names the same components: a
 * second copy is how one screen comes to say "Direct labour" and another
 * "Direct Labor" for one enum. Typed over `CostComponentType` so a sixth
 * component is a compile error rather than a raw value two screens agree on.
 */
export const COMPONENT_LABELS: Readonly<Record<CostComponentType, string>> = {
  DIRECT_MATERIAL: "Direct material",
  DIRECT_LABOR: "Direct labour",
  MANUFACTURING_OVERHEAD: "Manufacturing overhead",
  INBOUND_FREIGHT: "Inbound freight",
  IMPORT_DUTY: "Import duty",
};

/** Exported so Ask Gaurd renders cost behaviour the way this screen does. */
export const BEHAVIOR_LABELS: Readonly<Record<string, string>> = {
  VARIABLE: "Variable",
  FIXED: "Fixed",
};

/** Exported for the same reason as BEHAVIOR_LABELS. */
export const TREATMENT_LABELS: Readonly<Record<string, string>> = {
  EXPENSED_AS_INCURRED: "Expensed as incurred",
  CAPITALIZED_TO_INVENTORY: "Capitalized to inventory",
};

/** COGS state → how the row presents. Never a control result. */
export const COGS_PRESENTATION: Readonly<
  Record<string, { label: string; glyph: string; variant: "frost" | "aurora" | "quiet" }>
> = {
  RELIEVED: { label: "Relieved", glyph: "✓", variant: "aurora" },
  NOT_RELIEVED: { label: "Not relieved", glyph: "◆", variant: "frost" },
  NOT_SHIPPED: { label: "Not shipped", glyph: "○", variant: "quiet" },
};

const componentLabel = (c: string): string =>
  COMPONENT_LABELS[c as CostComponentType] ?? c;

function componentTotalView(t: CostComponentTotalOut): CostComponentTotalView {
  return {
    component: componentLabel(t.component),
    amount: formatCents(t.amountCents),
    share: formatBpsExact(t.shareBps),
    behavior: BEHAVIOR_LABELS[t.behavior] ?? t.behavior,
    basis: t.basis,
  };
}

/**
 * A COGS row's detail line, chosen by the row's own state.
 *
 * `O2C-CHAIN-001` writes "… still on the year-end book" whenever fulfilled
 * serials remain on hand, whatever the component's state — so an order with
 * no fulfillment carries it too, and SO-26190 carries it with twenty serials.
 * Printing that beside "Not shipped" would report twenty units as having
 * failed to relieve when nothing has shipped and there is nothing to
 * relieve. The service flags the case (`expectedOnBook`); the framing belongs
 * here, and the rule's own words are used unchanged where they are a finding.
 */
function cogsDetail(row: CogsChainRowOut): string {
  if (row.expectedOnBook) {
    return "No fulfillment posted at the balance-sheet date, so there is nothing to relieve.";
  }
  if (row.state === "NOT_RELIEVED") {
    return row.note ?? "Fulfilled, but the units were not relieved from the year-end book.";
  }
  return "Fulfilled, and no fulfilled serial remains on the year-end book.";
}

export function buildCostingData(user: DemoUser, correlationId: string): CostingData {
  const queries = getQueries();
  const ctx = makeContext(user, correlationId);
  const role = roleLabel(user);

  const standards = attempt(() => getCostStandards(getWorkspace(), ctx));
  const classification = attempt(() => getCostClassification(getWorkspace(), ctx));
  if (standards === undefined || classification === undefined) {
    return {
      restricted: true,
      roleLabel: role,
      headerNote: null,
      asOf: "",
      tabs: [],
      stack: null,
      classification: null,
      period: null,
      cogs: null,
      drawers: {},
    };
  }

  /**
   * Live, for uniformity rather than to fix anything visible.
   *
   * This screen uses the list ONLY to find the view it hands to
   * `gatherExceptionContext`, which fetches its own live position, so nothing
   * rendered here moves with this change and it carries no test — stated
   * plainly rather than counted as a fix. It is bound live anyway because the
   * defect this family keeps producing is a status pill added later to a
   * surface whose list was already frozen, and every sibling screen now
   * inherits the live one.
   */
  const exceptions = liveExceptionViews(queries, ctx);
  const blockers = attempt(() => queries.getBlockers(ctx)) ?? [];
  const blockerIds = new Set(blockers.map((b) => b.exceptionId));
  const drawers: Record<string, ExceptionDrawerData> = {};
  const drawerFor = (id: string | null): string | null => {
    if (id === null) return null;
    const view: ExceptionView | undefined = exceptions.find((e) => e.exception.id === id);
    if (view === undefined) return null;
    if (drawers[id] === undefined) {
      drawers[id] = assembleDrawer(
        gatherExceptionContext(queries, ctx, view),
        blockerIds.has(id),
      );
    }
    return id;
  };

  /* ---------------- Standard cost stack ---------------- */

  // Columns come from the service's union of every stack, and each row is
  // laid out AGAINST that column list rather than in its own order — a row
  // rendered in its own order under shared headings puts a figure beneath the
  // wrong component the moment two SKUs differ.
  const stackRows: CostStandardRowView[] = standards.rows.map((r) => {
    const amounts = new Map(r.components.map((c) => [c.component, c.amountCents]));
    return {
      sku: r.sku,
      description: r.description,
      standard: formatCents(r.standardUnitCents),
      cells: standards.componentTypes.map((type) => {
        const cents = amounts.get(type);
        return cents === undefined ? "Not in this stack" : formatCents(cents);
      }),
      // Stated only when it is true. A permanent "ties to standard" badge is a
      // claim the row would keep making after it stopped being so.
      disagreement: r.stackAgrees
        ? null
        : `Components sum to ${formatCents(r.stackTotalCents)}, not the ${formatCents(r.standardUnitCents)} this SKU is carried at.`,
      onHandUnits: String(r.onHandUnits),
      carried: formatCents(r.carriedCents),
    };
  });

  const stackStats: ProcurementStat[] = [
    {
      label: "SUBLEDGER AT STANDARD",
      value: formatCents(standards.subledgerCents),
      note: "The close's own inventory figure.",
      ember: false,
    },
    {
      label: "DECOMPOSED",
      value: formatCents(standards.componentTotalCents),
      note: "Extended over the units on the book.",
      ember: !standards.decompositionAgrees,
    },
    {
      label: "SKUS WITH A COST STACK",
      value: `${standards.rows.length} of ${standards.rows.length + standards.skusWithoutStack.length}`,
      note:
        standards.skusWithoutStack.length === 0
          ? "Every SKU in the book."
          : `No stack: ${standards.skusWithoutStack.join(", ")}.`,
      ember: standards.skusWithoutStack.length > 0,
    },
    {
      label: "UNITS OFF STANDARD",
      value: String(standards.unitsOffStandard),
      note: "Units carried at something other than their SKU's standard.",
      ember: standards.unitsOffStandard > 0,
    },
  ];

  /* ---------------- Cost classification ---------------- */

  const classStats: ProcurementStat[] = [
    {
      label: "VARIABLE",
      value: formatCents(classification.capitalized.variableCents),
      note: "Moves with the units built.",
      ember: false,
    },
    {
      label: "FIXED",
      value: formatCents(classification.capitalized.fixedCents),
      note: "Absorbed overhead at normal capacity.",
      ember: false,
    },
    {
      label: "CAPITALIZED",
      value: formatCents(classification.capitalized.totalCents),
      note: "Carried in inventory at the balance-sheet date.",
      ember: false,
    },
    {
      label: "TAKEN TO THE PERIOD",
      value: formatCents(classification.period.totalCents),
      note: "Never entered inventory. Not part of the figure beside it.",
      ember: false,
    },
  ];

  /* ---------------- Period costs ---------------- */

  const periodRows: PeriodCostRowView[] = classification.period.rows.map((r) => ({
    id: r.id,
    category: r.category,
    department: r.department,
    amount: formatCents(r.amountCents),
    treatment: TREATMENT_LABELS[r.treatment] ?? r.treatment,
    basis: r.basis,
    glAccount: r.glAccount,
  }));

  const years = classification.fiscalYears;
  const periodStats: ProcurementStat[] = [
    {
      label: "PERIOD COST POOLS",
      value: String(classification.period.rows.length),
      note: years.length === 1 ? `${years[0]}.` : `Covering ${years.join(", ")}.`,
      ember: false,
    },
    {
      label: "EXPENSED",
      value: formatCents(classification.period.totalCents),
      note: "Charged to the period, not to inventory.",
      ember: false,
    },
    {
      label: "RESEARCH AND DEVELOPMENT",
      value: formatCents(
        classification.period.byCategory.find((c) => c.category === "Research and development")
          ?.amountCents ?? 0,
      ),
      note: "ASC 730-10-25-1 — expensed as incurred.",
      ember: false,
    },
  ];

  /* ---------------- COGS state ---------------- */

  /**
   * Product lines per order, keyed for the join below. The COGS rows come
   * from the rules' chains and the lines from the scoped document read, so
   * an order the reader may not see resolves to a `withheld` entry here
   * rather than simply missing from the map.
   */
  const orderLines = new Map(
    (attempt(() => queries.listSalesOrderLines(ctx)) ?? []).map((o) => [o.salesOrder, o]),
  );

  const cogsRows: CogsRowView[] = classification.cogs.rows.map((r) => {
    const presentation = COGS_PRESENTATION[r.state] ?? {
      label: r.state,
      glyph: "○",
      variant: "quiet" as const,
    };
    return {
      salesOrder: r.salesOrder,
      state: presentation.label,
      glyph: presentation.glyph,
      variant: presentation.variant,
      detail: cogsDetail(r),
      exceptionId: drawerFor(r.relatedExceptionId),
      lines: (orderLines.get(r.salesOrder)?.lines ?? []).map((l) => ({
        sku: l.sku,
        quantity: String(l.quantity),
        amount: l.amountCents === undefined ? null : formatCents(l.amountCents),
      })),
      /**
       * Withheld and absent are separate sentences. Saying "no lines" for a
       * withheld order would tell a reader the order was empty, which is the
       * scope-as-absence defect this repo keeps finding — so the withheld case
       * names the scope and the absent case names the missing document.
       */
      linesNote: cogsLinesNote(orderLines.get(r.salesOrder)),
      orderTotal: (() => {
        const total = orderLines.get(r.salesOrder)?.totalCents;
        return total === undefined || total === null ? null : formatCents(total);
      })(),
    };
  });

  const cogsStats: ProcurementStat[] = [
    {
      label: "RELIEVED",
      value: String(classification.cogs.relieved),
      note: "Fulfilled, and off the year-end book.",
      ember: false,
    },
    {
      label: "NOT RELIEVED",
      value: String(classification.cogs.notRelieved),
      note: "Fulfilled, but still on the year-end book.",
      ember: classification.cogs.notRelieved > 0,
    },
    {
      label: "NOT SHIPPED",
      value: String(classification.cogs.notShipped),
      note: "No fulfillment at the balance-sheet date.",
      ember: false,
    },
  ];

  return {
    restricted: false,
    roleLabel: role,
    headerNote: null,
    asOf: formatDate(standards.asOf),
    tabs: [
      { key: "stack", label: "Standard Cost Stack", count: String(standards.rows.length) },
      { key: "classification", label: "Cost Behaviour", count: null },
      { key: "period", label: "Period Costs", count: String(classification.period.rows.length) },
      { key: "cogs", label: "COGS State", count: String(classification.cogs.rows.length) },
    ],
    stack: {
      stats: stackStats,
      componentColumns: standards.componentTypes.map(componentLabel),
      rows: stackRows,
      effectiveNote:
        standards.effectiveFroms.length === 1
          ? `Standards effective ${formatDate(standards.effectiveFroms[0] as string)}.`
          : `Standards carry ${standards.effectiveFroms.length} effective dates: ${standards.effectiveFroms.map(formatDate).join(", ")}.`,
      agreement: {
        agrees: standards.decompositionAgrees,
        headline: standards.decompositionAgrees
          ? "The five components account for the whole inventory balance."
          : "The components do not account for the whole inventory balance.",
        detail: standards.decompositionAgrees
          ? `Extended over the units on the book, the standard cost stack sums to ${formatCents(standards.componentTotalCents)} — the inventory subledger the close reconciles AGAINST the general ledger, not a second figure beside it. Every SKU's components tie to the standard it is carried at, and no unit is carried off standard. What the subledger is made of is settled here; whether it agrees with the ledger is the Reconciliation screen's question.`
          : `Extended over the units on the book, the stack sums to ${formatCents(standards.componentTotalCents)} against a subledger of ${formatCents(standards.subledgerCents)}. ${standards.unitsWithoutStack} units belong to a SKU with no cost stack and ${standards.unitsOffStandard} are carried off their SKU's standard; neither is decomposed above.`,
      },
      note: "A cost stack is only worth reading if its total is the number the rest of the close already uses. Whether it is, is measured here rather than asserted — the components are extended over the units actually on the book, not multiplied out of the SKU master.",
    },
    classification: {
      stats: classStats,
      components: classification.capitalized.components.map(componentTotalView),
      note: "Fixed and variable is a management classification, not a control result. Nothing in the close reads it, and the basis for each assignment is stated so a reader can disagree with the judgement rather than only with the label. Shares are rounded to two decimals and need not total exactly 100%; the amounts beside them are exact and do total the capitalized figure above.",
    },
    period: {
      stats: periodStats,
      rows: periodRows,
      byCategory: classification.period.byCategory.map((c) => ({
        category: c.category,
        amount: formatCents(c.amountCents),
      })),
      containment: {
        held: classification.period.keptOutOfInventory,
        headline: classification.period.keptOutOfInventory
          ? "None of these pools reaches an inventory account."
          : "A period cost is sitting in an inventory account.",
        detail: classification.period.keptOutOfInventory
          ? "Checked against the recorded balances, not assumed: no general-ledger account carrying one of these pools appears among the inventory balances the reconciliation sums. These costs are in the income statement, and the inventory bridge never sees them."
          : `${classification.period.accountsInGlBalances.join(", ")} carries a period cost and also holds a recorded inventory balance. The reconciliation sums every inventory balance except the reserve, so this amount is inside the gross general-ledger figure.`,
      },
      note: "The capitalized side of this question is the standard cost stack. A row here is the other side: a cost the company incurred in the year and deliberately did not put into inventory, with the reason it did not.",
    },
    cogs: {
      stats: cogsStats,
      rows: cogsRows,
      basisNote:
        "Read from the O2C-CHAIN-001 inventory-relief component: whether the serials on a fulfillment are still in the year-end book population. That is evidence of relief, not a cost-of-sales journal entry read from the general ledger — a row saying 'not relieved' says the units are still on the book, not that a posting was checked and found missing.",
      note: "An order with no fulfillment has nothing to relieve, and is reported as such rather than as an unrelieved cost.",
    },
    drawers,
  };
}
