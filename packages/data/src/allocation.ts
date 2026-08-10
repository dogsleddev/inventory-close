import type { AccountingClassification } from "@icg/domain";

/**
 * The canonical allocation plan: SKU unit counts per (location,
 * classification) cell. Produced once by a deterministic exact solver against
 * CANONICAL_SPEC §5 and frozen here; the control-total tests re-verify every
 * marginal (SKU units, location units+value, classification units+value) on
 * every run. Do not edit by hand — any change breaks the locked baseline.
 *
 * Story pins inside these numbers:
 * - WH_FH holds EXC-001's two KE-E2 (book location still Warehouse), the
 *   EXC-003 KE-X1 (the only warehouse KE-X1 is KE-X1-3498), EXC-006's and
 *   EXC-013's KE-E2, and EXC-005's KV-Z1 miscount pool.
 * - WH_VR holds exactly the 20 KE-M1 under E&O review (EXC-011) plus ten
 *   other units management placed under valuation review.
 * - GIT_IN includes EXC-002's three KE-X1. TPC_TP includes Redwood's exact
 *   14-unit composition. CS_LOANER includes EXC-008's KE-Y1. DMG_DMG
 *   includes EXC-012's KE-E1. DL_DEMO includes EXC-010's KE-X1.
 */
export interface AllocationCell {
  readonly id: string;
  readonly location: string;
  readonly classification: AccountingClassification;
  readonly skuUnits: Readonly<Record<string, number>>;
}

export const ALLOCATION_PLAN: readonly AllocationCell[] = [
  {
    id: "WH_FH",
    location: "PRIMARY_WAREHOUSE",
    classification: "FINISHED_HARDWARE",
    skuUnits: {
      "KE-M1": 271, "KE-S1": 121, "KE-E1": 119, "KE-E2": 154, "KE-X1": 1,
      "KV-F1": 1, "KV-Z1": 19, "KA-41": 91, "KG-K1": 23,
    },
  },
  {
    id: "WH_VR",
    location: "PRIMARY_WAREHOUSE",
    classification: "VALUATION_REVIEW",
    skuUnits: {
      "KE-M1": 20, "KE-I1": 1, "KE-Y1": 5, "KV-D1": 1, "KV-B1": 1,
      "KV-F1": 1, "KR-U1": 1,
    },
  },
  {
    id: "RCV_FH",
    location: "RECEIVING",
    classification: "FINISHED_HARDWARE",
    skuUnits: { "KE-S1": 1, "KE-X1": 17, "KV-D1": 39, "KV-B1": 3 },
  },
  {
    id: "STG_FH",
    location: "STAGING",
    classification: "FINISHED_HARDWARE",
    skuUnits: {
      "KE-E1": 1, "KE-E2": 22, "KE-X1": 2, "KV-F1": 22, "KV-Z1": 4,
      "KA-41": 20, "KR-U1": 4,
    },
  },
  {
    id: "GIT_IN",
    location: "INBOUND_TRANSIT",
    classification: "GIT",
    skuUnits: { "KE-E1": 1, "KE-X1": 12, "KE-Y1": 2, "KV-D1": 39, "KV-Z1": 1 },
  },
  {
    id: "GIT_OUT",
    location: "OUTBOUND_TRANSIT",
    classification: "GIT",
    skuUnits: {
      "KE-I1": 2, "KE-E1": 1, "KE-X1": 22, "KV-D1": 9, "KV-B1": 24,
      "KV-Z1": 1, "KA-41": 1,
    },
  },
  {
    id: "DL_DEMO",
    location: "DEMO_LOANER",
    classification: "DEMO",
    skuUnits: { "KE-I1": 4, "KE-E1": 1, "KE-X1": 21, "KV-F1": 15, "KR-U1": 34 },
  },
  {
    id: "DL_LOANER",
    location: "DEMO_LOANER",
    classification: "LOANER",
    skuUnits: { "KE-I1": 1, "KE-X1": 1, "KE-Y1": 2, "KR-U1": 1 },
  },
  {
    id: "RMA_RMA",
    location: "RMA_REPAIR",
    classification: "RMA",
    skuUnits: {
      "KE-I1": 6, "KE-E1": 1, "KE-X1": 22, "KV-B1": 32, "KV-F1": 1,
      "KV-Z1": 3,
    },
  },
  {
    id: "TPC_TP",
    location: "THIRD_PARTY_CUSTODY",
    classification: "THIRD_PARTY",
    skuUnits: {
      "KE-I1": 50, "KE-M1": 1, "KE-S1": 1, "KE-E1": 5, "KE-X1": 18,
      "KE-Y1": 1, "KV-F1": 1, "KA-41": 3,
    },
  },
  {
    id: "CS_FH",
    location: "CUSTOMER_SITE",
    classification: "FINISHED_HARDWARE",
    skuUnits: {
      "KE-I1": 39, "KE-S1": 1, "KE-X1": 21, "KV-B1": 2, "KV-Z1": 1,
      "KR-U1": 1,
    },
  },
  {
    id: "CS_LOANER",
    location: "CUSTOMER_SITE",
    classification: "LOANER",
    skuUnits: {
      "KE-I1": 1, "KE-X1": 1, "KE-Y1": 7, "KV-D1": 34, "KV-F1": 1,
      "KV-Z1": 1,
    },
  },
  {
    id: "DMG_DMG",
    location: "DAMAGED_HOLD",
    classification: "DAMAGED",
    skuUnits: {
      "KE-I1": 1, "KE-E1": 1, "KE-E2": 1, "KE-Y1": 6, "KV-D1": 24,
      "KV-F1": 1, "KR-U1": 1,
    },
  },
  {
    id: "CM_TP",
    location: "CONTRACT_MANUFACTURER",
    classification: "THIRD_PARTY",
    skuUnits: { "KE-Y1": 9, "KV-D1": 40, "KV-B1": 1 },
  },
];
