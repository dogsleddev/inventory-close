import { INVENTORY_GL_ACCOUNTS, isResolvedStatus } from "@icg/domain";
import { authorize } from "@icg/permissions";
import type { ServiceContext } from "./queries.js";
import type { Workspace } from "./workspace.js";

/**
 * Per-account inventory GL reconciliation (COMPLETION_PLAN §4).
 *
 * `buildReconciliation` in @icg/rules answers "does inventory tie to the GL
 * in total". This answers the question a Controller asks next: *which
 * account* is out, and what is sitting in it. Nothing here is a new
 * accounting conclusion — every figure is a re-cut of state the close
 * already produced:
 *
 * - subledger per account = the unit population summed by the GL account its
 *   accounting classification maps to;
 * - GL per account = the recorded `glBalances` row for that account;
 * - reconciling items per account = the close's own reconciling items,
 *   placed on the account their GL entries actually posted to.
 *
 * Two rules this module exists to keep:
 *
 * 1. **The reserve is not gross inventory.** 1290 is a credit balance held
 *    out of the gross bridge (`buildReconciliation` filters it out and
 *    CANONICAL_SPEC §5 reconciles it separately). It is returned as its own
 *    field, never as an account row, so no caller can sum it in by accident.
 * 2. **This is a projection, not a rule.** It derives no exception, no
 *    blocker and no status the close does not already hold. The per-account
 *    state below is a reconciliation state — whether that account's balance
 *    agrees with its subledger — and nothing consumes it as a control result.
 */

/** The reserve account, held out of gross inventory (CANONICAL_SPEC §5). */
export const INVENTORY_RESERVE_ACCOUNT = "1290";

/**
 * Chart-of-accounts descriptions, read from the ONE chart of accounts in
 * @icg/domain. It is a code constant there, not a fixture, on purpose: a
 * fixture would change the dataset manifest hash and force the
 * `dataset_version` pinned in `golden/baseline.json` to move for a display
 * label. Two copies of an account's name is exactly how a GL account ends up
 * described differently on two screens.
 */
export const INVENTORY_GL_ACCOUNT_DESCRIPTIONS: Readonly<Record<string, string>> =
  Object.fromEntries(INVENTORY_GL_ACCOUNTS.map((a) => [a.code, a.description]));

/**
 * Accounting classification → GL account (CANONICAL_SPEC §5, "Gross
 * subledger GL mapping"). Mirrors the map `getFinancialLife` reports per
 * unit; COMPLETION_PLAN §4 folds both into a shared
 * `INVENTORY_ACCOUNTING_MATRIX` later. Until then the mirror is held by a
 * test that compares this map against what the query service reports for a
 * unit of every classification, so the two cannot drift silently.
 */
export const CLASSIFICATION_GL_ACCOUNT: Readonly<Record<string, string>> = {
  FINISHED_HARDWARE: "1200",
  THIRD_PARTY: "1200",
  DAMAGED: "1200",
  VALUATION_REVIEW: "1200",
  GIT: "1210",
  DEMO: "1220",
  LOANER: "1220",
  RMA: "1230",
};

/**
 * Per-account reconciliation state. NOT an exception workflow status and
 * not a rule result: it says whether this account's recorded balance agrees
 * with its subledger, and — when it does not — whether the close's
 * identified items account for the whole difference.
 */
export type GlAccountReconciliationState =
  | "RECONCILED"
  | "OPEN_RECONCILING_ITEMS"
  | "DIFFERENCE_NOT_EXPLAINED";

export interface GlAccountReconcilingItemOut {
  readonly id: string;
  readonly description: string;
  /** Proposed effect on the GL, carrying the close's own sign convention. */
  readonly amountCents: number;
  readonly relatedExceptionId: string;
  readonly exceptionOpen: boolean;
  /** GL entries that place this item on this account — the attribution basis. */
  readonly glEntryRefs: readonly string[];
}

export interface GlAccountRowOut {
  readonly account: string;
  readonly description: string;
  /** Accounting classifications whose units land in this account. */
  readonly classifications: readonly string[];
  readonly unitCount: number;
  readonly subledgerCents: number;
  readonly glCents: number;
  /** GL minus subledger; positive when GL is higher (the bridge's convention). */
  readonly differenceCents: number;
  readonly items: readonly GlAccountReconcilingItemOut[];
  readonly explainedCents: number;
  /** Zero when applying every attributed item clears this account. */
  readonly unexplainedCents: number;
  readonly state: GlAccountReconciliationState;
}

export interface GlReserveAccountOut {
  readonly account: string;
  readonly description: string;
  /** Recorded balance — a credit, so the figure is negative. */
  readonly glCents: number;
  /** No unit carries a reserve classification; the reserve has no subledger. */
  readonly hasSubledger: false;
}

export interface GlAccountReconciliationOut {
  readonly asOf: string;
  /** Gross inventory accounts only — the reserve is never one of these. */
  readonly accounts: readonly GlAccountRowOut[];
  readonly subledgerCents: number;
  readonly grossGlCents: number;
  readonly differenceCents: number;
  readonly reserve: GlReserveAccountOut | null;
  /**
   * Reconciling items no single gross inventory account can be shown to
   * carry. Empty at baseline — reported rather than distributed, because a
   * split this module cannot derive is not one it may invent.
   */
  readonly unattributedItems: readonly GlAccountReconcilingItemOut[];
}

