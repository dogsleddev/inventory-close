import type { DemoUser } from "@icg/data";
import { getEoMethodology } from "@icg/services";
import type { EoMethodologyOut, ExceptionView } from "@icg/services";
import { formatCents } from "../format";
import type {
  EoMethodologyView,
  EoSignalRowView,
  ExceptionDrawerData,
  ProcurementStat,
  ValuationData,
} from "../view-model";
import { statusView } from "../workflow-view";
import { attempt } from "./data";
import { assembleDrawer, gatherExceptionContext } from "./exception-view";
import { getQueries, getWorkspace, makeContext, roleLabel } from "./workspace";

/**
 * Valuation (stage 07) — aging, the review populations, damage/RMA, and the
 * reserve position.
 *
 * The screen exists to hold one line: the reserve conclusion is
 * UNDETERMINED. No figure on this page is a proposed reserve, and there is
 * no control that would record one — VAL-EO-001 identifies a review, and
 * management concludes. The 1290 credit already on the GL is reported as a
 * recorded balance, never as this period's conclusion.
 *
 * Stage E appends the METHOD behind that conclusion: the signals a Controller
 * would weigh, on both the sides where evidence exists and the sides where it
 * does not. It changes nothing above it — `buildValuation` is untouched, the
 * aging bands are the same bands, and the conclusion is the same conclusion.
 *
 * The methodology block is deliberately placed AFTER the reserve position and
 * never inside it. It carries the largest money figure on the screen — the
 * carrying value of stock held beyond a whole forecast horizon — and that
 * figure is arithmetic about a population, not an exposure and not a
 * write-down. It travels with the statement that no recovery rate has been
 * applied to it, because none is on file.
 */

/** Unit counts group at workpaper scale; a bare 1500 reads as an id. */
const units = (n: number): string => n.toLocaleString("en-US");

