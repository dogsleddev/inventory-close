/**
 * @icg/domain — the deterministic core of Inventory Close Gaurd.
 *
 * Dependency rules (docs/05):
 * - This package has ZERO AI dependencies (enforced by lint + tests).
 * - It imports nothing from other @icg packages.
 * - Accounting rules never live in React components, prompts, MCP adapters,
 *   or exports — they consume these types via packages/rules and services.
 */

export * from "./money.js";
export * from "./dates.js";
export * from "./enums.js";
export * from "./custody.js";
export * from "./identifiers.js";
export * from "./types/inventory.js";
export * from "./types/netsuite.js";
export * from "./types/evidence.js";
export * from "./types/rules.js";
export * from "./types/exceptions.js";
export * from "./types/adjustments.js";
export * from "./types/pbc.js";
export * from "./types/security.js";
export * from "./types/sources.js";
export * from "./types/replay.js";
export * from "./types/chains.js";
export * from "./schemas/fixtures.js";
export * from "./schemas/datasetFixtures.js";
export * from "./schemas/goldenBaseline.js";
export * from "./repositories.js";
export * from "./accounts.js";
