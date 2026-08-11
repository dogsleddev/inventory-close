import type { PartyFixture } from "@icg/domain";

export const GENERATOR_VERSION = "1.0.0";

/** Balance-sheet date and the close window (docs/07). */
export const BALANCE_SHEET_DATE = "2026-12-31";
/** Fixed retrieval timestamp for all source refs — never wall-clock time. */
export const RETRIEVED_AT = "2027-01-07T06:00:00Z";
/** Fixed manifest generation stamp (same constant, determinism over realism). */
export const GENERATED_AT = RETRIEVED_AT;

export const LOCATIONS: readonly { id: string; name: string }[] = [
  { id: "PRIMARY_WAREHOUSE", name: "Primary Warehouse" },
  { id: "RECEIVING", name: "Receiving" },
  { id: "STAGING", name: "Shipping / Install Staging" },
  { id: "INBOUND_TRANSIT", name: "Inbound In Transit" },
  { id: "OUTBOUND_TRANSIT", name: "Outbound In Transit" },
  { id: "DEMO_LOANER", name: "Demo / Loaner Pool" },
  { id: "RMA_REPAIR", name: "RMA / Repair" },
  { id: "THIRD_PARTY_CUSTODY", name: "Third-Party Custody" },
  { id: "CUSTOMER_SITE", name: "Customer Site (Company-Owned)" },
  { id: "DAMAGED_HOLD", name: "Damaged / Hold" },
  { id: "CONTRACT_MANUFACTURER", name: "Contract Manufacturer / Vendor" },
];

/** Year-end physical count population (CANONICAL_SPEC §6). */
export const COUNT_POPULATION_LOCATIONS: readonly string[] = [
  "PRIMARY_WAREHOUSE",
  "RECEIVING",
  "STAGING",
  "RMA_REPAIR",
  "DAMAGED_HOLD",
];

export const SKU_DEFS: readonly {
  code: string;
  description: string;
  unitCostCents: number;
  units: number;
  serialized: boolean;
}[] = [
  { code: "KE-I1", description: "KestrelEdge I1 Indoor Node", unitCostCents: 70000, units: 105, serialized: true },
  { code: "KE-M1", description: "KestrelEdge M1 Mast Unit", unitCostCents: 135000, units: 292, serialized: true },
  { code: "KE-S1", description: "KestrelEdge S1 Sensor Array", unitCostCents: 240000, units: 124, serialized: true },
  { code: "KE-E1", description: "KestrelEdge E1 Edge Server", unitCostCents: 490000, units: 130, serialized: true },
  { code: "KE-E2", description: "KestrelEdge E2 Edge Server", unitCostCents: 740000, units: 177, serialized: true },
  { code: "KE-X1", description: "KestrelEdge X1 Compute Cluster", unitCostCents: 920000, units: 138, serialized: true },
  { code: "KE-Y1", description: "KestrelEdge Y1 Perimeter System", unitCostCents: 1280000, units: 32, serialized: true },
  { code: "KV-D1", description: "KestrelVision D1 Dome Camera", unitCostCents: 42500, units: 186, serialized: false },
  { code: "KV-B1", description: "KestrelVision B1 Bullet Camera", unitCostCents: 67500, units: 63, serialized: false },
  { code: "KV-F1", description: "KestrelVision F1 Fisheye Camera", unitCostCents: 87500, units: 43, serialized: false },
  { code: "KV-Z1", description: "KestrelVision Z1 PTZ Camera", unitCostCents: 145000, units: 30, serialized: false },
  { code: "KA-41", description: "KestrelAccess 41 Door Controller", unitCostCents: 120000, units: 115, serialized: false },
  { code: "KR-U1", description: "KestrelRelay U1 Uplink Gateway", unitCostCents: 82500, units: 42, serialized: false },
  { code: "KG-K1", description: "KestrelGrid K1 Site Kit", unitCostCents: 145000, units: 23, serialized: false },
];

/**
 * Vendor sourcing map: edge hardware from Meridian/Volta, accessories from
 * Cascade. Shared, because the purchase documents and the standard-cost
 * stack must name the SAME vendor for a SKU — two copies is how a price list
 * in the cost stack starts citing a vendor the purchase orders never used.
 */
