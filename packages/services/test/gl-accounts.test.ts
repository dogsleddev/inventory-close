import { beforeEach, describe, expect, it } from "vitest";
import { userByRole } from "@icg/data";
import type { Role } from "@icg/domain";
import {
  createQueryService,
  createWorkspace,
  getGlAccountReconciliation,
  INVENTORY_RESERVE_ACCOUNT,
  type ServiceContext,
  type Workspace,
} from "../src/index.js";
import { INVENTORY_GL_ACCOUNT_DESCRIPTIONS } from "../src/glAccounts.js";
import {
  ACCOUNTING_CLASSIFICATIONS,
  glAccountDescription,
  glAccountForClassification,
} from "@icg/domain";

/**
 * Per-account inventory GL reconciliation (COMPLETION_PLAN §4).
 *
 * The product reconciled inventory to the GL in total and never per account.
 * These tests pin the two things that make the per-account cut trustworthy:
 * the rows sum EXACTLY to the locked totals (so a fixture change cannot
 * silently desync this view from the bridge), and the reserve never enters
 * the gross figures.
 */

let ws: Workspace;
let queries: ReturnType<typeof createQueryService>;

const ctx = (role: Role): ServiceContext => ({
  user: userByRole(role),
  correlationId: `T-GLA-${role}`,
  sourceInterface: "TEST",
});

beforeEach(() => {
  ws = createWorkspace();
  queries = createQueryService(ws);
});

describe("the account rows sum to the locked reconciliation", () => {
  it("adds up to the bridge's own subledger, GL, and difference", () => {
    const bridge = queries.getReconciliation(ctx("CONTROLLER"));
    const view = getGlAccountReconciliation(ws, ctx("CONTROLLER"));

    // Read from the deterministic core, never transcribed: if the dataset
    // moves, the bridge and this view must move together or fail here.
    const subledger = view.accounts.reduce((n, a) => n + a.subledgerCents, 0);
    const gl = view.accounts.reduce((n, a) => n + a.glCents, 0);
    const difference = view.accounts.reduce((n, a) => n + a.differenceCents, 0);

    expect(subledger).toBe(bridge.subledgerCents);
    expect(gl).toBe(bridge.grossGlCents);
    expect(difference).toBe(bridge.differenceCents);
    // …and the projection reports the same totals it is made of.
    expect(view.subledgerCents).toBe(subledger);
    expect(view.grossGlCents).toBe(gl);
    expect(view.differenceCents).toBe(difference);
  });

  it("holds the locked baseline: $4,800,000 subledger, $4,812,450 GL, $12,450 difference", () => {
    const view = getGlAccountReconciliation(ws, ctx("CONTROLLER"));
    expect(view.subledgerCents).toBe(480_000_000);
    expect(view.grossGlCents).toBe(481_245_000);
    expect(view.differenceCents).toBe(1_245_000);
  });

  it("covers every unit exactly once — no unit falls outside an account row", () => {
    const view = getGlAccountReconciliation(ws, ctx("CONTROLLER"));
    const units = queries.listInventoryUnits(ctx("CONTROLLER"));
    expect(view.accounts.reduce((n, a) => n + a.unitCount, 0)).toBe(units.length);
    expect(units).toHaveLength(1_500);
  });

  it("puts every reconciling item on exactly one account", () => {
    const bridge = queries.getReconciliation(ctx("CONTROLLER"));
    const view = getGlAccountReconciliation(ws, ctx("CONTROLLER"));
    const placed = view.accounts.flatMap((a) => a.items.map((i) => i.id));
    expect(new Set(placed).size).toBe(placed.length);
    expect(placed).toHaveLength(bridge.items.length);
    expect(view.unattributedItems).toHaveLength(0);
    // Every account's explained amount is the sum of the items it carries.
    expect(view.accounts.reduce((n, a) => n + a.explainedCents, 0)).toBe(
      bridge.explainedCents,
    );
  });
});

