import type { ProjectionService, QueryService, ServiceContext } from "@icg/services";
import type { AiToolCall, AiToolName } from "./types.js";

/**
 * The approved tool layer (prompts/code/08).
 *
 * Two rules govern every handler and there are no exceptions to either.
 *
 * 1. **Every tool takes the CALLER's ServiceContext.** Authorization,
 *    restricted-content redaction and auditor scoping already happen inside
 *    @icg/services, before data leaves it. Calling a query with a privileged
 *    context — or reading the workspace directly — would bypass all three
 *    silently. There is no other data path into Ask Gaurd.
 *
 * 2. **An authorization failure is reported, never swallowed.** Queries throw
 *    `AuthorizationError`; a tool returns `NOT_AUTHORIZED` so the answer can
 *    say "restricted" instead of rendering an absence that reads as a zero.
 */

export interface AiToolResult {
  readonly call: AiToolCall;
  /** Structured, permission-filtered payload. Absent when outcome !== "OK". */
  readonly data?: unknown;
}

export interface AiToolContext {
  readonly queries: QueryService;
  /**
   * The Stage B–F read-only projections (Stage G). A second service object
   * rather than a workspace, so rule 1 above stays a property of the types:
   * a handler is never handed anything it could read fixtures out of.
   */
  readonly projections: ProjectionService;
  readonly ctx: ServiceContext;
}

type Handler = (t: AiToolContext, args: Readonly<Record<string, string>>) => unknown;

/** An authorization denial, distinguished exactly as apps/web does. */
const isAuthorizationError = (error: unknown): boolean =>
  error instanceof Error && error.name === "AuthorizationError";

/** Evidence ids a payload exposes — the only ids a citation may later use. */
function collectEvidenceIds(value: unknown, found: Set<string> = new Set()): Set<string> {
  if (value === null || value === undefined) return found;
  if (Array.isArray(value)) {
    for (const entry of value) collectEvidenceIds(entry, found);
    return found;
  }
  if (typeof value === "object") {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if ((key === "id" || key === "evidenceId") && typeof entry === "string" && /^EV-/.test(entry)) {
        found.add(entry);
      }
      collectEvidenceIds(entry, found);
    }
  }
  return found;
}

