import {
  ACCOUNTING_CLASSIFICATIONS,
  COST_COMPONENT_TYPES,
  type AccountingClassification,
  type CostBehavior,
  type CostComponentType,
} from "./enums.js";
import { PHYSICAL_CUSTODY_TYPES, type PhysicalCustodyType } from "./custody.js";

/**
 * The Inventory Accounting Matrix — the ONE place this product's authored
 * accounting interpretations live.
 *
 * Three maps used to answer three of these questions in four different
 * modules: accounting classification → GL account existed twice (exported
 * from the query service and mirrored in the GL-account projection), cost
 * component → behaviour lived in the costing projection, and custody type →
 * who is holding the unit lived in the ownership projection. Each was an
 * accounting judgement a reader may disagree with, held inside the layer that
 * happened to need it first. Two copies of a judgement is how two screens
 * start giving different answers to the same question; a judgement buried in
 * a projection is one nobody can find to disagree with.
 *
 * `domain` is the right home for all of it: the judgements are about the
 * model, not about any one surface, and this package depends on nothing.
 *
 * **Two kinds of answer live here and they are labelled, never blended.**
 *
 * - **SPECIFIED** — the answer comes from `CANONICAL_SPEC`. Changing it is a
 *   specification change, and the golden baseline will say so.
 * - **AUTHORED** — the answer was decided during the build. It is a
 *   management interpretation, it travels with the basis for the judgement,
 *   and a reader is entitled to disagree with it.
 *
 * Every authored entry below carries its own `basis`. That is what lets the
 * Methodology screen render the register of interpretations as a PROJECTION
 * of these tables rather than as prose beside them — prose would be a second
 * copy of the judgement, and a second copy is the defect this module exists
 * to remove.
 *
 * Nothing here is derived from a close run, so nothing here can drift with
 * one, and nothing here is read by the rule engine: no exception, blocker,
 * readiness input or locked figure depends on any value below.
 */

/** Where an answer in this module comes from. */
export type MatrixProvenance = "SPECIFIED" | "AUTHORED";

/**
 * One dimension of the matrix: what the column answers, and on whose
 * authority. A surface rendering the matrix reads this rather than
 * transcribing a provenance next to each column — a transcription is how a
 * column ends up labelled "specified" after the specification stopped saying
 * it.
 */
export interface MatrixDimension {
  readonly key:
    | "GL_ACCOUNT"
    | "CUSTODY"
    | "OWNERSHIP"
    | "COGS"
    | "EVIDENCE";
  readonly label: string;
  readonly question: string;
  readonly provenance: MatrixProvenance;
  /** The document or the reasoning the answer rests on. */
  readonly basis: string;
}

export const INVENTORY_ACCOUNTING_MATRIX_DIMENSIONS: readonly MatrixDimension[] = [
  {
    key: "GL_ACCOUNT",
    label: "GL account",
    question: "Which general-ledger account carries a unit of this classification?",
    provenance: "SPECIFIED",
    basis:
      "CANONICAL_SPEC section 5 sets the gross subledger-to-GL mapping. The chart of accounts itself is a code constant in this package, never a fixture.",
  },
  {
    key: "CUSTODY",
    label: "Expected custody",
    question: "Who would be expected to be holding a unit of this classification?",
    provenance: "AUTHORED",
    basis:
      "Custody is DERIVED per unit from its location, classification and named custodian; it is never stored and never read from this table. The expectation here is an authored claim about the population, and it is measured against the derivation rather than asserted — a classification whose units resolve to a custody type this row does not name is reported as the difference it is.",
  },
  {
    key: "OWNERSHIP",
    label: "Ownership assertion",
    question:
      "What does the company assert by carrying a unit of this classification on the year-end listing, and what would dispute it?",
    provenance: "AUTHORED",
    basis:
      "Presence on the listing is the company's own recorded assertion of ownership. Gaurd never concludes ownership; it reports the assertion and whether an open exception disputes it.",
  },
  {
    key: "COGS",
    label: "Cost relief",
    question:
      "Would a unit of this classification be expected to have had its cost relieved to cost of sales?",
    provenance: "AUTHORED",
    basis:
      "An expectation only. Whether a fulfilled unit's cost has actually left the book is measured per order-to-cash chain by O2C-CHAIN-001 and is never inferred from a classification. NOT_EXPECTED means the classification does not describe sold stock, not that a journal entry was checked and found present.",
  },
  {
    key: "EVIDENCE",
    label: "Establishing record",
    question: "Which record establishes that a unit belongs in this classification?",
    provenance: "AUTHORED",
    basis:
      "Names the record a preparer would produce to support the classification. It is a statement about what SHOULD exist; whether it does is an evidence question the close answers per unit, not a property of the classification.",
  },
];

