import type { IcgDataset } from "./buildDataset.js";

/**
 * Assemble the rule engine's input from a generated dataset. This is the
 * ONE sanctioned bridge from @icg/data to the shape @icg/rules consumes;
 * application services and tests both use it, so the wiring can never
 * drift between them. The returned object is plain fixture data — the
 * rules package defines the CloseInput type and never imports this.
 */
export function toCloseInput(dataset: IcgDataset) {
  return {
    datasetVersion: dataset.manifest.datasetVersion,
    datasetHash: dataset.manifest.datasetHash,
    scenarioScript: dataset.manifest.scenarioScript,
    asOf: dataset.manifest.balanceSheetDate,
    runTimestamp: dataset.manifest.generatedAt,
    skus: dataset.skus,
    inventoryUnits: dataset.inventoryUnits,
    glBalances: dataset.glBalances,
    glEntries: dataset.glEntries,
    inventoryAdjustments: dataset.inventoryAdjustments,
    purchaseOrders: dataset.purchaseOrders,
    itemReceipts: dataset.itemReceipts,
    vendorBills: dataset.vendorBills,
    salesOrders: dataset.salesOrders,
    itemFulfillments: dataset.itemFulfillments,
    customerInvoices: dataset.customerInvoices,
    countPlans: dataset.countPlans,
    countResults: dataset.countResults,
    countTests: dataset.countTests,
    countMovements: dataset.countMovements,
    carrierShipments: dataset.carrierShipments,
    installations: dataset.installations,
    telemetry: dataset.telemetry,
    contracts: dataset.contracts,
    rmaRecords: dataset.rmaRecords,
    custodianStatements: dataset.custodianStatements,
    forecasts: dataset.forecasts,
    assignments: dataset.assignments,
    sourceHealth: dataset.sourceHealth,
    scenarioEvents: dataset.scenarioEvents,
  };
}
