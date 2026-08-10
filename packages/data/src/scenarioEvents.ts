import type { ScenarioEventFixture } from "@icg/domain";
import { CANONICAL_SCENARIO_SCRIPT } from "@icg/domain";
import {
  EXC009_ADJUSTMENT,
  EXC009_DUPLICATE_JE,
  EXC009_RMA,
  EXC014_JAN_JE,
  EXC014_RECEIPT,
} from "./constants.js";
import type { UnitsResult } from "./units.js";

/**
 * SCENARIO-EVENTS-v1.1.0 — the ordered close-window facts that Stage 03
 * rules replay to move eight designed exceptions from their initial state to
 * the resolved baseline (EXC-005/006/008/009/010/012/013/014). The seven
 * baseline blockers receive no resolving events. Events reference source
 * facts only; exception IDs do not exist at generation time.
 */
export function buildScenarioEvents(unitsResult: UnitsResult): ScenarioEventFixture[] {
  const { story } = unitsResult;
  return [
    {
      id: "SE-001",
      script: CANONICAL_SCENARIO_SCRIPT,
      seq: 1,
      occurredAt: "2027-01-02T18:30:00Z",
      eventType: "TIMING_VALIDATED",
      description: `January GL posting ${EXC014_JAN_JE} ties to ${EXC014_RECEIPT} received 2026-12-30; receipt-to-GL difference validated as timing`,
      subjects: {
        serials: [story.exc014Serial],
        transactionNumbers: [EXC014_RECEIPT, EXC014_JAN_JE],
        glAccount: "1200",
        amountCents: 920000,
      },
      recordedBy: "L. Whitfield",
    },
    {
      id: "SE-002",
      script: CANONICAL_SCENARIO_SCRIPT,
      seq: 2,
      occurredAt: "2027-01-02T21:10:00Z",
      eventType: "DUPLICATE_IDENTIFIED",
      description: `${EXC009_DUPLICATE_JE} re-adds the same two KV-Z1 returns already restocked by ${EXC009_ADJUSTMENT} (${EXC009_RMA}, RMA-2026-0452), and was posted to 1200 instead of 1230`,
      subjects: {
        skus: ["KV-Z1"],
        transactionNumbers: [EXC009_DUPLICATE_JE, EXC009_ADJUSTMENT],
        documentRefs: [EXC009_RMA, "RMA-2026-0452"],
        glAccount: "1200",
        amountCents: 290000,
      },
      recordedBy: "L. Whitfield",
    },
    {
      id: "SE-003",
      script: CANONICAL_SCENARIO_SCRIPT,
      seq: 3,
      occurredAt: "2027-01-03T16:20:00Z",
      eventType: "ADJUSTMENT_PROPOSED",
      description: `Draft JE-PROP-001 proposed: reverse duplicate ${EXC009_DUPLICATE_JE} (credit 1200 $2,900); pending approval — no auto-posting`,
      subjects: {
        transactionNumbers: ["JE-PROP-001", EXC009_DUPLICATE_JE],
        glAccount: "1200",
        amountCents: -290000,
      },
      recordedBy: "T. Okafor",
    },
    {
      id: "SE-004",
      script: CANONICAL_SCENARIO_SCRIPT,
      seq: 4,
      occurredAt: "2027-01-03T16:40:00Z",
      eventType: "ADJUSTMENT_PROPOSED",
      description: `Draft JE-PROP-002 proposed: record ${EXC014_RECEIPT} in the 12/31 GL (debit 1200 $9,200); pending approval — no auto-posting`,
      subjects: {
        serials: [story.exc014Serial],
        transactionNumbers: ["JE-PROP-002", EXC014_RECEIPT],
        glAccount: "1200",
        amountCents: 920000,
      },
      recordedBy: "T. Okafor",
    },
    {
      id: "SE-005",
      script: CANONICAL_SCENARIO_SCRIPT,
      seq: 5,
      occurredAt: "2027-01-03T18:05:00Z",
      eventType: "RECOUNT_COMPLETED",
      description: "Supervised recount of KV-Z1 at Primary Warehouse found 19 of 19 — two units were shelved in an adjacent bin; first-pass variance fully explained",
      subjects: {
        skus: ["KV-Z1"],
        locations: ["PRIMARY_WAREHOUSE"],
        countPlanId: "CNT-YE-2026",
      },
      recordedBy: "R. Calloway",
    },
    {
      id: "SE-006",
      script: CANONICAL_SCENARIO_SCRIPT,
      seq: 6,
      occurredAt: "2027-01-03T19:15:00Z",
      eventType: "MOVEMENT_VALIDATED",
      description: `Authorized movement MV-004 places ${story.exc006Serial} in Staging during the count window; snapshot position reconciled with no quantity impact`,
      subjects: {
        serials: [story.exc006Serial],
        documentRefs: ["MV-004"],
        countPlanId: "CNT-YE-2026",
      },
      recordedBy: "S. Ibarra",
    },
    {
      id: "SE-007",
      script: CANONICAL_SCENARIO_SCRIPT,
      seq: 7,
      occurredAt: "2027-01-04T17:30:00Z",
      eventType: "DATA_QUALITY_CORRECTED",
      description: `Duplicate WMS bin record for ${story.exc013Serial} voided; serial physically verified in Primary Warehouse only — one unit, one location`,
      subjects: {
        serials: [story.exc013Serial],
        locations: ["PRIMARY_WAREHOUSE", "STAGING"],
        countPlanId: "CNT-YE-2026",
      },
      recordedBy: "R. Calloway",
    },
    {
      id: "SE-008",
      script: CANONICAL_SCENARIO_SCRIPT,
      seq: 8,
      occurredAt: "2027-01-04T20:00:00Z",
      eventType: "CONTRACT_LOCATED",
      description: `Title-retention addendum LA-2026-118-ADD-2 located for loaner ${story.exc008Serial} at Silver Fir Hotels; company ownership documented`,
      subjects: {
        serials: [story.exc008Serial],
        documentRefs: ["LA-2026-118-ADD-2", "CT-002"],
      },
      recordedBy: "D. Marsh",
    },
    {
      id: "SE-009",
      script: CANONICAL_SCENARIO_SCRIPT,
      seq: 9,
      occurredAt: "2027-01-05T17:45:00Z",
      eventType: "POLICY_REVIEW_CONCLUDED",
      description: `Demo unit ${story.exc010Serial} on assignment 214 days (policy threshold 180); condition verified current-generation and recoverable — no adjustment required`,
      subjects: {
        serials: [story.exc010Serial],
        documentRefs: ["CT-003"],
      },
      recordedBy: "L. Whitfield",
    },
    {
      id: "SE-010",
      script: CANONICAL_SCENARIO_SCRIPT,
      seq: 10,
      occurredAt: "2027-01-05T19:10:00Z",
      eventType: "DAMAGE_ASSESSED",
      description: `Damaged return ${story.exc012Serial} (RMA-2026-0468) assessed repairable; estimated recovery exceeds carrying value — no write-down required`,
      subjects: {
        serials: [story.exc012Serial],
        documentRefs: ["RMA-2026-0468"],
      },
      recordedBy: "L. Whitfield",
    },
  ];
}
