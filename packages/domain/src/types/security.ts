import type { IsoDateTime } from "../dates.js";
import type { Role } from "../enums.js";
import type { UserId } from "../identifiers.js";

/**
 * CANONICAL_SPEC §14: roles map to explicit permissions; preparation and
 * approval are separated where material; the auditor is read-only; system
 * admin does not automatically receive accounting authority. The concrete
 * role→permission matrix lives in packages/permissions.
 */
export interface User {
  readonly id: UserId;
  readonly displayName: string;
  readonly roles: readonly Role[];
}

/** A named permission, e.g. "exception.resolve" or "period.reopen". */
export type Permission = string & { readonly __brand: "Permission" };

export const permission = (v: string): Permission => v as Permission;

/**
 * Append-only audit event for material actions. docs/15 requires actor, role,
 * object, prior/new state, reason, interface, and correlation ID on every
 * material state change.
 */
export interface AuditEvent {
  readonly id: string;
  readonly occurredAt: IsoDateTime;
  readonly actor: UserId;
  readonly actorRole: Role;
  readonly action: string;
  readonly objectRef: string;
  readonly priorState?: string;
  readonly newState?: string;
  readonly reason?: string;
  /** Interface the change came through, e.g. "UI", "ASK_GAURD", "SYSTEM". */
  readonly sourceInterface: string;
  readonly correlationId: string;
  readonly detail?: string;
}
