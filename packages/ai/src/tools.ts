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
   * here from the records the Financial Life view already returns. Order
   * comes from the source records' own dates — never invented, and a record
   * without a date is reported undated rather than being given one.
   */
  get_evidence_timeline: ({ queries, ctx }, args) => {
    const serial = args["serial"] ?? "";
    const life = queries.getFinancialLife(ctx, serial);
    const r = life.records;
    const entries = [
      { label: "Purchase Order", ref: life.buySide.purchaseOrder, at: r.purchaseOrder?.orderDate },
      { label: "Item Receipt", ref: life.buySide.itemReceipt, at: r.itemReceipt?.receiptDate },
      { label: "Vendor Bill", ref: life.buySide.vendorBill, at: r.vendorBill?.billDate },
      { label: "Sales Order", ref: life.sellSide.salesOrder, at: r.salesOrder?.orderDate },
      { label: "Item Fulfillment", ref: life.sellSide.itemFulfillment, at: r.itemFulfillment?.shipDate },
      { label: "Delivery", ref: life.sellSide.carrierShipment, at: life.sellSide.deliveredAt },
      { label: "Installation", ref: r.installation?.id, at: life.sellSide.installedAt },
      { label: "First online", ref: r.telemetry?.serial, at: life.sellSide.firstOnlineAt },
      { label: "Customer Invoice", ref: life.sellSide.customerInvoice, at: r.customerInvoice?.invoiceDate },
    ].filter((e) => e.ref !== undefined);
    return {
      serial,
      // Undated entries sort last and say so; they are never given a date.
      events: [...entries].sort((a, b) =>
        a.at === undefined ? 1 : b.at === undefined ? -1 : a.at < b.at ? -1 : 1,
      ),
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
