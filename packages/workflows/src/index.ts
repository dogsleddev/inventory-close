/**
 * @icg/workflows — close workflow state machines (Stage 04).
 *
 * Constraints (CANONICAL_SPEC §14): preparation and approval are separated
 * where material; periods move OPEN → SOFT_LOCKED → LOCKED and may be
 * REOPENED only with a reason and history; material transitions emit audit
 * events.
 */

export type { ClosePeriod, PeriodState } from "@icg/domain";
