import { z } from "zod";
import {
  aggregateHealthBasisPoints,
  assignmentFixtureSchema,
  CANONICAL_DATASET_VERSION,
  CANONICAL_GENERATOR_SEED,
  CANONICAL_SCENARIO_SCRIPT,
  carrierShipmentFixtureSchema,
  consignmentUnitFixtureSchema,
  contractFixtureSchema,
  costComponentFixtureSchema,
  countMovementFixtureSchema,
  countPlanFixtureSchema,
  countResultFixtureSchema,
  countTestFixtureSchema,
  crmAccountFixtureSchema,
  custodianStatementFixtureSchema,
  customerInvoiceFixtureSchema,
  datasetManifestFixtureSchema,
  dispositionFixtureSchema,
  forecastFixtureSchema,
  glBalanceFixtureSchema,
  glEntryFixtureSchema,
  installationFixtureSchema,
  inventoryAdjustmentFixtureSchema,
  inventoryItemFixtureSchema,
  itemFulfillmentFixtureSchema,
  itemReceiptFixtureSchema,
  locationFixtureSchema,
  partyFixtureSchema,
  periodCostFixtureSchema,
  purchaseOrderFixtureSchema,
  rmaRecordFixtureSchema,
  salesOrderFixtureSchema,
  scenarioEventFixtureSchema,
  skuFixtureSchema,
  sourceHealthFixtureSchema,
  telemetryFixtureSchema,
  vendorBillFixtureSchema,
} from "@icg/domain";
import type {
  AssignmentFixture,
  CarrierShipmentFixture,
  ConsignmentUnitFixture,
  ContractFixture,
  CostComponentFixture,
  CountMovementFixture,
  CountPlanFixture,
  CountResultFixture,
  CountTestFixture,
  CrmAccountFixture,
  CustodianStatementFixture,
  CustomerInvoiceFixture,
  DatasetManifestFixture,
  DispositionFixture,
  ForecastFixture,
  GlBalanceFixture,
  GlEntryFixture,
  InstallationFixture,
  InventoryAdjustmentFixture,
  InventoryItemFixture,
  ItemFulfillmentFixture,
  ItemReceiptFixture,
  LocationFixture,
  PartyFixture,
  PeriodCostFixture,
  PurchaseOrderFixture,
  RmaRecordFixture,
  SalesOrderFixture,
  ScenarioEventFixture,
  SkuFixture,
  SourceHealthFixture,
  SourceSystemHealth,
  TelemetryFixture,
  VendorBillFixture,
} from "@icg/domain";
import {
  BALANCE_SHEET_DATE,
  GENERATED_AT,
  GENERATOR_VERSION,
  LOCATIONS,
  PARTIES,
  SKU_DEFS,
} from "./constants.js";
import { buildCostComponents, buildPeriodCosts } from "./costing.js";
import { buildCounts } from "./counts.js";
import { buildConsignmentUnits, buildDispositions } from "./lifecycle.js";
import { buildNetSuite } from "./netsuite.js";
import { buildOperational } from "./operational.js";
import { buildScenarioEvents } from "./scenarioEvents.js";
import { buildUnits, type StoryUnits } from "./units.js";
import { hashObject } from "./hash.js";
import { SOURCE_HEALTH } from "./health.js";

/**
 * The complete generated FY2026 dataset: source FACTS only. Exceptions,
 * blockers, readiness, reconciliation conclusions, and close-control states
 * are derived later by the deterministic rules (Stage 03) — never seeded.
 */
