import { isResolvedStatus } from "@icg/domain";
import type { ClosePolicy } from "./policy.js";
import type { DerivedException } from "./exceptions.js";
import type { ReconciliationOut } from "./reconciliation.js";

/**
 * Close readiness (CANONICAL_SPEC section 11): eight weighted categories.
 * Every category score is DERIVED from close state through documented tier
 * rules - resolve an exception and the score moves. Scores are integer
 * hundredths of a percent; the total is integer basis points with round-
 * half-up at the final division (8141.65 -> 8142). This is a management
 * workflow metric, not audit assurance.
 */
export interface ReadinessCategoryOut {
  readonly key: string;
  readonly label: string;
  readonly weightPercent: number;
  /** Score in integer hundredths of a percent (9000 = 90.00). */
  readonly scoreHundredths: number;
}

export interface ReadinessOut {
  readonly categories: readonly ReadinessCategoryOut[];
  readonly totalBasisPoints: number;
  readonly policyVersion: string;
}

/**
 * How one category's score was arrived at, in terms a reader can check.
 *
 * This is the same computation `computeReadiness` performs, reported rather
 * than re-derived: both read `deriveScores` below, so a Methodology surface
 * explaining a score and the close producing it cannot disagree. Writing the
 * explanation as a second implementation is the defect this shape exists to
 * prevent — it would keep describing a tier rule after the rule changed, and
 * nothing would fail.
 */
export interface ReadinessTermOut {
  /** The rule in words: what is subtracted, and per what. */
  readonly rule: string;
  /** What the close state actually was, as the rule measures it. */
  readonly observed: string;
  /** Percentage points this term removed. Zero when it did not fire. */
  readonly penaltyPercent: number;
  /** Exceptions this term counted, when it counts exceptions. */
  readonly drivingExceptionIds: readonly string[];
}

export interface ReadinessCategoryExplanationOut extends ReadinessCategoryOut {
  /** What the score measures, before any term is applied. */
  readonly basis: string;
  readonly terms: readonly ReadinessTermOut[];
  /** weightPercent × scoreHundredths — this category's share of the sum. */
  readonly weightedContribution: number;
}

export interface ReadinessExplanationOut {
  readonly categories: readonly ReadinessCategoryExplanationOut[];
  /** Σ weight × hundredths, before rounding. Exact integer arithmetic. */
  readonly weightedSum: number;
  /** The rounding step, stated: floor((weightedSum + 50) / 100), half-up. */
  readonly totalBasisPoints: number;
  readonly roundingRule: string;
  readonly policyVersion: string;
  /** Weights must sum to 100 for the division to yield basis points. */
  readonly weightPercentTotal: number;
}

interface DerivedScore {
  readonly score: number;
  readonly basis: string;
  readonly terms: readonly ReadinessTermOut[];
}

/**
 * The single derivation. `computeReadiness` projects the scores out of it;
 * `explainReadiness` projects the whole thing. Neither computes a score the
 * other does not see.
 */
