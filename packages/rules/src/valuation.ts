import { daysBetween, isoDate } from "@icg/domain";
import type { CloseInput } from "./engine/input.js";
import type { DerivedException } from "./exceptions.js";
import type { ClosePolicy } from "./policy.js";

/**
 * The valuation workspace (prompt 07): aging, the valuation-review
 * population, damage/RMA holdings, and the reserve position.
 *
 * The reserve conclusion is the point of this surface. VAL-EO-001 identifies
 * a review; it never computes an amount. `proposedReserveCents` therefore
 * does not exist here — the conclusion is `UNDETERMINED` and stays that way
 * until a human records one. The 1290 credit balance already on the GL is a
 * separate, recorded fact and is reported as such, never as this period's
 * conclusion.
 */

export interface AgingBucketOut {
  readonly key: string;
  readonly label: string;
  /** Inclusive lower bound in days since last movement; null for unknown. */
  readonly fromDays: number | null;
  readonly toDays: number | null;
  readonly units: number;
  readonly carryingCents: number;
}

export interface ValuationPopulationOut {
  readonly key: string;
  readonly label: string;
  readonly basis: string;
  readonly units: number;
  readonly carryingCents: number;
}

export interface DamagedUnitOut {
  readonly serial: string;
  readonly sku: string;
  readonly carryingCents: number;
  readonly rmaId?: string;
  readonly reason?: string;
  readonly exceptionId?: string;
}

export interface ValuationOut {
  readonly asOf: string;
  readonly slowMovingAgeDays: number;
  readonly aging: readonly AgingBucketOut[];
  /** Units whose age cannot be established — missing evidence, not "fresh". */
  readonly unknownAgeUnits: number;
  readonly unknownAgeCarryingCents: number;
  readonly populations: readonly ValuationPopulationOut[];
  readonly damaged: readonly DamagedUnitOut[];
  readonly reserve: {
    /** The 1290 balance already recorded in the GL, integer cents. */
    readonly recordedCents: number;
    /** Never a number. The rules identify a review; management concludes. */
    readonly conclusion: "UNDETERMINED";
    readonly conclusionNote: string;
    /** Exceptions whose reserve attribute is undetermined. */
    readonly openReviews: readonly {
      readonly exceptionId: string;
      readonly title: string;
      readonly exposureCents: number;
      readonly status: string;
      readonly skus: readonly string[];
      readonly units: number;
    }[];
  };
}

const BUCKETS: readonly { key: string; label: string; from: number; to: number | null }[] = [
  { key: "0_90", label: "0–90 days", from: 0, to: 90 },
  { key: "91_180", label: "91–180 days", from: 91, to: 180 },
  { key: "181_365", label: "181–365 days", from: 181, to: 365 },
  { key: "366_PLUS", label: "366+ days", from: 366, to: null },
];

