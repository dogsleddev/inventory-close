import { z } from "zod";

/**
 * Schema for golden/baseline.json — the locked aggregate control totals for
 * dataset FY2026-DEMO-v1.1.0. Cross-field invariants are encoded so a drifted
 * golden file fails loudly rather than silently anchoring wrong totals.
 */
export const goldenBaselineSchema = z
  .object({
    dataset_version: z.string().min(1),
    book_units: z.number().int().positive(),
    gross_inventory_cents: z.number().int().positive(),
    gross_gl_cents: z.number().int().positive(),
    /** Sign convention: positive means GL > subledger. */
    gross_gl_difference_cents: z.number().int(),
    exception_count: z.number().int().nonnegative(),
    open_exception_count: z.number().int().nonnegative(),
    resolved_exception_count: z.number().int().nonnegative(),
    blocker_count: z.number().int().nonnegative(),
    blocker_exposure_cents: z.number().int().nonnegative(),
    designed_exception_exposure_cents: z.number().int().nonnegative(),
    close_readiness_bps: z.number().int().min(0).max(10000),
    pbc_ready: z.number().int().nonnegative(),
    pbc_total: z.number().int().positive(),
    /** Stored as strings in the golden file, e.g. "80.95". */
    pbc_readiness_percent: z.string().regex(/^\d{1,3}\.\d{2}$/),
    source_health_percent: z.string().regex(/^\d{1,3}\.\d{2}$/),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.open_exception_count + value.resolved_exception_count !==
      value.exception_count
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "open + resolved must equal exception_count",
      });
    }
    if (
      value.gross_gl_cents - value.gross_inventory_cents !==
      value.gross_gl_difference_cents
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "gross_gl_difference_cents must equal gross_gl_cents - gross_inventory_cents",
      });
    }
    if (value.pbc_ready > value.pbc_total) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "pbc_ready cannot exceed pbc_total",
      });
    }
    if (value.blocker_exposure_cents > value.designed_exception_exposure_cents) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "blocker exposure cannot exceed total designed exposure",
      });
    }
    // The percent string must be the two-decimal rendering of ready/total
    // (17/21 → "80.95"), so the display value cannot drift from the integers.
    const expectedPbcPercent = ((value.pbc_ready / value.pbc_total) * 100).toFixed(2);
    if (value.pbc_readiness_percent !== expectedPbcPercent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `pbc_readiness_percent must equal ${expectedPbcPercent} (pbc_ready/pbc_total at two decimals)`,
      });
    }
  });

export type GoldenBaseline = z.infer<typeof goldenBaselineSchema>;