/** Formats the E&O methodology block. Labels only; nothing is summed here. */
function buildMethodology(eo: EoMethodologyOut): EoMethodologyView {
  const stats: ProcurementStat[] = [
    {
      label: "SLOW-MOVING BY POLICY",
      value: units(eo.agingBasis.agedOnPolicyBasis),
      note: `Units last moved ${eo.agingBasis.thresholdDays}+ days before the balance-sheet date.`,
      ember: false,
    },
    {
      label: "12-MONTH FORECAST",
      value: units(eo.forecastUnitsTotal),
      note: `Units of demand recorded against ${units(eo.onHandUnits)} on hand.`,
      ember: false,
    },
    {
      label: "BEYOND THE HORIZON",
      value: units(eo.excessOverHorizonUnits),
      note: "Units on hand above their SKU's whole 12-month forecast.",
      ember: false,
    },
    {
      label: "SKUS UNDER REVIEW",
      value: String(eo.skusUnderReview.length),
      note:
        eo.skusUnderReview.length === 0
          ? "No SKU met both halves of the policy test."
          : `${eo.skusUnderReview.join(", ")} — met both halves of the policy test.`,
      ember: eo.skusUnderReview.length > 0,
    },
  ];

  const signals: EoSignalRowView[] = eo.signals.map((s) => ({
    sku: s.sku,
    description: s.description,
    onHand: units(s.onHandUnits),
    aged: units(s.agedUnits),
    // An absent forecast is stated. A blank cell here would read as no demand.
    forecast:
      s.forecastUnits === undefined ? "No forecast on file" : units(s.forecastUnits),
    monthsOfSupply:
      s.monthsOfSupply === undefined
        ? "Not derivable"
        : `${s.monthsOfSupply.toFixed(1)} months`,
    excessUnits: units(s.excessOverHorizonUnits),
    excessCarrying: formatCents(s.excessOverHorizonCents),
    ageTest: s.metAgeTest ? "Met" : "Not met",
    forecastTest: s.metForecastTest ? "Met" : "Not met",
    underReview: s.underReview,
    note: s.forecastNote ?? null,
  }));

  return {
    stats,
    signals,
    basisNote: eo.basisNote,
    excessNote:
      "Units beyond the horizon are counted at what they are CARRIED at. That is not an exposure, not a proposed write-down, and not comparable with the recorded reserve above: no recovery rate has been applied to it, because none is on file. It is also a wider population than the policy test selects — the gap between the two is the methodology, not an error.",
    agingBasis: [
      { k: "Policy basis", v: "Last movement to the balance-sheet date" },
      { k: "Threshold", v: `${eo.agingBasis.thresholdDays} days` },
      {
        k: "Units aged on that basis",
        v: units(eo.agingBasis.agedOnPolicyBasis),
      },
      {
        k: "Units aged measured from acquisition instead",
        v: units(eo.agingBasis.agedOnAcquisitionBasis),
      },
      {
        k: "Units with no last-movement date",
        v: String(eo.agingBasis.unitsWithoutMovementDate),
      },
      {
        k: "Units with no acquisition date",
        v: String(eo.agingBasis.unitsWithoutAcquisitionDate),
      },
    ],
    agingNote: eo.agingBasis.ageBasisComplete
      ? "Every unit carries the date the policy basis needs, so the aged population is a measurement rather than a floor. The acquisition figure beside it is the same threshold on a different clock — disclosed because the choice of clock is what makes the aged population the size it is, and it is a choice, not a fact."
      : `${eo.agingBasis.unitsWithoutMovementDate} units carry no last-movement date, so the aged population above is a floor rather than a measurement: a unit whose age cannot be established is not a fresh one.`,
    condition: [
      {
        k: "Units with a condition record",
        v: units(eo.condition.unitsWithConditionRecord),
      },
      {
        k: "Units with none",
        v: units(eo.condition.unitsWithoutConditionRecord),
      },
      { k: "Source", v: eo.condition.source },
      {
        k: "Reasons recorded",
        v:
          eo.condition.recordedReasons.length === 0
            ? "None"
            : eo.condition.recordedReasons.join(" · "),
      },
    ],
    conditionNote:
      "Condition is the leg of the method the close does not have. It is stated rather than left blank: a count corroborates that a unit exists and where it is, never what state it is in, so for the great majority of the book there is no condition evidence at all.",
    recovery: [
      {
        k: "SKUs with an observed FY2026 selling price",
        v: String(eo.recovery.skusWithObservedPrice),
      },
      {
        k: "SKUs with none",
        v:
          eo.recovery.skusWithoutObservedPrice.length === 0
            ? "None"
            : eo.recovery.skusWithoutObservedPrice.join(", "),
      },
      { k: "Costs to complete and sell", v: "Not on file" },
      { k: "Net realisable value", v: "Not computed" },
    ],
    recoveryNote:
      "Net realisable value needs a selling price and the costs to complete and sell it. The second is not on file for any SKU, so no net realisable value is computed here and no recovery rate is applied to anything on the listing. What FY2026 disposals actually realised is reported under Custody & Disposition, as history about those units — not as an indication for these.",
  };
}

