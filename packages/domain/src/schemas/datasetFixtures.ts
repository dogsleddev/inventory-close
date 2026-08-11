import { z } from "zod";
import {
  COST_COMPONENT_TYPES,
  COST_TREATMENTS,
  COUNT_TEST_DIRECTIONS,
  COUNT_TEST_SELECTION_SOURCES,
  COUNT_TYPES,
  DISPOSITION_METHODS,
} from "../enums.js";
import {
  integerCentsSchema,
  isoDateSchema,
  isoDateTimeSchema,
  sourceRecordRefSchema,
} from "./fixtures.js";

/**
 * Stage 02 dataset fixture boundary (docs/07). These schemas validate the
 * generated source facts before business logic consumes them. They describe
 * FACTS from source systems — never close-control conclusions: no exception
 * fixtures, no close-match statuses, no readiness scores exist here.
 */

/** Fictional counterparties. */
export const partyFixtureSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["VENDOR", "CUSTOMER", "CUSTODIAN", "CONTRACT_MANUFACTURER"]),
  name: z.string().min(1),
});

export const transactionLineFixtureSchema = z.object({
  lineId: z.string().min(1),
  sku: z.string().min(1),
  quantity: z.number().int().positive(),
  amountCents: integerCentsSchema.optional(),
  serials: z.array(z.string().min(1)).optional(),
});

const transactionBase = {
  sourceRef: sourceRecordRefSchema,
  transactionNumber: z.string().min(1),
  lines: z.array(transactionLineFixtureSchema).min(1),
};

export const purchaseOrderFixtureSchema = z.object({
  ...transactionBase,
  vendor: z.string().min(1),
  orderDate: isoDateSchema,
});

export const itemReceiptFixtureSchema = z.object({
  ...transactionBase,
  purchaseOrderNumber: z.string().min(1),
  receiptDate: isoDateSchema,
});

export const vendorBillFixtureSchema = z.object({
  ...transactionBase,
  purchaseOrderNumber: z.string().min(1).optional(),
  billDate: isoDateSchema,
});

export const salesOrderFixtureSchema = z.object({
  ...transactionBase,
  customer: z.string().min(1),
  orderDate: isoDateSchema,
});

export const itemFulfillmentFixtureSchema = z.object({
  ...transactionBase,
  salesOrderNumber: z.string().min(1),
  shipDate: isoDateSchema,
});

export const customerInvoiceFixtureSchema = z.object({
  ...transactionBase,
  salesOrderNumber: z.string().min(1).optional(),
  invoiceDate: isoDateSchema,
});

/** NetSuite inventory adjustment (count follow-ups, RMA re-adds, ...). */
export const inventoryAdjustmentFixtureSchema = z.object({
  sourceRef: sourceRecordRefSchema,
  transactionNumber: z.string().min(1),
  adjustmentDate: isoDateSchema,
  glAccount: z.string().regex(/^\d{4}$/),
  reason: z.string().min(1),
  relatedCountPlanId: z.string().optional(),
  lines: z.array(transactionLineFixtureSchema).min(1),
});

/**
 * A GL journal-entry-level fact. Needed so GL-MAN-001 (unsupported manual
 * entry), RMA-DUP-001 (duplicate accounting), and REC-GL-001 (timing) can
 * derive their conclusions from evidence instead of seeded outcomes.
 */
export const glEntryFixtureSchema = z.object({
  sourceRef: sourceRecordRefSchema,
  transactionNumber: z.string().min(1),
  postedDate: isoDateSchema,
  account: z.string().regex(/^\d{4}$/),
  amountCents: integerCentsSchema,
  memo: z.string().min(1),
  enteredBy: z.string().min(1),
  /** Reference to supporting documentation; absent means unsupported. */
  supportRef: z.string().optional(),
});

export const countPlanFixtureSchema = z.object({
  id: z.string().min(1),
  countType: z.enum(COUNT_TYPES),
  sourceRef: sourceRecordRefSchema.optional(),
  externalId: z.string().optional(),
  snapshotAt: isoDateTimeSchema,
  sourceStatus: z.string().optional(),
  approvedBy: z.string().optional(),
  approvedAt: isoDateTimeSchema.optional(),
  rejectedReason: z.string().optional(),
  /** For cycle counts: when this cell is next due (overdue detection input). */
  nextCountDue: isoDateSchema.optional(),
});