const HANDLERS: Readonly<Record<AiToolName, Handler>> = {
  get_close_readiness: ({ queries, ctx }) => queries.getCloseReadiness(ctx),
  get_blocking_conditions: ({ queries, ctx }) => queries.getBlockers(ctx),
  list_open_exceptions: ({ queries, ctx }) =>
    queries.listExceptions(ctx).filter((e) => e.open),
  list_exceptions: ({ queries, ctx }) => queries.listExceptions(ctx),
  get_exception: ({ queries, ctx }, args) => {
    const id = args["exceptionId"] ?? "";
    const view = queries.getException(ctx, id);
    if (view === undefined) return undefined;
    // Lineage is separately scoped; absence here is scope, not emptiness.
    const lineage = queries.traceLineage(ctx, id);
    return { ...view, lineage: lineage ?? null, lineageInScope: lineage !== undefined };
  },
  /**
   * There is no ordered-timeline query below the web app, so one is derived
   * here from what the Financial Life view returns.
   *
   * Two rules, both learned the hard way. First, `ref` and `at` must come
   * from the SAME scope: `buySide`/`sellSide` are unfiltered while `records`
   * is scope-filtered, so reading the reference from one and the date from
   * the other made a WITHHELD date look like a missing one — and then the
   * date sort moved that entry, silently reordering an auditor's chain of
   * custody into an order the data contradicts. A withheld entry is now
   * marked WITHHELD, keeps its position out of the ordering, and the caller
   * is told the timeline was scope-reduced.
   *
   * Second, an event is only asserted when the fact that DEFINES it exists.
   * A carrier shipment is not a delivery: keying the "Delivery" row on the
   * shipment reference claimed delivery for goods still in transit.
   */
  get_evidence_timeline: ({ queries, ctx }, args) => {
    const serial = args["serial"] ?? "";
    const life = queries.getFinancialLife(ctx, serial);
    const r = life.records;

    /**
     * One candidate row, with the reader's view and the world's kept apart.
     *
     * `ref`/`at` are what the READER may see — both from `records`, which is
     * scope-filtered. `exists` and `unscopedRef` are facts about the CLOSE,
     * read from `buySide`/`sellSide`, which are not filtered. Keeping the two
     * sides in separate fields is the whole point: `exists` decides whether
     * the event happened, `ref` decides whether the reader may see it, and
     * only both together tell "restricted" apart from "has not happened".
     *
     * `exists` is never read off a scoped record. Doing that is what makes a
     * restriction and an absence the same value.
     */
    const spec: {
      label: string;
      ref?: string | undefined;
      at?: string | undefined;
      exists: boolean;
      unscopedRef?: string | undefined;
    }[] = [
      { label: "Purchase Order", ref: r.purchaseOrder?.transactionNumber, at: r.purchaseOrder?.orderDate, exists: life.buySide.purchaseOrder !== undefined, unscopedRef: life.buySide.purchaseOrder },
      { label: "Item Receipt", ref: r.itemReceipt?.transactionNumber, at: r.itemReceipt?.receiptDate, exists: life.buySide.itemReceipt !== undefined, unscopedRef: life.buySide.itemReceipt },
      { label: "Vendor Bill", ref: r.vendorBill?.transactionNumber, at: r.vendorBill?.billDate, exists: life.buySide.vendorBill !== undefined, unscopedRef: life.buySide.vendorBill },
      { label: "Sales Order", ref: r.salesOrder?.transactionNumber, at: r.salesOrder?.orderDate, exists: life.sellSide.salesOrder !== undefined, unscopedRef: life.sellSide.salesOrder },
      { label: "Item Fulfillment", ref: r.itemFulfillment?.transactionNumber, at: r.itemFulfillment?.shipDate, exists: life.sellSide.itemFulfillment !== undefined, unscopedRef: life.sellSide.itemFulfillment },
      // A carrier shipment is not a delivery: the defining fact is the
      // delivery date, and the shipment id is only what NAMES the event.
      { label: "Delivery", ref: r.carrierShipment?.id, at: life.sellSide.deliveredAt, exists: life.sellSide.deliveredAt !== undefined, unscopedRef: life.sellSide.carrierShipment },
      { label: "Installation", ref: r.installation?.id, at: life.sellSide.installedAt, exists: life.sellSide.installedAt !== undefined },
      { label: "First online", ref: r.telemetry?.serial, at: life.sellSide.firstOnlineAt, exists: life.sellSide.firstOnlineAt !== undefined },
      { label: "Customer Invoice", ref: r.customerInvoice?.transactionNumber, at: r.customerInvoice?.invoiceDate, exists: life.sellSide.customerInvoice !== undefined, unscopedRef: life.sellSide.customerInvoice },
    ];

    const dated: { label: string; ref: string; at: string; state: "DATED" }[] = [];
    const withheld: { label: string; ref: string; state: "WITHHELD" }[] = [];
    const undated: { label: string; ref: string; state: "UNDATED" }[] = [];

    for (const e of spec) {
      // An event that did not happen is not on the timeline in any state.
      // This is the handler's second rule, and it is tested FIRST so that no
      // later branch can assert an event the close does not contain;
      // `life.missing` is where a genuine absence is reported.
      if (!e.exists) continue;
      if (e.ref !== undefined && e.at !== undefined) {
        dated.push({ label: e.label, ref: e.ref, at: e.at, state: "DATED" });
        continue;
      }
      if (e.ref !== undefined) {
        undated.push({ label: e.label, ref: e.ref, state: "UNDATED" });
        continue;
      }
      /**
       * Withheld means the event HAPPENED and the reader may not see the
       * record naming it. Both halves are load-bearing, and each was got
       * wrong in turn:
       *
       * Testing only the unscoped side made "has not happened" and "is
       * restricted" the same value, so a CONTROLLER — whose scope withholds
       * nothing — was told "FP-IN-2288 · withheld by your access scope"
       * about a delivery that had not occurred, on forty of the fifteen
       * hundred serials.
       *
       * Testing `ref === undefined` instead fixed that reader and kept the
       * defect for every reader whose scope actually filters something: on
       * KE-X1-9025 an AUDITOR_READ_ONLY still read "Delivery · FP-IN-2291 ·
       * withheld by your access scope" over a delivery that has not
       * happened, because the shipment record was out of scope and nothing
       * consulted `deliveredAt`. Guarding the term the reader can see, and
       * never the fact that defines the event, narrows a defect of this
       * shape rather than removing it.
       */
      if (e.unscopedRef !== undefined) {
        withheld.push({ label: e.label, ref: e.unscopedRef, state: "WITHHELD" });
      }
    }

    return {
      serial,
      // Only dated events are ordered. A total order over values that
      // include undefined is not an order — the previous comparator returned
      // 1 for both (a,b) and (b,a) when neither had a date.
      events: [
        ...[...dated].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.label < b.label ? -1 : 1)),
        ...undated,
        ...withheld,
      ],
      datedCount: dated.length,
      withheldCount: withheld.length,
      scopeReduced: withheld.length > 0,
      missing: life.missing,
    };
  },
  get_financial_lifecycle: ({ queries, ctx }, args) =>
    queries.getFinancialLife(ctx, args["serial"] ?? ""),
  get_cycle_count_history: ({ queries, ctx }) => {
    const detail = queries.getCountDetail(ctx);
    return {
      summary: queries.getCountSummary(ctx),
      results: detail.results,
      tests: detail.tests,
      movements: detail.movements,
      // Empty for an auditor by design (the management lens is not theirs);
      // the flag keeps that distinguishable from "there are none".
      managementIndicators: detail.managementIndicators,
      managementLensInScope: detail.managementIndicators.length > 0,
    };
  },
  get_reconciliation_status: ({ queries, ctx }) => queries.getReconciliation(ctx),
  get_procurement_match: ({ queries, ctx }) => queries.getProcurementMatches(ctx),
  get_commercial_chain: ({ queries, ctx }) => queries.getCommercialChains(ctx),
  get_pbc_status: ({ queries, ctx }) => queries.getPbcPackage(ctx),
  get_source_health: ({ queries, ctx }) => queries.getSourceHealth(ctx),
  get_third_party_holdings: ({ queries, ctx }) => queries.getThirdPartyHoldings(ctx),
  search_serial: ({ queries, ctx }, args) => queries.searchSerial(ctx, args["serial"] ?? ""),
  get_valuation_status: ({ queries, ctx }) => queries.getValuation(ctx),
  get_proposed_adjustments: ({ queries, ctx }) => queries.getAdjustmentRegister(ctx),

  /* ---------------------------------------------------------------- */
  /* Stage G. Each is a one-line delegation on purpose: the figures are */
  /* already derived, already authorized and already scoped inside      */
  /* @icg/services, and a handler that reshaped one here would be a     */
  /* second derivation of a number the screens show.                    */
  /* ---------------------------------------------------------------- */

  get_gl_account_reconciliation: ({ projections, ctx }) =>
    projections.getGlAccountReconciliation(ctx),
  get_procurement_populations: ({ projections, ctx }) =>
    projections.getProcurementPopulations(ctx),
  get_cost_standards: ({ projections, ctx }) => projections.getCostStandards(ctx),
  get_cost_classification: ({ projections, ctx }) =>
    projections.getCostClassification(ctx),
  get_custody_breakdown: ({ projections, ctx }) => projections.getCustodyBreakdown(ctx),
  get_consignment_holdings: ({ projections, ctx }) =>
    projections.getConsignmentHoldings(ctx),
  get_dispositions: ({ projections, ctx }) => projections.getDispositions(ctx),
  get_eo_methodology: ({ projections, ctx }) => projections.getEoMethodology(ctx),
  get_methodology: ({ projections, ctx }) => projections.getMethodology(ctx),
  get_memo: ({ projections, ctx }) => projections.getMemo(ctx),

  /* ---------------------------------------------------------------- */
  /* The live close. Everything above reads the frozen baseline; these  */
  /* two read what people have done to it in this session, which is     */
  /* what every screen already shows. Both are one-line delegations to  */
  /* query-service projections that predate Stage G.                    */
  /* ---------------------------------------------------------------- */

  get_effective_close: ({ queries, ctx }) => queries.getEffectiveClose(ctx),
  get_exception_workflow: ({ queries, ctx }, args) =>
    queries.getExceptionWorkflow(ctx, args["exceptionId"] ?? ""),
};

