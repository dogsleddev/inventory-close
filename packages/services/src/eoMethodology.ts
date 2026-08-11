import { authorize } from "@icg/permissions";
import type { ServiceContext } from "./queries.js";
import type { Workspace } from "./workspace.js";

/**
 * Excess & obsolete methodology (COMPLETION_PLAN Stage E) — how the close
 * looks at slow-moving stock, and what it does NOT know.
 *
 * `/valuation` already reports the close's conclusion: UNDETERMINED, with the
 * recorded 1290 balance beside it. This module reports the METHOD behind that
 * — the signals a Controller would weigh, on both the sides where evidence
 * exists and the sides where it does not.
 *
 * It is a projection. It changes no rule, resolves no review, and touches
 * nothing `buildValuation` produces. `VAL-EO-001` remains the only thing that
 * can raise a valuation exception, and the reserve conclusion remains
 * management's.
 *
 * ## The line this module must not cross
 *
 * **Nothing here may become a reserve.** Not a rate, not a range, not an
 * indicative amount, not a recovery percentage applied to anything on the
 * book. The product's central claim is that no rule, model or assistant
 * proposes a reserve amount, and the E&O page is precisely where that claim
 * is easiest to break by accident.
 *
 * Two figures in here are genuinely dangerous and are handled deliberately:
 *
 * - **Excess over the forecast horizon.** It is arithmetic — units on hand
 *   beyond a whole 12-month forecast — and it is an order of magnitude larger
 *   than the population the rule actually flags. It is reported as the
 *   CARRYING VALUE of a population, in its own field, never as an exposure
 *   and never beside the reserve. `recoveryBasisOnFile` is permanently false
 *   and travels with it: no recovery rate has been applied to that value
 *   because none is on file.
 * - **Realized recovery on FY2026 disposals.** Each disposal's own realized
 *   proceeds are a historical fact and are reported per record by
 *   `ownership.ts`. A BLENDED rate across them, applied to stock still on the
 *   book, would be a reserve by another name — so this module does not
 *   compute one, and nothing here should start.
 *
 * ## The authored judgement, held once and stated
 *
 * Converting a 12-month forecast total into a monthly rate assumes demand
 * arrives evenly across the horizon. That is an assumption, not a fact the
 * dataset carries, so it is named in `MONTHS_OF_SUPPLY_BASIS` and travels to
 * the surface with the figure it produces.
 */

/**
 * The one authored assumption in this module. Held here with its basis rather
 * than in a fixture: an assumption a reader may disagree with should not
 * require regenerating a dataset to argue with.
 */
export const MONTHS_OF_SUPPLY_ASSUMPTION =
  "Demand is assumed to arrive ratably across the forecast horizon";

/**
 * Composed from the assumption rather than restating it, so the register's
 * answer and this basis cannot drift apart: the surface READS the assumption
 * out of here, and the sentence a reader checks it against contains the very
 * same words.
 */
export const MONTHS_OF_SUPPLY_BASIS =
  "Months of supply divides units on hand by the forecast's own monthly rate — the 12-month forecast spread evenly across its horizon. " +
  MONTHS_OF_SUPPLY_ASSUMPTION +
  " because the forecast records a horizon total and no monthly profile; a seasonal profile would move these figures and the close does not hold one.";

/** Where the aging clock starts. The policy's basis, and the alternative. */
export type AgingBasis = "LAST_MOVEMENT" | "ACQUISITION";

export interface EoSignalRowOut {
  readonly sku: string;
  readonly description: string;
  readonly onHandUnits: number;
  readonly carryingCents: number;
  /** Units at or beyond the policy threshold, on the policy's own basis. */
  readonly agedUnits: number;
  readonly agedCarryingCents: number;
  /** Absent when the SKU has no forecast — a stated absence, never a zero. */
  readonly forecastUnits?: number | undefined;
  readonly horizonMonths?: number | undefined;
  /** The forecast's own note, verbatim, where it carries one. */
  readonly forecastNote?: string | undefined;
  /** Undefined when there is no forecast, or the forecast rate is zero. */
  readonly monthsOfSupply?: number | undefined;
  /** Units held beyond the WHOLE forecast horizon. */
  readonly excessOverHorizonUnits: number;
  readonly excessOverHorizonCents: number;
  /** Whether this SKU met the age half of the rule's test. */
  readonly metAgeTest: boolean;
  /** Whether aged units exceed the forecast — the rule's second condition. */
  readonly metForecastTest: boolean;
  /**
   * Whether the close actually raised a review for this SKU. Read from the
   * exception population, NOT by re-deciding the rule's predicate here — a
   * projection that re-implements a rule is a second rule.
   */
  readonly underReview: boolean;
}