export const countTestFixtureSchema = z.object({
  id: z.string().min(1),
  countPlanId: z.string().min(1),
  selectionSource: z.enum(COUNT_TEST_SELECTION_SOURCES),
  direction: z.enum(COUNT_TEST_DIRECTIONS),
  sku: z.string().min(1),
  location: z.string().min(1),
  bin: z.string().optional(),
  serial: z.string().optional(),
  selectedBy: z.string().min(1),
  recordedAt: isoDateTimeSchema,
  /** Physical observation, recorded verbatim. */
  observation: z.string().min(1),
  /** True when the tested item traced cleanly listing↔floor. */
  traced: z.boolean(),
});

export const countMovementFixtureSchema = z.object({
  id: z.string().min(1),
  serial: z.string().optional(),
  sku: z.string().min(1),
  quantity: z.number().int().positive(),
  fromLocation: z.string().min(1),
  toLocation: z.string().min(1),
  movedAt: isoDateTimeSchema,
  authorizedBy: z.string().min(1),
  reason: z.string().min(1),
});

/** FlightPath carrier shipment with its event trail. */
export const carrierShipmentFixtureSchema = z.object({
  id: z.string().min(1),
  sourceRef: sourceRecordRefSchema,
  carrier: z.string().min(1),
  itemFulfillmentNumber: z.string().optional(),
  serials: z.array(z.string().min(1)),
  events: z
    .array(
      z.object({
        eventType: z.enum([
          "PICKUP",
          "IN_TRANSIT",
          "OUT_FOR_DELIVERY",
          "DELIVERED",
          "EXCEPTION",
        ]),
        occurredAt: isoDateTimeSchema,
        location: z.string().optional(),
      }),
    )
    .min(1),
});

/** DeployOps installation record — completion is an operational fact only. */
export const installationFixtureSchema = z.object({
  id: z.string().min(1),
  sourceRef: sourceRecordRefSchema,
  serials: z.array(z.string().min(1)).min(1),
  customer: z.string().min(1),
  siteName: z.string().min(1),
  installedAt: isoDateTimeSchema,
  installedBy: z.string().min(1),
  status: z.enum(["SCHEDULED", "IN_PROGRESS", "COMPLETE"]),
});

/** DeviceCloud telemetry summary per serial. */
export const telemetryFixtureSchema = z.object({
  id: z.string().min(1),
  sourceRef: sourceRecordRefSchema,
  serial: z.string().min(1),
  firstOnlineAt: isoDateTimeSchema,
  lastSeenAt: isoDateTimeSchema,
});

/**
 * AccordVault contract record. Provision status is a source fact about what
 * the document repository could locate — MISSING means the clause could not
 * be found, which never silently becomes present.
 */
export const contractFixtureSchema = z.object({
  id: z.string().min(1),
  sourceRef: sourceRecordRefSchema,
  counterparty: z.string().min(1),
  title: z.string().min(1),
  effectiveDate: isoDateSchema,
  provisions: z
    .array(
      z.object({
        provisionType: z.enum([
          "OWNERSHIP_TRANSFER",
          "ACCEPTANCE",
          "TITLE_RETENTION",
          "CUSTODY",
          "LOANER_TERMS",
          "DEMO_TERMS",
          "RETURN_TERMS",
        ]),
        status: z.enum(["PRESENT", "MISSING"]),
        documentRef: z.string().optional(),
      }),
    )
    .min(1),
});

/** ReturnLoop RMA record. */
export const rmaRecordFixtureSchema = z.object({
  id: z.string().min(1),
  sourceRef: sourceRecordRefSchema,
  serial: z.string().optional(),
  sku: z.string().min(1),
  customer: z.string().min(1),
  receivedAt: isoDateTimeSchema,
  reason: z.string().min(1),
  status: z.enum(["RECEIVED", "IN_EVALUATION", "IN_REPAIR", "CLOSED"]),
});

/** Third-party custodian statement / confirmation request state. */
export const custodianStatementFixtureSchema = z.object({
  id: z.string().min(1),
  custodian: z.string().min(1),
  asOf: isoDateSchema,
  requestedAt: isoDateTimeSchema,
  respondedAt: isoDateTimeSchema.optional(),
  lines: z
    .array(z.object({ sku: z.string().min(1), quantity: z.number().int().positive() }))
    .optional(),
});

export const crmAccountFixtureSchema = z.object({
  id: z.string().min(1),
  sourceRef: sourceRecordRefSchema,
  name: z.string().min(1),
  segment: z.string().min(1),
  region: z.string().min(1),
});

export const forecastFixtureSchema = z.object({
  id: z.string().min(1),
  sourceRef: sourceRecordRefSchema,
  sku: z.string().min(1),
  horizonMonths: z.number().int().positive(),
  forecastUnits: z.number().int().nonnegative(),
  note: z.string().optional(),
});

