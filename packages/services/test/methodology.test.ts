import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { userByRole } from "@icg/data";
import {
  ACCOUNTING_CLASSIFICATIONS,
  INVENTORY_ACCOUNTING_MATRIX,
  INVENTORY_ACCOUNTING_MATRIX_DIMENSIONS,
  type Role,
} from "@icg/domain";
import { computeReadiness, explainReadiness, POLICY_V1 } from "@icg/rules";
import {
  createWorkspace,
  effectiveClose,
  effectiveExceptions,
  getCostClassification,
  getMethodology,
  INTERPRETATION_CONSTANT_NAMES,
  type ServiceContext,
  type Workspace,
} from "../src/index.js";
import { MONTHS_OF_SUPPLY_BASIS } from "../src/eoMethodology.js";

/**
 * Stage F — the methodology projection.
 *
 * Every assertion here pins a RULE the projection has to keep rather than a
 * figure it happens to produce. Three failure modes are what these are for:
 *
 * - the explanation drifting from the arithmetic it claims to explain,
 * - a "term" that is prose and would say the same thing whatever the close
 *   state was,
 * - a measured claim that cannot go false.
 *
 * The last one is why several tests below CREATE the violating condition:
 * the baseline cannot produce one, so a projection hard-coding the boolean
 * would otherwise pass the whole suite. `createWorkspace()` calls
 * `buildDataset()` afresh, so mutating `ws.dataset` inside a test is isolated
 * to that test.
 */

let ws: Workspace;

const ctx = (role: Role): ServiceContext => ({
  user: userByRole(role),
  correlationId: `T-METH-${role}`,
  sourceInterface: "TEST",
});

beforeEach(() => {
  ws = createWorkspace();
});

const explain = (w: Workspace) =>
  explainReadiness(
    effectiveExceptions(w),
    w.close.reconciliation,
    w.close.proposedAdjustments.length,
    POLICY_V1,
  );

describe("the explanation and the computation are one derivation", () => {
  it("states no policy-dependent fact in prose that does not move with the policy", () => {
    // An ALTERNATE policy object — POLICY_V1 is never mutated; it is the
    // policy the locked baseline was scored against.
    const alt = {
      ...POLICY_V1,
      readinessCategories: POLICY_V1.readinessCategories.map((c, i) =>
        i === 0 ? { ...c, weightPercent: c.weightPercent + 5 } : c,
      ),
    };
    const base = explain(ws);
    const moved = explainReadiness(
      effectiveExceptions(ws),
      ws.close.reconciliation,
      ws.close.proposedAdjustments.length,
      alt,
    );
    expect(base.weightPercentTotal).toBe(100);
    expect(moved.weightPercentTotal).toBe(105);

    // Load-bearing: it says WHY the two assertions below exist. If someone
    // later branches this string inside the rules package, this fails first
    // and names the second authored copy rather than the symptom.
    expect(moved.roundingRule, "roundingRule is policy-invariant by design").toBe(
      base.roundingRule,
    );
    // ...so it must not assert the thing the same object measures.
    expect(moved.roundingRule).not.toMatch(/The weights total 100/);
    expect(moved.roundingRule).toMatch(/only if the weights total 100/);
  });

  it("makes no comparative claim about another category's penalty", () => {
    // LEXICAL, deliberately: it catches the phrasings that actually drifted
    // here ("at twice the rate", "the heaviest single penalty"), not every
    // comparative a future author could invent. A basis may still describe
    // its OWN policy value freely.
    const comparativeRate = /\b(twice|double|triple|half)\s+(the\s+)?(rate|penalty|deduction)\b/i;
    const superlative = /\b(heaviest|largest|highest|biggest|greatest|smallest|lightest)\b/i;
    for (const c of explain(ws).categories) {
      expect(comparativeRate.test(c.basis), `${c.key} compares its rate to another`).toBe(false);
      expect(superlative.test(c.basis), `${c.key} ranks its penalty against the policy`).toBe(
        false,
      );
    }
  });

  it("ends every term's observed sentence, at every close state", () => {
    // A trailing "N open: " with nothing after it reads as a list that failed
    // to render. Driven to the fully-concluded state so the empty case of
    // EVERY term is exercised, not only the one that drifted.
    const concluded = createWorkspace();
    concluded.close = {
      ...concluded.close,
      exceptions: concluded.close.exceptions.map((e) => ({
        ...e,
        status: "RESOLVED_NO_ADJUSTMENT" as const,
      })),
    };
    for (const w of [ws, concluded]) {
      for (const c of explain(w).categories) {
        for (const t of c.terms) {
          expect(t.observed, `${c.key}: ${t.rule}`).not.toMatch(/[:;,]\s*$/);
          expect(t.observed.trim(), `${c.key}: ${t.rule}`).not.toBe("");
        }
      }
    }
  });

  it("reports the same score for every category, and the same total", () => {
    const computed = computeReadiness(
      effectiveExceptions(ws),
      ws.close.reconciliation,
      ws.close.proposedAdjustments.length,
      POLICY_V1,
    );
    const explained = explain(ws);
    expect(explained.categories).toHaveLength(computed.categories.length);
    for (const [i, c] of computed.categories.entries()) {
      const e = explained.categories[i];
      expect(e?.key, `category ${i}`).toBe(c.key);
      expect(e?.scoreHundredths, c.key).toBe(c.scoreHundredths);
    }
    expect(explained.totalBasisPoints).toBe(computed.totalBasisPoints);
  });

  it("still agrees once the close has moved", () => {
    // Two projections over one derivation cannot disagree at ONE state by
    // accident, so the agreement is checked at a second one the baseline
    // cannot reach: every count exception concluded away.
    ws.close = {
      ...ws.close,
      exceptions: ws.close.exceptions.map((e) =>
        e.finding.ruleId.startsWith("CNT-")
          ? { ...e, status: "RESOLVED_NO_ADJUSTMENT" as const }
          : e,
      ),
    };
    const computed = computeReadiness(
      effectiveExceptions(ws),
      ws.close.reconciliation,
      ws.close.proposedAdjustments.length,
      POLICY_V1,
    );
    const explained = explain(ws);
    expect(explained.totalBasisPoints).toBe(computed.totalBasisPoints);
    // And the state actually moved, or this test proved nothing.
    expect(computed.totalBasisPoints).not.toBe(ws.close.readiness.totalBasisPoints);
  });

  it("explains the LIVE figure the rest of the product shows", () => {
    const view = getMethodology(ws, ctx("CONTROLLER"));
    expect(view.readiness.totalBasisPoints).toBe(effectiveClose(ws).readinessBps);
  });
});