/** Whether the cost of a unit in this classification would be expected to have left the book. */
export const COGS_RELIEF_EXPECTATIONS = ["NOT_EXPECTED", "IN_QUESTION"] as const;
export type CogsReliefExpectation = (typeof COGS_RELIEF_EXPECTATIONS)[number];

export interface InventoryAccountingMatrixRow {
  readonly classification: AccountingClassification;
  /** SPECIFIED — CANONICAL_SPEC section 5. */
  readonly glAccount: string;
  /**
   * AUTHORED — the custody types a unit of this classification is expected to
   * resolve to. Measured against `custodyTypeFor`, never used as an input to
   * it.
   */
  readonly expectedCustody: readonly PhysicalCustodyType[];
  /** AUTHORED — what carrying the unit asserts, and what would dispute it. */
  readonly ownershipAssertion: string;
  /** AUTHORED — see the COGS dimension note; an expectation, never a finding. */
  readonly cogsRelief: CogsReliefExpectation;
  readonly cogsBasis: string;
  /** AUTHORED — the record that would establish the classification. */
  readonly establishingRecord: string;
}

/**
 * The matrix, keyed by classification.
 *
 * `Record<AccountingClassification, …>` rather than an array: adding a
 * classification without answering every question here becomes a compile
 * error instead of a row that silently reports blanks.
 */
export const INVENTORY_ACCOUNTING_MATRIX: Readonly<
  Record<AccountingClassification, InventoryAccountingMatrixRow>