/** Demo/loaner assignment facts (DEMO-AGE-001, OWN-LOAN-001 inputs). */
export const assignmentFixtureSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["DEMO", "LOANER"]),
  serial: z.string().min(1),
  customer: z.string().optional(),
  startedAt: isoDateSchema,
  contractId: z.string().optional(),
});

/**
 * A scenario event (SCENARIO-EVENTS-v1.1.0): a dated, ordered fact arriving
 * during the close that Stage 03 rules replay deterministically. Events
 * reference source facts (serials, transactions, documents) — never
 * exception IDs, which do not exist until rules derive them.
 */
export const scenarioEventFixtureSchema = z.object({
  id: z.string().regex(/^SE-\d{3}$/),
  script: z.string().min(1),
  seq: z.number().int().positive(),
  occurredAt: isoDateTimeSchema,
  eventType: z.enum([
    "RECOUNT_COMPLETED",
    "MOVEMENT_VALIDATED",
    "DATA_QUALITY_CORRECTED",
    "CONTRACT_LOCATED",
    "DUPLICATE_IDENTIFIED",
    "ADJUSTMENT_PROPOSED",
    "POLICY_REVIEW_CONCLUDED",
    "DAMAGE_ASSESSED",
    "TIMING_VALIDATED",
    "CONFIRMATION_RECEIVED",
  ]),
  description: z.string().min(1),
  subjects: z.object({
    serials: z.array(z.string().min(1)).optional(),
    skus: z.array(z.string().min(1)).optional(),
    locations: z.array(z.string().min(1)).optional(),
    transactionNumbers: z.array(z.string().min(1)).optional(),
    documentRefs: z.array(z.string().min(1)).optional(),
    countPlanId: z.string().optional(),
    glAccount: z.string().optional(),
    amountCents: integerCentsSchema.optional(),
  }),
  recordedBy: z.string().min(1),
});

/**
 * One line of a SKU's standard-cost build-up (dataset v1.2.0). The rows for
 * a SKU sum exactly to that SKU's `unitCostCents`; the generator throws
 * rather than emit a stack that does not, and a regression pins it.
 */
export const costComponentFixtureSchema = z.object({
  sku: z.string().min(1),
  component: z.enum(COST_COMPONENT_TYPES),
  amountCents: integerCentsSchema.nonnegative(),
  /** Where the standard came from — a roll, a price list, a rate study. */
  costSource: z.string().min(1),
  effectiveFrom: isoDateSchema,
});

/**
 * An FY2026 cost pool deliberately kept OUT of inventory, with the basis for
 * keeping it out (dataset v1.2.0).
 *
 * These rows never appear in `glBalances`. That is a hard constraint, not a
 * convenience: `buildReconciliation` sums every GL balance except 1290, so a
 * period-cost row landing in that collection would silently move the locked
 * $4,812,450. The GL account here is an expense account, and a regression
 * asserts none of these is an inventory account.
 */
export const periodCostFixtureSchema = z.object({
  id: z.string().regex(/^PC-\d{4}-\d{4}$/),
  category: z.string().min(1),
  department: z.string().min(1),
  fiscalYear: z.string().regex(/^FY\d{4}$/),
  amountCents: integerCentsSchema.nonnegative(),
  treatment: z.enum(COST_TREATMENTS),
  /** The accounting reason, in the words a workpaper would use. */
  basis: z.string().min(1),
  glAccount: z.string().regex(/^\d{4}$/, "expected a 4-digit GL account code"),
});

/**
 * A unit held on site that the company does not own (dataset v1.2.0).
 *
 * Consignment-in is the custody case the book population cannot express: the
 * unit is physically here and is not inventory. It is a separate collection
 * precisely so it can never be summed into the 1,500 — and the value is
 * labelled as the OWNER's stated value, because the company has no cost
 * basis in a unit it never bought.
 */
export const consignmentUnitFixtureSchema = z.object({
  serial: z.string().min(1),
  sku: z.string().min(1),
  /** The party that owns the unit. Never KestrelGrid. */
  owner: z.string().min(1),
  location: z.string().min(1),
  bin: z.string().min(1).optional(),
  receivedAt: isoDateSchema,
  agreementRef: z.string().min(1),
  /** Stated by the owner. Not a book amount and not in any inventory total. */
  vendorStatedValueCents: integerCentsSchema.nonnegative(),
  sourceRef: sourceRecordRefSchema.optional(),
});

