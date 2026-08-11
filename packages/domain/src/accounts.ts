/**
 * Inventory chart of accounts.
 *
 * A code constant, deliberately NOT a fixture: the dataset's manifest hash
 * and `dataset_version` are pinned in golden/baseline.json, and account
 * descriptions are presentation vocabulary, not close data. Nothing here is
 * derived from a run, so nothing here can drift with one.
 *
 * `domain` is the right home because both the rules and the services read
 * it, and domain depends on nothing.
 */

export interface GlAccountDefinition {
  readonly code: string;
  readonly description: string;
  /** Gross inventory accounts carry the subledger; the reserve does not. */
  readonly grossInventory: boolean;
}

export const INVENTORY_GL_ACCOUNTS: readonly GlAccountDefinition[] = [
  { code: "1200", description: "Inventory — Finished / Other", grossInventory: true },
  { code: "1210", description: "Inventory — Goods in Transit", grossInventory: true },
  { code: "1220", description: "Inventory — Demo / Loaner", grossInventory: true },
  { code: "1230", description: "Inventory — RMA / Repair", grossInventory: true },
  // Held out of every gross figure in the product. A reserve netted into
  // gross inventory would understate the population being reconciled.
  { code: "1290", description: "Inventory Reserve", grossInventory: false },
];

/**
 * Accounts a proposed entry may use as the offset side. These are the only
 * offsets the FY2026 scenario establishes; an entry whose evidence does not
 * establish its offset must say so rather than pick one from this list.
 */
export const OFFSET_GL_ACCOUNTS: readonly GlAccountDefinition[] = [
  { code: "5110", description: "Inventory Adjustment / Write-Off Expense", grossInventory: false },
  { code: "2100", description: "Accrued Liabilities", grossInventory: false },
];

const BY_CODE = new Map(
  [...INVENTORY_GL_ACCOUNTS, ...OFFSET_GL_ACCOUNTS].map((a) => [a.code, a]),
);

/** Codes carrying gross inventory — the bridge population. */
export const GROSS_INVENTORY_ACCOUNT_CODES: readonly string[] = INVENTORY_GL_ACCOUNTS.filter(
  (a) => a.grossInventory,
).map((a) => a.code);

/**
 * The account's description, or undefined when the code is not one this
 * product knows. Callers render the bare code in that case — inventing a
 * description for an unknown account would be the surface asserting
 * something the chart of accounts does not say.
 */
export function glAccountDescription(code: string): string | undefined {
  return BY_CODE.get(code)?.description;
}

/**
 * A stable label for a code: "1200 · Inventory — Finished / Other", or just
 * the code when it is unknown.
 */
export function glAccountLabel(code: string): string {
  const description = glAccountDescription(code);
  return description === undefined ? code : `${code} · ${description}`;
}

/**
 * Used where an entry's offset cannot be established from the evidence on
 * file. It is a REQUIREMENT, never an account: nothing may post against it,
 * and the surface must show it as outstanding work rather than a booking.
 */
export const OFFSET_REVIEW_REQUIRED = "ACCOUNTING_REVIEW_REQUIRED";
