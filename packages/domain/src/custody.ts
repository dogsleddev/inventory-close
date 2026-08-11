import type { AccountingClassification } from "./enums.js";

/**
 * Physical custody — WHO IS HOLDING THE UNIT — kept deliberately separate
 * from ownership, which is an accounting conclusion. "Location is not
 * ownership" is the product's core rule, so this module never returns an
 * ownership answer and never reads one.
 *
 * Nothing here is stored: custody is DERIVED from facts the inventory
 * listing already carries (location, accounting classification, custodian).
 * No fixture records a custody type, and none should — a stored custody
 * field would be a second copy of a fact the location already states.
 *
 * `CONSIGNMENT_IN` (vendor-owned stock in our custody) and
 * `CONSIGNMENT_OUT` (our stock in a customer's custody under a consignment
 * arrangement) are part of the taxonomy because the model must be able to
 * express them. Neither is derivable from the FY2026 dataset: no fixture
 * records a consignment arrangement, so `custodyTypeFor` never returns
 * them. They are representable and empty — never faked from a location that
 * merely resembles one.
 *
 * `UNDETERMINED` is not a custody claim; it is the absence of one. It is
 * what the function returns rather than guessing when the inputs do not
 * establish who holds the unit.
 */
export const PHYSICAL_CUSTODY_TYPES = [
  /** Held by the company in its own facilities (warehouse, receiving, staging). */
  "COMPANY_WAREHOUSE",
  /** With a carrier, moving toward a company location. */
  "IN_TRANSIT_INBOUND",
  /** With a carrier, moving away from a company location. */
  "IN_TRANSIT_OUTBOUND",
  /** In the field demo/loaner pool. */
  "FIELD_DEMO_LOANER",
  /** Physically at a customer's site. */
  "CUSTOMER_SITE",
  /** Held by a named third-party custodian (installer, 3PL). */
  "THIRD_PARTY_CUSTODIAN",
  /** Held by a contract manufacturer or component vendor. */
  "CONTRACT_MANUFACTURER",
  /** In the returns / repair area. */
  "REPAIR_RMA_HOLD",
  /** Quarantined pending a damage disposition. */
  "QUARANTINE_DAMAGED",
  /** Vendor-owned stock in the company's custody. No population. */
  "CONSIGNMENT_IN",
  /** Company stock in a customer's custody on consignment. No population. */
  "CONSIGNMENT_OUT",
  /** The inputs do not establish custody. Not a claim — the absence of one. */
  "UNDETERMINED",
] as const;
export type PhysicalCustodyType = (typeof PHYSICAL_CUSTODY_TYPES)[number];

/** The two custody types the dataset cannot produce (see the module note). */
export const UNPOPULATED_CUSTODY_TYPES: readonly PhysicalCustodyType[] = [
  "CONSIGNMENT_IN",
  "CONSIGNMENT_OUT",
];

/**
 * Location id → custody. Location is the primary basis because it is the
 * fact that says where the unit physically is; the three company-operated
 * locations collapse to one custody answer because custody asks who holds
 * the unit, and the company holds all three.
 */
const CUSTODY_BY_LOCATION: Readonly<Record<string, PhysicalCustodyType>> = {
  PRIMARY_WAREHOUSE: "COMPANY_WAREHOUSE",
  RECEIVING: "COMPANY_WAREHOUSE",
  STAGING: "COMPANY_WAREHOUSE",
  INBOUND_TRANSIT: "IN_TRANSIT_INBOUND",
  OUTBOUND_TRANSIT: "IN_TRANSIT_OUTBOUND",
  DEMO_LOANER: "FIELD_DEMO_LOANER",
  CUSTOMER_SITE: "CUSTOMER_SITE",
  THIRD_PARTY_CUSTODY: "THIRD_PARTY_CUSTODIAN",
  CONTRACT_MANUFACTURER: "CONTRACT_MANUFACTURER",
  RMA_REPAIR: "REPAIR_RMA_HOLD",
  DAMAGED_HOLD: "QUARANTINE_DAMAGED",
};

/**
 * Classification fallback for a location the model does not describe. Only
 * the classifications that themselves state a holding are mapped: GIT says
 * a unit is with a carrier but not in which direction, and
 * FINISHED_HARDWARE / VALUATION_REVIEW say nothing at all about custody, so
 * both stay UNDETERMINED rather than defaulting into a warehouse.
 */
const CUSTODY_BY_CLASSIFICATION: Readonly<
  Partial<Record<AccountingClassification, PhysicalCustodyType>>
> = {
  DEMO: "FIELD_DEMO_LOANER",
  LOANER: "FIELD_DEMO_LOANER",
  RMA: "REPAIR_RMA_HOLD",
  DAMAGED: "QUARANTINE_DAMAGED",
};

export interface CustodyBasis {
  readonly location: string;
  readonly classification: AccountingClassification | string;
  /** Present only where the listing records a holder. */
  readonly custodian?: string | undefined;
}

/**
 * Pure derivation, total over its inputs, with no I/O and no dataset
 * dependency. A custodian on the record can only ever REFINE the answer to
 * a third-party holding — it never overrides a company location, because a
 * named contact on a warehouse row would not mean the warehouse stopped
 * holding the unit.
 */
export function custodyTypeFor(basis: CustodyBasis): PhysicalCustodyType {
  const byLocation = CUSTODY_BY_LOCATION[basis.location];
  if (byLocation !== undefined) return byLocation;
  const byClassification =
    CUSTODY_BY_CLASSIFICATION[basis.classification as AccountingClassification];
  if (byClassification !== undefined) return byClassification;
  if (basis.classification === "THIRD_PARTY" && basis.custodian !== undefined) {
    return "THIRD_PARTY_CUSTODIAN";
  }
  return "UNDETERMINED";
}

/**
 * Ownership status as the close reports it for a book unit. Derived, never
 * stored: presence on the year-end listing is the company's recorded
 * assertion of ownership, and an OPEN exception asserting
 * RIGHTS_AND_OBLIGATIONS over that unit is what puts the assertion under
 * review. Gaurd never concludes ownership — it reports the recorded
 * assertion and whether anything disputes it.
 */
export const INVENTORY_OWNERSHIP_STATUSES = ["COMPANY_OWNED", "UNDER_REVIEW"] as const;
export type InventoryOwnershipStatus = (typeof INVENTORY_OWNERSHIP_STATUSES)[number];
