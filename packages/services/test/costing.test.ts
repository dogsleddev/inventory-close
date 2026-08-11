import { beforeEach, describe, expect, it } from "vitest";
import { COST_COMPONENT_TYPES } from "@icg/domain";
import { userByRole } from "@icg/data";
import {
  COST_COMPONENT_BEHAVIOR,
  createQueryService,
  createWorkspace,
  getCostClassification,
  getCostStandards,
  type ServiceContext,
  type Workspace,
} from "../src/index.js";

/**
 * Stage D — costing.
 *
 * Every assertion here pins a RULE the projection has to keep, not a figure
 * it happens to produce. The figures that are pinned as literals are the
 * locked ones the whole close is built on ($4,800,000), and they are pinned
 * precisely so a costing change that moved them would fail here first.
 */

const controller: ServiceContext = {
  user: userByRole("CONTROLLER"),
  correlationId: "CORR-COST",
  sourceInterface: "TEST",
};

let ws: Workspace;

beforeEach(() => {
  ws = createWorkspace();
});

describe("the standard cost stack", () => {
  it("decomposes the close's own subledger figure, and says that it does", () => {
    const std = getCostStandards(ws, controller);
    // The claim the screen is allowed to make. Both halves: the components
    // sum to the subledger, AND the flag that licenses the sentence agrees.
    expect(std.componentTotalCents).toBe(std.subledgerCents);
    expect(std.subledgerCents).toBe(480_000_000);
    expect(std.decompositionAgrees).toBe(true);
    // The flag is a conjunction, so it must not be satisfiable by the total
    // alone: each of its other conditions is asserted in its own right.
    expect(std.unitsWithoutStack).toBe(0);
    expect(std.unitsOffStandard).toBe(0);
    expect(std.skusWithoutStack).toEqual([]);
    expect(std.rows.every((r) => r.stackAgrees)).toBe(true);
  });

  it("ties every SKU's components to the standard that SKU is carried at", () => {
    const std = getCostStandards(ws, controller);
    const standardOf = new Map(ws.dataset.skus.map((s) => [s.code, s.unitCostCents]));
    expect(std.rows.length).toBe(ws.dataset.skus.length);
    for (const row of std.rows) {
      const sum = row.components.reduce((n, c) => n + c.amountCents, 0);
      // Against the SKU master, not against the row's own reported total —
      // a stackTotalCents that agrees with itself proves nothing.
      expect(sum, row.sku).toBe(standardOf.get(row.sku));
      expect(row.stackTotalCents, row.sku).toBe(sum);
      expect(row.stackAgrees, row.sku).toBe(true);
    }
  });

  it("extends over the units on the book rather than multiplying the SKU master", () => {
    const std = getCostStandards(ws, controller);
    for (const row of std.rows) {
      const units = ws.dataset.inventoryUnits.filter((u) => u.sku === row.sku);
      expect(row.onHandUnits, row.sku).toBe(units.length);
      expect(row.carriedCents, row.sku).toBe(
        units.reduce((n, u) => n + u.unitCostCents, 0),
      );
    }
    // And the carried values are the subledger — no unit is missed or counted
    // twice by the per-SKU cut.
    expect(std.rows.reduce((n, r) => n + r.carriedCents, 0)).toBe(std.subledgerCents);
  });

  it("takes its column set from the union of stacks, not from one row", () => {
    const std = getCostStandards(ws, controller);
    const union = new Set(std.rows.flatMap((r) => r.components.map((c) => c.component)));
    expect([...std.componentTypes].sort()).toEqual([...union].sort());
    // Canonical order, so a per-SKU table's columns cannot reshuffle between
    // rows or between tabs.
    for (const row of std.rows) {
      const order = row.components.map((c) => COST_COMPONENT_TYPES.indexOf(c.component));
      expect([...order], row.sku).toEqual([...order].sort((a, b) => a - b));
    }
  });

  it("stops claiming the balance decomposes when a unit is carried off standard", () => {
    // The baseline cannot exercise this: every unit is at its SKU's standard,
    // so removing the off-standard guard from the projection changes nothing
    // and every assertion above stays green. The condition is created here so
    // the guard is actually tested rather than merely present.
    //
    // `createWorkspace` calls `buildDataset()` afresh, so this mutation is
    // confined to this test's workspace.
    type Unit = (typeof ws.dataset.inventoryUnits)[number];
    const victim = ws.dataset.inventoryUnits[0] as Unit;
    const original = victim.unitCostCents;
    victim.unitCostCents = original + 1_000;

    const std = getCostStandards(ws, controller);
    expect(std.unitsOffStandard).toBe(1);
    expect(std.decompositionAgrees).toBe(false);
    // The off-standard unit's cost is not decomposed — spreading a cost the
    // stack does not explain would be an invention — so the component total
    // now falls short of the carried balance rather than silently matching.
    expect(std.componentTotalCents).toBeLessThan(
      std.rows.reduce((n, r) => n + r.carriedCents, 0),
    );
    // Exactly one unit's worth of standard cost drops out — the amount the
    // stack could explain, not the inflated figure the unit is now carried
    // at. `subledgerCents` is the close's own number and does not move: this
    // projection reports the close's figure, it does not recompute it.
    expect(std.subledgerCents).toBe(480_000_000);
    expect(std.componentTotalCents).toBe(480_000_000 - original);
  });

  it("reports every effective date rather than assuming one", () => {
    const std = getCostStandards(ws, controller);
    const dates = new Set(ws.dataset.costComponents.map((c) => c.effectiveFrom));
    expect([...std.effectiveFroms].sort()).toEqual([...dates].sort());
  });
});

