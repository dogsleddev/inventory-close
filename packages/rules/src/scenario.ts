import type { ProposedAdjustment, ScenarioEventFixture } from "@icg/domain";
import { cents, exceptionId, glAccountCode, isBalanced } from "@icg/domain";
import type { DerivedException } from "./exceptions.js";

/**
 * The deterministic scenario-event engine (prompt 03 item 6). Events are
 * applied in sequence order; each event can resolve exceptions whose rule
 * family it addresses AND whose subjects it matches. The engine is generic
 * - the fact that exactly the eight designed historical exceptions resolve
 * (and seven stay open) is asserted by the golden tests, never assumed.
 */

/** Which rule family each event type is allowed to resolve, and to what. */
const EVENT_RESOLUTIONS: Readonly<
  Record<string, { ruleId: string; to: "RESOLVED_NO_ADJUSTMENT" | "RESOLVED_ADJUSTMENT_PROPOSED" }>
> = {
  RECOUNT_COMPLETED: { ruleId: "CNT-VAR-001", to: "RESOLVED_NO_ADJUSTMENT" },
  MOVEMENT_VALIDATED: { ruleId: "CNT-MOVE-001", to: "RESOLVED_NO_ADJUSTMENT" },
  DATA_QUALITY_CORRECTED: { ruleId: "DQ-LOC-001", to: "RESOLVED_NO_ADJUSTMENT" },
  CONTRACT_LOCATED: { ruleId: "OWN-LOAN-001", to: "RESOLVED_NO_ADJUSTMENT" },
  POLICY_REVIEW_CONCLUDED: { ruleId: "DEMO-AGE-001", to: "RESOLVED_NO_ADJUSTMENT" },
  DAMAGE_ASSESSED: { ruleId: "VAL-DMG-001", to: "RESOLVED_NO_ADJUSTMENT" },
};

/**
 * Two-step resolutions: the identifying/validating event marks the
 * exception, and the ADJUSTMENT_PROPOSED event that references the same
 * transactions completes it as RESOLVED_ADJUSTMENT_PROPOSED.
 */
const IDENTIFYING_EVENTS: Readonly<Record<string, string>> = {
  DUPLICATE_IDENTIFIED: "RMA-DUP-001",
  TIMING_VALIDATED: "REC-GL-001",
};

/** Offset account per resolved rule family for balanced proposed JEs. */
const PROPOSAL_OFFSET_ACCOUNT: Readonly<Record<string, string>> = {
  "RMA-DUP-001": "5110",
  "REC-GL-001": "2100",
};

function subjectsOverlap(
  event: ScenarioEventFixture,
  exception: DerivedException,
): boolean {
  const es = event.subjects;
  const fs = exception.finding.subjects;
  const overlap = <T>(a?: readonly T[], b?: readonly T[]) =>
    a !== undefined && b !== undefined && a.some((x) => b.includes(x));
  return (
    overlap(es.serials, fs.serials) ||
    overlap(es.transactionNumbers, fs.transactionNumbers) ||
    overlap(es.documentRefs, fs.documentRefs) ||
    (overlap(es.skus, fs.skus) && overlap(es.locations, fs.locations))
  );
}

export interface ScenarioResult {
  readonly exceptions: readonly DerivedException[];
  readonly proposedAdjustments: readonly ProposedAdjustment[];
  readonly appliedEventIds: readonly string[];
}

export function applyScenarioEvents(
  initial: readonly DerivedException[],
  events: readonly ScenarioEventFixture[],
): ScenarioResult {
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  const state = new Map(initial.map((e) => [e.id, e]));
  // Identification is scoped to the SPECIFIC exception the event's subjects
  // match, never to a whole rule family - evidence lineage stays attributed
  // to the exception it belongs to.
  const identifiedBy = new Map<string, string>(); // exceptionId -> event id
  const proposedAdjustments: ProposedAdjustment[] = [];
  const isResolved = (status: string) => status.startsWith("RESOLVED_");

  for (const event of ordered) {
    const simple = EVENT_RESOLUTIONS[event.eventType];
    if (simple) {
      for (const [id, exc] of state) {
        if (exc.finding.ruleId !== simple.ruleId) continue;
        if (isResolved(exc.status)) continue;
        if (!subjectsOverlap(event, exc)) continue;
        state.set(id, {
          ...exc,
          status: simple.to,
          resolvedByEvents: [...exc.resolvedByEvents, event.id],
        });
      }
      continue;
    }
    const identifyingRule = IDENTIFYING_EVENTS[event.eventType];
    if (identifyingRule !== undefined) {
      for (const [id, exc] of state) {
        if (exc.finding.ruleId !== identifyingRule) continue;
        if (isResolved(exc.status)) continue;
        if (!subjectsOverlap(event, exc)) continue;
        identifiedBy.set(id, event.id);
      }
      continue;
    }
    if (event.eventType === "ADJUSTMENT_PROPOSED") {
      for (const [id, exc] of state) {
        const eventId = identifiedBy.get(id);
        if (eventId === undefined) continue;
        if (isResolved(exc.status)) continue;
        if (!subjectsOverlap(event, exc)) continue;
        const amount = event.subjects.amountCents ?? 0;
        const account = event.subjects.glAccount ?? "1200";
        const offset = PROPOSAL_OFFSET_ACCOUNT[exc.finding.ruleId] ?? "5110";
        const proposal: ProposedAdjustment = {
          id: event.subjects.transactionNumbers?.[0] ?? `PROP-${event.id}`,
          relatedExceptionId: exceptionId(id),
          description: event.description,
          lines: [
            { account: glAccountCode(account), memo: event.description, amount: cents(amount) },
            { account: glAccountCode(offset), memo: "Offset", amount: cents(-amount) },
          ],
          approved: false,
        };
        if (!isBalanced(proposal)) {
          throw new Error(`Proposed adjustment ${proposal.id} does not balance`);
        }
        proposedAdjustments.push(proposal);
        state.set(id, {
          ...exc,
          status: "RESOLVED_ADJUSTMENT_PROPOSED",
          resolvedByEvents: [...exc.resolvedByEvents, eventId, event.id],
        });
      }
    }
  }

  return {
    exceptions: [...state.values()],
    proposedAdjustments,
    appliedEventIds: ordered.map((e) => e.id),
  };
}
