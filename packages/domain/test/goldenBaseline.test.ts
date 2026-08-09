import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { goldenBaselineSchema } from "../src/schemas/goldenBaseline.js";
import { CANONICAL_DATASET_VERSION } from "../src/identifiers.js";

const goldenPath = new URL("../../../golden/baseline.json", import.meta.url);
const goldenRaw: unknown = JSON.parse(readFileSync(goldenPath, "utf8"));

describe("golden/baseline.json", () => {
  it("validates against the golden baseline schema", () => {
    const result = goldenBaselineSchema.safeParse(goldenRaw);
    expect(result.success).toBe(true);
  });

  it("still carries the locked FY2026 control totals", () => {
    const golden = goldenBaselineSchema.parse(goldenRaw);
    expect(golden.dataset_version).toBe(CANONICAL_DATASET_VERSION);
    expect(golden.book_units).toBe(1500);
    expect(golden.gross_inventory_cents).toBe(480000000);
    expect(golden.gross_gl_cents).toBe(481245000);
    expect(golden.gross_gl_difference_cents).toBe(1245000);
    expect(golden.exception_count).toBe(15);
    expect(golden.open_exception_count).toBe(7);
    expect(golden.resolved_exception_count).toBe(8);
    expect(golden.blocker_count).toBe(7);
    expect(golden.blocker_exposure_cents).toBe(19895000);
    expect(golden.designed_exception_exposure_cents).toBe(25565000);
    expect(golden.close_readiness_bps).toBe(8142);
    expect(golden.pbc_ready).toBe(17);
    expect(golden.pbc_total).toBe(21);
    expect(golden.pbc_readiness_percent).toBe("80.95");
    expect(golden.source_health_percent).toBe("91.67");
  });

  it("rejects a golden file with non-integer money", () => {
    const corrupted = {
      ...(goldenRaw as Record<string, unknown>),
      gross_inventory_cents: 4800000.5,
    };
    expect(goldenBaselineSchema.safeParse(corrupted).success).toBe(false);
  });

  it("rejects inconsistent open/resolved exception counts", () => {
    const corrupted = {
      ...(goldenRaw as Record<string, unknown>),
      resolved_exception_count: 9,
    };
    expect(goldenBaselineSchema.safeParse(corrupted).success).toBe(false);
  });

  it("rejects a GL difference that does not tie to GL minus subledger", () => {
    const corrupted = {
      ...(goldenRaw as Record<string, unknown>),
      gross_gl_difference_cents: 1,
    };
    expect(goldenBaselineSchema.safeParse(corrupted).success).toBe(false);
  });

  it("rejects unknown fields (golden files are closed schemas)", () => {
    const corrupted = {
      ...(goldenRaw as Record<string, unknown>),
      surprise_field: true,
    };
    expect(goldenBaselineSchema.safeParse(corrupted).success).toBe(false);
  });
});