function deriveScores(
  exceptions: readonly DerivedException[],
  reconciliation: ReconciliationOut,
  proposedAdjustmentCount: number,
  policy: ClosePolicy,
): Map<string, DerivedScore> {
  const open = exceptions.filter((e) => !isResolvedStatus(e.status));
  const p = policy.readinessPenalties;
  const clamp = (percent: number) => Math.max(0, Math.min(100, percent)) * 100;

  const openByRulePrefix = (prefix: string) =>
    open.filter((e) => e.finding.ruleId.startsWith(prefix));
  const openWith = (predicate: (e: DerivedException) => boolean) =>
    open.filter(predicate);

  const ids = (list: readonly DerivedException[]) => list.map((e) => e.id);

  /** A tier term: the whole penalty applies once if anything qualifies. */
  const tier = (
    rule: string,
    qualifying: readonly DerivedException[],
    penalty: number,
    observedWhenNone: string,
  ): ReadinessTermOut => ({
    rule,
    observed:
      qualifying.length === 0
        ? observedWhenNone
        : `${qualifying.length} open: ${ids(qualifying).join(", ")}`,
    penaltyPercent: qualifying.length > 0 ? penalty : 0,
    drivingExceptionIds: ids(qualifying),
  });

  const scores = new Map<string, DerivedScore>();
  // Population / GL: penalized while the GL difference is unadjusted.
  scores.set(
    "POPULATION_GL",
    {
      score: clamp(100 - (reconciliation.differenceCents !== 0 ? p.unadjustedGlDifference : 0)),
      basis:
        "Starts at 100 and is penalized once while the subledger and the general ledger do not agree. The penalty is for the difference being unadjusted, not for its size.",
      terms: [
        {
          rule: `Subledger-to-GL difference outstanding: −${p.unadjustedGlDifference} points`,
          observed:
            reconciliation.differenceCents === 0
              ? "The subledger and the general ledger agree."
              : "The subledger and the general ledger do not agree.",
          penaltyPercent: reconciliation.differenceCents !== 0 ? p.unadjustedGlDifference : 0,
          drivingExceptionIds: [],
        },
      ],
    },
  );
  // Physical count: per open count-family exception.
  const openCount = openByRulePrefix("CNT-");
  scores.set("PHYSICAL_COUNT", {
    score: clamp(100 - p.perOpenCountException * openCount.length),
    basis:
      "Starts at 100 and loses a fixed amount for EACH open count-family finding. Unlike the tier categories this one scales, because two unresolved count questions leave the population less established than one.",
    terms: [
      {
        rule: `Each open CNT- exception: −${p.perOpenCountException} points`,
        observed:
          openCount.length === 0
            ? "No count-family exception is open."
            : `${openCount.length} open: ${ids(openCount).join(", ")}`,
        penaltyPercent: p.perOpenCountException * openCount.length,
        drivingExceptionIds: ids(openCount),
      },
    ],
  });
  // Cutoff: per open cutoff exception.
  const openCutoff = openByRulePrefix("CUT-");
  scores.set("CUTOFF", {
    score: clamp(100 - p.perOpenCutoffException * openCutoff.length),
    basis:
      "Starts at 100 and loses a fixed amount for EACH open cutoff finding. Cutoff scales for the same reason count does, at twice the rate: a period-attribution question is unresolved in both directions until it is answered.",
    terms: [
      {
        rule: `Each open CUT- exception: −${p.perOpenCutoffException} points`,
        observed:
          openCutoff.length === 0
            ? "No cutoff exception is open."
            : `${openCutoff.length} open: ${ids(openCutoff).join(", ")}`,
        penaltyPercent: p.perOpenCutoffException * openCutoff.length,
        drivingExceptionIds: ids(openCutoff),
      },
    ],
  });
  // Ownership: one tier while any open rights/obligations determination exists.
  const openOwnership = openWith((e) =>
    e.finding.assertions.includes("RIGHTS_AND_OBLIGATIONS"),
  );
  scores.set("OWNERSHIP", {
    score: clamp(100 - (openOwnership.length > 0 ? p.openOwnershipDetermination : 0)),
    basis:
      "A tier, not a count: the penalty applies once while ANY rights-and-obligations determination is open. A second open determination does not make ownership twice as unresolved.",
    terms: [
      tier(
        `Any open rights-and-obligations determination: −${p.openOwnershipDetermination} points, once`,
        openOwnership,
        p.openOwnershipDetermination,
        "No open exception asserts rights and obligations.",
      ),
    ],
  });
  // Third party: one tier while any custodian confirmation is outstanding.
  const openThirdParty = openWith((e) => e.finding.ruleId === "TPI-CONF-001");
  scores.set("THIRD_PARTY", {
    score: clamp(100 - (openThirdParty.length > 0 ? p.outstandingThirdPartyConfirmation : 0)),
    basis:
      "A tier on the third-party confirmation control alone. It carries the heaviest single penalty in the policy because a custodian's confirmation is the only evidence the company cannot produce for itself.",
    terms: [
      tier(
        `Any outstanding TPI-CONF-001 confirmation: −${p.outstandingThirdPartyConfirmation} points, once`,
        openThirdParty,
        p.outstandingThirdPartyConfirmation,
        "No custodian confirmation is outstanding.",
      ),
    ],
  });
  // Valuation: one tier while any reserve remains undetermined.
  const openReserve = openWith(
    (e) => e.finding.attributes?.["reserve"] === "UNDETERMINED",
  );
  scores.set("VALUATION", {
    score: clamp(100 - (openReserve.length > 0 ? p.undeterminedReserve : 0)),
    basis:
      "A tier while any open finding still carries an undetermined reserve. It measures whether management has concluded, never what the reserve should be — nothing in this product computes a reserve amount.",
    terms: [
      tier(
        `Any open finding with an undetermined reserve: −${p.undeterminedReserve} points, once`,
        openReserve,
        p.undeterminedReserve,
        "No open finding carries an undetermined reserve.",
      ),
    ],
  });
  // Exceptions: resolved share of all designed exceptions, in hundredths.
  const resolvedCount = exceptions.length - open.length;
  scores.set("EXCEPTIONS", {
    score:
      exceptions.length === 0
        ? 10000
        : Math.round((resolvedCount / exceptions.length) * 10000),
    basis:
      "A ratio rather than a penalty: exceptions resolved over exceptions raised. It does not start at 100 and it never reaches 100 while anything is open.",
    terms: [
      {
        rule: "Exceptions resolved ÷ exceptions raised",
        observed:
          exceptions.length === 0
            ? "No exception was raised."
            : `${resolvedCount} of ${exceptions.length} resolved; ${open.length} open: ${ids(open).join(", ")}`,
        penaltyPercent: 0,
        drivingExceptionIds: ids(open),
      },
    ],
  });
  // Adjustments: proposals completed over GL-side items identified.
  const identified = reconciliation.items.length;
  scores.set("ADJUSTMENTS", {
    score:
      identified === 0
        ? 10000
        : Math.round((proposedAdjustmentCount / identified) * 10000),
    basis:
      "A ratio: entries drafted over reconciling items identified. Identified is not drafted and drafted is not posted — this measures the middle step only, and nothing in this product posts.",
    terms: [
      {
        rule: "Entries drafted ÷ reconciling items identified",
        observed:
          identified === 0
            ? "No reconciling item was identified."
            : `${proposedAdjustmentCount} drafted of ${identified} identified`,
        penaltyPercent: 0,
        // Deliberately empty. This computation is handed a COUNT of drafted
        // entries, not the entries themselves, so it cannot say WHICH item
        // is undrafted — and naming one by position would be a claim the
        // arithmetic does not support. The adjustment register answers that
        // question, keyed on the items themselves.
        drivingExceptionIds: [],
      },
    ],
  });

  return scores;
}

