/**
 * @icg/audit — the append-only audit trail (Stage 04, docs/15). Material
 * state changes record actor, role, action, object, prior/new state,
 * reason, interface, and correlation id. There is no update or delete API:
 * history only ever grows, and reads return defensive copies.
 */

import type { AuditEvent, Role } from "@icg/domain";
import { isoDateTime, userId as mkUserId } from "@icg/domain";

export interface AuditEventInput {
  readonly actorUserId: string;
  readonly actorRole: Role;
  readonly action: string;
  readonly objectRef: string;
  readonly priorState?: string;
  readonly newState?: string;
  readonly reason?: string;
  readonly sourceInterface: string;
  readonly correlationId: string;
  readonly at: string;
  readonly detail?: string;
}

export interface AuditLog {
  append(input: AuditEventInput): AuditEvent;
  /** All events, oldest first. Returned array is a copy. */
  list(): readonly AuditEvent[];
  listForObject(objectRef: string): readonly AuditEvent[];
  count(): number;
}

export function createAuditLog(): AuditLog {
  const events: AuditEvent[] = [];
  let seq = 0;
  return {
    append(input) {
      seq += 1;
      const event: AuditEvent = {
        id: `AE-${String(seq).padStart(6, "0")}`,
        occurredAt: isoDateTime(input.at),
        actor: mkUserId(input.actorUserId),
        actorRole: input.actorRole,
        action: input.action,
        objectRef: input.objectRef,
        ...(input.priorState !== undefined ? { priorState: input.priorState } : {}),
        ...(input.newState !== undefined ? { newState: input.newState } : {}),
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
        sourceInterface: input.sourceInterface,
        correlationId: input.correlationId,
        ...(input.detail !== undefined ? { detail: input.detail } : {}),
      };
      events.push(event);
      return event;
    },
    list: () => [...events],
    listForObject: (objectRef) => events.filter((e) => e.objectRef === objectRef),
    count: () => events.length,
  };
}