export interface AgingBasisOut {
  readonly policyBasis: AgingBasis;
  readonly thresholdDays: number;
  readonly unitsWithMovementDate: number;
  readonly unitsWithoutMovementDate: number;
  /** Units aged past the threshold on the policy's basis. */
  readonly agedOnPolicyBasis: number;
  /** The same threshold measured from acquisition instead. */
  readonly agedOnAcquisitionBasis: number;
  readonly unitsWithoutAcquisitionDate: number;
  /**
   * Whether every unit carries the date the policy basis needs. False means
   * the aged population is a floor, not a measurement.
   */
  readonly ageBasisComplete: boolean;
}

export interface ConditionEvidenceOut {
  /** Units with any recorded condition narrative at all. */
  readonly unitsWithConditionRecord: number;
  readonly unitsWithoutConditionRecord: number;
  /** Where the little condition evidence there is comes from. */
  readonly source: string;
  /** Distinct reasons recorded, so the coverage is legible. */
  readonly recordedReasons: readonly string[];
  /**
   * Whether condition is established for the book. Permanently false here,
   * and the surface says so rather than leaving a column blank.
   */
  readonly conditionBasisOnFile: boolean;
}

export interface RecoveryEvidenceOut {
  /** SKUs with an observed FY2026 selling price on a sales order. */
  readonly skusWithObservedPrice: number;
  /** SKUs with none — named, because a blank cell asserts a price of zero. */
  readonly skusWithoutObservedPrice: readonly string[];
  /**
   * Whether costs to complete and sell are on file anywhere. They are not, so
   * net realisable value cannot be computed and this module does not.
   */
  readonly costsToSellOnFile: boolean;
  readonly nrvComputed: false;
  /**
   * Whether a recovery basis exists for stock still on the book. Permanently
   * false: FY2026 disposals realised what they realised, and extrapolating
   * that to units still on hand would be a reserve nobody concluded.
   */
  readonly recoveryBasisOnFile: boolean;
}

export interface EoMethodologyOut {
  readonly asOf: string;
  readonly basisNote: string;
  readonly signals: readonly EoSignalRowOut[];
  readonly agingBasis: AgingBasisOut;
  readonly condition: ConditionEvidenceOut;
  readonly recovery: RecoveryEvidenceOut;
  /** Book units against the total the forecasts carry. */
  readonly onHandUnits: number;
  readonly forecastUnitsTotal: number;
  /** Whether every SKU on the book carries a forecast. */
  readonly demandCoverageComplete: boolean;
  readonly skusWithoutForecast: readonly string[];
  /** Units beyond a whole horizon, across every SKU. */
  readonly excessOverHorizonUnits: number;
  /**
   * What those units are CARRIED at. Not an exposure, not a proposed
   * write-down, and not comparable with the reserve — see the module note.
   */
  readonly excessOverHorizonCents: number;
  /** SKUs the close actually raised a valuation review for. */
  readonly skusUnderReview: readonly string[];
}