/**
 * The per-account projection. Read-only, authorized on the same permission
 * key as every other close read, and derived entirely from workspace state.
 */
export function getGlAccountReconciliation(
  ws: Workspace,
  ctx: ServiceContext,
): GlAccountReconciliationOut {
  authorize(ctx.user, "close.read");

  const recon = ws.close.reconciliation;

  // Subledger side: the unit population, cut by the account its accounting
  // classification maps to. An unmapped classification would be a silent
  // hole in the sum, so it lands in a row of its own instead of nowhere.
  const subledger = new Map<
    string,
    { cents: number; units: number; classifications: Set<string> }
  >();
  for (const unit of ws.dataset.inventoryUnits) {
    const account = CLASSIFICATION_GL_ACCOUNT[unit.classification] ?? unit.classification;
    let bucket = subledger.get(account);
    if (bucket === undefined) {
      bucket = { cents: 0, units: 0, classifications: new Set<string>() };
      subledger.set(account, bucket);
    }
    bucket.cents += unit.unitCostCents;
    bucket.units += 1;
    bucket.classifications.add(unit.classification);
  }

  // GL side: the recorded balances, less the reserve.
  const glByAccount = new Map<string, number>();
  for (const balance of ws.dataset.glBalances) {
    if (balance.account === INVENTORY_RESERVE_ACCOUNT) continue;
    glByAccount.set(
      balance.account,
      (glByAccount.get(balance.account) ?? 0) + balance.amountCents,
    );
  }

  // Attribution: each reconciling item sits on the account its GL entries
  // actually hit. EXC-009's duplicate is the case that matters — the return
  // it duplicates was restocked to 1230, but the duplicate posted to 1200,
  // and 1200 is where the difference is. Reading the account off the entry
  // is the only way to get that right.
  const attributed = new Map<string, GlAccountReconcilingItemOut[]>();
  const unattributedItems: GlAccountReconcilingItemOut[] = [];
  for (const item of recon.items) {
    const exception = ws.close.exceptions.find((e) => e.id === item.relatedExceptionId);
    const refs = new Set(exception?.finding.subjects.transactionNumbers ?? []);
    const entries = ws.dataset.glEntries.filter((e) => refs.has(e.transactionNumber));
    const accounts = [...new Set(entries.map((e) => e.account))];
    const projected: GlAccountReconcilingItemOut = {
      id: item.id,
      description: item.description,
      amountCents: item.amountCents,
      relatedExceptionId: item.relatedExceptionId,
      exceptionOpen: exception !== undefined && !isResolvedStatus(exception.status),
      glEntryRefs: entries.map((e) => e.transactionNumber),
    };
    // One account, and one this view actually reports. Anything else — no
    // GL entry, or entries across several accounts — is a split that cannot
    // be derived, so it is surfaced rather than apportioned.
    const account = accounts.length === 1 ? accounts[0] : undefined;
    if (account === undefined || !glByAccount.has(account)) {
      unattributedItems.push(projected);
      continue;
    }
    const list = attributed.get(account);
    if (list === undefined) attributed.set(account, [projected]);
    else list.push(projected);
  }

  const codes = [...new Set([...glByAccount.keys(), ...subledger.keys()])].sort();
  const accounts: GlAccountRowOut[] = codes.map((account) => {
    const book = subledger.get(account);
    const subledgerCents = book?.cents ?? 0;
    const glCents = glByAccount.get(account) ?? 0;
    const differenceCents = glCents - subledgerCents;
    const items = attributed.get(account) ?? [];
    const explainedCents = items.reduce((sum, i) => sum + i.amountCents, 0);
    const unexplainedCents = differenceCents + explainedCents;
    return {
      account,
      description: INVENTORY_GL_ACCOUNT_DESCRIPTIONS[account] ?? account,
      classifications: [...(book?.classifications ?? [])].sort(),
      unitCount: book?.units ?? 0,
      subledgerCents,
      glCents,
      differenceCents,
      items,
      explainedCents,
      unexplainedCents,
      state:
        differenceCents === 0
          ? "RECONCILED"
          : items.length > 0 && unexplainedCents === 0
            ? "OPEN_RECONCILING_ITEMS"
            : "DIFFERENCE_NOT_EXPLAINED",
    };
  });

  const reserveBalance = ws.dataset.glBalances.find(
    (b) => b.account === INVENTORY_RESERVE_ACCOUNT,
  );

  return {
    asOf: recon.asOf,
    accounts,
    subledgerCents: accounts.reduce((sum, a) => sum + a.subledgerCents, 0),
    grossGlCents: accounts.reduce((sum, a) => sum + a.glCents, 0),
    differenceCents: accounts.reduce((sum, a) => sum + a.differenceCents, 0),
    reserve:
      reserveBalance === undefined
        ? null
        : {
            account: reserveBalance.account,
            description:
              INVENTORY_GL_ACCOUNT_DESCRIPTIONS[reserveBalance.account] ??
              reserveBalance.account,
            glCents: reserveBalance.amountCents,
            hasSubledger: false,
          },
    unattributedItems,
  };
}
