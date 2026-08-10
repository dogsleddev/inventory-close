import type { IsoDateTime } from "./dates.js";
import type { NetSuiteRecordType, SourceSystemId } from "./enums.js";

/**
 * Branded identifier types. IDs are opaque strings; branding prevents an
 * exception ID from being passed where a serial number is expected.
 */
export type ExceptionId = string & { readonly __brand: "ExceptionId" };
export type RuleId = string & { readonly __brand: "RuleId" };
export type SerialNumberId = string & { readonly __brand: "SerialNumberId" };
export type SkuCode = string & { readonly __brand: "SkuCode" };
export type LocationId = string & { readonly __brand: "LocationId" };
export type GlAccountCode = string & { readonly __brand: "GlAccountCode" };
export type EvidenceId = string & { readonly __brand: "EvidenceId" };
export type PbcRequestId = string & { readonly __brand: "PbcRequestId" };
export type UserId = string & { readonly __brand: "UserId" };
export type ClosePeriodId = string & { readonly __brand: "ClosePeriodId" };
export type RunId = string & { readonly __brand: "RunId" };

export const exceptionId = (v: string): ExceptionId => v as ExceptionId;
export const ruleId = (v: string): RuleId => v as RuleId;
export const serialNumberId = (v: string): SerialNumberId => v as SerialNumberId;
export const skuCode = (v: string): SkuCode => v as SkuCode;
export const locationId = (v: string): LocationId => v as LocationId;
export const glAccountCode = (v: string): GlAccountCode => v as GlAccountCode;
export const evidenceId = (v: string): EvidenceId => v as EvidenceId;
export const pbcRequestId = (v: string): PbcRequestId => v as PbcRequestId;
export const userId = (v: string): UserId => v as UserId;
export const closePeriodId = (v: string): ClosePeriodId => v as ClosePeriodId;
export const runId = (v: string): RunId => v as RunId;

/**
 * Identity of a record retrieved read-only from NetSuite (docs/05): Gaurd
 * preserves source record type, internal ID, transaction number, line ID,
 * last-modified and retrieved timestamps, and a hash of the retrieved payload.
 */
export interface SourceRecordRef {
  readonly sourceSystem: SourceSystemId;
  readonly recordType: NetSuiteRecordType | string;
  readonly internalId: string;
  /** Optionals admit explicit undefined to match Zod-inferred fixture shapes. */
  readonly transactionNumber?: string | undefined;
  readonly lineId?: string | undefined;
  readonly lastModifiedAt?: IsoDateTime | string | undefined;
  readonly retrievedAt: IsoDateTime | string;
  readonly sourceHash: string;
}

/** Canonical dataset identifiers (README / data/README.md). */
export const CANONICAL_DATASET_VERSION = "FY2026-DEMO-v1.1.0";
export const CANONICAL_GENERATOR_SEED = "ICG-FY2026-DEMO-002";
export const CANONICAL_SCENARIO_SCRIPT = "SCENARIO-EVENTS-v1.1.0";
