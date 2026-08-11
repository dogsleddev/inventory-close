import { custodyTypeFor, PHYSICAL_CUSTODY_TYPES } from "@icg/domain";
import type { DispositionMethod, PhysicalCustodyType } from "@icg/domain";
import { authorize } from "@icg/permissions";
import { makeRecordScope, type ServiceContext } from "./queries.js";
import type { Workspace } from "./workspace.js";

/**
 * Custody, consignment-in and disposition (COMPLETION_PLAN Stage E) — the
 * three populations that answer *who is holding this, who owns it, and what
 * left*.
 *
 * They belong in one module because they are one question seen three ways,
 * and because keeping them apart is what a reader gets wrong:
 *
 * - **Custody breakdown** — the 1,500 book units cut by who physically holds
 *   them. Company-OWNED stock, some of it in someone else's hands.
 * - **Consignment-in** — vendor-OWNED stock in the company's hands. Not on
 *   the book, not in the subledger, not a unit of the 1,500.
 * - **Dispositions** — units that left the book population before the
 *   balance-sheet date. The one lifecycle the year-end listing cannot show,
 *   because nothing on it has been disposed of.
 *
 * This is a projection, not a rule. `consignmentInUnits` and `dispositions`
 * are absent from `toCloseInput`'s allowlist, so no rule can see them and no
 * derived figure can move. Nothing here derives an exception, a blocker or a
 * readiness input.
 *
 * **Record scope genuinely applies here**, unlike in `costing.ts`: both
 * collections carry a `sourceRef`, so `makeRecordScope` is called on every
 * row. It narrows nothing today — no consignment or disposition record is
 * evidence for any exception — but a projection that skipped the call would
 * be relying on that staying true.
 *
 * Two claims this module exists to MEASURE rather than assert, because both
 * are true on this dataset and prose asserting them would pass forever and
 * start lying silently:
 *
 * 1. No consigned serial is on the book. Checked against the unit population
 *    (`consignedSerialsOnBook`), and paired with `subledgerIsBookPopulation`
 *    — because serial exclusion only proves VALUE exclusion if the subledger
 *    is exactly the sum over the book. It is; that equality is the link, and
 *    it is returned rather than left for the reader to make.
 * 2. No disposed serial is on the book (`disposedSerialsOnBook`).
 */

/* ------------------------------------------------------------------ */
/* Custody — the book population by who is holding it                  */
/* ------------------------------------------------------------------ */

export interface CustodyRowOut {
  readonly custodyType: PhysicalCustodyType;
  readonly units: number;
  readonly carryingCents: number;
  /** Locations contributing to this custody answer. */
  readonly locations: readonly string[];
  /** Named holders on those units, where the listing records one. */
  readonly custodians: readonly string[];
  /** Units this custody type covers that carry no named holder. */
  readonly unitsWithoutCustodian: number;
}

export interface CustodyBreakdownOut {
  readonly asOf: string;
  readonly rows: readonly CustodyRowOut[];
  readonly bookUnits: number;
  readonly bookCarryingCents: number;
  /** The close's own subledger figure — not a second sum of the population. */
  readonly subledgerCents: number;
  /**
   * Whether the custody cut accounts for the whole book. A custody breakdown
   * that drops a unit is worse than none: it invites a reader to treat the
   * rows as the population.
   */
  readonly coversBook: boolean;
  /** Custody types in the taxonomy that no book unit resolves to. */
  readonly unpopulatedTypes: readonly PhysicalCustodyType[];
  /**
   * Units whose inputs do not establish custody. Reported rather than folded
   * into a warehouse — `UNDETERMINED` is the absence of a claim, not a place.
   */
  readonly undeterminedUnits: number;
  /** Units held by someone other than the company, and their carrying value. */
  readonly heldByOthersUnits: number;
  readonly heldByOthersCents: number;
}

/**
 * Custody types where the holder is NOT the company. Used only to summarise
 * "how much of our stock is in someone else's hands" — it is a grouping of
 * the derived answer, never a second derivation.
 */
const HELD_BY_OTHERS: readonly PhysicalCustodyType[] = [
  "IN_TRANSIT_INBOUND",
  "IN_TRANSIT_OUTBOUND",
  "CUSTOMER_SITE",
  "THIRD_PARTY_CUSTODIAN",
  "CONTRACT_MANUFACTURER",
  "FIELD_DEMO_LOANER",
];