export function buildValuation(
  input: CloseInput,
  exceptions: readonly DerivedException[],
  policy: ClosePolicy,
): ValuationOut {
  const tally = new Map<string, { units: number; carryingCents: number }>();
  for (const b of BUCKETS) tally.set(b.key, { units: 0, carryingCents: 0 });
  let unknownAgeUnits = 0;
  let unknownAgeCarryingCents = 0;

  for (const unit of input.inventoryUnits) {
    if (unit.lastMovementAt === undefined) {
      unknownAgeUnits += 1;
      unknownAgeCarryingCents += unit.unitCostCents;
      continue;
    }
    const age = daysBetween(isoDate(unit.lastMovementAt), isoDate(input.asOf));
    const bucket =
      BUCKETS.find((b) => age >= b.from && (b.to === null || age <= b.to)) ??
      // Ages before the first bucket's floor (a movement dated after the
      // balance-sheet date) belong to the youngest bucket, not to nothing.
      BUCKETS[0];
    if (bucket === undefined) continue;
    const entry = tally.get(bucket.key);
    if (entry === undefined) continue;
    entry.units += 1;
    entry.carryingCents += unit.unitCostCents;
  }

  const aging: AgingBucketOut[] = BUCKETS.map((b) => ({
    key: b.key,
    label: b.label,
    fromDays: b.from,
    toDays: b.to,
    units: tally.get(b.key)?.units ?? 0,
    carryingCents: tally.get(b.key)?.carryingCents ?? 0,
  }));

  const byClassification = (classification: string) =>
    input.inventoryUnits.filter((u) => u.classification === classification);
  const population = (
    key: string,
    label: string,
    basis: string,
    units: readonly { unitCostCents: number }[],
  ): ValuationPopulationOut => ({
    key,
    label,
    basis,
    units: units.length,
    carryingCents: units.reduce((sum, u) => sum + u.unitCostCents, 0),
  });

  const populations: ValuationPopulationOut[] = [
    population(
      "VALUATION_REVIEW",
      "Valuation review",
      "Classified for valuation review in the inventory listing",
      byClassification("VALUATION_REVIEW"),
    ),
    population(
      "DAMAGED",
      "Damaged",
      "Classified damaged in the inventory listing",
      byClassification("DAMAGED"),
    ),
    population(
      "RMA",
      "RMA / returns",
      "Classified RMA in the inventory listing",
      byClassification("RMA"),
    ),
    population(
      "DEMO",
      "Demo",
      "Classified demo in the inventory listing",
      byClassification("DEMO"),
    ),
    population(
      "LOANER",
      "Loaner",
      "Classified loaner in the inventory listing",
      byClassification("LOANER"),
    ),
    population(
      "SLOW_MOVING",
      `No movement ${policy.slowMovingAgeDays}+ days`,
      "Derived from last-movement dates against the policy threshold",
      input.inventoryUnits.filter(
        (u) =>
          u.lastMovementAt !== undefined &&
          daysBetween(isoDate(u.lastMovementAt), isoDate(input.asOf)) >=
            policy.slowMovingAgeDays,
      ),
    ),
  ];

  const damaged: DamagedUnitOut[] = input.inventoryUnits
    .filter((u) => u.location === "DAMAGED_HOLD")
    .map((u) => {
      const rma = input.rmaRecords.find((r) => r.serial === u.serial);
      const exception = exceptions.find((e) =>
        e.finding.subjects.serials?.includes(u.serial),
      );
      return {
        serial: u.serial,
        sku: u.sku,
        carryingCents: u.unitCostCents,
        ...(rma !== undefined ? { rmaId: rma.id, reason: rma.reason } : {}),
        ...(exception !== undefined ? { exceptionId: exception.id } : {}),
      };
    })
    .sort((a, b) => (a.serial < b.serial ? -1 : 1));

  const openReviews = exceptions
    .filter((e) => e.finding.attributes?.["reserve"] === "UNDETERMINED")
    .map((e) => {
      const skus = e.finding.subjects.skus ?? [];
      return {
        exceptionId: e.id,
        title: e.finding.title,
        exposureCents: e.finding.exposureCents,
        status: e.status,
        skus,
        // The units the finding actually covers — the AGED holdings of
        // those SKUs, matching the rule's own population. Counting every
        // unit of the SKU would report stock the exception never flagged.
        units: input.inventoryUnits.filter(
          (u) =>
            skus.includes(u.sku) &&
            u.lastMovementAt !== undefined &&
            daysBetween(isoDate(u.lastMovementAt), isoDate(input.asOf)) >=
              policy.slowMovingAgeDays,
        ).length,
      };
    })
    .sort((a, b) => (a.exceptionId < b.exceptionId ? -1 : 1));

  return {
    asOf: input.asOf,
    slowMovingAgeDays: policy.slowMovingAgeDays,
    aging,
    unknownAgeUnits,
    unknownAgeCarryingCents,
    populations,
    damaged,
    reserve: {
      recordedCents:
        input.glBalances.find((b) => b.account === "1290")?.amountCents ?? 0,
      conclusion: "UNDETERMINED",
      conclusionNote:
        "The rules identify a valuation review. No reserve amount is proposed by any rule, model, or assistant — management records the conclusion.",
      openReviews,
    },
  };
}
