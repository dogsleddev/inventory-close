import { beforeEach, describe, expect, it } from "vitest";
import { userByRole } from "@icg/data";
import { createQueryService, createWorkspace, type ServiceContext, type Workspace } from "../src/index.js";

/**
 * `listSalesOrderLines` — what was actually sold on each order.
 *
 * The COGS tab was the only order-keyed surface in the product and it
 * reported a state per sales order without ever saying what was on it. The
 * documents carried full line detail the whole time.
 *
 * This lives in `queries.ts` rather than `costing.ts` because a sales order
 * CAN be a scoped record — `SO-26184` is in the evidence graph — and
 * `costing.ts` documents (and `projections.test.ts` enforces) that it reads
 * no source document.
 */

const ctxFor = (role: string): ServiceContext => ({
  user: userByRole(role as never),
  correlationId: "CORR-SOL",
  sourceInterface: "TEST",
});

const controller = ctxFor("CONTROLLER");

let ws: Workspace;
let q: ReturnType<typeof createQueryService>;

beforeEach(() => {
  ws = createWorkspace();
  q = createQueryService(ws);
});

describe("a sales order reports its own product lines", () => {
  it("reports every line on a multi-line order, not just the first", () => {
    const so = q.listSalesOrderLines(controller).find((o) => o.salesOrder === "SO-26110");
    expect(so).toBeDefined();
    expect(so?.lines).toEqual([
      { sku: "KE-E1", quantity: 2, amountCents: 1568000 },
      { sku: "KE-X1", quantity: 1, amountCents: 1472000 },
      { sku: "KE-E2", quantity: 1, amountCents: 1184000 },
    ]);
    expect(so?.totalCents).toBe(4224000);
  });

  it("keeps multi-line orders multi-line across the population", () => {
    // Derived, not spot-checked: a change that collapsed each order to its
    // first line would leave every row length 1 and satisfy a single lookup.
    const rows = q.listSalesOrderLines(controller);
    expect(rows.length).toBe(ws.dataset.salesOrders.length);
    expect(rows.filter((o) => o.lines.length > 1).length).toBeGreaterThan(1);
  });

  it("states a total that is the sum of the lines it printed", () => {
    // The total and the lines are one derivation, or they are two answers to
    // the same question.
    for (const o of q.listSalesOrderLines(controller)) {
      if (o.totalCents === null) continue;
      expect(o.lines.reduce((n, l) => n + (l.amountCents ?? 0), 0), o.salesOrder).toBe(
        o.totalCents,
      );
    }
  });

  it("matches the documents it claims to be reporting", () => {
    // Against the dataset, not against itself. A projection that agreed only
    // with its own output would pass while reporting the wrong order.
    const rows = new Map(q.listSalesOrderLines(controller).map((o) => [o.salesOrder, o]));
    for (const order of ws.dataset.salesOrders) {
      const got = rows.get(order.transactionNumber);
      expect(got?.lines.map((l) => l.sku), order.transactionNumber).toEqual(
        order.lines.map((l) => l.sku),
      );
      expect(got?.lines.map((l) => l.quantity), order.transactionNumber).toEqual(
        order.lines.map((l) => l.quantity),
      );
    }
  });

  it("never lets a withheld order read as an order with nothing on it", () => {
    // At this baseline every order is readable by every demo role, so the
    // WITHHELD BRANCH IS NOT EXERCISED HERE — this asserts the invariant that
    // makes the branch safe, and deliberately does not claim to cover it.
    // The scoped-read behaviour itself is exercised in the auditor test below.
    for (const role of ["CONTROLLER", "AUDITOR_READ_ONLY"]) {
      for (const o of q.listSalesOrderLines(ctxFor(role))) {
        expect(o.withheld && o.lines.length > 0, o.salesOrder).toBe(false);
        expect(o.withheld && o.totalCents !== null, o.salesOrder).toBe(false);
      }
    }
  });

  it("withholds an order whose evidence leaves the auditor's scope", () => {
    // The premise has to be built: auditor scope keys on a PBC item having a
    // sealed PROVIDED version, and at the baseline SO-26184's evidence is in
    // scope. Emptying the PBC list removes every provided workpaper, so no
    // evidence — and therefore no evidenced source document — is in scope.
    // Without this setup the assertion below would pass against an
    // unscoped read, which is exactly how a scope test proves nothing.
    const auditor = ctxFor("AUDITOR_READ_ONLY");
    const before = q.listSalesOrderLines(auditor).find((o) => o.salesOrder === "SO-26184");
    expect(before?.withheld).toBe(false);
    expect(before?.lines.length).toBeGreaterThan(0);

    (ws.close as { pbc: readonly unknown[] }).pbc = [];
    const after = createQueryService(ws)
      .listSalesOrderLines(auditor)
      .find((o) => o.salesOrder === "SO-26184");

    expect(after?.withheld).toBe(true);
    expect(after?.lines).toEqual([]);
    expect(after?.totalCents).toBeNull();
  });

  it("does not withhold that order from a controller", () => {
    // Scope is the auditor's, not everyone's — the same narrowing must not
    // reach a role the workpaper model does not govern.
    (ws.close as { pbc: readonly unknown[] }).pbc = [];
    const so = createQueryService(ws)
      .listSalesOrderLines(controller)
      .find((o) => o.salesOrder === "SO-26184");
    expect(so?.withheld).toBe(false);
    expect(so?.lines.length).toBeGreaterThan(0);
  });
});