/** Whole days between an ISO date and the balance-sheet date, on UTC. */
function daysBefore(from: string, asOf: string): number {
  const ms = Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export function getEoMethodology(ws: Workspace, ctx: ServiceContext): EoMethodologyOut {
  authorize(ctx.user, "close.read");

  const asOf = ws.close.reconciliation.asOf;
  const thresholdDays = ws.close.valuation.slowMovingAgeDays;

  const forecastBySku = new Map(ws.dataset.forecasts.map((f) => [f.sku, f]));
  const skuMeta = new Map(ws.dataset.skus.map((s) => [s.code, s]));

  // Which SKUs the close raised a valuation review for, read off the
  // exceptions rather than re-decided here.
  const skusUnderReview = [
    ...new Set(
      ws.close.exceptions
        .filter((e) => e.finding.attributes?.["reserve"] === "UNDETERMINED")
        .flatMap((e) => e.finding.subjects.skus ?? []),
    ),
  ].sort();
  const underReview = new Set(skusUnderReview);

  let unitsWithMovementDate = 0;
  let unitsWithoutMovementDate = 0;
  let unitsWithoutAcquisitionDate = 0;
  let agedOnPolicyBasis = 0;
  let agedOnAcquisitionBasis = 0;

  const bySku = new Map<
    string,
    { units: number; cents: number; aged: number; agedCents: number }
  >();

  for (const unit of ws.dataset.inventoryUnits) {
    let bucket = bySku.get(unit.sku);
    if (bucket === undefined) {
      bucket = { units: 0, cents: 0, aged: 0, agedCents: 0 };
      bySku.set(unit.sku, bucket);
    }
    bucket.units += 1;
    bucket.cents += unit.unitCostCents;

    // The policy basis, computed from the unit population against the policy
    // threshold. Deliberately NOT read off the valuation aging's 366+ band:
    // that band is `>= 366` while the policy is `>= 365`, and the two agree
    // on this dataset only because no unit is aged exactly 365 days. Reading
    // the band would produce the same number from the wrong source.
    if (unit.lastMovementAt === undefined) {
      unitsWithoutMovementDate += 1;
    } else {
      unitsWithMovementDate += 1;
      if (daysBefore(unit.lastMovementAt, asOf) >= thresholdDays) {
        agedOnPolicyBasis += 1;
        bucket.aged += 1;
        bucket.agedCents += unit.unitCostCents;
      }
    }

    if (unit.acquiredAt === undefined) unitsWithoutAcquisitionDate += 1;
    else if (daysBefore(unit.acquiredAt, asOf) >= thresholdDays) {
      agedOnAcquisitionBasis += 1;
    }
  }

  const signals: EoSignalRowOut[] = [...bySku.entries()]
    .map(([sku, b]) => {
      const forecast = forecastBySku.get(sku);
      const forecastUnits = forecast?.forecastUnits;
      const horizonMonths = forecast?.horizonMonths;
      const monthlyRate =
        forecastUnits !== undefined && horizonMonths !== undefined && horizonMonths > 0
          ? forecastUnits / horizonMonths
          : undefined;
      const excessUnits =
        forecastUnits === undefined ? 0 : Math.max(0, b.units - forecastUnits);
      const unitCost = skuMeta.get(sku)?.unitCostCents ?? 0;
      return {
        sku,
        description: skuMeta.get(sku)?.description ?? sku,
        onHandUnits: b.units,
        carryingCents: b.cents,
        agedUnits: b.aged,
        agedCarryingCents: b.agedCents,
        ...(forecastUnits !== undefined ? { forecastUnits } : {}),
        ...(horizonMonths !== undefined ? { horizonMonths } : {}),
        ...(forecast?.note !== undefined ? { forecastNote: forecast.note } : {}),
        ...(monthlyRate !== undefined && monthlyRate > 0
          ? { monthsOfSupply: b.units / monthlyRate }
          : {}),
        excessOverHorizonUnits: excessUnits,
        excessOverHorizonCents: excessUnits * unitCost,
        metAgeTest: b.aged > 0,
        metForecastTest: forecastUnits !== undefined && b.aged > forecastUnits,
        underReview: underReview.has(sku),
      };
    })
    .sort((a, b) => b.excessOverHorizonCents - a.excessOverHorizonCents || (a.sku < b.sku ? -1 : 1));

  // Condition: the only condition narrative in the dataset is on returned
  // units. Counted over serials that are actually ON the book, so the figure
  // describes the population it is reported beside.
  const booked = new Set(ws.dataset.inventoryUnits.map((u) => u.serial));
  const bookedReturns = ws.dataset.rmaRecords.filter(
    (r) => r.serial !== undefined && booked.has(r.serial),
  );
  const conditionSerials = new Set(
    bookedReturns.map((r) => r.serial).filter((s): s is string => s !== undefined),
  );
  // Drawn from the SAME records the count above describes. Listing reasons
  // from every return record beside a count of the booked ones would let a
  // reader attribute a reason to a unit that is no longer on the book.
  const recordedReasons = [...new Set(bookedReturns.map((r) => r.reason))].sort();

  // Price evidence: an observed FY2026 selling price, per SKU. Reported as
  // coverage only — no margin, no recovery rate, no NRV is derived from it.
  const pricedSkus = new Set(
    ws.dataset.salesOrders.flatMap((so) =>
      so.lines.filter((l) => l.amountCents !== undefined).map((l) => l.sku),
    ),
  );
  const skusWithoutObservedPrice = [...bySku.keys()]
    .filter((s) => !pricedSkus.has(s))
    .sort();

  const skusWithoutForecast = [...bySku.keys()]
    .filter((s) => !forecastBySku.has(s))
    .sort();

  return {
    asOf,
    basisNote: MONTHS_OF_SUPPLY_BASIS,
    signals,
    agingBasis: {
      policyBasis: "LAST_MOVEMENT",
      thresholdDays,
      unitsWithMovementDate,
      unitsWithoutMovementDate,
      agedOnPolicyBasis,
      agedOnAcquisitionBasis,
      unitsWithoutAcquisitionDate,
      ageBasisComplete: unitsWithoutMovementDate === 0,
    },
    condition: {
      unitsWithConditionRecord: conditionSerials.size,
      unitsWithoutConditionRecord: booked.size - conditionSerials.size,
      source: "Return records only — a count corroborates that a unit exists, never what condition it is in.",
      recordedReasons,
      conditionBasisOnFile: false,
    },
    recovery: {
      skusWithObservedPrice: [...bySku.keys()].filter((s) => pricedSkus.has(s)).length,
      skusWithoutObservedPrice,
      costsToSellOnFile: false,
      nrvComputed: false,
      recoveryBasisOnFile: false,
    },
    onHandUnits: ws.dataset.inventoryUnits.length,
    forecastUnitsTotal: ws.dataset.forecasts.reduce((n, f) => n + f.forecastUnits, 0),
    demandCoverageComplete: skusWithoutForecast.length === 0,
    skusWithoutForecast,
    excessOverHorizonUnits: signals.reduce((n, s) => n + s.excessOverHorizonUnits, 0),
    excessOverHorizonCents: signals.reduce((n, s) => n + s.excessOverHorizonCents, 0),
    skusUnderReview,
  };
}
