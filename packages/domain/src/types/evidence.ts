import type { IsoDateTime } from "../dates.js";
import type {
  EvidenceLinkType,
  EvidenceSensitivity,
  SourceSystemId,
} from "../enums.js";
import type { EvidenceId, SourceRecordRef, UserId } from "../identifiers.js";

/**
 * Evidence is append-only: material records are superseded, voided, or
 * annotated — never destructively edited (CANONICAL_SPEC §14).
 */
export interface Evidence {
  readonly id: EvidenceId;
  readonly title: string;
  /**
   * Omitted when the evidence does not originate from one of the nine
   * CANONICAL_SPEC §4 source domains (e.g. a management-prepared upload);
   * no invented source vocabulary.
   */
  readonly sourceSystem?: SourceSystemId;
  readonly sourceRef?: SourceRecordRef;
  readonly sensitivity: EvidenceSensitivity;
  readonly contentHash: string;
  readonly retrievedAt: IsoDateTime;
  readonly recordedBy: UserId;
  readonly supersededBy?: EvidenceId;
  readonly voided?: boolean;
  readonly voidReason?: string;
}

/** Typed edge in the evidence graph (docs/11). */
export interface EvidenceLink {
  readonly from: EvidenceId;
  readonly linkType: EvidenceLinkType;
  /** Target: another evidence item or a domain object reference string. */
  readonly to: string;
}

/**
 * A requirement that a control or exception needs a specific kind of
 * evidence. Missing required evidence never silently becomes PASS.
 */
export interface EvidenceRequirement {
  readonly description: string;
  readonly required: boolean;
  readonly satisfiedBy?: EvidenceId;
}
