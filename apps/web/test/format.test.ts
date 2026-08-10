import { describe, expect, it } from "vitest";
import {
  formatBpsExact,
  formatBpsOverview,
  formatCents,
  formatCentsMillions,
  formatDate,
  formatDateShort,
  formatInstant,
  formatScoreHundredths,
} from "../lib/format";

/**
 * The dual-scale numeric rules from the design system (overview scale vs
 * workpaper scale), accounting negatives, and deterministic UTC dates.
 */
describe("money formatting", () => {
  it("renders integer cents at workpaper scale with grouping", () => {
    expect(formatCents(481245000)).toBe("$4,812,450");
    expect(formatCents(1245000)).toBe("$12,450");
    expect(formatCents(0)).toBe("$0");
  });

  it("renders accounting negatives in parentheses", () => {
    expect(formatCents(-5400000)).toBe("($54,000)");
  });

  it("keeps sub-dollar cents instead of silently rounding", () => {
    expect(formatCents(123456)).toBe("$1,234.56");
  });

  it("renders overview-scale millions at the documented precisions", () => {
    expect(formatCentsMillions(480000000, 2)).toBe("$4.80M");
    expect(formatCentsMillions(481245000, 3)).toBe("$4.812M");
  });
});

describe("readiness formatting (documented rounding rule)", () => {
  it("renders 8142 bps as 81.4% at overview scale", () => {
    expect(formatBpsOverview(8142)).toBe("81.4%");
  });

  it("renders 8142 bps as 81.42% at workpaper scale", () => {
    expect(formatBpsExact(8142)).toBe("81.42%");
    expect(formatBpsExact(8095)).toBe("80.95%");
    expect(formatBpsExact(9167)).toBe("91.67%");
  });

  it("keeps integer scores terse and fractional scores exact", () => {
    expect(formatScoreHundredths(9000)).toBe("90%");
    expect(formatScoreHundredths(5333)).toBe("53.33%");
    expect(formatScoreHundredths(6667)).toBe("66.67%");
  });
});

describe("dates (UTC, deterministic)", () => {
  it("formats dates and instants without local-timezone drift", () => {
    expect(formatDate("2026-12-27")).toBe("Dec. 27, 2026");
    expect(formatDateShort("2026-12-29T17:41:00Z")).toBe("Dec. 29");
    expect(formatInstant("2026-12-29T17:41:00Z")).toBe("Dec. 29, 2026 17:41 UTC");
  });
});
