import type { ConsignmentUnitFixture, DispositionFixture } from "@icg/domain";
import { RETRIEVED_AT, SKU_DEFS, VENDOR_OF } from "./constants.js";
import { hashObject } from "./hash.js";
import type { SerialRegistry } from "./units.js";

/**
 * Off-book unit lifecycle (dataset v1.2.0): stock the company holds but does
 * not own, and stock it owned and no longer holds.
 *
 * Both collections exist because the book population cannot express either
 * case. A consigned unit is on the floor and is not inventory; a scrapped
 * unit is inventory history and is not on the floor. Keeping them as separate
 * collections is what makes them impossible to sum into the 1,500 — the
 * exclusion is structural, not a filter somebody has to remember to apply.
 *
 * Serials are minted from the SAME registry the book population uses, so a
 * consigned or disposed serial can never collide with a booked one. This
 * module therefore runs LAST in `buildDataset`: minting advances a per-SKU
 * PRNG stream, and minting earlier would renumber the book population.
 */

const skuByCode = new Map(SKU_DEFS.map((s) => [s.code, s]));

function unitCostOf(sku: string): number {
  const def = skuByCode.get(sku);
  if (def === undefined) throw new Error(`Unknown SKU ${sku}`);
  return def.unitCostCents;
}

function mkRef(sourceSystem: "NETSUITE_ERP" | "NETSUITE_WMS", recordType: string, internalId: number, transactionNumber?: string) {
  return {
    sourceSystem,
    recordType,
    internalId: String(internalId),
    ...(transactionNumber !== undefined ? { transactionNumber } : {}),
    retrievedAt: RETRIEVED_AT,
    sourceHash: hashObject({ recordType, internalId, transactionNumber }),
  };
}

/**
 * Vendor-owned stock held on site. The owner is the SKU's own vendor, so the
 * consignment agreement and the purchase documents can never name different
 * counterparties for the same part.
 */
const CONSIGNMENT_PLAN: readonly {
  sku: string;
  count: number;
  location: string;
  bin: string;
  agreementRef: string;
  receivedAt: string;
}[] = [
  { sku: "KE-X1", count: 5, location: "PRIMARY_WAREHOUSE", bin: "CONSIGN-A1", agreementRef: "CA-VOLTA-2026-01", receivedAt: "2026-09-14" },
  { sku: "KE-E1", count: 4, location: "PRIMARY_WAREHOUSE", bin: "CONSIGN-A2", agreementRef: "CA-VOLTA-2026-01", receivedAt: "2026-10-26" },
  { sku: "KE-S1", count: 3, location: "RECEIVING", bin: "CONSIGN-B2", agreementRef: "CA-MERIDIAN-2026-01", receivedAt: "2026-11-09" },
];

export function buildConsignmentUnits(registry: SerialRegistry): ConsignmentUnitFixture[] {
  const rows: ConsignmentUnitFixture[] = [];
  let internalId = 810_000;
  for (const plan of CONSIGNMENT_PLAN) {
    const owner = VENDOR_OF[plan.sku];
    if (owner === undefined) throw new Error(`No vendor for SKU ${plan.sku}`);
    for (let i = 0; i < plan.count; i++) {
      const serial = registry.mint(plan.sku);
      rows.push({
        serial,
        sku: plan.sku,
        owner,
        location: plan.location,
        bin: plan.bin,
        receivedAt: plan.receivedAt,
        agreementRef: plan.agreementRef,
        // The owner's stated value at the standard price for the part. It is
        // labelled as the owner's figure because the company has no cost
        // basis in a unit it never bought.
        vendorStatedValueCents: unitCostOf(plan.sku),
        // The WMS knows the unit is on the floor; the ERP does not carry it
        // as inventory. That split IS the consignment story.
        sourceRef: mkRef("NETSUITE_WMS", "CONSIGNMENT_HOLDING", ++internalId),
      });
    }
  }
  return rows;
}

/**
 * FY2026 disposals. Every unit here left the book before the balance-sheet
 * date, so none of them is in the 1,500 — and none is minted into it.
 */
const DISPOSITION_PLAN: readonly {
  id: string;
  sku: string;
  method: DispositionFixture["method"];
  disposedAt: string;
  proceedsCents: number;
  reason: string;
  authorizedBy: string;
  evidenceRef: string;
  adjustment: string;
}[] = [
  {
    id: "DSP-2026-0001",
    sku: "KE-S1",
    method: "SCRAPPED",
    disposedAt: "2026-06-02",
    proceedsCents: 0,
    reason:
      "Board-level failure outside warranty. Repair quote exceeded replacement cost, so the unit was scrapped rather than returned to stock.",
    authorizedBy: "R. Alvarez",
    evidenceRef: "SCRAP-CERT-2026-0031",
    adjustment: "ADJ-2026-0188",
  },
  {
    id: "DSP-2026-0002",
    sku: "KE-M1",
    method: "SCRAPPED",
    disposedAt: "2026-09-18",
    proceedsCents: 0,
    reason:
      "Water ingress during a site survey. The unit failed post-repair test and was scrapped under the damaged-stock policy.",
    authorizedBy: "R. Alvarez",
    evidenceRef: "SCRAP-CERT-2026-0044",
    adjustment: "ADJ-2026-0261",
  },
  {
    id: "DSP-2026-0003",
    sku: "KE-E1",
    method: "RETURNED_TO_VENDOR",
    disposedAt: "2026-04-27",
    // Full credit: a warranty replacement, not a loss.
    proceedsCents: 490_000,
    reason:
      "Returned to the vendor under warranty. A credit memo was issued for the full standard cost and the replacement unit was received separately.",
    authorizedBy: "D. Whitfield",
    evidenceRef: "VCM-2026-0117",
    adjustment: "ADJ-2026-0126",
  },
  {
    id: "DSP-2026-0004",
    sku: "KE-I1",
    method: "SALVAGE_SALE",
    disposedAt: "2026-11-30",
    proceedsCents: 12_000,
    reason:
      "Cosmetic damage in transit made the unit unsellable as new. Sold for salvage to a refurbisher at the recovered amount.",
    authorizedBy: "D. Whitfield",
    evidenceRef: "SALV-2026-0009",
    adjustment: "ADJ-2026-0303",
  },
];

export function buildDispositions(registry: SerialRegistry): DispositionFixture[] {
  let internalId = 820_000;
  return DISPOSITION_PLAN.map((plan) => ({
    id: plan.id,
    serial: registry.mint(plan.sku),
    sku: plan.sku,
    method: plan.method,
    disposedAt: plan.disposedAt,
    originalCostCents: unitCostOf(plan.sku),
    proceedsCents: plan.proceedsCents,
    reason: plan.reason,
    authorizedBy: plan.authorizedBy,
    evidenceRef: plan.evidenceRef,
    sourceRef: mkRef("NETSUITE_ERP", "INVENTORY_ADJUSTMENT", ++internalId, plan.adjustment),
  }));
}