describe("a readiness term reports the close state, not a sentence about it", () => {
  it("names only exceptions that exist and are open", () => {
    const view = getMethodology(ws, ctx("CONTROLLER"));
    const open = new Set(
      effectiveExceptions(ws)
        .filter(
          (e) =>
            e.status !== "RESOLVED_NO_ADJUSTMENT" &&
            e.status !== "RESOLVED_ADJUSTMENT_PROPOSED",
        )
        .map((e) => e.id),
    );
    let named = 0;
    for (const c of view.readiness.categories) {
      for (const t of c.terms) {
        for (const id of t.drivingExceptionIds) {
          named += 1;
          expect(open.has(id), `${c.key} names ${id}, which is not open`).toBe(true);
        }
      }
    }
    // The loop's length comes from the output under test: an explanation that
    // named nothing would empty it and this would go green having checked
    // nothing at all.
    expect(named).toBeGreaterThan(0);
  });

  it("fires a tier term exactly when it has something to count", () => {
    const view = getMethodology(ws, ctx("CONTROLLER"));
    // The exclusions are hoisted OUT of the loop so the set under test is
    // named before iteration rather than discovered during it. A counter
    // incremented inside a loop it also skips proves only that the loop ran,
    // not that the assertion did — and it still reaches 1 when every category
    // has been emptied.
    const assertable = view.readiness.categories.filter(
      // Ratio categories carry no penalty by design; POPULATION_GL is driven
      // by a figure rather than by ids.
      (c) => c.key !== "EXCEPTIONS" && c.key !== "ADJUSTMENTS" && c.key !== "POPULATION_GL",
    );
    expect(assertable.length, "no category was left to assert on").toBeGreaterThan(0);

    for (const c of assertable) {
      expect(c.terms.length, `${c.key} contributed no term to check`).toBeGreaterThan(0);
      for (const t of c.terms) {
        expect(t.penaltyPercent > 0, `${c.key}: ${t.rule}`).toBe(
          t.drivingExceptionIds.length > 0,
        );
      }
    }
  });

  it("drops the deduction when the condition it names goes away", () => {
    // A condition the baseline cannot produce. Without it, a term whose
    // penalty was hard-coded would pass every assertion above.
    const before = explain(ws).categories.find((c) => c.key === "CUTOFF");
    expect(before?.scoreHundredths).toBeLessThan(10000);
    expect(before?.terms[0]?.penaltyPercent).toBeGreaterThan(0);
    expect(before?.terms[0]?.drivingExceptionIds.length).toBeGreaterThan(0);

    ws.close = {
      ...ws.close,
      exceptions: ws.close.exceptions.map((e) =>
        e.finding.ruleId.startsWith("CUT-")
          ? { ...e, status: "RESOLVED_NO_ADJUSTMENT" as const }
          : e,
      ),
    };
    const after = explain(ws).categories.find((c) => c.key === "CUTOFF");
    expect(after?.scoreHundredths).toBe(10000);
    expect(after?.terms[0]?.penaltyPercent).toBe(0);
    expect(after?.terms[0]?.drivingExceptionIds).toEqual([]);
  });

  it("keeps the weighted sum an exact integer identity", () => {
    const view = getMethodology(ws, ctx("CONTROLLER")).readiness;
    const byHand = view.categories.reduce(
      (n, c) => n + c.weightPercent * c.scoreHundredths,
      0,
    );
    expect(view.weightedSum).toBe(byHand);
    expect(view.totalBasisPoints).toBe(Math.floor((byHand + 50) / 100));
    expect(view.weightPercentTotal).toBe(100);
  });
});

