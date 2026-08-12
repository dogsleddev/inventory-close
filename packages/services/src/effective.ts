import { POLICY_V1, computeReadiness } from "@icg/rules";
import type { Workspace } from "./workspace.js";

/**
 * Effective close state: the derived close, plus what people have done to it
 * in this session.
 *
 * The rules produce a baseline from the dataset — that derivation is
 * reproducible, hashed, and never touched here. On top of it sit two human
 * acts: evidence somebody submitted, and conclusions somebody recorded. This
 * module answers "where does the close stand NOW", which is a different
 * question from "what did the rules find", and both have to remain
 * answerable.
 *
 * Nothing in here writes. `ws.close` is read-only to this module, so
 * Reset Demo restoring the baseline is guaranteed by construction rather
 * than by discipline.
 */

/**
 * Which requirements the rule asked for that are still unsatisfied.
 *
 * A requirement is satisfied either because the close derived it as
 * satisfied, or because someone has since submitted evidence against this
 * exception naming it. Submitted evidence is matched on the requirement it
 * was submitted FOR — never on kind or title, which would let an unrelated
 * upload silently answer a requirement it has nothing to do with.
 */
export function unmetRequirements(ws: Workspace, exceptionId: string): readonly string[] {
  const exception = ws.close.exceptions.find((e) => e.id === exceptionId);
  if (exception === undefined) return [];
  const satisfiedBySubmission = new Set(
    ws.submittedEvidence
      .filter((e) => e.satisfiesRequirement?.exceptionId === exceptionId)
      // Returned evidence does not satisfy anything: a reviewer sent it back.
      .filter((e) => e.reviewState !== "RETURNED")
      .map((e) => e.satisfiesRequirement?.requirement),
  );
  return exception.finding.evidenceRequirements
    .filter((r) => r.required && !r.satisfied)
    .map((r) => r.description)
    .filter((description) => !satisfiedBySubmission.has(description));
}

/** The most recent conclusion recorded against an exception, if any. */
export function latestConclusion(ws: Workspace, exceptionId: string) {
  return [...ws.conclusions].reverse().find((c) => c.exceptionId === exceptionId);
}

/**
 * The status the close reads today: the rules' status unless a management
 * conclusion has superseded it.
 *
 * A conclusion of REMAINS_OPEN does NOT change the status — it records that
 * a person looked and decided it stays open, which is information about the
 * review, not about the rule.
 */
export function effectiveStatus(ws: Workspace, exceptionId: string): string {
  const exception = ws.close.exceptions.find((e) => e.id === exceptionId);
  const derived = exception?.status ?? "";
  const conclusion = latestConclusion(ws, exceptionId);
  if (conclusion === undefined || conclusion.conclusion === "REMAINS_OPEN") return derived;
  /**
   * The requirements gate, enforced against the STATE and not only against
   * the write.
   *
   * `concludeException` refuses to record a resolving conclusion while a
   * required record is missing, and calls that the one rule it will not bend.
   * It checked once, at the moment of writing, and nothing re-derived it
   * afterwards — so a conclusion outlived the record that justified it. A
   * reviewer returning a submission regrows `unmetRequirements`, and the
   * resolution went on standing: the exception dropped out of the blocker
   * set, readiness rescored, and the Overview offered sign-off with "Every
   * blocker has a management conclusion" beside "0 blockers · $0" — an act
   * the close's own rules forbid, recorded and locked.
   *
   * No shipped surface can reach that today: `reviewEvidence` is exposed by
   * no server action, so nothing in the running product can move a submission
   * to RETURNED. That makes this a latent hole rather than a live defect, and
   * COMPLETION_PLAN §168 plans the button that would open it. Enforcing the
   * invariant here means wiring that button cannot re-open it.
   *
   * A conclusion is not deleted when this fires — it stays in the trail, and
   * `latestConclusion` still returns it. What it loses is the power to
   * supersede the rule, which is the only thing the gate was ever about.
   */
  if (unmetRequirements(ws, exceptionId).length > 0) return derived;
  return conclusion.conclusion;
}

function isResolvedConclusion(value: string): boolean {
  return value === "RESOLVED_NO_ADJUSTMENT" || value === "RESOLVED_ADJUSTMENT_PROPOSED";
}

/** Exceptions still open once conclusions are taken into account. */
export function effectiveOpenExceptionIds(ws: Workspace): readonly string[] {
  return ws.close.exceptions
    .filter((e) => !isResolvedConclusion(effectiveStatus(ws, e.id)))
    .filter((e) => !isResolvedConclusion(e.status))
    .map((e) => e.id);
}

/**
 * Blockers as they stand now. The baseline blocker set is the rules'; an
 * exception a person has concluded drops out of it, and nothing is ever
 * added — this overlay can only close items, never open new ones.
 */
export function effectiveBlockers(ws: Workspace) {
  const openIds = new Set(effectiveOpenExceptionIds(ws));
  return ws.close.blockers.filter((b) => openIds.has(b.exceptionId));
}

export interface EffectiveClose {
  /** True once a person has changed anything; the surfaces say so when it is. */
  readonly diverged: boolean;
  readonly blockers: ReturnType<typeof effectiveBlockers>;
  readonly blockerCount: number;
  readonly blockerExposureCents: number;
  readonly readinessBps: number;
  /** The rules' own figures, so a surface can show both without recomputing. */
  readonly baselineBlockerCount: number;
  readonly baselineReadinessBps: number;
  readonly concludedCount: number;
  readonly openRequestCount: number;
}

/**
 * Live close position.
 *
 * Readiness is recomputed with the SAME function and policy the baseline
 * used — `computeReadiness` from @icg/rules — over the effective exception
 * set. A second scoring path here would be a second definition of readiness,
 * and the two would disagree the first time either changed.
 */
/**
 * The exception set as the scorer sees it now.
 *
 * Exported so anything EXPLAINING readiness scores the same population the
 * close scores. Two constructions of "the effective exceptions" would be two
 * answers to a question that has one, and the explanation would start
 * describing a run that never happened.
 */
export function effectiveExceptions(ws: Workspace) {
  const openIds = new Set(effectiveOpenExceptionIds(ws));
  return ws.close.exceptions.map((e) =>
    openIds.has(e.id)
      ? e
      : // Present the concluded item to the scorer as resolved, exactly as a
        // rules-resolved exception would arrive.
        { ...e, status: effectiveStatus(ws, e.id) as typeof e.status },
  );
}

export function effectiveClose(ws: Workspace): EffectiveClose {
  const blockers = effectiveBlockers(ws);
  const readiness = computeReadiness(
    effectiveExceptions(ws),
    ws.close.reconciliation,
    ws.close.proposedAdjustments.length,
    // The SAME policy the baseline scored against. A second policy here
    // would be a second definition of readiness.
    POLICY_V1,
  );
  return {
    diverged: ws.conclusions.length > 0 || ws.submittedEvidence.length > 0,
    blockers,
    blockerCount: blockers.length,
    blockerExposureCents: blockers.reduce((n, b) => n + b.exposureCents, 0),
    readinessBps: readiness.totalBasisPoints,
    baselineBlockerCount: ws.close.blockers.length,
    baselineReadinessBps: ws.close.readiness.totalBasisPoints,
    concludedCount: new Set(ws.conclusions.map((c) => c.exceptionId)).size,
    openRequestCount: ws.evidenceRequests.length,
  };
}