describe("the four gross accounts", () => {
  it("reports the CANONICAL_SPEC §5 accounts and no others", () => {
    const view = getGlAccountReconciliation(ws, ctx("CONTROLLER"));
    expect(view.accounts.map((a) => a.account)).toEqual(["1200", "1210", "1220", "1230"]);
    for (const account of view.accounts) {
      expect(account.description).toBe(INVENTORY_GL_ACCOUNT_DESCRIPTIONS[account.account]);
      expect(account.description).not.toBe(account.account);
      expect(account.unitCount).toBeGreaterThan(0);
      expect(account.classifications.length).toBeGreaterThan(0);
    }
  });

  it("derives the per-account subledger from the classification mapping", () => {
    const view = getGlAccountReconciliation(ws, ctx("CONTROLLER"));
    const units = queries.listInventoryUnits(ctx("CONTROLLER"));
    for (const account of view.accounts) {
      const mine = units.filter(
        (u) => glAccountForClassification(u.classification) === account.account,
      );
      expect(account.subledgerCents).toBe(
        mine.reduce((n, u) => n + u.unitCostCents, 0),
      );
      expect(account.unitCount).toBe(mine.length);
    }
  });

  it("carries the whole difference in 1200 and ties the other three exactly", () => {
    const view = getGlAccountReconciliation(ws, ctx("CONTROLLER"));
    const bridge = queries.getReconciliation(ctx("CONTROLLER"));
    const byAccount = new Map(view.accounts.map((a) => [a.account, a]));

    expect(byAccount.get("1200")?.differenceCents).toBe(bridge.differenceCents);
    for (const account of ["1210", "1220", "1230"]) {
      expect(byAccount.get(account)?.differenceCents, `${account} does not tie`).toBe(0);
      expect(byAccount.get(account)?.items, `${account} carries an item`).toHaveLength(0);
    }
  });

  it("gives every classification an account the chart of accounts and the GL both know", () => {
    // The mapping used to exist twice and this test compared the copies.
    // There is one map now (INVENTORY_ACCOUNTING_MATRIX), so that comparison
    // could only ever pass. What can still go wrong is the mapping naming an
    // account nothing else carries — a classification pointed at 1240 would
    // put its units in a bucket the GL has no balance for, and the row would
    // report a difference equal to its whole subledger.
    const view = getGlAccountReconciliation(ws, ctx("CONTROLLER"));
    const reported = new Set(view.accounts.map((a) => a.account));
    for (const classification of ACCOUNTING_CLASSIFICATIONS) {
      const account = glAccountForClassification(classification);
      expect(glAccountDescription(account), `${classification} → ${account}`).toBeDefined();
      expect(reported.has(account), `${classification} → ${account} has no GL row`).toBe(true);
    }
  });

  it("reports the same account for a unit as the matrix assigns its classification", () => {
    // Structural now — the query service calls the same function — so this
    // is here to catch a future projection that starts deriving the account
    // some other way, which is exactly how the two copies drifted before.
    const units = queries.listInventoryUnits(ctx("CONTROLLER"));
    const seen = new Set<string>();
    for (const classification of ACCOUNTING_CLASSIFICATIONS) {
      const unit = units.find((u) => u.classification === classification);
      if (unit === undefined) continue;
      seen.add(classification);
      const life = queries.getFinancialLife(ctx("CONTROLLER"), unit.serial);
      expect(life.unit?.glAccount, `${classification} maps inconsistently`).toBe(
        glAccountForClassification(classification),
      );
    }
    // The loop's iteration count must not come from the population it walks:
    // an empty listing would empty it and the test would pass having checked
    // nothing. Every classification in the enum is carried at this baseline.
    expect(seen.size).toBe(ACCOUNTING_CLASSIFICATIONS.length);
  });
});