export const VENDOR_OF: Readonly<Record<string, string>> = {
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

export const GL_BALANCES_CENTS: readonly { account: string; amountCents: number }[] = [
  { account: "1200", amountCents: 378915000 },
  { account: "1210", amountCents: 39030000 },
  { account: "1220", amountCents: 39467500 },
  { account: "1230", amountCents: 23832500 },
  // Existing reserve, credit balance, separately reconciled (CANONICAL_SPEC §5).
  { account: "1290", amountCents: -5400000 },
];

/** Fictional counterparties — every name is synthetic. */
export const PARTIES: readonly PartyFixture[] = [
  { id: "V-001", kind: "VENDOR", name: "Meridian Contract Manufacturing" },
  { id: "V-002", kind: "VENDOR", name: "Volta Components Ltd" },
  { id: "V-003", kind: "VENDOR", name: "Cascade Systems Assembly" },
  { id: "CU-001", kind: "CUSTOMER", name: "Bluewater Foods Group" },
  { id: "CU-002", kind: "CUSTOMER", name: "Summit Ridge Health" },
  { id: "CU-003", kind: "CUSTOMER", name: "Ironvale Robotics" },
  { id: "CU-004", kind: "CUSTOMER", name: "Copperline Grocers" },
  { id: "CU-005", kind: "CUSTOMER", name: "Northgate Fulfillment" },
  { id: "CU-006", kind: "CUSTOMER", name: "Silver Fir Hotels" },
  { id: "CU-007", kind: "CUSTOMER", name: "Redstone Manufacturing" },
  { id: "CU-008", kind: "CUSTOMER", name: "Lakeshore Retail Co" },
  { id: "CU-009", kind: "CUSTOMER", name: "Evergreen Campus Services" },
  { id: "CU-010", kind: "CUSTOMER", name: "Halcyon Logistics" },
  { id: "TP-001", kind: "CUSTODIAN", name: "Redwood Installation Services" },
  { id: "TP-002", kind: "CUSTODIAN", name: "Beacon Field Services" },
  { id: "TP-003", kind: "CONTRACT_MANUFACTURER", name: "Meridian Contract Manufacturing" },
];

export const REDWOOD = "Redwood Installation Services";
export const BEACON = "Beacon Field Services";
export const MERIDIAN = "Meridian Contract Manufacturing";

/** Canonical serials that must exist exactly as specified. */
export const SERIAL_EXC001_PRIMARY = "KE-E2-1048";
export const SERIAL_EXC001_LINKED = "KE-E2-1051";
export const SERIAL_EXC003_NOT_FOUND = "KE-X1-3498";
/** Physical unit found on the floor but absent from the book listing. */
export const SERIAL_EXC004_OFF_BOOK = "KE-X1-8842";

/** EXC-001 commercial chain identifiers (CANONICAL_SPEC §8). */
export const EXC001_SO = "SO-26184";
export const EXC001_IF = "IF-261972";
export const EXC001_INVOICE = "INV-2027-00418";
export const EXC001_CUSTOMER = "Bluewater Foods Group";

/** EXC-002 inbound GIT identifiers. */
export const EXC002_PO = "PO-26-1187";
export const EXC002_BILL = "VB-26-2419";
export const EXC002_JAN_RECEIPT = "IR-27-0007";

/** EXC-009 / EXC-014 / EXC-015 GL-side identifiers. */
export const EXC009_RMA = "RMA-2026-0451";
export const EXC009_ADJUSTMENT = "ADJ-2026-0312";
export const EXC009_DUPLICATE_JE = "JE-2026-0790";
export const EXC014_RECEIPT = "IR-26-2214";
export const EXC014_JAN_JE = "JE-2027-0012";
export const EXC015_MANUAL_JE = "JE-2026-0847";

/**
 * Seeded purchase price variance (COMPLETION_PLAN D9, dataset v1.2.0).
 *
 * Inventory is carried at standard cost, so a vendor billing a different
 * price produces PPV — which is expensed, never capitalized. That is exactly
 * why this can exist without moving a single locked figure: no inventory
 * account, no subledger row and no GL balance changes, and PPV stays a
 * match-level attribute rather than becoming a sixteenth exception.
 *
 * Cents per unit, applied to the first line of each vendor's largest fully
 * matched FY2026 purchase order. Positive is unfavorable (billed above
 * standard); negative is favorable.
 */
export const PPV_PER_UNIT_CENTS: Readonly<Record<string, number>> = {
  "Meridian Contract Manufacturing": 1800,
  "Volta Components Ltd": -2250,
  "Cascade Systems Assembly": 4500,
};

/** Redwood's designed 14-unit composition (CANONICAL_SPEC §9). */
export const REDWOOD_COMPOSITION: readonly { sku: string; units: number }[] = [
  { sku: "KE-S1", units: 1 },
  { sku: "KE-E1", units: 4 },
  { sku: "KE-X1", units: 6 },
  { sku: "KE-Y1", units: 1 },
  { sku: "KA-41", units: 2 },
];
