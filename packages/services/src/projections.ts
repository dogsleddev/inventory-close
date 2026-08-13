import { getCostClassification, getCostStandards } from "./costing.js";
import { getEoMethodology } from "./eoMethodology.js";
import { getGlAccountReconciliation } from "./glAccounts.js";
import { getMemo } from "./memo.js";
import { getMethodology } from "./methodology.js";
import {
  getConsignmentHoldings,
  getCustodyBreakdown,
  getDispositions,
} from "./ownership.js";
import { getProcurementPopulations } from "./procurement.js";
import type { ServiceContext } from "./queries.js";
import type { Workspace } from "./workspace.js";

/**
 * The read-only projections Stages B–F added, bound to one workspace
 * (COMPLETION_PLAN Stage G).
 *
 * `createQueryService` is the older half of the same idea and every screen
 * reads through it. These projections were written afterwards as free
 * functions taking `(ws, ctx)` — which is fine for a server component that
 * already holds the workspace, and wrong for Ask Gaurd, whose whole safety
 * argument is that **a tool handler cannot reach the workspace at all**. A
 * handler holding `ws` could read `ws.dataset` directly and bypass
 * authorization, restricted-content redaction and auditor scoping in one
 * line, silently.
 *
 * So the workspace is closed over here and never handed out. A tool receives
 * functions that take a `ServiceContext` and nothing else, which makes the
 * bypass unrepresentable rather than merely discouraged.
 *
 * Why this is a separate module and not more methods on `createQueryService`:
 * `procurement.ts` and `ownership.ts` import `makeRecordScope` from
 * `queries.ts` at runtime, so `queries.ts` importing them back would close an
 * import cycle. ESM would probably survive it — the binding is read inside a
 * function body — but "probably survives a cycle" is not a property to build
 * the permission boundary on. Nothing imports this module from below.
 *
 * Every function delegated here calls `authorize(ctx.user, …)`. This layer
 * adds no logic of its own: it is a binding, not a service, and a projection
 * that needed a decision made about it would belong in the module that owns
 * the figures.
 *
 * **Source-document scoping is per module, and this comment used to claim
 * otherwise.** It said every delegate "scopes source documents itself", which
 * was a claim about ten modules made by a file that calls into them and checks
 * nothing — and it was false of most of them. `eoMethodology.ts` read a
 * forecast's own note straight off the fixture, so an auditor whose workpaper
 * scope hides FC-002 read its note on `/valuation`: the side door around
 * `listEvidence` that `makeRecordScope` exists to close. It is scoped now.
 *
 * Which delegates reach source records at all, and what each does:
 *
 * - `procurement`, `ownership`, `costing`, `methodology`, `eoMethodology` —
 *   reach source documents and call `makeRecordScope`.
 * - `glAccounts`, `memo` — reach no source record. `glAccounts` reads close
 *   aggregates and the GL account map; `memo` reads workspace drafts and
 *   versions, whose own visibility `memo.ts` decides. Neither needs the scope
 *   and neither silently skips it.
 *
 * A delegate added here that reads `ws.dataset.*` and returns any of its text
 * belongs in the first list, not the second.
 *
 * The claim is only worth making if it is checked: `security.test.ts` asserts
 * the withholding and asserts that no figure shrinks with it. That sentence
 * first shipped naming `projections.test.ts`, a file that does not exist — a
 * comment citing its own guard by a name nobody had created, written while
 * fixing the class "a claim more precise than its enforcement". Cite the file
 * that holds the test, and open it before you write the sentence.
 */
export function createProjectionService(ws: Workspace) {
  return {
    /** Per-account inventory reconciliation — which account is out (Stage B). */
    getGlAccountReconciliation: (ctx: ServiceContext) =>
      getGlAccountReconciliation(ws, ctx),
    /** 3WM, GRNI, invoiced-not-received, goods in transit, PPV (Stage C). */
    getProcurementPopulations: (ctx: ServiceContext) =>
      getProcurementPopulations(ws, ctx),
    /** The capitalized standard cost stack (Stage D). */
    getCostStandards: (ctx: ServiceContext) => getCostStandards(ws, ctx),
    /** Period costs kept out of inventory, and COGS relief state (Stage D). */
    getCostClassification: (ctx: ServiceContext) => getCostClassification(ws, ctx),
    /** Physical custody of the book population (Stage E). */
    getCustodyBreakdown: (ctx: ServiceContext) => getCustodyBreakdown(ws, ctx),
    /** Vendor-owned stock held on our floor, off book (Stage E). */
    getConsignmentHoldings: (ctx: ServiceContext) => getConsignmentHoldings(ws, ctx),
    /** Scrap and other dispositions (Stage E). */
    getDispositions: (ctx: ServiceContext) => getDispositions(ws, ctx),
    /** The E&O signal basis — aging, condition, recovery (Stage E). */
    getEoMethodology: (ctx: ServiceContext) => getEoMethodology(ws, ctx),
    /** Readiness derivation, reconciliation derivation, judgements (Stage F). */
    getMethodology: (ctx: ServiceContext) => getMethodology(ws, ctx),
    /** The close memo and the close position it speaks about (Stage F). */
    getMemo: (ctx: ServiceContext) => getMemo(ws, ctx),
  };
}

export type ProjectionService = ReturnType<typeof createProjectionService>;
