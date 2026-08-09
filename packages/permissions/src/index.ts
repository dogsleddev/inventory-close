/**
 * @icg/permissions — explicit role→permission mapping (Stage 04).
 *
 * Constraints (CANONICAL_SPEC §14): the auditor role is read-only; system
 * admin does not automatically receive accounting authority; Ask Gaurd
 * inherits the caller's authorization before tool data reaches the model;
 * natural language cannot bypass permissions.
 */

export type { Permission, Role, User } from "@icg/domain";
