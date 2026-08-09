import { describe, expect, it } from "vitest";
import {
  addCents,
  basisPoints,
  cents,
  formatBasisPoints,
  formatUsd,
  multiplyCents,
  NonIntegerMoneyError,
  negateCents,
  subtractCents,
  sumCents,
} from "../src/money.js";

describe("integer minor-unit money", () => {
  it("rejects non-integer cents", () => {
    expect(() => cents(12.5)).toThrow(NonIntegerMoneyError);
    expect(() => cents(0.1 + 0.2)).toThrow(NonIntegerMoneyError);
    expect(() => cents(Number.NaN)).toThrow(NonIntegerMoneyError);
    expect(() => cents(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      NonIntegerMoneyError,
    );
  });

  it("performs exact integer arithmetic", () => {
    expect(addCents(cents(1245000), cents(478755000))).toBe(480000000);
    expect(subtractCents(cents(481245000), cents(480000000))).toBe(1245000);
    expect(multiplyCents(cents(740000), 2)).toBe(1480000);
    expect(negateCents(cents(1875000))).toBe(-1875000);
    expect(
      sumCents([cents(-290000), cents(920000), cents(-1875000)]),
    ).toBe(-1245000);
  });

  it("rejects non-integer quantities", () => {
    expect(() => multiplyCents(cents(100), 1.5)).toThrow(NonIntegerMoneyError);
  });

  it("formats USD deterministically without locale dependence", () => {
    expect(formatUsd(cents(481245000))).toBe("$4,812,450.00");
    expect(formatUsd(cents(480000000))).toBe("$4,800,000.00");
    expect(formatUsd(cents(-1245000))).toBe("-$12,450.00");
    expect(formatUsd(cents(0))).toBe("$0.00");
    expect(formatUsd(cents(5))).toBe("$0.05");
  });

  it("formats basis points at canonical two-decimal precision", () => {
    expect(formatBasisPoints(basisPoints(8142))).toBe("81.42%");
    expect(formatBasisPoints(basisPoints(9167))).toBe("91.67%");
    expect(formatBasisPoints(basisPoints(10000))).toBe("100.00%");
  });

  it("rejects fractional basis points", () => {
    expect(() => basisPoints(8141.67)).toThrow(NonIntegerMoneyError);
  });
});
