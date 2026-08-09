/**
 * @icg/data — deterministic dataset generation and repository adapters
 * (Stage 02).
 *
 * Constraints (data/README.md, docs/07): seed source facts, evidence
 * availability, and scenario events from seed ICG-FY2026-DEMO-002 — never
 * manually seed final exception outcomes; deterministic rules produce those.
 * All fixture input passes through the Zod schemas in @icg/domain before
 * reaching business logic. The read-only NetSuiteAdapter fixtures preserve
 * source record identity and hashes.
 */

export {
  CANONICAL_DATASET_VERSION,
  CANONICAL_GENERATOR_SEED,
  CANONICAL_SCENARIO_SCRIPT,
} from "@icg/domain";
