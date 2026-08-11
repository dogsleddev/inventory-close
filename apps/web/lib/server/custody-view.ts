import type { DemoUser } from "@icg/data";
import {
  getConsignmentHoldings,
  getCustodyBreakdown,
  getDispositions,
} from "@icg/services";
import { formatCents, formatDate } from "../format";
import type {
  ConsignmentRowView,
  CustodyData,
  CustodyRowView,
  DispositionRowView,
  ProcurementStat,
} from "../view-model";
import { attempt } from "./data";
import { holderLabel, locationLabel } from "./humanize";
import { CUSTODY_LABELS } from "./inventory-list-view";
import { getQueries, getWorkspace, makeContext, roleLabel } from "./workspace";

/**
 * Custody & Disposition (COMPLETION_PLAN Stage E) — who is holding it, who
 * owns it, and what left.
 *
 * Three populations that a reader merges at their peril, so the screen keeps
 * them on separate tabs and states the separation rather than implying it:
 *
 * - **Custody** — the book units by who physically holds them. Company-owned
 *   stock, some of it in someone else's hands.
 * - **Consignment in** — vendor-owned stock in the company's hands. Not on
 *   the book, not in the subledger.
 * - **Disposition** — units that left the book before the balance-sheet date.
 *
 * This module formats and labels. Every figure arrives already derived from
 * `getCustodyBreakdown` / `getConsignmentHoldings` / `getDispositions`,
 * because a figure computed in the web layer is one no service derived.
 *
 * Three sentences on this screen are claims, and each renders from a boolean
 * the services layer MEASURED — the custody cut covers the whole book, no
 * consigned serial is on the book, and no disposed serial is on the book.
 * Each has a negative branch that says the opposite. None is written as prose
 * that happens to be true today.
 */

const METHOD_LABELS: Readonly<Record<string, string>> = {
  SCRAPPED: "Scrapped",
  RETURNED_TO_VENDOR: "Returned to vendor",
  SALVAGE_SALE: "Salvage sale",
};

/** Unit counts group at workpaper scale; a bare 1500 reads as an id. */
const units = (n: number): string => n.toLocaleString("en-US");