export function getCustodyBreakdown(
  ws: Workspace,
  ctx: ServiceContext,
): CustodyBreakdownOut {
  authorize(ctx.user, "close.read");

  const buckets = new Map<
    PhysicalCustodyType,
    {
      units: number;
      cents: number;
      locations: Set<string>;
      custodians: Set<string>;
      withoutCustodian: number;
    }
  >();

  for (const unit of ws.dataset.inventoryUnits) {
    // The SAME derivation the master list uses. Custody is never stored, and
    // a second copy of this mapping is how two screens end up disagreeing
    // about who holds a unit.
    const custodyType = custodyTypeFor({
      location: unit.location,
      classification: unit.classification,
      ...(unit.custodian !== undefined ? { custodian: unit.custodian } : {}),
    });
    let bucket = buckets.get(custodyType);
    if (bucket === undefined) {
      bucket = {
        units: 0,
        cents: 0,
        locations: new Set<string>(),
        custodians: new Set<string>(),
        withoutCustodian: 0,
      };
      buckets.set(custodyType, bucket);
    }
    bucket.units += 1;
    bucket.cents += unit.unitCostCents;
    bucket.locations.add(unit.location);
    if (unit.custodian === undefined) bucket.withoutCustodian += 1;
    else bucket.custodians.add(unit.custodian);
  }

  const rows: CustodyRowOut[] = [...buckets.entries()]
    .map(([custodyType, b]) => ({
      custodyType,
      units: b.units,
      carryingCents: b.cents,
      locations: [...b.locations].sort(),
      custodians: [...b.custodians].sort(),
      unitsWithoutCustodian: b.withoutCustodian,
    }))
    .sort((a, b) => b.carryingCents - a.carryingCents);

  const bookUnits = ws.dataset.inventoryUnits.length;
  const bookCarryingCents = rows.reduce((n, r) => n + r.carryingCents, 0);
  const heldByOthers = rows.filter((r) => HELD_BY_OTHERS.includes(r.custodyType));

  return {
    asOf: ws.close.reconciliation.asOf,
    rows,
    bookUnits,
    bookCarryingCents,
    subledgerCents: ws.close.reconciliation.subledgerCents,
    coversBook:
      rows.reduce((n, r) => n + r.units, 0) === bookUnits &&
      bookCarryingCents === ws.close.reconciliation.subledgerCents,
    unpopulatedTypes: PHYSICAL_CUSTODY_TYPES.filter(
      (t) => !buckets.has(t) && t !== "UNDETERMINED",
    ),
    undeterminedUnits: buckets.get("UNDETERMINED")?.units ?? 0,
    heldByOthersUnits: heldByOthers.reduce((n, r) => n + r.units, 0),
    heldByOthersCents: heldByOthers.reduce((n, r) => n + r.carryingCents, 0),
  };
}

/* ------------------------------------------------------------------ */
/* Consignment-in — vendor-owned stock in the company's custody         */
/* ------------------------------------------------------------------ */

export interface ConsignmentRowOut {
  readonly serial: string;
  readonly sku: string;
  readonly owner: string;
  readonly location: string;
  readonly bin?: string | undefined;
  readonly receivedAt: string;
  readonly agreementRef: string;
  /**
   * The owner's stated value, at the standard price for the part. NOT a book
   * amount: the company has no cost basis in a unit it never bought.
   */
  readonly statedValueCents: number;
}

export interface ConsignmentGroupOut {
  readonly key: string;
  readonly units: number;
  readonly statedValueCents: number;
}

export interface ConsignmentHoldingsOut {
  readonly asOf: string;
  readonly rows: readonly ConsignmentRowOut[];
  readonly units: number;
  readonly statedValueCents: number;
  readonly byOwner: readonly ConsignmentGroupOut[];
  readonly byAgreement: readonly ConsignmentGroupOut[];
  /**
   * Consigned serials that ALSO appear on the year-end listing. Empty is the
   * only correct answer — a unit cannot be both vendor-owned and part of the
   * company's inventory. Measured, not promised.
   */
  readonly consignedSerialsOnBook: readonly string[];
  readonly heldOffBook: boolean;
  /**
   * Whether the subledger IS the sum over the book population. This is the
   * link that turns serial exclusion into VALUE exclusion: without it, "none
   * of this is inside the inventory balance" is an inference the reader has
   * to make rather than a fact this module established.
   */
  readonly subledgerIsBookPopulation: boolean;
  /** The only flag a surface may say "outside the subledger" from. */
  readonly outsideSubledger: boolean;
  /**
   * Year-end count lines touching a consignment bin. Zero today: the count
   * population is drawn from book units, so these holdings were not part of
   * it. An absence a custody reader will ask about, so it is measured.
   */
  readonly countLinesTouchingConsignmentBins: number;
  /** Rows the viewer's scope withheld — never silently shorter. */
  readonly withheldRowCount: number;
}

