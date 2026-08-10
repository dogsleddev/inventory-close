import { z } from "zod";
import {
  ACCOUNTING_CLASSIFICATIONS,
  COUNT_TYPES,
  EXCEPTION_STATUSES,
  NETSUITE_RECORD_TYPES,
  PBC_STATUSES,
  RISK_LEVELS,
  SOURCE_HEALTH_STATUSES,
  SOURCE_SYSTEM_IDS,
} from "../enums.js";

/**
 * Runtime validation at external/fixture boundaries. Business logic never
 * consumes raw JSON: fixture files are parsed through these schemas by the
 * repository adapters in packages/data.
 */

export const integerCentsSchema = z
  .number()
  .int("money must be integer minor units (cents)")
  .safe();

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "expected YYYY-MM-DD");

export const isoDateTimeSchema = z
  .string()
  .regex(
    /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,3})?Z$/,
    "expected UTC ISO-8601 with Z suffix",
  );

export const sourceRecordRefSchema = z.object({
  sourceSystem: z.enum(SOURCE_SYSTEM_IDS),
  recordType: z.enum(NETSUITE_RECORD_TYPES).or(z.string().min(1)),
  internalId: z.string().min(1),
  transactionNumber: z.string().min(1).optional(),
  lineId: z.string().min(1).optional(),
  lastModifiedAt: isoDateTimeSchema.optional(),
  retrievedAt: isoDateTimeSchema,
  sourceHash: z.string().min(1),
});

export const skuFixtureSchema = z.object({
  code: z.string().regex(/^K[A-Z]-[A-Z0-9]+$/, "expected a K*-* SKU code"),
  description: z.string().min(1),
  unitCostCents: integerCentsSchema.positive(),
  /** KE-* hardware is serialized; accessories are counted by quantity. */
  serialized: z.boolean().optional(),
});

export const locationFixtureSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  defaultClassification: z.enum(ACCOUNTING_CLASSIFICATIONS).optional(),
});

export const inventoryItemFixtureSchema = z.object({
  serial: z.string().min(1),
  sku: z.string().min(1),
  location: z.string().min(1),
  classification: z.enum(ACCOUNTING_CLASSIFICATIONS),
  unitCostCents: integerCentsSchema.positive(),
  sourceRef: sourceRecordRefSchema.optional(),
  /** Aging inputs (VAL-EO-001, DEMO-AGE-001): when acquired / last moved. */
  acquiredAt: isoDateSchema.optional(),
  lastMovementAt: isoDateSchema.optional(),
  /** Custodian holding the unit (third-party custody / CM locations only). */
  custodian: z.string().min(1).optional(),
});

export const glBalanceFixtureSchema = z.object({
  account: z.string().regex(/^\d{4}$/, "expected a 4-digit GL account code"),
  asOf: isoDateSchema,
  amountCents: integerCentsSchema,
  sourceRef: sourceRecordRefSchema.optional(),
});

export const sourceHealthFixtureSchema = z.object({
  sourceSystem: z.enum(SOURCE_SYSTEM_IDS),
  status: z.enum(SOURCE_HEALTH_STATUSES),
  lastSyncAt: isoDateTimeSchema.optional(),
  lastSyncId: z.string().optional(),
  note: z.string().optional(),
});

export const countResultFixtureSchema = z.object({
  countPlanId: z.string().min(1),
  countType: z.enum(COUNT_TYPES),
  sku: z.string().min(1),
  location: z.string().min(1),
  bin: z.string().optional(),
  serial: z.string().optional(),
  snapshotQuantity: z.number().int().nonnegative(),
  countQuantity: z.number().int().nonnegative(),
  adjustedQuantity: z.number().int().optional(),
  variance: z.number().int(),
  externalCountDetailId: z.string().optional(),
});

export const exceptionFixtureSchema = z.object({
  id: z.string().regex(/^EXC-\d{3}$/, "expected EXC-###"),
  title: z.string().min(1),
  ruleId: z.string().min(1),
  ruleVersion: z.string().min(1),
  status: z.enum(EXCEPTION_STATUSES),
  risk: z.enum(RISK_LEVELS),
  exposureCents: integerCentsSchema.positive(),
  blocker: z.boolean(),
});

export const pbcRequestFixtureSchema = z.object({
  id: z.string().regex(/^PBC-\d{3}$/, "expected PBC-###"),
  title: z.string().min(1),
  status: z.enum(PBC_STATUSES),
});

export type SkuFixture = z.infer<typeof skuFixtureSchema>;
export type LocationFixture = z.infer<typeof locationFixtureSchema>;
export type InventoryItemFixture = z.infer<typeof inventoryItemFixtureSchema>;
export type GlBalanceFixture = z.infer<typeof glBalanceFixtureSchema>;
export type SourceHealthFixture = z.infer<typeof sourceHealthFixtureSchema>;
export type CountResultFixture = z.infer<typeof countResultFixtureSchema>;
export type ExceptionFixture = z.infer<typeof exceptionFixtureSchema>;
export type PbcRequestFixture = z.infer<typeof pbcRequestFixtureSchema>;