> = {
  FINISHED_HARDWARE: {
    classification: "FINISHED_HARDWARE",
    glAccount: "1200",
    expectedCustody: ["COMPANY_WAREHOUSE", "CUSTOMER_SITE"],
    ownershipAssertion:
      "Company-owned finished goods. Units sitting at a customer site are recorded as company-owned installed stock rather than as a sale, so the assertion covers them too — and an open cutoff or rights-and-obligations exception over such a unit is what puts that assertion under review.",
    cogsRelief: "NOT_EXPECTED",
    cogsBasis:
      "A unit on the year-end listing has not been derecognized, and a company-owned unit at a customer site is installed stock rather than a sale. No relief would be expected against either.",
    establishingRecord:
      "The item receipt that brought the unit onto the book, and — where it sits at a customer — the installation record placing it there.",
  },
  GIT: {
    classification: "GIT",
    glAccount: "1210",
    expectedCustody: ["IN_TRANSIT_INBOUND", "IN_TRANSIT_OUTBOUND"],
    ownershipAssertion:
      "Goods the company owns while they are with a carrier. The assertion depends on which way the unit is moving and on when title passes under the governing contract, which is why this classification carries both inbound and outbound stock and why a missing contract provision disputes the assertion rather than merely delaying it.",
    cogsRelief: "IN_QUESTION",
    cogsBasis:
      "The outbound half of this classification is stock that has been fulfilled but is still carried on the book, so whether its cost has left the book is a live question. It is answered per chain by O2C-CHAIN-001 and never from this row.",
    establishingRecord:
      "The carrier shipment trail for the unit, together with the contract provision that governs when title passes.",
  },
  DEMO: {
    classification: "DEMO",
    glAccount: "1220",
    expectedCustody: ["FIELD_DEMO_LOANER"],
    ownershipAssertion:
      "Company-owned stock deployed to the field demonstration pool. Deployment is not a transfer, so the assertion is unaffected by where the unit sits; age is a valuation question rather than an ownership one.",
    cogsRelief: "NOT_EXPECTED",
    cogsBasis: "A demonstration unit has not been sold, so no relief would be expected.",
    establishingRecord:
      "The assignment that placed the unit in the demonstration pool, with its start date.",
  },
  LOANER: {
    classification: "LOANER",
    glAccount: "1220",
    expectedCustody: ["FIELD_DEMO_LOANER", "CUSTOMER_SITE"],
    ownershipAssertion:
      "Company-owned stock lent to a customer under loaner terms. The loan does not transfer ownership, and the assertion rests on the loaner terms in the governing contract — an absent provision is what puts it under review.",
    cogsRelief: "NOT_EXPECTED",
    cogsBasis:
      "A loan is not a sale. The unit stays on the book for the duration of the loan, so no relief would be expected against it.",
    establishingRecord:
      "The assignment recording the loan, and the contract provision setting the loaner terms.",
  },
  RMA: {
    classification: "RMA",
    glAccount: "1230",
    expectedCustody: ["REPAIR_RMA_HOLD"],
    ownershipAssertion:
      "Stock the company has taken back and holds pending repair or disposition. Ownership returns to the company on receipt, so the assertion is established by the return itself rather than by anything a customer records.",
    cogsRelief: "NOT_EXPECTED",
    cogsBasis:
      "A returned unit is back on the book. If its cost had been relieved on the original sale, the return is what puts it back — which is a separate question from whether the return was recorded once.",
    establishingRecord: "The RMA record for the unit, and the receipt that took it back in.",
  },
  DAMAGED: {
    classification: "DAMAGED",
    glAccount: "1200",
    expectedCustody: ["QUARANTINE_DAMAGED"],
    ownershipAssertion:
      "Company-owned stock quarantined pending a damage disposition. Damage changes what the unit is worth, never who owns it, so the assertion is not in question for this classification.",
    cogsRelief: "NOT_EXPECTED",
    cogsBasis:
      "Quarantined stock has not been sold. Whether it should still be carried at cost is a valuation question, not a relief one.",
    establishingRecord:
      "The damage assessment for the unit and the adjustment that moved it into the quarantine location.",
  },
  THIRD_PARTY: {
    classification: "THIRD_PARTY",
    glAccount: "1200",
    expectedCustody: ["THIRD_PARTY_CUSTODIAN", "CONTRACT_MANUFACTURER"],
    ownershipAssertion:
      "Company-owned stock in someone else's physical custody. This is the classification where custody and ownership come apart most sharply: the holder is not the owner, and the assertion rests on a confirmation from the custodian rather than on anything the company can observe directly. An outstanding confirmation is what puts it under review.",
    cogsRelief: "NOT_EXPECTED",
    cogsBasis:
      "Stock held by a custodian has not been sold; placing it with a third party is a custody arrangement, not a disposal.",
    establishingRecord:
      "The custodian's statement of what it is holding, confirmed as at the balance-sheet date.",
  },
  VALUATION_REVIEW: {
    classification: "VALUATION_REVIEW",
    glAccount: "1200",
    expectedCustody: ["COMPANY_WAREHOUSE"],
    ownershipAssertion:
      "Company-owned stock flagged for a valuation review. The flag is about carrying value; it makes no ownership claim of its own and disputes none.",
    cogsRelief: "NOT_EXPECTED",
    cogsBasis:
      "Stock under valuation review is still on hand and unsold. The open question is what it is worth, not whether its cost has left the book.",
    establishingRecord:
      "The aging or demand evidence that put the unit into review, and the reserve assessment that would conclude it.",
  },
};

/** Every matrix row, in the canonical classification order. */
export const INVENTORY_ACCOUNTING_MATRIX_ROWS: readonly InventoryAccountingMatrixRow[] =
  ACCOUNTING_CLASSIFICATIONS.map((c) => INVENTORY_ACCOUNTING_MATRIX[c]);

/**
 * The GL account that carries a unit of this classification.
 *
 * Total over the classification enum and the single source for the mapping.
 * Every surface that needs a unit's account calls THIS — the per-unit
 * Financial Life answer, the all-inventory master list, the per-account GL
 * reconciliation and the exports are then the same answer by construction
 * rather than by a test comparing two copies.
 */
export function glAccountForClassification(
  classification: AccountingClassification,
): string {
  return INVENTORY_ACCOUNTING_MATRIX[classification].glAccount;
}

/**
 * The classifications an account carries, in canonical order. Derived from
 * the matrix rather than written beside it, so an account's membership list
 * cannot disagree with the mapping that produced it.
 */
