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

export function computeReadiness(
  exceptions: readonly DerivedException[],
  reconciliation: ReconciliationOut,
  proposedAdjustmentCount: number,
  policy: ClosePolicy,
): ReadinessOut {
  const open = exceptions.filter((e) => !isResolvedStatus(e.status));
  const p = policy.readinessPenalties;
  const clamp = (percent: number) => Math.max(0, Math.min(100, percent)) * 100;

  const openByRulePrefix = (prefix: string) =>
    open.filter((e) => e.finding.ruleId.startsWith(prefix)).length;
  const anyOpenWith = (predicate: (e: DerivedException) => boolean) =>
    open.some(predicate);

  const scores = new Map<string, number>();
  // Population / GL: penalized while the GL difference is unadjusted.
  scores.set(
    "POPULATION_GL",
    clamp(100 - (reconciliation.differenceCents !== 0 ? p.unadjustedGlDifference : 0)),
  );
  // Physical count: per open count-family exception.
  scores.set(
    "PHYSICAL_COUNT",
    clamp(100 - p.perOpenCountException * openByRulePrefix("CNT-")),
  );
  // Cutoff: per open cutoff exception.
  scores.set("CUTOFF", clamp(100 - p.perOpenCutoffException * openByRulePrefix("CUT-")));
  // Ownership: one tier while any open rights/obligations determination exists.
  scores.set(
    "OWNERSHIP",
    clamp(
      100 -
        (anyOpenWith((e) => e.finding.assertions.includes("RIGHTS_AND_OBLIGATIONS"))
          ? p.openOwnershipDetermination
          : 0),
    ),
  );
  // Third party: one tier while any custodian confirmation is outstanding.
  scores.set(
    "THIRD_PARTY",
    clamp(
      100 -
        (anyOpenWith((e) => e.finding.ruleId === "TPI-CONF-001")
          ? p.outstandingThirdPartyConfirmation
          : 0),
    ),
  );
  // Valuation: one tier while any reserve remains undetermined.
  scores.set(
    "VALUATION",
    clamp(
      100 -
        (anyOpenWith((e) => e.finding.attributes?.["reserve"] === "UNDETERMINED")
          ? p.undeterminedReserve
          : 0),
    ),
  );
  // Exceptions: resolved share of all designed exceptions, in hundredths.
  const resolvedCount = exceptions.length - open.length;
  scores.set(
    "EXCEPTIONS",
    exceptions.length === 0
      ? 10000
      : Math.round((resolvedCount / exceptions.length) * 10000),
  );
  // Adjustments: proposals completed over GL-side items identified.
  const identified = reconciliation.items.length;
  scores.set(
    "ADJUSTMENTS",
    identified === 0 ? 10000 : Math.round((proposedAdjustmentCount / identified) * 10000),
  );

  const categories: ReadinessCategoryOut[] = policy.readinessCategories.map((c) => ({
    key: c.key,
    label: c.label,
    weightPercent: c.weightPercent,
    scoreHundredths: scores.get(c.key) ?? 0,
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