describe("reconciling items land on the account their GL entries hit", () => {
  it("attributes from the GL entry, not from the exception's other records", () => {
    const view = getGlAccountReconciliation(ws, ctx("CONTROLLER"));
    for (const account of view.accounts) {
      for (const item of account.items) {
        expect(item.glEntryRefs.length).toBeGreaterThan(0);
        for (const ref of item.glEntryRefs) {
          const entry = ws.dataset.glEntries.find((e) => e.transactionNumber === ref);
          expect(entry?.account, `${item.id} attributed away from its entry`).toBe(
            account.account,
          );
        }
      }
    }
  });

  it("does not follow the RMA duplicate to the account the original restock used", () => {
    // EXC-009's duplicate re-add was posted to 1200 while the inventory
    // adjustment it duplicates sits on 1230 — the reason attribution reads
    // the GL entry rather than the related records.
    const view = getGlAccountReconciliation(ws, ctx("CONTROLLER"));
    const rma = ws.close.exceptions.find((e) => e.finding.ruleId === "RMA-DUP-001");
    expect(rma).toBeDefined();
    const restock = ws.dataset.inventoryAdjustments.find((a) =>
      (rma?.finding.subjects.transactionNumbers ?? []).includes(a.transactionNumber),
    );
    expect(restock?.glAccount).toBe("1230");
    const holder = view.accounts.find((a) =>
      a.items.some((i) => i.relatedExceptionId === rma?.id),
    );
    expect(holder?.account).toBe("1200");
  });
});

describe("the reserve is never part of gross inventory", () => {
  it("returns 1290 separately, with no account row and no subledger", () => {
    const view = getGlAccountReconciliation(ws, ctx("CONTROLLER"));
    expect(view.accounts.some((a) => a.account === INVENTORY_RESERVE_ACCOUNT)).toBe(false);
    expect(view.reserve?.account).toBe(INVENTORY_RESERVE_ACCOUNT);
    expect(view.reserve?.hasSubledger).toBe(false);
    // A credit balance, reported with its sign rather than as an absolute.
    expect(view.reserve?.glCents).toBeLessThan(0);
    expect(view.reserve?.glCents).toBe(
      queries.getReconciliation(ctx("CONTROLLER")).reserveCents,
    );
  });

  it("leaves the gross total unchanged by the reserve balance", () => {
    const view = getGlAccountReconciliation(ws, ctx("CONTROLLER"));
    const reserve = view.reserve?.glCents ?? 0;
    expect(reserve).not.toBe(0);
    expect(view.grossGlCents).toBe(
      queries.getReconciliation(ctx("CONTROLLER")).grossGlCents,
    );
    expect(view.grossGlCents + reserve).not.toBe(view.grossGlCents);
  });
});

describe("per-account state is a reconciliation state, never a workflow status", () => {
  it("says Reconciled when the account ties and Open reconciling items when it does not", () => {
    const view = getGlAccountReconciliation(ws, ctx("CONTROLLER"));
    for (const account of view.accounts) {
      if (account.differenceCents === 0) {
        expect(account.state).toBe("RECONCILED");
      } else {
        expect(account.items.length).toBeGreaterThan(0);
        expect(account.unexplainedCents).toBe(0);
        expect(account.state).toBe("OPEN_RECONCILING_ITEMS");
      }
    }
  });

  it("never borrows a canonical exception status word", () => {
    const view = getGlAccountReconciliation(ws, ctx("CONTROLLER"));
    const statuses = new Set(ws.close.exceptions.map((e) => String(e.status)));
    for (const account of view.accounts) {
      expect(statuses.has(account.state)).toBe(false);
    }
  });

  it("adds no exception and no blocker to the close", () => {
    const before = {
      exceptions: queries.listExceptions(ctx("CONTROLLER")).length,
      blockers: queries.getBlockers(ctx("CONTROLLER")).length,
    };
    getGlAccountReconciliation(ws, ctx("CONTROLLER"));
    expect(queries.listExceptions(ctx("CONTROLLER"))).toHaveLength(before.exceptions);
    expect(queries.getBlockers(ctx("CONTROLLER"))).toHaveLength(before.blockers);
    expect(before.exceptions).toBe(15);
    expect(before.blockers).toBe(7);
  });
});

describe("authorization", () => {
  it("is refused to a role without close.read", () => {
    expect(() => getGlAccountReconciliation(ws, ctx("SYSTEM_ADMIN"))).toThrow();
  });

  it("reads the same to the auditor as to the controller", () => {
    expect(getGlAccountReconciliation(ws, ctx("AUDITOR_READ_ONLY"))).toEqual(
      getGlAccountReconciliation(ws, ctx("CONTROLLER")),
    );
  });
});