export function classificationsForGlAccount(
  account: string,
): readonly AccountingClassification[] {
  return ACCOUNTING_CLASSIFICATIONS.filter(
    (c) => INVENTORY_ACCOUNTING_MATRIX[c].glAccount === account,
  );
}

/* ------------------------------------------------------------------ */
/* Custody → who is holding the unit                                   */
/* ------------------------------------------------------------------ */

/**
 * Who is holding the unit, as a three-way answer.
 *
 * NOT_ESTABLISHED is its own value and not the absence of one: a custody type
 * the location does not describe means nobody has said who holds the unit,
 * which is a different statement from "somebody other than the company does".
 * Two surfaces used to derive this by taking the COMPLEMENT of a small
 * company-held set, which turned an undetermined holding into a positive
 * claim that a third party held the unit.
 */
export type CustodyHolder = "COMPANY" | "OTHER_PARTY" | "NOT_ESTABLISHED";

/**
 * AUTHORED. Total over the custody taxonomy and exhaustive by construction:
 * `Record<PhysicalCustodyType, …>` means adding a custody type without
 * answering this question is a compile error rather than a unit quietly
 * reported as held by a third party.
 */
export const CUSTODY_HOLDER: Readonly<Record<PhysicalCustodyType, CustodyHolder>> = {
  COMPANY_WAREHOUSE: "COMPANY",
  REPAIR_RMA_HOLD: "COMPANY",
  QUARANTINE_DAMAGED: "COMPANY",
  IN_TRANSIT_INBOUND: "OTHER_PARTY",
  IN_TRANSIT_OUTBOUND: "OTHER_PARTY",
  CUSTOMER_SITE: "OTHER_PARTY",
  THIRD_PARTY_CUSTODIAN: "OTHER_PARTY",
  CONTRACT_MANUFACTURER: "OTHER_PARTY",
  FIELD_DEMO_LOANER: "OTHER_PARTY",
  // Vendor-owned stock in the company's custody is held BY the company; it is
  // simply not the company's stock. No book unit resolves here.
  CONSIGNMENT_IN: "COMPANY",
  CONSIGNMENT_OUT: "OTHER_PARTY",
  UNDETERMINED: "NOT_ESTABLISHED",
};

export function custodyHolderFor(custodyType: PhysicalCustodyType): CustodyHolder {
  return CUSTODY_HOLDER[custodyType];
}

/* ------------------------------------------------------------------ */
/* Cost components → how the cost behaves, and why                     */
/* ------------------------------------------------------------------ */

export interface CostComponentInterpretation {
  readonly component: CostComponentType;
  readonly behavior: CostBehavior;
  readonly basis: string;
}

/**
 * AUTHORED. How each capitalized component behaves with volume, and why.
 *
 * Held here rather than in the fixtures on purpose: a behaviour
 * classification is an accounting interpretation a reader may disagree with,
 * and putting it in the dataset would make disagreeing with it a dataset
 * regeneration — a new manifest hash and a new `dataset_version` for a
 * judgement about economics.
 */
export const COST_COMPONENT_BEHAVIOR: Readonly<
  Record<CostComponentType, CostComponentInterpretation>
> = {
  DIRECT_MATERIAL: {
    component: "DIRECT_MATERIAL",
    behavior: "VARIABLE",
    basis:
      "Component cost is incurred per unit built and moves directly with volume.",
  },
  DIRECT_LABOR: {
    component: "DIRECT_LABOR",
    behavior: "VARIABLE",
    basis:
      "Assembly and test hours are charged at a standard rate per unit, so the cost follows the units produced.",
  },
  MANUFACTURING_OVERHEAD: {
    component: "MANUFACTURING_OVERHEAD",
    behavior: "FIXED",
    basis:
      "Absorbed at a standard rate set on normal capacity. The pool itself does not move with the next unit; overhead left unabsorbed is not capitalized at all, and is reported on the period side as idle capacity.",
  },
  INBOUND_FREIGHT: {
    component: "INBOUND_FREIGHT",
    behavior: "VARIABLE",
    basis:
      "Charged on the shipment that brings the goods in, and scales with the units shipped.",
  },
  IMPORT_DUTY: {
    component: "IMPORT_DUTY",
    behavior: "VARIABLE",
    basis: "Assessed on the declared value of the units imported.",
  },
};

