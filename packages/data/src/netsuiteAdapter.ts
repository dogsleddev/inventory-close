import type {
  CountPlanFixture,
  CountResultFixture,
  CustomerInvoiceFixture,
  GlBalanceFixture,
  InventoryAdjustmentFixture,
  InventoryItemFixture,
  ItemFulfillmentFixture,
  ItemReceiptFixture,
  PurchaseOrderFixture,
  SalesOrderFixture,
  SkuFixture,
  VendorBillFixture,
} from "@icg/domain";
import type { IcgDataset } from "./buildDataset.js";

/**
 * Read-only NetSuite adapter (docs/05, CANONICAL_SPEC section 3). MVP has
 * NO posting, count approval, bill/invoice/fulfillment edit, journal
 * posting, or inventory mutation: this interface deliberately contains no
 * mutation method of any kind, and a guard test enforces that by name.
 * Every record preserves its source identity (type, internal id,
 * transaction number, timestamps, hash) via its sourceRef.
 */
export interface NetSuiteAdapter {
  getItems(): Promise<readonly SkuFixture[]>;
  getInventoryState(): Promise<readonly InventoryItemFixture[]>;
  getPurchaseOrders(): Promise<readonly PurchaseOrderFixture[]>;
  getItemReceipts(): Promise<readonly ItemReceiptFixture[]>;
  getVendorBills(): Promise<readonly VendorBillFixture[]>;
  getSalesOrders(): Promise<readonly SalesOrderFixture[]>;
  getItemFulfillments(): Promise<readonly ItemFulfillmentFixture[]>;
  getCustomerInvoices(): Promise<readonly CustomerInvoiceFixture[]>;
  getInventoryCounts(): Promise<readonly CountPlanFixture[]>;
  getInventoryCountResults(countPlanId: string): Promise<readonly CountResultFixture[]>;
  getInventoryAdjustments(): Promise<readonly InventoryAdjustmentFixture[]>;
  getGlBalances(): Promise<readonly GlBalanceFixture[]>;
}

/** Deterministic fixture-backed adapter; returns frozen views of the dataset. */
export function createFixtureNetSuiteAdapter(dataset: IcgDataset): NetSuiteAdapter {
  return {
    getItems: () => Promise.resolve(dataset.skus),
    getInventoryState: () => Promise.resolve(dataset.inventoryUnits),
    getPurchaseOrders: () => Promise.resolve(dataset.purchaseOrders),
    getItemReceipts: () => Promise.resolve(dataset.itemReceipts),
    getVendorBills: () => Promise.resolve(dataset.vendorBills),
    getSalesOrders: () => Promise.resolve(dataset.salesOrders),
    getItemFulfillments: () => Promise.resolve(dataset.itemFulfillments),
    getCustomerInvoices: () => Promise.resolve(dataset.customerInvoices),
    getInventoryCounts: () =>
      Promise.resolve(
        dataset.countPlans.filter((p) => p.sourceRef?.sourceSystem === "NETSUITE_WMS"),
      ),
    getInventoryCountResults: (countPlanId: string) =>
      Promise.resolve(dataset.countResults.filter((r) => r.countPlanId === countPlanId)),
    getInventoryAdjustments: () => Promise.resolve(dataset.inventoryAdjustments),
    getGlBalances: () => Promise.resolve(dataset.glBalances),
  };
}
