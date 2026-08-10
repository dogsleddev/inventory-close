import { describe, expect, it } from "vitest";
import {
  InvalidDateError,
  isoDate,
  isoDateSchema,
  isoDateTimeSchema,
  isRealCalendarDate,
} from "../src/index.js";

/**
 * Stage 01 review follow-up: regex-only validation accepted impossible
 * calendar dates. The boundary must reject them (prompts/code/01:
 * "deliberately invalid fixtures fail").
 */
describe("calendar-valid dates", () => {
  it.each(["2026-02-30", "2026-04-31", "2025-02-29", "2026-06-31"])(
    "rejects the impossible date %s",
    (value) => {
      expect(isRealCalendarDate(value)).toBe(false);
      expect(() => isoDate(value)).toThrow(InvalidDateError);
      expect(isoDateSchema.safeParse(value).success).toBe(false);
      expect(isoDateTimeSchema.safeParse(`${value}T12:00:00Z`).success).toBe(false);
    },
  );

  it.each(["2026-12-31", "2028-02-29", "2026-02-28", "2025-01-01"])(
    "accepts the real date %s",
    (value) => {
      expect(isRealCalendarDate(value)).toBe(true);
      expect(isoDateSchema.safeParse(value).success).toBe(true);
      expect(isoDateTimeSchema.safeParse(`${value}T12:00:00Z`).success).toBe(true);
    },
  );
});