/* ------------------------------------------------------------------ */
/* The register of authored interpretations                            */
/* ------------------------------------------------------------------ */

/**
 * One authored judgement, with what it is about and why it was made.
 *
 * The register below is BUILT FROM the tables above rather than written
 * beside them. A hand-written register is a second copy of every judgement
 * it describes, and a second copy drifts: the register would keep describing
 * a mapping after the mapping changed, and nothing would fail. Deriving it
 * means the Methodology screen cannot show an interpretation this module does
 * not hold, and cannot omit one it does.
 *
 * It covers the AUTHORED dimensions ONLY, and it selects them by reading
 * `provenance` rather than by a hand-kept list — so the GL mapping is absent
 * because the specification decides it, and moving a dimension between the
 * two kinds of answer moves it into or out of this register without anyone
 * remembering to.
 */
export interface AuthoredInterpretation {
  readonly id: string;
  readonly dimension: MatrixDimension["key"] | "COST_BEHAVIOR" | "CUSTODY_HOLDER";
  /** What the judgement is about — a classification, a component, a type. */
  readonly subject: string;
  /** The judgement itself, as a short answer. */
  readonly answer: string;
  /** Why. The reader disagrees with this, not with the label. */
  readonly basis: string;
}

/**
 * The answer and the basis a matrix row gives on one dimension. Exhaustive
 * over the dimension keys: a new dimension is a compile error here rather
 * than a column the register silently stops covering.
 */
function dimensionAnswer(
  rowValue: InventoryAccountingMatrixRow,
  key: MatrixDimension["key"],
): { answer: string; basis: string } {
  switch (key) {
    case "GL_ACCOUNT":
      return {
        answer: rowValue.glAccount,
        basis: "Set by CANONICAL_SPEC section 5, not decided here.",
      };
    case "CUSTODY":
      return {
        answer: rowValue.expectedCustody.join(", "),
        basis:
          "Custody is derived per unit from location, classification and custodian. This expectation is measured against that derivation, never used as an input to it.",
      };
    case "OWNERSHIP":
      return {
        answer: "Company-owned as recorded, subject to any open exception over the unit",
        basis: rowValue.ownershipAssertion,
      };
    case "COGS":
      return { answer: rowValue.cogsRelief, basis: rowValue.cogsBasis };
    case "EVIDENCE":
      return {
        answer: rowValue.establishingRecord,
        basis:
          "Names the record that would establish the classification. Whether it exists for a given unit is an evidence question the close answers per unit.",
      };
  }
}

const AUTHORED_DIMENSIONS = INVENTORY_ACCOUNTING_MATRIX_DIMENSIONS.filter(
  (d) => d.provenance === "AUTHORED",
);

export const AUTHORED_INTERPRETATIONS: readonly AuthoredInterpretation[] = [
  ...ACCOUNTING_CLASSIFICATIONS.flatMap((c): AuthoredInterpretation[] =>
    AUTHORED_DIMENSIONS.map((d): AuthoredInterpretation => {
      const { answer, basis } = dimensionAnswer(INVENTORY_ACCOUNTING_MATRIX[c], d.key);
      return { id: `${d.key}:${c}`, dimension: d.key, subject: c, answer, basis };
    }),
  ),
  ...COST_COMPONENT_TYPES.map((component): AuthoredInterpretation => ({
    id: `COST_BEHAVIOR:${component}`,
    dimension: "COST_BEHAVIOR",
    subject: component,
    answer: COST_COMPONENT_BEHAVIOR[component].behavior,
    basis: COST_COMPONENT_BEHAVIOR[component].basis,
  })),
  ...PHYSICAL_CUSTODY_TYPES.map((custodyType): AuthoredInterpretation => ({
    id: `CUSTODY_HOLDER:${custodyType}`,
    dimension: "CUSTODY_HOLDER",
    subject: custodyType,
    answer: CUSTODY_HOLDER[custodyType],
    basis:
      "Who is physically holding a unit that resolved to this custody type. NOT_ESTABLISHED is the absence of an answer, never a claim that another party holds the unit.",
  })),
];