describe("the accounting matrix is measured against the population", () => {
  it("holds at the baseline, in both directions", () => {
    const matrix = getMethodology(ws, ctx("CONTROLLER")).matrix;
    expect(matrix.custodyExpectationHolds).toBe(true);
    expect(matrix.rowsWithUnexpectedCustody).toEqual([]);
    expect(matrix.rowsWithUnobservedCustody).toEqual([]);
    // Every row is populated at this baseline, so "as expected" is a real
    // agreement rather than the vacuous truth of an empty comparison.
    for (const row of matrix.rows) {
      expect(row.observedCustody.length, row.classification).toBeGreaterThan(0);
    }
  });

  it("goes false when a unit is held somewhere its row does not expect", () => {
    type Unit = (typeof ws.dataset.inventoryUnits)[number];
    const victim = ws.dataset.inventoryUnits.find(
      (u) => u.classification === "FINISHED_HARDWARE",
    ) as Unit;
    ws.dataset = {
      ...ws.dataset,
      inventoryUnits: ws.dataset.inventoryUnits.map((u) =>
        u.serial === victim.serial ? { ...u, location: "DEMO_LOANER" } : u,
      ),
    };
    const matrix = getMethodology(ws, ctx("CONTROLLER")).matrix;
    expect(matrix.custodyExpectationHolds).toBe(false);
    expect(matrix.rowsWithUnexpectedCustody).toContain("FINISHED_HARDWARE");
    // The OTHER half must stay clean, or this test would also be proving the
    // second conjunct and neither would be shown to be load-bearing.
    expect(matrix.rowsWithUnobservedCustody).toEqual([]);
  });

  it("goes false when a row expects custody nothing reaches", () => {
    // The complementary break, in isolation: remove every unit that reaches
    // one of FINISHED_HARDWARE's two expected custody types.
    ws.dataset = {
      ...ws.dataset,
      inventoryUnits: ws.dataset.inventoryUnits.filter(
        (u) => !(u.classification === "FINISHED_HARDWARE" && u.location === "CUSTOMER_SITE"),
      ),
    };
    const matrix = getMethodology(ws, ctx("CONTROLLER")).matrix;
    expect(matrix.custodyExpectationHolds).toBe(false);
    expect(matrix.rowsWithUnobservedCustody).toContain("FINISHED_HARDWARE");
    expect(matrix.rowsWithUnexpectedCustody).toEqual([]);
  });

  it("gives every classification a row, and every row the account the matrix assigns", () => {
    const matrix = getMethodology(ws, ctx("CONTROLLER")).matrix;
    expect(matrix.rows.map((r) => r.classification)).toEqual([
      ...ACCOUNTING_CLASSIFICATIONS,
    ]);
    for (const row of matrix.rows) {
      expect(row.glAccount, row.classification).toBe(
        INVENTORY_ACCOUNTING_MATRIX[row.classification].glAccount,
      );
      expect(row.glAccountDescription, row.classification).not.toBe(row.glAccount);
    }
  });
});

