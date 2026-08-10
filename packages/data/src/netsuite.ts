import type {
  CustomerInvoiceFixture,
  GlBalanceFixture,
  GlEntryFixture,
  InventoryAdjustmentFixture,
  InventoryItemFixture,
  ItemFulfillmentFixture,
  ItemReceiptFixture,
  PurchaseOrderFixture,
  SalesOrderFixture,
  TransactionLineFixture,
  VendorBillFixture,
} from "@icg/domain";
import {
  BALANCE_SHEET_DATE,
  EXC001_CUSTOMER,
  EXC001_IF,
  EXC001_INVOICE,
  EXC001_SO,
  EXC002_BILL,
  EXC002_JAN_RECEIPT,
  EXC002_PO,
  EXC009_ADJUSTMENT,
  EXC009_DUPLICATE_JE,
  EXC009_RMA,
  EXC014_JAN_JE,
  EXC014_RECEIPT,
  EXC015_MANUAL_JE,
  GL_BALANCES_CENTS,
  PARTIES,
  RETRIEVED_AT,
  SKU_DEFS,
} from "./constants.js";
import { addDays, atTime } from "./dateMath.js";
import { hashObject } from "./hash.js";
import { createPrng } from "./prng.js";
import type { UnitsResult } from "./units.js";

const skuByCode = new Map(SKU_DEFS.map((s) => [s.code, s]));
const CUSTOMERS = PARTIES.filter((p) => p.kind === "CUSTOMER").map((p) => p.name);

/** Vendor sourcing map: edge hardware from Meridian/Volta, accessories from Cascade. */
const VENDOR_OF: Readonly<Record<string, string>> = {
  "KE-I1": "Volta Components Ltd",
  "KE-M1": "Meridian Contract Manufacturing",
  "KE-S1": "Meridian Contract Manufacturing",
  "KE-E1": "Volta Components Ltd",
  "KE-E2": "Meridian Contract Manufacturing",
  "KE-X1": "Volta Components Ltd",
  "KE-Y1": "Meridian Contract Manufacturing",
  "KV-D1": "Cascade Systems Assembly",
  "KV-B1": "Cascade Systems Assembly",
  "KV-F1": "Cascade Systems Assembly",
  "KV-Z1": "Cascade Systems Assembly",
  "KA-41": "Cascade Systems Assembly",
  "KR-U1": "Volta Components Ltd",
  "KG-K1": "Cascade Systems Assembly",
};

function mkRef(
  recordType: string,
  internalId: number,
  transactionNumber: string,
  lastModifiedAt: string,
) {
  return {
    sourceSystem: "NETSUITE_ERP" as const,
    recordType,
    internalId: String(internalId),
    transactionNumber,
    lastModifiedAt,
    retrievedAt: RETRIEVED_AT,
    sourceHash: hashObject({ recordType, internalId, transactionNumber }),
  };
}

function costLines(
  bySku: ReadonlyMap<string, { quantity: number; serials: string[] }>,
): TransactionLineFixture[] {
  return [...bySku.entries()].map(([sku, group], i) => {
    const def = skuByCode.get(sku);
    if (!def) throw new Error(`Unknown SKU ${sku}`);
    return {
      lineId: `L${i + 1}`,
      sku,
      quantity: group.quantity,
      amountCents: group.quantity * def.unitCostCents,
      ...(group.serials.length > 0 ? { serials: group.serials } : {}),
    };
  });
}

function groupUnitsBySku(
  units: readonly InventoryItemFixture[],
): Map<string, { quantity: number; serials: string[] }> {
  const bySku = new Map<string, { quantity: number; serials: string[] }>();
  for (const u of units) {
    let g = bySku.get(u.sku);
    if (!g) {
      g = { quantity: 0, serials: [] };
      bySku.set(u.sku, g);
    }
    g.quantity += 1;
    if (skuByCode.get(u.sku)?.serialized) {
      g.serials.push(u.serial);
    }
  }
  return bySku;
}

export interface SoldChain {
  readonly salesOrderNumber: string;
  readonly fulfillmentNumber: string;
  readonly invoiceNumber: string;
  readonly customer: string;
  readonly serials: readonly string[];
  readonly shipDate: string;
  readonly deliveredDate: string;
}

export interface StagedOutboundOrder {
  readonly salesOrderNumber: string;
  readonly customer: string;
  readonly serials: readonly string[];
  readonly pickupDate: string;
}

