import { hashObject } from "@icg/data";
import type { PbcItemOut } from "@icg/rules";

/**
 * PBC workpaper versions (docs/10, prompt 07).
 *
 * Providing is a management act with a sealed artifact behind it: a provided
 * version is immutable, carries the hash it was sealed with, and is
 * superseded rather than edited. Nothing here records auditor acceptance —
 * no such state exists in this product.
 *
 * Versions are workspace state, not a rule output, so they live in the
 * service layer: `close.pbc` stays exactly what the deterministic core
 * derived, and replay equivalence is unaffected by who provided what.
 */

export type PbcVersionState = "DRAFT" | "PROVIDED" | "SUPERSEDED";

export interface PbcVersion {
  readonly label: string;
  /** Sequence number for provided versions; absent for unnumbered drafts. */
  readonly version?: number;
  readonly state: PbcVersionState;
  readonly at: string;
  readonly note: string;
  readonly byUserId: string;
  /** Present only on sealed versions — a draft has nothing sealed yet. */
  readonly contentHash?: string;
  readonly sealed: boolean;
  /** The working draft is the only editable object in a history. */
  readonly editable: boolean;
  readonly supersededByVersion?: number;
}

/**
 * Authored version dates. These are baseline demo facts, not clock reads,
 * so the same history renders on every machine and survives demo reset.
 */
const DATES = {
  initialDraft: "2026-12-30",
  firstProvided: "2026-12-31",
  prepared: "2027-01-02",
  secondProvided: "2027-01-03",
  workingDraft: "2027-01-05",
} as const;

/** Providing to the audit team is a Controller act; drafts are the owner's. */
const PROVIDER_ROLE = "CONTROLLER";

/**
 * A sealed version's hash covers the workpaper identity and the controlled
 * state it was sealed against — the same dependency slices REFRESH_REQUIRED
 * compares. It is derived, never authored, so it reproduces exactly.
 */
function sealHash(id: string, version: number, stateHash: string): string {
  return hashObject({ pbc: id, version, state: stateHash });
}

/**
 * The version history implied by a workpaper's current status.
 *
 * FOLLOW_UP_REQUESTED is the important case: further support was asked for
 * *after* providing, so the prior version stays sealed and provided. That is
 * why auditor scope keys on "has a sealed provided version" rather than on
 * the current status — see `hasProvidedVersion`.
 */
export function versionsFor(
  item: PbcItemOut,
  stateHash: string,
  userForRole: (role: string) => string,
): readonly PbcVersion[] {
  const owner = userForRole(item.owner);
  const provider = userForRole(PROVIDER_ROLE);
  const seal = (n: number) => sealHash(item.id, n, stateHash);

  switch (item.status) {
    case "NOT_STARTED":
      return [];

    case "PREPARING":
      return [
        {
          label: "Working draft",
          state: "DRAFT",
          at: DATES.workingDraft,
          note: "In preparation — not yet internally reviewed",
          byUserId: owner,
          sealed: false,
          editable: true,
        },
      ];

    case "READY":
      return [
        {
          label: "Prepared draft",
          state: "DRAFT",
          at: DATES.prepared,
          note: "Prepared and internally reviewed — not yet provided",
          byUserId: owner,
          sealed: false,
          editable: true,
        },
      ];

    case "PROVIDED":
      return [
        {
          label: "Version 1",
          version: 1,
          state: "PROVIDED",
          at: DATES.firstProvided,
          note: "Provided to the external audit team",
          byUserId: provider,
          contentHash: seal(1),
          sealed: true,
          editable: false,
        },
      ];

    case "FOLLOW_UP_REQUESTED":
      return [
        {
          label: "Working draft",
          state: "DRAFT",
          at: DATES.workingDraft,
          note: "Response to follow-up — awaiting the requested evidence",
          byUserId: provider,
          sealed: false,
          editable: true,
        },
        {
          label: "Version 2",
          version: 2,
          state: "PROVIDED",
          at: DATES.secondProvided,
          note: "Provided — supersedes version 1",
          byUserId: provider,
          contentHash: seal(2),
          sealed: true,
          editable: false,
        },
        {
          label: "Version 1",
          version: 1,
          state: "SUPERSEDED",
          at: DATES.firstProvided,
          note: "Provided — initial population",
          byUserId: owner,
          contentHash: seal(1),
          sealed: true,
          editable: false,
          supersededByVersion: 2,
        },
        {
          label: "Draft",
          state: "DRAFT",
          at: DATES.initialDraft,
          note: "Internal preparation — never provided",
          byUserId: owner,
          sealed: false,
          editable: false,
        },
      ];

    default:
      return [];
  }
}

/** True when any version in the history was sealed and handed over. */
export function hasProvidedVersion(versions: readonly PbcVersion[]): boolean {
  return versions.some((v) => v.sealed && v.version !== undefined);
}