describe("the register of authored judgements", () => {
  it("covers the authored dimensions and excludes the specified one", () => {
    const view = getMethodology(ws, ctx("CONTROLLER"));
    const dimensions = new Set(view.interpretations.map((i) => i.dimension));
    const authored = INVENTORY_ACCOUNTING_MATRIX_DIMENSIONS.filter(
      (d) => d.provenance === "AUTHORED",
    ).map((d) => d.key);
    const specified = INVENTORY_ACCOUNTING_MATRIX_DIMENSIONS.filter(
      (d) => d.provenance === "SPECIFIED",
    ).map((d) => d.key);
    // Both halves asserted: a register that listed everything would pass the
    // first check alone, and one that listed nothing would pass the second.
    expect(authored.length).toBeGreaterThan(0);
    expect(specified.length).toBeGreaterThan(0);
    for (const key of authored) {
      expect(dimensions.has(key), `${key} is authored and not in the register`).toBe(true);
    }
    for (const key of specified) {
      expect(dimensions.has(key), `${key} is specified and should not be`).toBe(false);
    }
  });

  it("carries a basis on every entry, and never an empty one", () => {
    const view = getMethodology(ws, ctx("CONTROLLER"));
    expect(view.interpretations.length).toBeGreaterThan(0);
    for (const i of view.interpretations) {
      expect(i.basis.length, i.id).toBeGreaterThan(20);
      expect(i.answer.length, i.id).toBeGreaterThan(0);
      expect(i.heldIn.length, i.id).toBeGreaterThan(0);
    }
  });

  it("names constants that actually exist in the source tree", () => {
    // A register pointing at a constant nobody can find is the same defect as
    // a scan whose config roots name files that are not there: the pointer
    // reads as a guarantee and guarantees nothing.
    const roots = [
      join(__dirname, "..", "..", "domain", "src", "accountingMatrix.ts"),
      join(__dirname, "..", "src", "eoMethodology.ts"),
      join(__dirname, "..", "..", "rules", "src", "policy.ts"),
    ];
    const source = roots.map((p) => readFileSync(p, "utf8")).join("\n");
    expect(INTERPRETATION_CONSTANT_NAMES.length).toBeGreaterThan(0);
    for (const name of INTERPRETATION_CONSTANT_NAMES) {
      expect(source.includes(`export const ${name}`), `${name} is not exported anywhere`).toBe(
        true,
      );
    }
    const view = getMethodology(ws, ctx("CONTROLLER"));
    for (const i of view.interpretations) {
      expect(
        INTERPRETATION_CONSTANT_NAMES.includes(i.heldIn),
        `${i.id} is held in ${i.heldIn}, which is not a checked constant`,
      ).toBe(true);
    }
  });
});

describe("the bridge derivation reports the close's own arithmetic", () => {
  it("takes every figure from the reconciliation the rules produced", () => {
    const view = getMethodology(ws, ctx("CONTROLLER")).reconciliation;
    const recon = ws.close.reconciliation;
    expect(view.subledgerCents).toBe(recon.subledgerCents);
    expect(view.grossGlCents).toBe(recon.grossGlCents);
    expect(view.differenceCents).toBe(recon.differenceCents);
    expect(view.explainedCents).toBe(recon.explainedCents);
    expect(view.unexplainedCents).toBe(recon.unexplainedCents);
    expect(view.items).toHaveLength(recon.items.length);
    expect(view.subledgerUnits).toBe(ws.dataset.inventoryUnits.length);
  });

  it("says the difference is fully explained only when it is", () => {
    expect(getMethodology(ws, ctx("CONTROLLER")).reconciliation.fullyExplained).toBe(true);
    // Created condition: drop an item and the claim must go false.
    ws.close = {
      ...ws.close,
      reconciliation: {
        ...ws.close.reconciliation,
        unexplainedCents: 1_000,
      },
    };
    expect(getMethodology(ws, ctx("CONTROLLER")).reconciliation.fullyExplained).toBe(false);
  });
});

describe("authorization", () => {
  it("refuses a role without close.read", () => {
    expect(() => getMethodology(ws, ctx("SYSTEM_ADMIN"))).toThrow();
  });

  it("gives every role that can read the close the same methodology", () => {
    // Nothing here is a scoped record, so an auditor's answer is the same
    // answer. That is worth pinning: a scope applied where nothing is
    // withheld is how a file starts claiming a redaction that never happened.
    const controller = getMethodology(ws, ctx("CONTROLLER"));
    const auditor = getMethodology(ws, ctx("AUDITOR_READ_ONLY"));
    expect(auditor.interpretations).toEqual(controller.interpretations);
    expect(auditor.matrix.rows).toEqual(controller.matrix.rows);
    expect(auditor.readiness.totalBasisPoints).toBe(controller.readiness.totalBasisPoints);
  });
});