export interface NetSuiteResult {
  purchaseOrders: PurchaseOrderFixture[];
  itemReceipts: ItemReceiptFixture[];
  vendorBills: VendorBillFixture[];
  salesOrders: SalesOrderFixture[];
  itemFulfillments: ItemFulfillmentFixture[];
  customerInvoices: CustomerInvoiceFixture[];
  inventoryAdjustments: InventoryAdjustmentFixture[];
  glEntries: GlEntryFixture[];
  glBalances: GlBalanceFixture[];
  soldChains: SoldChain[];
  stagedOutbound: StagedOutboundOrder[];
}

export function buildNetSuite(seed: string, unitsResult: UnitsResult): NetSuiteResult {
  const { units, story, registry } = unitsResult;
  const prng = createPrng(`${seed}:netsuite`);
  let internalId = 10000;
  const nextId = () => ++internalId;

  const purchaseOrders: PurchaseOrderFixture[] = [];
  const itemReceipts: ItemReceiptFixture[] = [];
  const vendorBills: VendorBillFixture[] = [];

  // ---- Purchase side: one PO/receipt/bill per (vendor, acquisition date) ----
  // Inbound-transit units and the EXC-014 timing unit get dedicated handling.
  const normal = units.filter(
    (u) => u.location !== "INBOUND_TRANSIT" && u.serial !== story.exc014Serial,
  );
  const batches = new Map<string, InventoryItemFixture[]>();
  for (const u of normal) {
    const vendor = VENDOR_OF[u.sku];
    if (!vendor) throw new Error(`No vendor for SKU ${u.sku}`);
    const key = `${vendor}|${u.acquiredAt ?? BALANCE_SHEET_DATE}`;
    const list = batches.get(key);
    if (list) list.push(u);
    else batches.set(key, [u]);
  }
  let poSeq = 3000;
  let irSeq = 4000;
  let vbSeq = 5000;
  const sortedBatches = [...batches.entries()].sort(([a], [b]) =>
    a < b ? -1 : 1,
  );
  for (const [key, batchUnits] of sortedBatches) {
    const [vendor, receiptDate] = key.split("|") as [string, string];
    const yy = receiptDate.slice(2, 4);
    const orderDate = addDays(receiptDate, -21);
    const poNumber = `PO-${orderDate.slice(2, 4)}-${++poSeq}`;
    const irNumber = `IR-${yy}-${++irSeq}`;
    const vbNumber = `VB-${yy}-${++vbSeq}`;
    const billDate = addDays(receiptDate, 7);
    const lines = costLines(groupUnitsBySku(batchUnits));
    purchaseOrders.push({
      sourceRef: mkRef("PURCHASE_ORDER", nextId(), poNumber, atTime(orderDate, "16:00:00")),
      transactionNumber: poNumber,
      vendor,
      orderDate,
      lines,
    });
    itemReceipts.push({
      sourceRef: mkRef("ITEM_RECEIPT", nextId(), irNumber, atTime(receiptDate, "18:30:00")),
      transactionNumber: irNumber,
      purchaseOrderNumber: poNumber,
      receiptDate,
      lines,
    });
    vendorBills.push({
      sourceRef: mkRef("VENDOR_BILL", nextId(), vbNumber, atTime(billDate, "12:00:00")),
      transactionNumber: vbNumber,
      purchaseOrderNumber: poNumber,
      billDate,
      lines,
    });
  }

  // EXC-014: dedicated PO / receipt 12/30; the GL side posts in January.
  {
    const unit = units.find((u) => u.serial === story.exc014Serial);
    if (!unit) throw new Error("EXC-014 unit missing");
    const lines = costLines(groupUnitsBySku([unit]));
    purchaseOrders.push({
      sourceRef: mkRef("PURCHASE_ORDER", nextId(), "PO-26-1201", "2026-12-12T16:00:00Z"),
      transactionNumber: "PO-26-1201",
      vendor: VENDOR_OF["KE-X1"]!,
      orderDate: "2026-12-12",
      lines,
    });
    itemReceipts.push({
      sourceRef: mkRef("ITEM_RECEIPT", nextId(), EXC014_RECEIPT, "2026-12-30T19:45:00Z"),
      transactionNumber: EXC014_RECEIPT,
      purchaseOrderNumber: "PO-26-1201",
      receiptDate: "2026-12-30",
      lines,
    });
    vendorBills.push({
      sourceRef: mkRef("VENDOR_BILL", nextId(), "VB-26-2431", "2026-12-31T12:00:00Z"),
      transactionNumber: "VB-26-2431",
      purchaseOrderNumber: "PO-26-1201",
      billDate: "2026-12-31",
      lines,
    });
  }

  // EXC-002: PO + bill in December; vendor shipped 12/29; the NetSuite item
  // receipt is not recorded until 1/4/2027; ownership terms unresolved.
  {
    const excUnits = units.filter((u) => story.exc002Serials.includes(u.serial));
    const lines = costLines(groupUnitsBySku(excUnits));
    purchaseOrders.push({
      sourceRef: mkRef("PURCHASE_ORDER", nextId(), EXC002_PO, "2026-12-15T16:00:00Z"),
      transactionNumber: EXC002_PO,
      vendor: VENDOR_OF["KE-X1"]!,
      orderDate: "2026-12-15",
      lines,
    });
    vendorBills.push({
      sourceRef: mkRef("VENDOR_BILL", nextId(), EXC002_BILL, "2026-12-30T12:00:00Z"),
      transactionNumber: EXC002_BILL,
      purchaseOrderNumber: EXC002_PO,
      billDate: "2026-12-30",
      lines,
    });
    itemReceipts.push({
      sourceRef: mkRef("ITEM_RECEIPT", nextId(), EXC002_JAN_RECEIPT, "2027-01-04T15:20:00Z"),
      transactionNumber: EXC002_JAN_RECEIPT,
      purchaseOrderNumber: EXC002_PO,
      receiptDate: "2027-01-04",
      lines,
    });
  }

  // Other inbound-GIT purchases: billed in December (FOB origin, title clear),
  // received in early January.
  {
    const otherGit = units.filter(
      (u) => u.location === "INBOUND_TRANSIT" && !story.exc002Serials.includes(u.serial),
    );
    const byVendor = new Map<string, InventoryItemFixture[]>();
    for (const u of otherGit) {
      const vendor = VENDOR_OF[u.sku]!;
      const list = byVendor.get(vendor);
      if (list) list.push(u);
      else byVendor.set(vendor, [u]);
    }
    let gitSeq = 0;
    for (const [vendor, vendorUnits] of [...byVendor.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
      gitSeq += 1;
      const poNumber = `PO-26-12${40 + gitSeq}`;
      const vbNumber = `VB-26-24${40 + gitSeq}`;
      const irNumber = `IR-27-00${10 + gitSeq}`;
      const shipDay = 26 + gitSeq;
      const lines = costLines(groupUnitsBySku(vendorUnits));
      purchaseOrders.push({
        sourceRef: mkRef("PURCHASE_ORDER", nextId(), poNumber, "2026-12-08T16:00:00Z"),
        transactionNumber: poNumber,
        vendor,
        orderDate: "2026-12-08",
        lines,
      });
      vendorBills.push({
        sourceRef: mkRef("VENDOR_BILL", nextId(), vbNumber, atTime(`2026-12-${shipDay}`, "12:00:00")),
        transactionNumber: vbNumber,
        purchaseOrderNumber: poNumber,
        billDate: `2026-12-${shipDay}`,
        lines,
      });
      itemReceipts.push({
        sourceRef: mkRef("ITEM_RECEIPT", nextId(), irNumber, atTime(`2027-01-0${1 + gitSeq}`, "15:00:00")),
        transactionNumber: irNumber,
        purchaseOrderNumber: poNumber,
        receiptDate: `2027-01-0${1 + gitSeq}`,
        lines,
      });
    }
  }

  // ---- Sales side ----
  const salesOrders: SalesOrderFixture[] = [];
  const itemFulfillments: ItemFulfillmentFixture[] = [];
  const customerInvoices: CustomerInvoiceFixture[] = [];
  const soldChains: SoldChain[] = [];

  // Ten clean, fully-chained FY2026 sales (units sold before year end are not
  // in the book population; their serials come from the same registry).
  const SELLABLE = ["KE-M1", "KE-S1", "KE-E1", "KE-E2", "KE-X1"];
  for (let i = 0; i < 10; i++) {
    const customer = CUSTOMERS[i % CUSTOMERS.length]!;
    const soNumber = `SO-26${101 + i}`;
    const ifNumber = `IF-26${1501 + i}`;
    const invNumber = `INV-2026-0${301 + i}`;
    const orderDate = addDays("2026-11-03", i * 4);
    const shipDate = addDays(orderDate, 3);
    const deliveredDate = addDays(shipDate, 2);
    const invoiceDate = addDays(deliveredDate, 1);
    const unitCount = prng.int(2, 4);
    const bySku = new Map<string, { quantity: number; serials: string[] }>();
    const serials: string[] = [];
    for (let n = 0; n < unitCount; n++) {
      const sku = SELLABLE[prng.int(0, SELLABLE.length - 1)]!;
      const serial = registry.mint(sku);
      serials.push(serial);
      let g = bySku.get(sku);
      if (!g) {
        g = { quantity: 0, serials: [] };
        bySku.set(sku, g);
      }
      g.quantity += 1;
      g.serials.push(serial);
    }
    const cost = costLines(bySku);
    const priced = cost.map((l) => ({
      ...l,
      amountCents: Math.round((l.amountCents ?? 0) * 1.6),
    }));
    salesOrders.push({
      sourceRef: mkRef("SALES_ORDER", nextId(), soNumber, atTime(orderDate, "17:00:00")),
      transactionNumber: soNumber,
      customer,
      orderDate,
      lines: priced,
    });
    itemFulfillments.push({
      sourceRef: mkRef("ITEM_FULFILLMENT", nextId(), ifNumber, atTime(shipDate, "18:00:00")),
      transactionNumber: ifNumber,
      salesOrderNumber: soNumber,
      shipDate,
      lines: cost,
    });
    customerInvoices.push({
      sourceRef: mkRef("CUSTOMER_INVOICE", nextId(), invNumber, atTime(invoiceDate, "09:00:00")),
      transactionNumber: invNumber,
      salesOrderNumber: soNumber,
      invoiceDate,
      lines: priced,
    });
    soldChains.push({
      salesOrderNumber: soNumber,
      fulfillmentNumber: ifNumber,
      invoiceNumber: invNumber,
      customer,
      serials,
      shipDate,
      deliveredDate,
    });
  }

  // EXC-001: SO-26184 / IF-261972 shipped 12/27; invoice dated 1/2/2027;
  // NetSuite year-end inventory for both serials still shows Warehouse.
  {
    const exc001Cost = costLines(
      new Map([["KE-E2", { quantity: 2, serials: [...story.exc001Serials] }]]),
    );
    const exc001Priced = exc001Cost.map((l) => ({
      ...l,
      amountCents: Math.round((l.amountCents ?? 0) * 1.6),
    }));
    salesOrders.push({
      sourceRef: mkRef("SALES_ORDER", nextId(), EXC001_SO, "2026-12-22T17:10:00Z"),
      transactionNumber: EXC001_SO,
      customer: EXC001_CUSTOMER,
      orderDate: "2026-12-22",
      lines: exc001Priced,
    });
    itemFulfillments.push({
      sourceRef: mkRef("ITEM_FULFILLMENT", nextId(), EXC001_IF, "2026-12-27T18:05:00Z"),
      transactionNumber: EXC001_IF,
      salesOrderNumber: EXC001_SO,
      shipDate: "2026-12-27",
      lines: exc001Cost,
    });
    customerInvoices.push({
      sourceRef: mkRef("CUSTOMER_INVOICE", nextId(), EXC001_INVOICE, "2027-01-02T09:30:00Z"),
      transactionNumber: EXC001_INVOICE,
      salesOrderNumber: EXC001_SO,
      invoiceDate: "2027-01-02",
      lines: exc001Priced,
    });
  }

  // Outbound in-transit (GIT_OUT): staged orders picked up late December,
  // title passes on delivery; no fulfillment posted, no invoice issued.
  const stagedOutbound: StagedOutboundOrder[] = [];
  {
    const outbound = units.filter((u) => u.location === "OUTBOUND_TRANSIT");
    const chunkSize = Math.ceil(outbound.length / 3);
    for (let c = 0; c < 3; c++) {
      const chunk = outbound.slice(c * chunkSize, (c + 1) * chunkSize);
      if (chunk.length === 0) continue;
      const soNumber = `SO-26${190 + c}`;
      const customer = CUSTOMERS[(c + 3) % CUSTOMERS.length]!;
      const orderDate = `2026-12-${18 + c}`;
      const priced = costLines(groupUnitsBySku(chunk)).map((l) => ({
        ...l,
        amountCents: Math.round((l.amountCents ?? 0) * 1.6),
      }));
      salesOrders.push({
        sourceRef: mkRef("SALES_ORDER", nextId(), soNumber, atTime(orderDate, "17:00:00")),
        transactionNumber: soNumber,
        customer,
        orderDate,
        lines: priced,
      });
      stagedOutbound.push({
        salesOrderNumber: soNumber,
        customer,
        serials: chunk
          .filter((u) => skuByCode.get(u.sku)?.serialized)
          .map((u) => u.serial),
        pickupDate: `2026-12-${28 + c}`,
      });
    }
  }

  // ---- Adjustments and journal entries ----
  const inventoryAdjustments: InventoryAdjustmentFixture[] = [
    {
      sourceRef: mkRef("INVENTORY_ADJUSTMENT", nextId(), "ADJ-2026-0058", "2026-02-20T17:00:00Z"),
      transactionNumber: "ADJ-2026-0058",
      adjustmentDate: "2026-02-20",
      glAccount: "1200",
      reason: "Cycle count variance write-off — approved after recount",
      relatedCountPlanId: "CNT-CC-2026-02",
      lines: [{ lineId: "L1", sku: "KV-B1", quantity: 1, amountCents: -67500 }],
    },
    {
      sourceRef: mkRef("INVENTORY_ADJUSTMENT", nextId(), EXC009_ADJUSTMENT, "2026-12-28T16:40:00Z"),
      transactionNumber: EXC009_ADJUSTMENT,
      adjustmentDate: "2026-12-28",
      glAccount: "1230",
      reason: `RMA return to stock — ${EXC009_RMA} / RMA-2026-0452`,
      lines: [{ lineId: "L1", sku: "KV-Z1", quantity: 2, amountCents: 290000 }],
    },
  ];

  const glEntries: GlEntryFixture[] = [
    {
      // EXC-009: manual re-add duplicating ADJ-2026-0312, and posted to 1200.
      sourceRef: mkRef("GL_ENTRY", nextId(), EXC009_DUPLICATE_JE, "2026-12-29T15:10:00Z"),
      transactionNumber: EXC009_DUPLICATE_JE,
      postedDate: "2026-12-29",
      account: "1200",
      amountCents: 290000,
      memo: `RMA return re-add — KV-Z1 x2 (${EXC009_RMA}, RMA-2026-0452)`,
      enteredBy: "T. Okafor",
      supportRef: EXC009_RMA,
    },
    {
      // EXC-015: unsupported manual entry, no support reference.
      sourceRef: mkRef("GL_ENTRY", nextId(), EXC015_MANUAL_JE, "2026-12-31T22:55:00Z"),
      transactionNumber: EXC015_MANUAL_JE,
      postedDate: "2026-12-31",
      account: "1200",
      amountCents: 1875000,
      memo: "Year-end inventory true-up",
      enteredBy: "T. Okafor",
    },
    {
      // EXC-014: the GL posting for IR-26-2214, delayed into January.
      sourceRef: mkRef("GL_ENTRY", nextId(), EXC014_JAN_JE, "2027-01-02T07:15:00Z"),
      transactionNumber: EXC014_JAN_JE,
      postedDate: "2027-01-02",
      account: "1200",
      amountCents: 920000,
      memo: `Receipt posting for ${EXC014_RECEIPT} — December batch interface delay`,
      enteredBy: "SYSTEM-BATCH",
      supportRef: EXC014_RECEIPT,
    },
  ];

  const glBalances: GlBalanceFixture[] = GL_BALANCES_CENTS.map((b, i) => ({
    account: b.account,
    asOf: BALANCE_SHEET_DATE,
    amountCents: b.amountCents,
    sourceRef: mkRef("GL_BALANCE", 90001 + i, `GLB-2026-${b.account}`, "2027-01-01T02:00:00Z"),
  }));

  return {
    purchaseOrders,
    itemReceipts,
    vendorBills,
    salesOrders,
    itemFulfillments,
    customerInvoices,
    inventoryAdjustments,
    glEntries,
    glBalances,
    soldChains,
    stagedOutbound,
  };
}