export function getConsignmentHoldings(
  ws: Workspace,
  ctx: ServiceContext,
): ConsignmentHoldingsOut {
  authorize(ctx.user, "close.read");
  const inScope = makeRecordScope(ws, ctx.user);

  const visible = ws.dataset.consignmentInUnits.filter((c) => inScope(c.sourceRef));
  const withheldRowCount = ws.dataset.consignmentInUnits.length - visible.length;

  const rows: ConsignmentRowOut[] = visible
    .map((c) => ({
      serial: c.serial,
      sku: c.sku,
      owner: c.owner,
      location: c.location,
      ...(c.bin !== undefined ? { bin: c.bin } : {}),
      receivedAt: c.receivedAt,
      agreementRef: c.agreementRef,
      statedValueCents: c.vendorStatedValueCents,
    }))
    .sort((a, b) => (a.serial < b.serial ? -1 : 1));

  const group = (key: (r: ConsignmentRowOut) => string): ConsignmentGroupOut[] => {
    const map = new Map<string, { units: number; cents: number }>();
    for (const r of rows) {
      const bucket = map.get(key(r)) ?? { units: 0, cents: 0 };
      bucket.units += 1;
      bucket.cents += r.statedValueCents;
      map.set(key(r), bucket);
    }
    return [...map.entries()]
      .map(([k, b]) => ({ key: k, units: b.units, statedValueCents: b.cents }))
      .sort((a, b) => b.statedValueCents - a.statedValueCents);
  };

  // The check, against the whole collection rather than the visible slice: a
  // consigned serial hidden from this viewer would still be on the book.
  const booked = new Set(ws.dataset.inventoryUnits.map((u) => u.serial));
  const consignedSerialsOnBook = ws.dataset.consignmentInUnits
    .map((c) => c.serial)
    .filter((s) => booked.has(s))
    .sort();

  const bookSumCents = ws.dataset.inventoryUnits.reduce(
    (n, u) => n + u.unitCostCents,
    0,
  );
  const subledgerIsBookPopulation = bookSumCents === ws.close.reconciliation.subledgerCents;
  const heldOffBook = consignedSerialsOnBook.length === 0;

  const consignmentBins = new Set(
    ws.dataset.consignmentInUnits
      .map((c) => c.bin)
      .filter((b): b is string => b !== undefined),
  );
  const countLinesTouchingConsignmentBins =
    ws.dataset.countResults.filter((r) => r.bin !== undefined && consignmentBins.has(r.bin))
      .length +
    ws.dataset.countTests.filter((t) => t.bin !== undefined && consignmentBins.has(t.bin))
      .length;

  return {
    asOf: ws.close.reconciliation.asOf,
    rows,
    units: rows.length,
    statedValueCents: rows.reduce((n, r) => n + r.statedValueCents, 0),
    byOwner: group((r) => r.owner),
    byAgreement: group((r) => r.agreementRef),
    consignedSerialsOnBook,
    heldOffBook,
    subledgerIsBookPopulation,
    outsideSubledger: heldOffBook && subledgerIsBookPopulation,
    countLinesTouchingConsignmentBins,
    withheldRowCount,
  };
}

/* ------------------------------------------------------------------ */
/* Dispositions — what left the book before the balance-sheet date      */
/* ------------------------------------------------------------------ */

export interface DispositionRowOut {
  readonly id: string;
  readonly serial: string;
  readonly sku: string;
  readonly method: DispositionMethod;
  readonly disposedAt: string;
  readonly originalCostCents: number;
  readonly proceedsCents: number;
  /** Original cost less proceeds. Zero on a full-credit vendor return. */
  readonly lossCents: number;
  readonly reason: string;
  readonly authorizedBy: string;
  readonly evidenceRef?: string | undefined;
  /** The adjustment the source record names. */
  readonly adjustmentRef?: string | undefined;
  /**
   * Whether that adjustment is actually in the inventory-adjustment
   * population. FALSE on every row here, and that is the point: the source
   * record names a transaction the close does not hold, and a screen showing
   * the number as though it resolved would claim more than it can show.
   */
  readonly adjustmentOnFile: boolean;
  /**
   * Whether the named certificate is held in the evidence system. FALSE on
   * every row — the reference is on the source record only, so nothing can
   * be opened and no surface may offer to.
   */
  readonly evidenceOnFile: boolean;
}

export interface DispositionMethodOut {
  readonly method: DispositionMethod;
  readonly units: number;
  readonly originalCostCents: number;
  readonly proceedsCents: number;
  readonly lossCents: number;
}

