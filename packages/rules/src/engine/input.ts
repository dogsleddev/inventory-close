import type {
  AssignmentFixture,
  CarrierShipmentFixture,
  ContractFixture,
  CountMovementFixture,
  CountPlanFixture,
  CountResultFixture,
  CountTestFixture,
  CustodianStatementFixture,
  CustomerInvoiceFixture,
  ForecastFixture,
  GlBalanceFixture,
  GlEntryFixture,
  InstallationFixture,
  InventoryAdjustmentFixture,
  InventoryItemFixture,
  ItemFulfillmentFixture,
  ItemReceiptFixture,
  PurchaseOrderFixture,
  RmaRecordFixture,
  SalesOrderFixture,
  ScenarioEventFixture,
  SkuFixture,
  SourceHealthFixture,
  TelemetryFixture,
  VendorBillFixture,
} from "@icg/domain";

/**
 * Everything the deterministic close computes FROM. Assembled by the caller
 * (tests today, application services in Stage 04) out of validated fixture
 * data — packages/rules never reads fixture files and never imports
 * @icg/data (dependency direction, docs/05).
 */
export interface CloseInput {
  readonly datasetVersion: string;
  readonly datasetHash: string;
  readonly scenarioScript: string;
  /** Balance-sheet date, "2026-12-31". */
  readonly asOf: string;
  /** Deterministic run timestamp (e.g. the dataset's retrieval instant). */
  readonly runTimestamp: string;
  readonly skus: readonly SkuFixture[];
  readonly inventoryUnits: readonly InventoryItemFixture[];
  readonly glBalances: readonly GlBalanceFixture[];
  readonly glEntries: readonly GlEntryFixture[];
  readonly inventoryAdjustments: readonly InventoryAdjustmentFixture[];
  readonly purchaseOrders: readonly PurchaseOrderFixture[];
  readonly itemReceipts: readonly ItemReceiptFixture[];
  readonly vendorBills: readonly VendorBillFixture[];
  readonly salesOrders: readonly SalesOrderFixture[];
  readonly itemFulfillments: readonly ItemFulfillmentFixture[];
  readonly customerInvoices: readonly CustomerInvoiceFixture[];
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
  readonly forecasts: readonly ForecastFixture[];
  readonly assignments: readonly AssignmentFixture[];
  readonly sourceHealth: readonly SourceHealthFixture[];
  readonly scenarioEvents: readonly ScenarioEventFixture[];
}

/** Fast lookups shared by rules; derived once per run, never mutated. */
export interface CloseIndex {
  readonly skuCostCents: ReadonlyMap<string, number>;
  readonly skuSerialized: ReadonlyMap<string, boolean>;
  readonly unitsBySerial: ReadonlyMap<string, InventoryItemFixture>;
  readonly contractsById: ReadonlyMap<string, ContractFixture>;
  readonly contractsByCounterparty: ReadonlyMap<string, readonly ContractFixture[]>;
}

export function buildIndex(input: CloseInput): CloseIndex {
  const byCounterparty = new Map<string, ContractFixture[]>();
  for (const c of input.contracts) {
    const list = byCounterparty.get(c.counterparty);
    if (list) list.push(c);
    else byCounterparty.set(c.counterparty, [c]);
  }
  return {
    skuCostCents: new Map(input.skus.map((s) => [s.code, s.unitCostCents])),
    skuSerialized: new Map(input.skus.map((s) => [s.code, s.serialized ?? true])),
    unitsBySerial: new Map(input.inventoryUnits.map((u) => [u.serial, u])),
    contractsById: new Map(input.contracts.map((c) => [c.id, c])),
    contractsByCounterparty: byCounterparty,
  };
}
