/**
 * Explicit date/time types. Calendar dates (cutoff, balance-sheet date) are
 * IsoDate ("YYYY-MM-DD"); event instants (sync times, retrievals, approvals)
 * are IsoDateTime (UTC ISO-8601 with Z suffix). Keeping them distinct avoids
 * timezone drift in cutoff logic.
 */

export type IsoDate = string & { readonly __brand: "IsoDate" };
export type IsoDateTime = string & { readonly __brand: "IsoDateTime" };

const ISO_DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const ISO_DATE_TIME_RE =
  /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,3})?Z$/;

export class InvalidDateError extends Error {
  constructor(value: string, kind: "IsoDate" | "IsoDateTime") {
    super(`Invalid ${kind}: "${value}"`);
    this.name = "InvalidDateError";
  }
}

export function isoDate(value: string): IsoDate {
  if (!ISO_DATE_RE.test(value)) {
    throw new InvalidDateError(value, "IsoDate");
  }
  return value as IsoDate;
}

export function isoDateTime(value: string): IsoDateTime {
  if (!ISO_DATE_TIME_RE.test(value)) {
    throw new InvalidDateError(value, "IsoDateTime");
  }
  return value as IsoDateTime;
}

/** Lexicographic comparison is chronological for both ISO forms. */
export function compareIsoDates(a: IsoDate, b: IsoDate): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isOnOrBefore(a: IsoDate, b: IsoDate): boolean {
  return compareIsoDates(a, b) <= 0;
}

export function isAfter(a: IsoDate, b: IsoDate): boolean {
  return compareIsoDates(a, b) > 0;
}

/** FY2026 balance-sheet date for the canonical dataset. */
export const FY2026_BALANCE_SHEET_DATE: IsoDate = isoDate("2026-12-31");