export function buildCustodyData(user: DemoUser, correlationId: string): CustodyData {
  const ctx = makeContext(user, correlationId);
  const role = roleLabel(user);
  // Location display names belong to the dataset, and `getQueries()` is where
  // they are registered. Called for that registration: without it
  // `locationLabel` falls back to title-casing the id, which renders
  // RMA_REPAIR as "Rma Repair".
  getQueries();

  const custody = attempt(() => getCustodyBreakdown(getWorkspace(), ctx));
  const consignment = attempt(() => getConsignmentHoldings(getWorkspace(), ctx));
  const dispositions = attempt(() => getDispositions(getWorkspace(), ctx));
  if (custody === undefined || consignment === undefined || dispositions === undefined) {
    return {
      restricted: true,
      roleLabel: role,
      headerNote: null,
      asOf: "",
      tabs: [],
      custody: null,
      consignment: null,
      disposition: null,
    };
  }

  /* ---------------- Custody ---------------- */

  const custodyRows: CustodyRowView[] = custody.rows.map((r) => ({
    custody: CUSTODY_LABELS[r.custodyType] ?? r.custodyType,
    units: units(r.units),
    carrying: formatCents(r.carryingCents),
    locations: r.locations.map(locationLabel).join(", "),
    // A blank cell would assert that nobody holds the unit, so the absence is
    // stated. What it may NOT do is explain itself with a rule the row next to
    // it breaks: "the listing records a holder only where a third party holds
    // the unit" was false on 305 units at a customer site, in the demo pool or
    // in transit — all held by another party, none carrying a name. The
    // listing names a holder for the two custodian arrangements it records,
    // and says nothing about the rest.
    custodians:
      r.custodians.length > 0
        ? r.custodians.length === 1 || r.unitsWithoutCustodian === 0
          ? r.custodians.join(", ")
          : `${r.custodians.join(", ")} — and no name on ${units(r.unitsWithoutCustodian)} of these units`
        : "No holder named on the listing",
    heldBy: holderLabel(r.heldBy),
  }));

  const custodyStats: ProcurementStat[] = [
    {
      label: "UNITS ON THE LISTING",
      value: units(custody.bookUnits),
      note: "Every unit the company reports owning.",
      ember: false,
    },
    {
      label: "CUSTODY TYPES IN USE",
      value: String(custody.rows.length),
      note: "Derived from location, never stored.",
      ember: false,
    },
    {
      label: "HELD BY SOMEONE ELSE",
      value: units(custody.heldByOthersUnits),
      note: `${formatCents(custody.heldByOthersCents)} of company-owned stock in another party's hands.`,
      ember: false,
    },
    {
      label: "CUSTODY NOT ESTABLISHED",
      value: String(custody.undeterminedUnits),
      note: "Units whose location does not say who holds them.",
      ember: custody.undeterminedUnits > 0,
    },
  ];

  /* ---------------- Consignment ---------------- */

  const consignmentRows: ConsignmentRowView[] = consignment.rows.map((r) => ({
    serial: r.serial,
    sku: r.sku,
    owner: r.owner,
    location: locationLabel(r.location),
    bin: r.bin ?? "No bin recorded",
    received: formatDate(r.receivedAt),
    agreement: r.agreementRef,
    statedValue: formatCents(r.statedValueCents),
  }));

  const consignmentStats: ProcurementStat[] = [
    {
      label: "UNITS HELD",
      value: String(consignment.units),
      note: "Physically on site, owned by someone else.",
      ember: false,
    },
    {
      label: "OWNER'S STATED VALUE",
      value: formatCents(consignment.statedValueCents),
      note: "Not a book amount. The company has no cost basis in a unit it never bought.",
      ember: false,
    },
    {
      label: "AGREEMENTS",
      value: String(consignment.byAgreement.length),
      note: consignment.byAgreement.map((a) => a.key).join(", "),
      ember: false,
    },
  ];

  /* ---------------- Disposition ---------------- */

  const dispositionRows: DispositionRowView[] = dispositions.rows.map((r) => ({
    id: r.id,
    serial: r.serial,
    sku: r.sku,
    method: METHOD_LABELS[r.method] ?? r.method,
    disposed: formatDate(r.disposedAt),
    originalCost: formatCents(r.originalCostCents),
    proceeds: formatCents(r.proceedsCents),
    loss: formatCents(r.lossCents),
    reason: r.reason,
    authorizedBy: r.authorizedBy,
    // The reference is named on the source record; whether the close holds it
    // is a different question, and the answer travels with the number.
    adjustment:
      r.adjustmentRef === undefined
        ? "None named"
        : r.adjustmentOnFile
          ? `${r.adjustmentRef} — on file`
          : `${r.adjustmentRef} — named on the source record, not in the close's adjustments`,
    evidence:
      r.evidenceRef === undefined
        ? "None named"
        : r.evidenceOnFile
          ? `${r.evidenceRef} — held`
          : `${r.evidenceRef} — named on the source record, not held in the evidence system`,
  }));

  const dispositionStats: ProcurementStat[] = [
    {
      label: "UNITS DISPOSED IN FY2026",
      value: String(dispositions.units),
      note: "Removed from the book before the balance-sheet date.",
      ember: false,
    },
    {
      label: "ORIGINAL COST",
      value: formatCents(dispositions.originalCostCents),
      note: "What the units were carried at before they left.",
      ember: false,
    },
    {
      label: "RECOVERED",
      value: formatCents(dispositions.proceedsCents),
      note: "Credits and salvage proceeds actually realised.",
      ember: false,
    },
    {
      label: "NOT RECOVERED",
      value: formatCents(dispositions.lossCents),
      note: "Cost less proceeds, on these four records only.",
      ember: dispositions.lossCents > 0,
    },
  ];

  return {
    restricted: false,
    roleLabel: role,
    headerNote: null,
    asOf: formatDate(custody.asOf),
    tabs: [
      { key: "custody", label: "Custody", count: String(custody.rows.length) },
      {
        key: "consignment",
        label: "Consignment In (vendor-owned)",
        count: String(consignment.units),
      },
      { key: "disposition", label: "Disposition", count: String(dispositions.units) },
    ],
    custody: {
      stats: custodyStats,
      rows: custodyRows,
      coverage: {
        holds: custody.coversBook,
        headline: custody.coversBook
          ? "Every unit on the listing resolves to exactly one custody answer."
          : "The custody cut does not account for the whole listing.",
        detail: custody.coversBook
          ? `The rows below carry ${units(custody.bookUnits)} units at ${formatCents(custody.bookCarryingCents)} — the same population and the same value the close reconciles as the inventory subledger. Custody is derived from where the unit is, never stored, so there is no second copy of it to drift.`
          : `The rows below carry ${formatCents(custody.bookCarryingCents)} against a subledger of ${formatCents(custody.subledgerCents)}, and ${custody.undeterminedUnits} units have no established custody. Read the rows as a sample, not as the population.`,
      },
      unpopulatedNote:
        custody.unpopulatedTypes.length === 0
          ? "Every custody type in the model has a population on this listing."
          : `The model can express ${custody.unpopulatedTypes.length} more custody types that no unit on this listing resolves to: ${custody.unpopulatedTypes.map((t) => CUSTODY_LABELS[t] ?? t).join(", ")}. Representable and empty is not the same as unsupported — consignment-in has its own population on the next tab, and it is off-book by construction.`,
      // "Everything here is company-owned" was too strong: presence on the
      // listing is the company's RECORDED assertion of ownership, and the
      // close has open exceptions disputing that assertion for some of these
      // very units — EXC-007's third-party holding among them. Custody is
      // still the question this screen answers; ownership is reported as what
      // the listing asserts, with the dispute named rather than papered over.
      note: "Custody says who is holding the unit. Ownership is the accounting conclusion beside it, and the two answer different questions: every unit here is stock the listing RECORDS as company-owned, including the units a customer, a carrier or an installer is holding. Where an open exception disputes that record, the Exceptions and Ownership screens carry it — this screen never treats a location as an ownership conclusion. Location is not ownership.",
    },
    consignment: {
      stats: consignmentStats,
      rows: consignmentRows,
      byOwner: consignment.byOwner.map((o) => ({
        key: o.key,
        value: `${units(o.units)} units · ${formatCents(o.statedValueCents)}`,
      })),
      separation: {
        holds: consignment.outsideSubledger,
        headline: consignment.outsideSubledger
          ? "None of this stock is in the inventory balance."
          : "Consigned stock is reaching the inventory balance.",
        detail: consignment.outsideSubledger
          ? "Checked, not assumed, and in two steps: no serial held here appears on the year-end listing, and the listing is exactly what the close reports as the inventory subledger. The second step is what makes the first one about value rather than about serial numbers."
          : `${consignment.consignedSerialsOnBook.join(", ")} appears both here and on the year-end listing. A unit cannot be both vendor-owned and part of the company's inventory, so one of the two records is wrong.`,
      },
      // The measurement is "no count line records a consignment bin". The
      // REASON must not overstate it: the counted population is drawn from
      // book locations, but the count also runs floor-to-sheet tests that
      // start from the floor — one of which found a unit that is not on the
      // book at all. So this says what the count recorded, not what it could
      // not have reached.
      countNote:
        consignment.countLinesTouchingConsignmentBins === 0
          ? "No year-end count line records a consignment bin, so nothing in the count either corroborates or contradicts these holdings. The counted population is drawn from book locations and these units are not on the book — though the count does also run floor-to-sheet tests that start from the floor, so this states what was recorded rather than what the count could not have reached."
          : `${consignment.countLinesTouchingConsignmentBins} count lines record a consignment bin, so the count reached stock the company does not own.`,
      note: "Vendor-owned units in the company's custody: the case the book population cannot express, because the book is a list of what the company owns. Value is the owner's, stated at the standard price for the part — the company never bought these units and has no cost basis in them, so no figure here is a cost.",
      withheldNote:
        consignment.withheldRowCount === 0
          ? null
          : `${consignment.withheldRowCount} holdings are outside this role's scope and are not listed.`,
    },
    disposition: {
      stats: dispositionStats,
      rows: dispositionRows,
      byMethod: dispositions.byMethod.map((m) => ({
        method: METHOD_LABELS[m.method] ?? m.method,
        units: String(m.units),
        cost: formatCents(m.originalCostCents),
        proceeds: formatCents(m.proceedsCents),
        loss: formatCents(m.lossCents),
      })),
      removal: {
        holds: dispositions.removedFromBook,
        headline: dispositions.removedFromBook
          ? "None of these units is on the year-end listing."
          : "A disposed unit is still on the year-end listing.",
        detail: dispositions.removedFromBook
          ? "Checked against the listing rather than assumed. A unit that had been disposed of and left on the book would be counted twice — once as stock on hand and once as a disposal — and nothing else in the close would show it."
          : `${dispositions.disposedSerialsOnBook.join(", ")} was disposed of during FY2026 and still appears on the year-end listing, so its cost is counted both as stock on hand and as a disposal.`,
      },
      supportNote:
        dispositions.rowsWithAdjustmentOnFile === 0 && dispositions.rowsWithEvidenceOnFile === 0
          ? `Each record names an inventory adjustment and a certificate. Neither resolves: the close holds none of the ${dispositions.units} adjustments, and the evidence system — which indexes ${dispositions.evidenceIndexSize} references — holds none of the certificates. The references are shown as the source record wrote them, and nothing here can be opened.`
          : `${dispositions.rowsWithAdjustmentOnFile} of ${dispositions.units} records name an adjustment the close holds, and ${dispositions.rowsWithEvidenceOnFile} name a certificate the evidence system holds. The rest are shown as the source record wrote them.`,
      note: "The one lifecycle the year-end listing cannot show, because nothing on it has been disposed of. These four units left the book during FY2026; the amounts are what each record states, and no figure here is a reserve or an estimate for anything still on hand.",
      withheldNote:
        dispositions.withheldRowCount === 0
          ? null
          : `${dispositions.withheldRowCount} disposition records are outside this role's scope and are not listed.`,
    },
  };
}
