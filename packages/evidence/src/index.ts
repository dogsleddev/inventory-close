/**
 * @icg/evidence — evidence lineage and the append-only evidence graph.
 *
 * Implemented in Stage 04. Constraints (docs/01 principle 15, CANONICAL_SPEC
 * §14): lineage records source system/record, retrieval, original/normalized
 * value, transformation, reviewer, status, and retained artifact hash;
 * material history is append-only (supersede/void/annotate, never delete).
 */

export type { Evidence, EvidenceLink, EvidenceRequirement } from "@icg/domain";
