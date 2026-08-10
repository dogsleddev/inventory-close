import type { DemoUser } from "@icg/data";
import type { ExceptionView } from "@icg/services";
import { formatCents } from "../format";
import type { ExceptionDrawerData, ValuationData } from "../view-model";
import { statusView } from "../workflow-view";
import { attempt } from "./data";
import { assembleDrawer, gatherExceptionContext } from "./exception-view";
import { getQueries, makeContext, roleLabel } from "./workspace";

/**
 * Valuation (stage 07) — aging, the review populations, damage/RMA, and the
 * reserve position.
 *
 * The screen exists to hold one line: the reserve conclusion is
 * UNDETERMINED. No figure on this page is a proposed reserve, and there is
 * no control that would record one — VAL-EO-001 identifies a review, and
 * management concludes. The 1290 credit already on the GL is reported as a
 * recorded balance, never as this period's conclusion.
 */
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
      damaged: { rows: [], empty: null },
      drawers: {},
    };
  }

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
          drawerId: drawerFor(view),
        };
      }),
      empty:
        valuation.damaged.length === 0
          ? "No units sit in the damaged/hold area — checked against the inventory listing, not assumed."
          : null,
    },
    drawers,
  };
}