export function buildValuationData(
  user: DemoUser,
  correlationId: string,
): ValuationData {
  const queries = getQueries();
  const ctx = makeContext(user, correlationId);
  const role = roleLabel(user);

  const valuation = attempt(() => queries.getValuation(ctx));
  if (valuation === undefined) {
    return {
      restricted: true,
      roleLabel: role,
      reserve: null,
      aging: null,
      populations: [],
      damaged: { rows: [], note: "", empty: null },
      methodology: null,
      drawers: {},
    };
  }

  const eo = attempt(() => getEoMethodology(getWorkspace(), ctx));

  const exceptions = attempt(() => queries.listExceptions(ctx)) ?? [];
  const blockers = attempt(() => queries.getBlockers(ctx)) ?? [];
  const blockerIds = new Set(blockers.map((b) => b.exceptionId));

  const drawers: Record<string, ExceptionDrawerData> = {};
  const drawerFor = (view: ExceptionView | undefined): string | null => {
    if (view === undefined) return null;
    const id = view.exception.id;
    drawers[id] ??= assembleDrawer(
      gatherExceptionContext(queries, ctx, view),
      blockerIds.has(id),
    );
    return id;
  };

  // The widest bucket sets the bar scale; a bar is a relative width, never a
  // second way of stating the number beside it.
  const widest = Math.max(...valuation.aging.map((b) => b.carryingCents), 1);

  return {
    restricted: false,
    roleLabel: role,
    reserve: {
      conclusion: valuation.reserve.conclusion,
      note: valuation.reserve.conclusionNote,
      recordedLabel: "Reserve already recorded (GL 1290)",
      recorded: formatCents(valuation.reserve.recordedCents),
      recordedNote:
        "A balance carried in the general ledger. It is not this period's conclusion and is not netted into any figure on the reconciliation bridge.",
      reviews: valuation.reserve.openReviews.map((review) => {
        const view = exceptions.find((e) => e.exception.id === review.exceptionId);
        return {
          id: review.exceptionId,
          title: review.title,
          exposure: formatCents(review.exposureCents),
          status: statusView(
            view?.exception.status ?? (review.status as never),
          ),
          detail:
            review.skus.length > 0
              ? `${review.units} aged ${review.skus.join(", ")} unit${review.units === 1 ? "" : "s"} — carrying value under review, not a reserve.`
              : "Carrying value under review, not a reserve.",
          drawerId: drawerFor(view),
        };
      }),
    },
    aging: {
      rows: valuation.aging.map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        units: String(bucket.units),
        carrying: formatCents(bucket.carryingCents),
        fillPct: Math.round((bucket.carryingCents / widest) * 100),
        aged:
          bucket.fromDays !== null && bucket.fromDays >= valuation.slowMovingAgeDays,
      })),
      // Missing aging evidence is a state, not an empty bucket.
      unknown:
        valuation.unknownAgeUnits > 0
          ? {
              units: String(valuation.unknownAgeUnits),
              carrying: formatCents(valuation.unknownAgeCarryingCents),
            }
          : null,
      note: `Age is measured from each unit's last movement to the balance-sheet date. Policy marks stock slow-moving at ${valuation.slowMovingAgeDays}+ days; that identifies a review population, and nothing more.`,
    },
    populations: valuation.populations.map((p) => ({
      key: p.key,
      label: p.label,
      basis: p.basis,
      units: String(p.units),
      carrying: formatCents(p.carryingCents),
    })),
    damaged: {
      // The population is selected by LOCATION alone, so no assessment state
      // may be asserted for it. Each row reports its own: a resolved
      // exception means the assessment concluded, and a unit VAL-DMG-001
      // never evaluated (no RMA record) has no assessment to report at all.
      rows: valuation.damaged.map((unit) => {
        const view =
          unit.exceptionId !== undefined
            ? exceptions.find((e) => e.exception.id === unit.exceptionId)
            : undefined;
        return {
          serial: unit.serial,
          sku: unit.sku,
          carrying: formatCents(unit.carryingCents),
          rma: unit.rmaId ?? "No RMA record",
          reason: unit.reason ?? "—",
          exceptionId: unit.exceptionId ?? null,
          assessment:
            view !== undefined ? statusView(view.exception.status) : null,
          assessmentNote:
            view !== undefined
              ? view.open
                ? "Assessment outstanding"
                : "Assessment concluded"
              : "No assessment on file",
          drawerId: drawerFor(view),
        };
      }),
      note: "Selected by location in the inventory listing. A unit appears here because of where it sits, not because an assessment is outstanding — each row states its own.",
      empty:
        valuation.damaged.length === 0
          ? "No units sit in the damaged/hold area — checked against the inventory listing, not assumed."
          : null,
    },
    methodology: eo === undefined ? null : buildMethodology(eo),
    drawers,
  };
}