describe("the matrix's cost-relief prose stays tied to the population it describes", () => {
  /**
   * The matrix is the biggest authored surface in the stage and the one least
   * protected by tests: five columns of accounting judgement, none of which
   * the engine checks. These two properties tie the COGS column to the data,
   * and neither names a classification — a test that says "GIT must not claim
   * fulfillment" pins today's instance and would pass the same sentence
   * written onto any other row tomorrow.
   */

  /** Serials on an item fulfillment that are STILL on the year-end book. */
  const fulfilledStillOnBook = (w: Workspace): Map<string, string[]> => {
    const classOf = new Map(w.dataset.inventoryUnits.map((u) => [u.serial, u.classification]));
    const out = new Map<string, string[]>();
    for (const f of w.dataset.itemFulfillments) {
      for (const line of f.lines) {
        for (const serial of line.serials ?? []) {
          const c = classOf.get(serial);
          if (c === undefined) continue; // relieved: no longer on the book
          out.set(c, [...(out.get(c) ?? []), serial]);
        }
      }
    }
    return out;
  };

  it("never states fulfillment as a completed event for a classification no fulfillment reaches", () => {
    // Only the TRIGGER is lexical — the set of phrases that assert fulfilment
    // as something that has happened. The PERMISSION half is fully derived:
    // a row may say it only if fulfilled serials of that classification are
    // actually still on the book.
    const claimsFulfilment = /has been fulfilled|have been fulfilled|was fulfilled|were fulfilled|fulfilled but/i;
    const owners = fulfilledStillOnBook(ws);

    for (const classification of ACCOUNTING_CLASSIFICATIONS) {
      const basis = INVENTORY_ACCOUNTING_MATRIX[classification].cogsBasis;
      if (!claimsFulfilment.test(basis)) continue;
      expect(
        owners.has(classification),
        `${classification}.cogsBasis states stock has been fulfilled, but ${
          (owners.get(classification) ?? []).length
        } fulfilled serials of that classification remain on the book`,
      ).toBe(true);
    }
  });

  it("every classification owning an unrelieved chain names the rule that decides relief for it", () => {
    const view = getCostClassification(ws, ctx("CONTROLLER"));
    const classOf = new Map(ws.dataset.inventoryUnits.map((u) => [u.serial, u.classification]));

    const live = new Set<string>();
    for (const row of view.cogs.rows) {
      if (row.state !== "NOT_RELIEVED") continue;
      for (const f of ws.dataset.itemFulfillments) {
        if (f.salesOrderNumber !== row.salesOrder) continue;
        for (const line of f.lines) {
          for (const serial of line.serials ?? []) {
            const c = classOf.get(serial);
            if (c !== undefined) live.add(c);
          }
        }
      }
    }

    // Load-bearing: without it, a dataset carrying no unrelieved chain makes
    // the property below vacuously true — the "measured claim that cannot go
    // false" this file exists to prevent.
    expect(live.size, "no classification owns an unrelieved chain to assert on").toBeGreaterThan(0);

    for (const classification of live) {
      expect(
        INVENTORY_ACCOUNTING_MATRIX[classification as keyof typeof INVENTORY_ACCOUNTING_MATRIX]
          .cogsBasis,
        `${classification} owns an unrelieved chain, so its basis must route relief to the rule`,
      ).toContain("O2C-CHAIN-001");
    }
  });
});

describe("the register reads its answers from the constants that hold them", () => {
  it("no interpretation's answer is authored in the projection", () => {
    // A category rule over all 58 rows: the panel claims each answer is read
    // from the constant that holds it, never restated beside it. A restated
    // answer appears in this module as a string literal.
    const source = readFileSync(
      join(process.cwd(), "packages/services/src/methodology.ts"),
      "utf8",
    );
    const view = getMethodology(ws, ctx("CONTROLLER"));
    const restated = view.interpretations
      .filter((i) => source.includes(JSON.stringify(i.answer)))
      .map((i) => i.id);
    expect(restated, "answers authored in the projection rather than read from a constant").toEqual(
      [],
    );
  });

  it("composes the months-of-supply basis from the assumption it reports", () => {
    const view = getMethodology(ws, ctx("CONTROLLER"));
    const row = view.interpretations.find((i) => i.id === "EO:MONTHS_OF_SUPPLY");
    expect(row).toBeDefined();
    expect(row!.basis).toBe(MONTHS_OF_SUPPLY_BASIS);
    // The pointer in `heldIn` is only true if the basis actually contains the
    // answer; composition is what makes it so, rather than two strings that
    // happen to agree today.
    expect(row!.basis).toContain(row!.answer);
  });
});