/**
 * A unit that left the book population during FY2026 (dataset v1.2.0).
 *
 * Disposed serials are minted outside the 1,500 by construction — a disposal
 * that removed a unit from a population it is still counted in would be a
 * contradiction, not a demo. `sourceRef` identifies the NetSuite inventory
 * adjustment that performed the removal.
 */
export const dispositionFixtureSchema = z.object({
  id: z.string().regex(/^DSP-\d{4}-\d{4}$/),
  serial: z.string().min(1),
  sku: z.string().min(1),
  method: z.enum(DISPOSITION_METHODS),
  disposedAt: isoDateSchema,
  originalCostCents: integerCentsSchema.nonnegative(),
  /** Zero for scrap; a vendor credit or salvage receipt otherwise. */
  proceedsCents: integerCentsSchema.nonnegative(),
  reason: z.string().min(1),
  authorizedBy: z.string().min(1),
  /** Scrap certificate, vendor credit memo, or salvage receipt. */
  evidenceRef: z.string().min(1).optional(),
  sourceRef: sourceRecordRefSchema,
});

/** The generated dataset manifest (CANONICAL_SPEC §15 lineage). */
export const datasetManifestFixtureSchema = z.object({
  datasetVersion: z.string().min(1),
  generatorSeed: z.string().min(1),
  scenarioScript: z.string().min(1),
  generatorVersion: z.string().min(1),
  balanceSheetDate: isoDateSchema,
  generatedAt: isoDateTimeSchema,
  rowCounts: z.record(z.string(), z.number().int().nonnegative()),
  controlTotals: z.object({
    bookUnits: z.number().int(),
    grossInventoryCents: integerCentsSchema,
    grossGlCents: integerCentsSchema,
    grossGlDifferenceCents: integerCentsSchema,
    reserveCents: integerCentsSchema,
    countPopulationUnits: z.number().int(),
    sourceHealthBasisPoints: z.number().int(),
  }),
  collectionHashes: z.record(z.string(), z.string().min(1)),
  datasetHash: z.string().min(1),
});

export type PartyFixture = z.infer<typeof partyFixtureSchema>;
export type TransactionLineFixture = z.infer<typeof transactionLineFixtureSchema>;
export type PurchaseOrderFixture = z.infer<typeof purchaseOrderFixtureSchema>;
export type ItemReceiptFixture = z.infer<typeof itemReceiptFixtureSchema>;
export type VendorBillFixture = z.infer<typeof vendorBillFixtureSchema>;
export type SalesOrderFixture = z.infer<typeof salesOrderFixtureSchema>;
export type ItemFulfillmentFixture = z.infer<typeof itemFulfillmentFixtureSchema>;
export type CustomerInvoiceFixture = z.infer<typeof customerInvoiceFixtureSchema>;
export type InventoryAdjustmentFixture = z.infer<typeof inventoryAdjustmentFixtureSchema>;
export type GlEntryFixture = z.infer<typeof glEntryFixtureSchema>;
export type CountPlanFixture = z.infer<typeof countPlanFixtureSchema>;
export type CountTestFixture = z.infer<typeof countTestFixtureSchema>;
export type CountMovementFixture = z.infer<typeof countMovementFixtureSchema>;
export type CarrierShipmentFixture = z.infer<typeof carrierShipmentFixtureSchema>;
export type InstallationFixture = z.infer<typeof installationFixtureSchema>;
export type TelemetryFixture = z.infer<typeof telemetryFixtureSchema>;
export type ContractFixture = z.infer<typeof contractFixtureSchema>;
export type RmaRecordFixture = z.infer<typeof rmaRecordFixtureSchema>;
export type CustodianStatementFixture = z.infer<typeof custodianStatementFixtureSchema>;
export type CrmAccountFixture = z.infer<typeof crmAccountFixtureSchema>;
export type ForecastFixture = z.infer<typeof forecastFixtureSchema>;
export type AssignmentFixture = z.infer<typeof assignmentFixtureSchema>;
export type ScenarioEventFixture = z.infer<typeof scenarioEventFixtureSchema>;
export type CostComponentFixture = z.infer<typeof costComponentFixtureSchema>;
export type PeriodCostFixture = z.infer<typeof periodCostFixtureSchema>;
export type ConsignmentUnitFixture = z.infer<typeof consignmentUnitFixtureSchema>;
export type DispositionFixture = z.infer<typeof dispositionFixtureSchema>;
export type DatasetManifestFixture = z.infer<typeof datasetManifestFixtureSchema>;