describe("cost behaviour", () => {
  it("classifies every component type the data actually carries", () => {
    // A component with no behaviour entry would drop out of the split
    // silently, and variable + fixed would still look like a whole number.
    for (const type of new Set(ws.dataset.costComponents.map((c) => c.component))) {
      expect(COST_COMPONENT_BEHAVIOR[type], type).toBeDefined();
      expect(COST_COMPONENT_BEHAVIOR[type].basis.length, type).toBeGreaterThan(20);
    }
  });

  it("splits the capitalized total exhaustively", () => {
    const cls = getCostClassification(ws, controller);
    expect(cls.capitalized.variableCents + cls.capitalized.fixedCents).toBe(
      cls.capitalized.totalCents,
    );
    // Both sides must be non-empty or the exhaustiveness above is vacuous.
    expect(cls.capitalized.variableCents).toBeGreaterThan(0);
    expect(cls.capitalized.fixedCents).toBeGreaterThan(0);
  });

  it("reads the same capitalized total as the stack projection", () => {
    // Two entry points, one figure. They are separate service calls and the
    // screen shows them on separate tabs, so a reader must never find the
    // inventory balance decomposed two ways.
    expect(getCostClassification(ws, controller).capitalized.totalCents).toBe(
      getCostStandards(ws, controller).componentTotalCents,
    );
  });
});

describe("period costs", () => {
  it("keeps every pool out of the balances the reconciliation sums", () => {
    const cls = getCostClassification(ws, controller);
    // The measurement the screen renders.
    expect(cls.period.accountsInGlBalances).toEqual([]);
    expect(cls.period.keptOutOfInventory).toBe(true);
    // Asserted independently of the projection's own answer: no period-cost
    // account may appear in glBalances at all. `buildReconciliation` sums
    // every balance except 1290, so one that did would move the locked gross
    // GL with no rule change.
    const recorded = new Set(ws.dataset.glBalances.map((b) => b.account));
    expect(recorded.size).toBeGreaterThan(0);
    for (const row of cls.period.rows) {
      expect(recorded.has(row.glAccount), `${row.id} on ${row.glAccount}`).toBe(false);
    }
  });

  it("says so when a pool does reach a recorded balance", () => {
    // The whole point of `keptOutOfInventory` is that it is measured, and on
    // this dataset it is true — so a projection that hard-coded `true` would
    // pass every other test in this file. Create the violation and check the
    // screen would report it.
    const pool = getCostClassification(ws, controller).period.rows[0];
    expect(pool).toBeDefined();
    type Balance = (typeof ws.dataset.glBalances)[number];
    const balances = ws.dataset.glBalances as Balance[];
    const template = balances[0] as Balance;
    balances.push({ ...template, account: pool?.glAccount ?? "6710", amountCents: 1 });

    const cls = getCostClassification(ws, controller);
    expect(cls.period.accountsInGlBalances).toEqual([pool?.glAccount]);
    expect(cls.period.keptOutOfInventory).toBe(false);
  });

  it("carries a basis on every pool and never capitalizes one", () => {
    const cls = getCostClassification(ws, controller);
    expect(cls.period.rows.length).toBeGreaterThan(0);
    for (const row of cls.period.rows) {
      expect(row.treatment, row.id).toBe("EXPENSED_AS_INCURRED");
      expect(row.basis.length, row.id).toBeGreaterThan(40);
    }
    expect(cls.period.totalCents).toBe(
      cls.period.rows.reduce((n, r) => n + r.amountCents, 0),
    );
    expect(cls.period.byCategory.reduce((n, c) => n + c.amountCents, 0)).toBe(
      cls.period.totalCents,
    );
  });

  it("never folds the expensed side into the capitalized one", () => {
    const cls = getCostClassification(ws, controller);
    // The two halves answer the same question from opposite sides, and the
    // one thing a surface must never do is add them.
    expect(cls.capitalized.totalCents).toBe(480_000_000);
    expect(cls.period.totalCents).toBeGreaterThan(0);
    expect(cls.capitalized.totalCents).not.toBe(
      cls.capitalized.totalCents + cls.period.totalCents,
    );
  });
});

