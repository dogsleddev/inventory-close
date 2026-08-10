import type { QueryService, ServiceContext } from "@icg/services";
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

    // ref, at, and the fact that defines the event — all from one scope.
    const spec: {
      label: string;
      ref?: string | undefined;
      at?: string | undefined;
      present: boolean;
    }[] = [
      { label: "Purchase Order", ref: r.purchaseOrder?.transactionNumber, at: r.purchaseOrder?.orderDate, present: r.purchaseOrder !== undefined },
      { label: "Item Receipt", ref: r.itemReceipt?.transactionNumber, at: r.itemReceipt?.receiptDate, present: r.itemReceipt !== undefined },
      { label: "Vendor Bill", ref: r.vendorBill?.transactionNumber, at: r.vendorBill?.billDate, present: r.vendorBill !== undefined },
      { label: "Sales Order", ref: r.salesOrder?.transactionNumber, at: r.salesOrder?.orderDate, present: r.salesOrder !== undefined },
      { label: "Item Fulfillment", ref: r.itemFulfillment?.transactionNumber, at: r.itemFulfillment?.shipDate, present: r.itemFulfillment !== undefined },
      // Delivery exists only where a delivery event does.
      { label: "Delivery", ref: r.carrierShipment?.id, at: life.sellSide.deliveredAt, present: life.sellSide.deliveredAt !== undefined },
      { label: "Installation", ref: r.installation?.id, at: life.sellSide.installedAt, present: life.sellSide.installedAt !== undefined },
      { label: "First online", ref: r.telemetry?.serial, at: life.sellSide.firstOnlineAt, present: life.sellSide.firstOnlineAt !== undefined },
      { label: "Customer Invoice", ref: r.customerInvoice?.transactionNumber, at: r.customerInvoice?.invoiceDate, present: r.customerInvoice !== undefined },
    ];

    // A component the viewer's scope withheld: the unfiltered side still
    // names it, the scoped side does not. That is a restriction, and it is
    // reported as one rather than dropped or dated.
    const unscopedRefs: Readonly<Record<string, string | undefined>> = {
      "Purchase Order": life.buySide.purchaseOrder,
      "Item Receipt": life.buySide.itemReceipt,
      "Vendor Bill": life.buySide.vendorBill,
      "Sales Order": life.sellSide.salesOrder,
      "Item Fulfillment": life.sellSide.itemFulfillment,
      Delivery: life.sellSide.carrierShipment,
      "Customer Invoice": life.sellSide.customerInvoice,
    };

    const dated: { label: string; ref: string; at: string; state: "DATED" }[] = [];
    const withheld: { label: string; ref: string; state: "WITHHELD" }[] = [];
    const undated: { label: string; ref: string; state: "UNDATED" }[] = [];

    for (const e of spec) {
      if (e.present && e.ref !== undefined && e.at !== undefined) {
        dated.push({ label: e.label, ref: e.ref, at: e.at, state: "DATED" });
        continue;
      }
      if (e.present && e.ref !== undefined) {
        undated.push({ label: e.label, ref: e.ref, state: "UNDATED" });
        continue;
      }
      const unscoped = unscopedRefs[e.label];
      if (unscoped !== undefined) {
        withheld.push({ label: e.label, ref: unscoped, state: "WITHHELD" });
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
