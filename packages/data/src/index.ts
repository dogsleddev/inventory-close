/**
 * @icg/data — deterministic dataset generation and fixtures (Stage 02).
 *
 * Constraints (data/README.md, docs/07): seed source facts, evidence
 * availability, and scenario events from seed ICG-FY2026-DEMO-002 — never
 * manually seed final exception outcomes; deterministic rules produce those.
 * All fixture output passes through the Zod schemas in @icg/domain before it
 * is returned or written. Read-only NetSuite fixtures preserve source record
 * identity (type, internal ID, transaction number, timestamps, hash).
 */

export {
  CANONICAL_DATASET_VERSION,
  CANONICAL_GENERATOR_SEED,
  CANONICAL_SCENARIO_SCRIPT,
} from "@icg/domain";

export { buildDataset } from "./buildDataset.js";
export type { FixtureCollections, IcgDataset } from "./buildDataset.js";
export { toCloseInput } from "./closeInput.js";
export { createFixtureNetSuiteAdapter } from "./netsuiteAdapter.js";
export type { NetSuiteAdapter } from "./netsuiteAdapter.js";
export { DEMO_USERS, userByRole } from "./users.js";
export type { DemoUser } from "./users.js";
export { ALLOCATION_PLAN } from "./allocation.js";
export type { AllocationCell } from "./allocation.js";
export * from "./constants.js";
export { createPrng, fnv1a32 } from "./prng.js";
export type { Prng } from "./prng.js";
export { hashObject, sha256Hex, stableStringify } from "./hash.js";
export { addDays, atTime } from "./dateMath.js";
export { buildUnits, SerialRegistry } from "./units.js";
export type { StoryUnits, UnitsResult } from "./units.js";
export { SOURCE_HEALTH } from "./health.js";