export interface IcgDataset {
  readonly manifest: DatasetManifestFixture;
  readonly skus: readonly SkuFixture[];
  readonly locations: readonly LocationFixture[];
  readonly parties: readonly PartyFixture[];
  readonly inventoryUnits: readonly InventoryItemFixture[];
  readonly purchaseOrders: readonly PurchaseOrderFixture[];
  readonly itemReceipts: readonly ItemReceiptFixture[];
  readonly vendorBills: readonly VendorBillFixture[];
  readonly salesOrders: readonly SalesOrderFixture[];
  readonly itemFulfillments: readonly ItemFulfillmentFixture[];
  readonly customerInvoices: readonly CustomerInvoiceFixture[];
  readonly inventoryAdjustments: readonly InventoryAdjustmentFixture[];
  readonly glEntries: readonly GlEntryFixture[];
  readonly glBalances: readonly GlBalanceFixture[];
  readonly countPlans: readonly CountPlanFixture[];
  readonly countResults: readonly CountResultFixture[];
  readonly countTests: readonly CountTestFixture[];
  readonly countMovements: readonly CountMovementFixture[];
  readonly carrierShipments: readonly CarrierShipmentFixture[];
  readonly installations: readonly InstallationFixture[];
  readonly telemetry: readonly TelemetryFixture[];
  readonly contracts: readonly ContractFixture[];
  readonly rmaRecords: readonly RmaRecordFixture[];
  readonly custodianStatements: readonly CustodianStatementFixture[];
  readonly crmAccounts: readonly CrmAccountFixture[];
  readonly forecasts: readonly ForecastFixture[];
  readonly assignments: readonly AssignmentFixture[];
  readonly scenarioEvents: readonly ScenarioEventFixture[];
  readonly sourceHealth: readonly SourceHealthFixture[];
  /**
   * Dataset v1.2.0 additions. None of these reaches `toCloseInput`, so no
   * rule sees them and no derived figure can move: they answer questions the
   * close asks ABOUT inventory (what it costs, which costs belong in it, who
   * owns what is on the floor, what left) without being inventory.
   */
  readonly costComponents: readonly CostComponentFixture[];
  readonly periodCosts: readonly PeriodCostFixture[];
  readonly consignmentInUnits: readonly ConsignmentUnitFixture[];
  readonly dispositions: readonly DispositionFixture[];
  /** Story serials, exported for tests and later stages (not a fixture). */
  readonly story: StoryUnits;
}

/** Every fixture collection, in a stable key order for hashing/manifest. */
export type FixtureCollections = Omit<IcgDataset, "manifest" | "story">;

function parseAll<T>(schema: z.ZodType<T>, rows: unknown, name: string): T[] {
  const result = z.array(schema).safeParse(rows);
  if (!result.success) {
    throw new Error(
      `Fixture collection '${name}' failed validation: ${result.error.message}`,
    );
  }
  return result.data;
}

