import type { ExceptionView } from "@icg/services";
import { conclusionLabel } from "../workflow-view";

/**
 * The adjustment register, read against the live close.
 *
 * The register is a RULES artifact: `entry.exceptionOpen` and
 * `entry.undraftedReason` are baked at close derivation
 * (`packages/rules/src/adjustments.ts:137,144,150`) and returned verbatim by
 * `queries.ts:954-957`. The rules package is frozen and correct — it is
 * reporting what was true when the close ran. What is not correct is a SCREEN
 * printing that sentence after management has concluded, because the sentence
 * is not a badge, it is an assertion:
 *
 *   "No entry drafted — EXC-015 has not reached a management conclusion."
 *
 * while /exceptions/EXC-015 says "Management concluded the item is supported
 * and no adjustment is required." One of those two is false, and the user is
 * the one who made it false.
 *
 * So the overlay happens here, at the view layer, where a live position may be
 * substituted for a baked one. Nothing in @icg/rules changes.
 *
 * `exceptions` MUST be the live list — `liveExceptionViews(queries, ctx)`.
 * Handing it `listExceptions` output makes every method below a slower way of
 * returning the baked value.
 */

/** As much of a register entry as the overlay needs to read. */
interface RegisterEntryLike {
  readonly exceptionId: string;
  readonly exceptionOpen: boolean;
  readonly undraftedReason?: string;
}

export interface LiveRegister {
  /** Whether the entry's exception is STILL open, counting conclusions. */
  isOpen(entry: RegisterEntryLike): boolean;
  /** How many entries are still waiting on a management conclusion. */
  openCount(entries: readonly RegisterEntryLike[]): number;
  /**
   * The undrafted reason, with a baked denial replaced by the live position.
   * Returns undefined exactly when the entry carried no reason (it has a
   * drafted proposal), so a caller's own fallback still applies.
   */
  undraftedReason(entry: RegisterEntryLike): string | undefined;
}

export function liveRegister(exceptions: readonly ExceptionView[]): LiveRegister {
  const byId = new Map(exceptions.map((e) => [e.exception.id, e]));
  const isOpen = (entry: RegisterEntryLike): boolean =>
    byId.get(entry.exceptionId)?.open ?? entry.exceptionOpen;

  return {
    isOpen,
    openCount: (entries) => entries.filter(isOpen).length,
    undraftedReason(entry) {
      if (entry.undraftedReason === undefined) return undefined;
      const view = byId.get(entry.exceptionId);
      // Still open, or not a row this projection knows: the rules' own
      // sentence is the true one and stays.
      if (view === undefined || view.open) return entry.undraftedReason;
      // Concluded. Both halves of the baked sentence are reported, but the
      // second half is now the live position rather than its negation — the
      // entry genuinely still has no draft, and saying so is not the defect.
      return `No entry drafted for ${entry.exceptionId}. Management's conclusion: ${conclusionLabel(view.exception.status)}.`;
    },
  };
}
