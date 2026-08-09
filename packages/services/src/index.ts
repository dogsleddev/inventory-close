/**
 * @icg/services — application services (Stage 04).
 *
 * Dependency direction (docs/05): UI / Ask Gaurd / MCP → services →
 * deterministic domain/rules → repositories/evidence. UI and AI surfaces call
 * these services; they never reimplement accounting logic. Permission checks
 * happen here, before data reaches any caller — including the AI adapter.
 */

export type {
  AccountingException,
  Reconciliation,
  RunManifest,
} from "@icg/domain";
