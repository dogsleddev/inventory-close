/**
 * @icg/permissions — explicit role→permission mapping and service-layer
 * authorization (docs/15). Read broadly where appropriate; change narrowly;
 * approve explicitly; preserve history.
 *
 * Principles enforced here:
 * - Roles map to EXPLICIT permissions; nothing is implied.
 * - The auditor role is read-only, scoped to provided/permitted support.
 * - System Admin does not automatically receive accounting authority.
 * - Preparers cannot self-approve material work (segregation of duties).
 * - Restricted contract content requires explicit permission; users may
 *   still be told that restricted evidence exists.
 */

import type { EvidenceSensitivity, Role } from "@icg/domain";
import type { DemoUser } from "@icg/data";

export type PermissionKey =
  | "close.read"
  | "evidence.read"
  | "evidence.read_restricted"
  | "evidence.submit"
  | "evidence.review"
  | "comment.create"
  | "draft.create"
  | "review.request"
  | "review.approve"
  | "period.lock"
  | "period.reopen"
  | "pbc.read"
  | "pbc.prepare"
  | "audit.read";

/** Explicit grants per role — the docs/15 matrix, nothing implied. */
const ROLE_PERMISSIONS: Readonly<Record<Role, readonly PermissionKey[]>> = {
  HEAD_OF_FINANCE: [
    "close.read", "evidence.read", "evidence.read_restricted", "comment.create",
    "review.request", "review.approve", "period.lock", "period.reopen",
    "pbc.read", "audit.read",
  ],
  CONTROLLER: [
    "close.read", "evidence.read", "evidence.read_restricted", "evidence.submit",
    "evidence.review", "comment.create", "draft.create", "review.request",
    "review.approve", "period.lock", "period.reopen", "pbc.read", "pbc.prepare",
    "audit.read",
  ],
  ACCOUNTING_MANAGER: [
    "close.read", "evidence.read", "evidence.read_restricted", "evidence.submit",
    "evidence.review", "comment.create", "draft.create", "review.request",
    "review.approve", "pbc.read", "pbc.prepare", "audit.read",
  ],
  PREPARER: [
    "close.read", "evidence.read", "evidence.submit", "comment.create",
    "draft.create", "review.request", "pbc.read", "pbc.prepare",
  ],
  WAREHOUSE: ["close.read", "evidence.read", "evidence.submit", "comment.create"],
  SUPPLY_CHAIN: ["close.read", "evidence.read", "evidence.submit", "comment.create"],
  FPA: ["close.read", "evidence.read", "comment.create", "pbc.read"],
  LEGAL: [
    "close.read", "evidence.read", "evidence.read_restricted", "evidence.submit",
    "comment.create",
  ],
  // Auditor: read-only over close state and provided support. No commands.
  AUDITOR_READ_ONLY: ["close.read", "evidence.read", "pbc.read"],
  // System admin: platform operator; NO accounting authority of any kind.
  SYSTEM_ADMIN: ["audit.read"],
};

export class AuthorizationError extends Error {
  constructor(
    readonly userId: string,
    readonly permission: PermissionKey,
    detail?: string,
  ) {
    super(`User ${userId} lacks permission ${permission}${detail ? `: ${detail}` : ""}`);
    this.name = "AuthorizationError";
  }
}

export class SegregationOfDutiesError extends Error {
  constructor(readonly userId: string, readonly objectRef: string) {
    super(`User ${userId} cannot approve their own work on ${objectRef}`);
    this.name = "SegregationOfDutiesError";
  }
}

export function permissionsFor(user: DemoUser): ReadonlySet<PermissionKey> {
  return new Set(user.roles.flatMap((role) => ROLE_PERMISSIONS[role] ?? []));
}

export function hasPermission(user: DemoUser, permission: PermissionKey): boolean {
  return permissionsFor(user).has(permission);
}

/** Throwing service-layer gate. There is no client-side permission logic. */
export function authorize(user: DemoUser, permission: PermissionKey, detail?: string): void {
  if (!hasPermission(user, permission)) {
    throw new AuthorizationError(user.id, permission, detail);
  }
}

/**
 * Object-level check for sensitive evidence: restricted content needs the
 * explicit read_restricted grant; everyone with evidence.read may know the
 * item EXISTS (docs/15).
 */
export function canReadContent(user: DemoUser, sensitivity: EvidenceSensitivity): boolean {
  if (sensitivity === "RESTRICTED") {
    return hasPermission(user, "evidence.read_restricted");
  }
  return hasPermission(user, "evidence.read");
}

/** Preparation and approval are separated where material. */
export function assertNotSelfApproval(
  approver: DemoUser,
  preparedByUserId: string,
  objectRef: string,
): void {
  if (approver.id === preparedByUserId) {
    throw new SegregationOfDutiesError(approver.id, objectRef);
  }
}
