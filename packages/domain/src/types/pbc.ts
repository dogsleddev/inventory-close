import type { IsoDateTime } from "../dates.js";
import type { PbcStatus } from "../enums.js";
import type { EvidenceId, PbcRequestId, UserId } from "../identifiers.js";

/**
 * CANONICAL_SPEC §12: 21 management-prepared PBC requests. Provided artifacts
 * are immutable — changes create new versions; packages carry a manifest and
 * hashes.
 */
export interface PbcRequest {
  readonly id: PbcRequestId;
  readonly title: string;
  readonly status: PbcStatus;
  readonly owner?: UserId;
  readonly artifactIds: readonly string[];
}

export interface PbcArtifact {
  readonly id: string;
  readonly requestId: PbcRequestId;
  readonly version: number;
  readonly contentHash: string;
  readonly providedAt?: IsoDateTime;
  readonly supersededByVersion?: number;
  readonly evidenceIds: readonly EvidenceId[];
}

/** Statuses that count toward the 17/21 readiness numerator. */
export function countsAsReadyOrProvided(status: PbcStatus): boolean {
  return status === "READY" || status === "PROVIDED";
}