describe("COGS state", () => {
  it("reads one row per commercial chain, from the relief component itself", () => {
    const cls = getCostClassification(ws, controller);
    // If the rule ever renames "Inventory relief", the states cannot be read
    // and the count says so rather than every row quietly becoming
    // NOT_SHIPPED. Break the component name in costing.ts to see this fail.
    expect(cls.cogs.chainsWithoutReliefComponent).toBe(0);
    expect(cls.cogs.rows.length).toBe(ws.close.chains.length);
    expect(cls.cogs.relieved + cls.cogs.notRelieved + cls.cogs.notShipped).toBe(
      cls.cogs.rows.length,
    );
  });

  it("derives each state from its chain's own relief component", () => {
    const cls = getCostClassification(ws, controller);
    const expected: Readonly<Record<string, string>> = {
      PRESENT: "RELIEVED",
      MISSING: "NOT_RELIEVED",
      NOT_APPLICABLE: "NOT_SHIPPED",
    };
    for (const row of cls.cogs.rows) {
      const chain = ws.close.chains.find((c) => c.subjectRef === row.salesOrder);
      const relief = chain?.components.find((c) => c.name === "Inventory relief");
      expect(relief, row.salesOrder).toBeDefined();
      expect(row.state, row.salesOrder).toBe(expected[relief?.state ?? ""]);
    }
    // All three states must occur or the mapping above is barely tested.
    expect(cls.cogs.relieved).toBeGreaterThan(0);
    expect(cls.cogs.notRelieved).toBeGreaterThan(0);
    expect(cls.cogs.notShipped).toBeGreaterThan(0);
  });

  it("flags the rows whose units on the book are expected rather than a finding", () => {
    const cls = getCostClassification(ws, controller);
    for (const row of cls.cogs.rows) {
      expect(row.expectedOnBook, row.salesOrder).toBe(row.state === "NOT_SHIPPED");
    }
    // The flag is load-bearing, and this is what makes it so: the rule writes
    // "… still on the year-end book" whenever fulfilled serials are on hand,
    // WHATEVER the component's state. So an order that never shipped carries
    // the same sentence, and a surface printing it beside "not shipped"
    // reports units as having failed to relieve when nothing was fulfilled.
    // If this stops being true the flag is decoration and can go.
    const misleading = cls.cogs.rows.filter(
      (r) => r.expectedOnBook && (r.note ?? "").includes("still on the year-end book"),
    );
    expect(misleading.length).toBeGreaterThan(0);
    // And the note is never reworded — it is the rule's own sentence.
    for (const row of cls.cogs.rows) {
      if (row.note === null) continue;
      const chain = ws.close.chains.find((c) => c.subjectRef === row.salesOrder);
      expect(row.note, row.salesOrder).toBe(
        chain?.components.find((c) => c.name === "Inventory relief")?.note,
      );
    }
  });

  it("links a chain to the close's own exception rather than inventing one", () => {
    const cls = getCostClassification(ws, controller);
    for (const row of cls.cogs.rows) {
      if (row.relatedExceptionId === null) {
        expect(
          ws.close.exceptions.some((e) =>
            e.finding.subjects.transactionNumbers?.includes(row.salesOrder),
          ),
          row.salesOrder,
        ).toBe(false);
        continue;
      }
      const exception = ws.close.exceptions.find((e) => e.id === row.relatedExceptionId);
      expect(exception, row.salesOrder).toBeDefined();
      expect(
        exception?.finding.subjects.transactionNumbers?.includes(row.salesOrder),
        row.salesOrder,
      ).toBe(true);
    }
    // The unrelieved chain is the one the close already raised — the link is
    // what lets a reader get from a costing question to its exception.
    const notRelieved = cls.cogs.rows.filter((r) => r.state === "NOT_RELIEVED");
    expect(notRelieved.every((r) => r.relatedExceptionId !== null)).toBe(true);
  });
});

describe("costing is a projection, not a rule", () => {
  it("moves no locked figure and derives no exception", () => {
    const before = createQueryService(ws).getCloseReadiness(controller).aggregates;
    getCostStandards(ws, controller);
    getCostClassification(ws, controller);
    const after = createQueryService(ws).getCloseReadiness(controller).aggregates;
    expect(after).toEqual(before);
    expect(after.exceptionCount).toBe(15);
    expect(after.blockerCount).toBe(7);
    expect(after.closeReadinessBps).toBe(8142);
    expect(ws.close.reconciliation.subledgerCents).toBe(480_000_000);
    expect(ws.close.reconciliation.grossGlCents).toBe(481_245_000);
  });

  it("refuses a role without close.read", () => {
    const admin: ServiceContext = {
      user: userByRole("SYSTEM_ADMIN"),
      correlationId: "CORR-COST-DENY",
      sourceInterface: "TEST",
    };
    expect(() => getCostStandards(ws, admin)).toThrow();
    expect(() => getCostClassification(ws, admin)).toThrow();
  });

  it("shows an auditor exactly what it shows a controller", () => {
    // Nothing here is a scoped record, so an auditor's view must not be
    // narrowed — and the export's scope map says so by carrying no note for
    // this table. The two have to agree.
    const auditor: ServiceContext = {
      user: userByRole("AUDITOR_READ_ONLY"),
      correlationId: "CORR-COST-AUD",
      sourceInterface: "TEST",
    };
    expect(getCostStandards(ws, auditor)).toEqual(getCostStandards(ws, controller));
    expect(getCostClassification(ws, auditor)).toEqual(
      getCostClassification(ws, controller),
    );
  });
});
