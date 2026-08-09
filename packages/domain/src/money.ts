/**
 * Money is always integer minor units (cents). Floating-point dollars never
 * enter the domain: constructors reject non-integers, and arithmetic stays in
 * safe-integer space.
 */

export type Cents = number & { readonly __brand: "Cents" };

export class NonIntegerMoneyError extends Error {
  constructor(value: number) {
    super(`Money must be an integer number of cents, received: ${value}`);
    this.name = "NonIntegerMoneyError";
  }
}

export function cents(value: number): Cents {
  if (!Number.isSafeInteger(value)) {
    throw new NonIntegerMoneyError(value);
  }
  return value as Cents;
}

export function addCents(a: Cents, b: Cents): Cents {
  return cents(a + b);
}

export function subtractCents(a: Cents, b: Cents): Cents {
  return cents(a - b);
}

export function sumCents(values: readonly Cents[]): Cents {
  return values.reduce<Cents>((acc, v) => addCents(acc, v), cents(0));
}

/** Multiply a unit cost by an integer quantity (e.g. units of a SKU). */
export function multiplyCents(unit: Cents, quantity: number): Cents {
  if (!Number.isSafeInteger(quantity)) {
    throw new NonIntegerMoneyError(quantity);
  }
  return cents(unit * quantity);
}

export function negateCents(value: Cents): Cents {
  return cents(-value);
}

/**
 * Deterministic USD formatting without locale dependence:
 * 481245000 -> "$4,812,450.00", -1245000 -> "-$12,450.00".
 */
export function formatUsd(value: Cents): string {
  const negative = value < 0;
  const abs = Math.abs(value);
  const dollars = Math.trunc(abs / 100).toString();
  const remainder = (abs % 100).toString().padStart(2, "0");
  const grouped = dollars.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}$${grouped}.${remainder}`;
}

/**
 * Readiness and other ratios use explicit integer basis points
 * (8142 = 81.42%), never floats.
 */
export type BasisPoints = number & { readonly __brand: "BasisPoints" };

export function basisPoints(value: number): BasisPoints {
  if (!Number.isSafeInteger(value)) {
    throw new NonIntegerMoneyError(value);
  }
  return value as BasisPoints;
}

/** 8142 -> "81.42%" (two-decimal canonical rendering). */
export function formatBasisPoints(value: BasisPoints): string {
  const negative = value < 0;
  const abs = Math.abs(value);
  const whole = Math.trunc(abs / 100);
  const frac = (abs % 100).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${frac}%`;
}