export interface DispositionsOut {
  readonly asOf: string;
  readonly rows: readonly DispositionRowOut[];
  readonly units: number;
  readonly originalCostCents: number;
  readonly proceedsCents: number;
  readonly lossCents: number;
  readonly byMethod: readonly DispositionMethodOut[];
  /**
   * Disposed serials that ALSO appear on the year-end listing. Empty is the
   * only correct answer — a unit cannot be both disposed of and on hand. A
   * projection must CHECK this, because a double count here would be
   * invisible in every other figure.
   */
  readonly disposedSerialsOnBook: readonly string[];
  readonly removedFromBook: boolean;
  /** Rows whose named adjustment the close actually holds. Zero today. */
  readonly rowsWithAdjustmentOnFile: number;
  /** Rows whose named certificate the evidence system holds. Zero today. */
  readonly rowsWithEvidenceOnFile: number;
  /**
   * How many external references the evidence system indexes at all. Returned
   * so "the certificate is not on file" is legible as a lookup that found
   * nothing, rather than as a lookup against an empty index.
   */
  readonly evidenceIndexSize: number;
  /** Rows the viewer's scope withheld — never silently shorter. */
  readonly withheldRowCount: number;
}

export function getDispositions(ws: Workspace, ctx: ServiceContext): DispositionsOut {
  authorize(ctx.user, "close.read");
  const inScope = makeRecordScope(ws, ctx.user);

  const visible = ws.dataset.dispositions.filter((d) => inScope(d.sourceRef));
  const withheldRowCount = ws.dataset.dispositions.length - visible.length;

  const adjustments = new Set(
    ws.dataset.inventoryAdjustments.map((a) => a.transactionNumber),
  );
  // Evidence items are titled with the external identifier of the record they
  // hold — a transaction number, an RMA id, a forecast id. That is the
  // namespace a certificate reference would live in if the evidence system
  // held one, so it is the namespace this looks in. Matching a certificate
  // reference against `sourceRef.transactionNumber` instead would compare two
  // different kinds of identifier and return false for every row forever,
  // which is the right answer arrived at by a check that cannot fire.
  const evidenceTitles = new Set(ws.evidenceGraph.items.map((i) => i.title));

  const rows: DispositionRowOut[] = visible
    .map((d) => ({
      id: d.id,
      serial: d.serial,
      sku: d.sku,
      method: d.method,
      disposedAt: d.disposedAt,
      originalCostCents: d.originalCostCents,
      proceedsCents: d.proceedsCents,
      lossCents: d.originalCostCents - d.proceedsCents,
      reason: d.reason,
      authorizedBy: d.authorizedBy,
      ...(d.evidenceRef !== undefined ? { evidenceRef: d.evidenceRef } : {}),
      ...(d.sourceRef.transactionNumber !== undefined
        ? { adjustmentRef: d.sourceRef.transactionNumber }
        : {}),
      adjustmentOnFile:
        d.sourceRef.transactionNumber !== undefined &&
        adjustments.has(d.sourceRef.transactionNumber),
      evidenceOnFile: d.evidenceRef !== undefined && evidenceTitles.has(d.evidenceRef),
    }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  const byMethodMap = new Map<
    DispositionMethod,
    { units: number; cost: number; proceeds: number }
  >();
  for (const r of rows) {
    const bucket = byMethodMap.get(r.method) ?? { units: 0, cost: 0, proceeds: 0 };
    bucket.units += 1;
    bucket.cost += r.originalCostCents;
    bucket.proceeds += r.proceedsCents;
    byMethodMap.set(r.method, bucket);
  }

  const booked = new Set(ws.dataset.inventoryUnits.map((u) => u.serial));
  const disposedSerialsOnBook = ws.dataset.dispositions
    .map((d) => d.serial)
    .filter((s) => booked.has(s))
    .sort();

  return {
    asOf: ws.close.reconciliation.asOf,
    rows,
    units: rows.length,
    originalCostCents: rows.reduce((n, r) => n + r.originalCostCents, 0),
    proceedsCents: rows.reduce((n, r) => n + r.proceedsCents, 0),
    lossCents: rows.reduce((n, r) => n + r.lossCents, 0),
    byMethod: [...byMethodMap.entries()]
      .map(([method, b]) => ({
        method,
        units: b.units,
        originalCostCents: b.cost,
        proceedsCents: b.proceeds,
        lossCents: b.cost - b.proceeds,
      }))
      .sort((a, b) => b.originalCostCents - a.originalCostCents),
    disposedSerialsOnBook,
    removedFromBook: disposedSerialsOnBook.length === 0,
    rowsWithAdjustmentOnFile: rows.filter((r) => r.adjustmentOnFile).length,
    rowsWithEvidenceOnFile: rows.filter((r) => r.evidenceOnFile).length,
    evidenceIndexSize: evidenceTitles.size,
    withheldRowCount,
  };
}