/** Run one approved tool. Never throws for authorization; reports instead. */
export function runTool(
  t: AiToolContext,
  tool: AiToolName,
  args: Readonly<Record<string, string>> = {},
): AiToolResult {
  const handler = HANDLERS[tool];
  try {
    const data = handler(t, args);
    if (data === undefined) {
      return { call: { tool, args, outcome: "NOT_FOUND", evidenceIds: [] } };
    }
    return {
      call: { tool, args, outcome: "OK", evidenceIds: [...collectEvidenceIds(data)].sort() },
      data,
    };
  } catch (error) {
    if (isAuthorizationError(error)) {
      return { call: { tool, args, outcome: "NOT_AUTHORIZED", evidenceIds: [] } };
    }
    // A bug must not masquerade as a permissions boundary.
    throw error;
  }
}

/**
 * A recorder that runs tools and keeps every call. The answer engine uses one
 * per question so the interaction record is complete and the guardrail layer
 * can check citations against what was actually returned.
 */
export function createToolSession(t: AiToolContext) {
  const calls: AiToolCall[] = [];
  return {
    run<T = unknown>(tool: AiToolName, args: Readonly<Record<string, string>> = {}): T | undefined {
      const result = runTool(t, tool, args);
      calls.push(result.call);
      return result.data as T | undefined;
    },
    get calls(): readonly AiToolCall[] {
      return calls;
    },
    /** Every evidence id any call surfaced — the citation allowlist. */
    get evidenceIds(): ReadonlySet<string> {
      return new Set(calls.flatMap((c) => c.evidenceIds));
    },
    get anyDenied(): boolean {
      return calls.some((c) => c.outcome === "NOT_AUTHORIZED");
    },
  };
}

export type AiToolSession = ReturnType<typeof createToolSession>;