export function computeReadiness(
  exceptions: readonly DerivedException[],
  reconciliation: ReconciliationOut,
  proposedAdjustmentCount: number,
  policy: ClosePolicy,
): ReadinessOut {
  const scores = deriveScores(exceptions, reconciliation, proposedAdjustmentCount, policy);

  const categories: ReadinessCategoryOut[] = policy.readinessCategories.map((c) => ({
    key: c.key,
    label: c.label,
    weightPercent: c.weightPercent,
    scoreHundredths: scores.get(c.key)?.score ?? 0,
  }));

  // Integer half-up rounding: sum(weight x hundredths) is exact; dividing
  // by 100 yields basis points (weights sum to 100).
  const weightedSum = categories.reduce(
    (sum, c) => sum + c.weightPercent * c.scoreHundredths,
    0,
  );
  const totalBasisPoints = Math.floor((weightedSum + 50) / 100);

  return { categories, totalBasisPoints, policyVersion: policy.version };
}

/**
 * The same computation, reported term by term.
 *
 * It shares `deriveScores` with `computeReadiness` rather than repeating it,
 * so a surface explaining why readiness is what it is reads the arithmetic
 * the close actually performed. The returned shape is deliberately NOT part
 * of `CloseRunResult`: the run's output is hashed, and an explanation is a
 * projection over the run, not an input to it.
 */
export function explainReadiness(
  exceptions: readonly DerivedException[],
  reconciliation: ReconciliationOut,
  proposedAdjustmentCount: number,
  policy: ClosePolicy,
): ReadinessExplanationOut {
  const scores = deriveScores(exceptions, reconciliation, proposedAdjustmentCount, policy);

  const categories: ReadinessCategoryExplanationOut[] = policy.readinessCategories.map(
    (c) => {
      const derived = scores.get(c.key);
      const scoreHundredths = derived?.score ?? 0;
      return {
        key: c.key,
        label: c.label,
        weightPercent: c.weightPercent,
        scoreHundredths,
        basis: derived?.basis ?? "",
        terms: derived?.terms ?? [],
        weightedContribution: c.weightPercent * scoreHundredths,
      };
    },
  );

  const weightedSum = categories.reduce((sum, c) => sum + c.weightedContribution, 0);
  return {
    categories,
    weightedSum,
    totalBasisPoints: Math.floor((weightedSum + 50) / 100),
    roundingRule:
      "Each category's score in hundredths of a percent is multiplied by its integer weight and the products are summed exactly. The weights total 100, so dividing by 100 gives basis points; the division rounds half up.",
    policyVersion: policy.version,
    weightPercentTotal: policy.readinessCategories.reduce(
      (sum, c) => sum + c.weightPercent,
      0,
    ),
  };
}