export function buildDataset(seed: string = CANONICAL_GENERATOR_SEED): IcgDataset {
  const unitsResult = buildUnits(seed);
  const netsuite = buildNetSuite(seed, unitsResult);
  const counts = buildCounts(seed, unitsResult);
  const operational = buildOperational(seed, unitsResult, netsuite);
  const scenarioEvents = buildScenarioEvents(unitsResult);
  // LAST, and deliberately so: these mint serials from the same registry the
  // book population draws from, which advances a per-SKU PRNG stream. Minting
  // them any earlier renumbers every unit generated after them.
  const consignmentInUnits = buildConsignmentUnits(unitsResult.registry);
  const dispositions = buildDispositions(unitsResult.registry);

  // Operational events own the book-movement story for installed and
  // assigned units (see OperationalResult.unitPatches). Location, cost and
  // classification never change here — only the movement date is aligned,
  // so every allocation marginal and control total is untouched.
  const patchedUnits = unitsResult.units.map((u) => {
    const lastMovementAt = operational.unitPatches.get(u.serial);
    return lastMovementAt !== undefined ? { ...u, lastMovementAt } : u;
  });

  const skus = SKU_DEFS.map((s) => ({
    code: s.code,
    description: s.description,
    unitCostCents: s.unitCostCents,
    serialized: s.serialized,
  }));

  const collections: FixtureCollections = {
    skus: parseAll(skuFixtureSchema, skus, "skus"),
    locations: parseAll(locationFixtureSchema, LOCATIONS, "locations"),
    parties: parseAll(partyFixtureSchema, PARTIES, "parties"),
    inventoryUnits: parseAll(inventoryItemFixtureSchema, patchedUnits, "inventoryUnits"),
    purchaseOrders: parseAll(purchaseOrderFixtureSchema, netsuite.purchaseOrders, "purchaseOrders"),
    itemReceipts: parseAll(itemReceiptFixtureSchema, netsuite.itemReceipts, "itemReceipts"),
    vendorBills: parseAll(vendorBillFixtureSchema, netsuite.vendorBills, "vendorBills"),
    salesOrders: parseAll(salesOrderFixtureSchema, netsuite.salesOrders, "salesOrders"),
    itemFulfillments: parseAll(itemFulfillmentFixtureSchema, netsuite.itemFulfillments, "itemFulfillments"),
    customerInvoices: parseAll(customerInvoiceFixtureSchema, netsuite.customerInvoices, "customerInvoices"),
    inventoryAdjustments: parseAll(inventoryAdjustmentFixtureSchema, netsuite.inventoryAdjustments, "inventoryAdjustments"),
    glEntries: parseAll(glEntryFixtureSchema, netsuite.glEntries, "glEntries"),
    glBalances: parseAll(glBalanceFixtureSchema, netsuite.glBalances, "glBalances"),
    countPlans: parseAll(countPlanFixtureSchema, counts.plans, "countPlans"),
    countResults: parseAll(countResultFixtureSchema, counts.results, "countResults"),
    countTests: parseAll(countTestFixtureSchema, counts.tests, "countTests"),
    countMovements: parseAll(countMovementFixtureSchema, counts.movements, "countMovements"),
    carrierShipments: parseAll(carrierShipmentFixtureSchema, operational.carrierShipments, "carrierShipments"),
    installations: parseAll(installationFixtureSchema, operational.installations, "installations"),
    telemetry: parseAll(telemetryFixtureSchema, operational.telemetry, "telemetry"),
    contracts: parseAll(contractFixtureSchema, operational.contracts, "contracts"),
    rmaRecords: parseAll(rmaRecordFixtureSchema, operational.rmaRecords, "rmaRecords"),
    custodianStatements: parseAll(custodianStatementFixtureSchema, operational.custodianStatements, "custodianStatements"),
    crmAccounts: parseAll(crmAccountFixtureSchema, operational.crmAccounts, "crmAccounts"),
    forecasts: parseAll(forecastFixtureSchema, operational.forecasts, "forecasts"),
    assignments: parseAll(assignmentFixtureSchema, operational.assignments, "assignments"),
    scenarioEvents: parseAll(scenarioEventFixtureSchema, scenarioEvents, "scenarioEvents"),
    sourceHealth: parseAll(sourceHealthFixtureSchema, SOURCE_HEALTH, "sourceHealth"),
    costComponents: parseAll(costComponentFixtureSchema, buildCostComponents(), "costComponents"),
    periodCosts: parseAll(periodCostFixtureSchema, buildPeriodCosts(), "periodCosts"),
    consignmentInUnits: parseAll(consignmentUnitFixtureSchema, consignmentInUnits, "consignmentInUnits"),
    dispositions: parseAll(dispositionFixtureSchema, dispositions, "dispositions"),
  };

  // Control totals computed from the generated facts, in integer cents.
  const units = collections.inventoryUnits;
  const grossInventoryCents = units.reduce((sum, u) => sum + u.unitCostCents, 0);
  const grossGlCents = collections.glBalances
    .filter((b) => b.account !== "1290")
    .reduce((sum, b) => sum + b.amountCents, 0);
  const reserveCents =
    collections.glBalances.find((b) => b.account === "1290")?.amountCents ?? 0;
  const countPopulationUnits = units.filter((u) =>
    ["PRIMARY_WAREHOUSE", "RECEIVING", "STAGING", "RMA_REPAIR", "DAMAGED_HOLD"].includes(
      u.location,
    ),
  ).length;
  const healthInputs: SourceSystemHealth[] = collections.sourceHealth.map((h) => ({
    sourceSystem: h.sourceSystem,
    status: h.status,
  }));

  const rowCounts = Object.fromEntries(
    Object.entries(collections).map(([name, rows]) => [name, rows.length]),
  );
  const collectionHashes = Object.fromEntries(
    Object.entries(collections).map(([name, rows]) => [name, hashObject(rows)]),
  );

  const manifest = datasetManifestFixtureSchema.parse({
    datasetVersion: CANONICAL_DATASET_VERSION,
    generatorSeed: seed,
    scenarioScript: CANONICAL_SCENARIO_SCRIPT,
    generatorVersion: GENERATOR_VERSION,
    balanceSheetDate: BALANCE_SHEET_DATE,
    generatedAt: GENERATED_AT,
    rowCounts,
    controlTotals: {
      bookUnits: units.length,
      grossInventoryCents,
      grossGlCents,
      grossGlDifferenceCents: grossGlCents - grossInventoryCents,
      reserveCents,
      countPopulationUnits,
      sourceHealthBasisPoints: aggregateHealthBasisPoints(healthInputs),
    },
    collectionHashes,
    datasetHash: hashObject(collectionHashes),
  });

  return { manifest, ...collections, story: unitsResult.story };
}
