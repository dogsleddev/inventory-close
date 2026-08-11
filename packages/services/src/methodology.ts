import {
  ACCOUNTING_CLASSIFICATIONS,
  AUTHORED_INTERPRETATIONS,
  custodyTypeFor,
  glAccountDescription,
  GROSS_INVENTORY_ACCOUNT_CODES,
  INVENTORY_ACCOUNTING_MATRIX,
  INVENTORY_ACCOUNTING_MATRIX_DIMENSIONS,
  PHYSICAL_CUSTODY_TYPES,
  type AccountingClassification,
  type AuthoredInterpretation,
  type MatrixDimension,
  type PhysicalCustodyType,
} from "@icg/domain";
import { explainReadiness, POLICY_V1, type ReadinessExplanationOut } from "@icg/rules";
import { authorize } from "@icg/permissions";
import { effectiveExceptions } from "./effective.js";
import { MONTHS_OF_SUPPLY_ASSUMPTION, MONTHS_OF_SUPPLY_BASIS } from "./eoMethodology.js";
import { INVENTORY_RESERVE_ACCOUNT } from "./glAccounts.js";
import { REPLAY_EXCLUSIONS } from "./integrity.js";
import type { ServiceContext } from "./queries.js";
import type { Workspace } from "./workspace.js";

/**
 * Methodology and calculations (COMPLETION_PLAN Stage F, decision D12) —
 * *how is each of these figures arrived at, and which parts of it did somebody
 * decide?*
 *
 * The product could show every figure and explain none of them. Each screen
 * carries the sentence its own number needs, which is right for reading one
 * screen and useless for the question a reviewer actually asks: what is
 * derived, what is policy, and what is a judgement I am entitled to disagree
 * with.
 *
 * **Every field below is read from the thing it describes.** That is the whole
 * discipline of this module, and it is not a style preference:
 *
 * - The readiness derivation comes from `explainReadiness`, which shares its
 *   arithmetic with `computeReadiness` — the function the close actually ran.
 *   A second implementation would keep describing a tier rule after the rule
 *   changed, and no test would fail.
 * - The register of authored interpretations comes from
 *   `AUTHORED_INTERPRETATIONS` in @icg/domain plus the named constants below,
 *   read at runtime. Prose restating a judgement is a second copy of it.
 * - The accounting matrix's custody expectation is MEASURED against
 *   `custodyTypeFor` over the real population rather than asserted, and the
 *   difference is reported in both directions.
 *
 * This is a projection, not a rule. Nothing here is an input to any rule, no
 * exception or blocker is derived, and no figure moves because of it.
 *
 * Nothing here reads a source document — the matrix, the policy and the
 * interpretations carry no `sourceRef`, and the unit population is readable
 * under `close.read` exactly as `listInventoryUnits` is — so there is nothing
 * for `makeRecordScope` to narrow, and it is deliberately not called rather
 * than silently omitted.
 */

/* ------------------------------------------------------------------ */
/* Shapes                                                              */
/* ------------------------------------------------------------------ */

/** What the reconciliation does, checked against what it produced. */
export interface ReconciliationDerivationOut {
  readonly asOf: string;
  /** The accounts summed into the gross GL figure. */
  readonly grossAccounts: readonly string[];
  /** Held out of every gross figure, and why. */
  readonly excludedAccount: string;
  readonly excludedAccountDescription: string;
  readonly subledgerCents: number;
  readonly subledgerUnits: number;
  readonly grossGlCents: number;
  readonly differenceCents: number;
  /** The convention, stated once: positive means the GL is higher. */
  readonly signConvention: string;
  readonly items: readonly {
    readonly id: string;
    readonly description: string;
    readonly amountCents: number;
    readonly relatedExceptionId: string;
  }[];
  readonly explainedCents: number;
  readonly unexplainedCents: number;
  /**
   * Whether applying every identified item clears the difference exactly.
   * Measured, because "fully explained" is the claim the bridge exists to
   * support and it is false the moment an item is added or removed.
   */
  readonly fullyExplained: boolean;
}

export interface MatrixRowOut {
  readonly classification: AccountingClassification;
  readonly glAccount: string;
  readonly glAccountDescription: string;
  readonly ownershipAssertion: string;
  readonly cogsRelief: string;
  readonly cogsBasis: string;
  readonly establishingRecord: string;
  /** AUTHORED — what this row expects. */
  readonly expectedCustody: readonly PhysicalCustodyType[];
  /** MEASURED — what the population's units actually resolve to. */
  readonly observedCustody: readonly PhysicalCustodyType[];
  /** Observed custody the row did not expect. */
  readonly unexpectedCustody: readonly PhysicalCustodyType[];
  /** Expected custody nothing in the population resolves to. */
  readonly unobservedCustody: readonly PhysicalCustodyType[];
  /** Both differences empty. */
  readonly custodyAsExpected: boolean;
  readonly units: number;
  readonly carryingCents: number;
}

export interface AccountingMatrixOut {
  readonly dimensions: readonly MatrixDimension[];
  readonly rows: readonly MatrixRowOut[];
  /**
   * Whether every row's observed custody sits inside its authored
   * expectation, and every expectation is populated.
   *
   * Two independent halves, and both can go false on their own: an
   * expectation can be too narrow (a unit resolves somewhere the row does not
   * name) or too wide (the row names a custody type no unit reaches). A
   * single flag over one of them would let the other kind of wrongness
   * through, so both are counted and the rows that differ are named.
   */
  readonly custodyExpectationHolds: boolean;
  readonly rowsWithUnexpectedCustody: readonly AccountingClassification[];
  readonly rowsWithUnobservedCustody: readonly AccountingClassification[];
}

/**
 * One judgement in the register, with where it is held.
 *
 * `heldIn` names the exported constant, not a file path: the constant is what
 * a reader greps for, and a test asserts each name still exists in source so
 * a register entry cannot outlive the thing it points at.
 */
export interface InterpretationOut {
  readonly id: string;
  readonly dimension: string;
  readonly subject: string;
  readonly answer: string;
  readonly basis: string;
  readonly heldIn: string;
}

/** A policy value somebody chose, with what it governs. */
export interface PolicyValueOut {
  readonly key: string;
  readonly value: string;
  readonly governs: string;
}

export interface MethodologyOut {
  readonly policyVersion: string;
  readonly datasetVersion: string;
  readonly runId: string;
  readonly readiness: ReadinessExplanationOut;
  /**
   * True once a management conclusion or a submitted record has moved the
   * live position away from the baseline. The explanation always describes
   * the LIVE figure, so it has to say when that is no longer the derived one.
   */
  readonly readinessDiverged: boolean;
  readonly baselineReadinessBps: number;
  readonly reconciliation: ReconciliationDerivationOut;
  readonly matrix: AccountingMatrixOut;
  readonly policyValues: readonly PolicyValueOut[];
  readonly interpretations: readonly InterpretationOut[];
  /** What the determinism check deliberately does not cover. */
  readonly replayExclusions: readonly string[];
}

/* ------------------------------------------------------------------ */
/* Where each interpretation is held                                   */
/* ------------------------------------------------------------------ */

/**
 * The constant that holds each authored dimension.
 *
 * `Record<…, string>` over the register's own dimension union, so a new
 * dimension without a home is a compile error rather than a register row
 * that says nothing about where to find the judgement.
 */
const INTERPRETATION_HOME: Readonly<Record<AuthoredInterpretation["dimension"], string>> = {
  GL_ACCOUNT: "INVENTORY_ACCOUNTING_MATRIX",
  CUSTODY: "INVENTORY_ACCOUNTING_MATRIX",
  OWNERSHIP: "INVENTORY_ACCOUNTING_MATRIX",
  COGS: "INVENTORY_ACCOUNTING_MATRIX",
  EVIDENCE: "INVENTORY_ACCOUNTING_MATRIX",
  COST_BEHAVIOR: "COST_COMPONENT_BEHAVIOR",
  CUSTODY_HOLDER: "CUSTODY_HOLDER",
};

/* ------------------------------------------------------------------ */
/* The projection                                                      */
/* ------------------------------------------------------------------ */

function buildMatrix(ws: Workspace): AccountingMatrixOut {
  const observed = new Map<
    AccountingClassification,
    { custody: Set<PhysicalCustodyType>; units: number; cents: number }
  >();
  for (const classification of ACCOUNTING_CLASSIFICATIONS) {
    observed.set(classification, { custody: new Set(), units: 0, cents: 0 });
  }
  for (const unit of ws.dataset.inventoryUnits) {
    const bucket = observed.get(unit.classification);
    if (bucket === undefined) continue;
    bucket.units += 1;
    bucket.cents += unit.unitCostCents;
    // The SAME derivation the master list and the custody breakdown use. A
    // second copy here would let this page agree with itself and with
    // nothing else.
    bucket.custody.add(
      custodyTypeFor({
        location: unit.location,
        classification: unit.classification,
        ...(unit.custodian !== undefined ? { custodian: unit.custodian } : {}),
      }),
    );
  }

  const rows: MatrixRowOut[] = ACCOUNTING_CLASSIFICATIONS.map((classification) => {
    const authored = INVENTORY_ACCOUNTING_MATRIX[classification];
    const bucket = observed.get(classification)!;
    const expected = new Set<PhysicalCustodyType>(authored.expectedCustody);
    const observedCustody = PHYSICAL_CUSTODY_TYPES.filter((t) => bucket.custody.has(t));
    const unexpectedCustody = observedCustody.filter((t) => !expected.has(t));
    const unobservedCustody = authored.expectedCustody.filter(
      (t) => !bucket.custody.has(t),
    );
    return {
      classification,
      glAccount: authored.glAccount,
      glAccountDescription: glAccountDescription(authored.glAccount) ?? authored.glAccount,
      ownershipAssertion: authored.ownershipAssertion,
      cogsRelief: authored.cogsRelief,
      cogsBasis: authored.cogsBasis,
      establishingRecord: authored.establishingRecord,
      expectedCustody: authored.expectedCustody,
      observedCustody,
      unexpectedCustody,
      unobservedCustody,
      custodyAsExpected: unexpectedCustody.length === 0 && unobservedCustody.length === 0,
      units: bucket.units,
      carryingCents: bucket.cents,
    };
  });

  const rowsWithUnexpectedCustody = rows
    .filter((r) => r.unexpectedCustody.length > 0)
    .map((r) => r.classification);
  const rowsWithUnobservedCustody = rows
    .filter((r) => r.unobservedCustody.length > 0)
    .map((r) => r.classification);

  return {
    dimensions: INVENTORY_ACCOUNTING_MATRIX_DIMENSIONS,
    rows,
    custodyExpectationHolds:
      rowsWithUnexpectedCustody.length === 0 && rowsWithUnobservedCustody.length === 0,
    rowsWithUnexpectedCustody,
    rowsWithUnobservedCustody,
  };
}

function buildReconciliationDerivation(ws: Workspace): ReconciliationDerivationOut {
  const recon = ws.close.reconciliation;
  return {
    asOf: recon.asOf,
    grossAccounts: GROSS_INVENTORY_ACCOUNT_CODES,
    excludedAccount: INVENTORY_RESERVE_ACCOUNT,
    excludedAccountDescription:
      glAccountDescription(INVENTORY_RESERVE_ACCOUNT) ?? INVENTORY_RESERVE_ACCOUNT,
    subledgerCents: recon.subledgerCents,
    subledgerUnits: ws.dataset.inventoryUnits.length,
    grossGlCents: recon.grossGlCents,
    differenceCents: recon.differenceCents,
    signConvention:
      "The difference is the general ledger less the subledger, so a positive figure means the ledger carries more than the unit population does.",
    items: recon.items.map((i) => ({
      id: i.id,
      description: i.description,
      amountCents: i.amountCents,
      relatedExceptionId: i.relatedExceptionId,
    })),
    explainedCents: recon.explainedCents,
    unexplainedCents: recon.unexplainedCents,
    fullyExplained: recon.unexplainedCents === 0,
  };
}

function buildPolicyValues(): readonly PolicyValueOut[] {
  const p = POLICY_V1;
  return [
    {
      key: "demoAgeThresholdDays",
      value: `${p.demoAgeThresholdDays} days`,
      governs: "How long a demonstration assignment may run before DEMO-AGE-001 asks for a review.",
    },
    {
      key: "slowMovingAgeDays",
      value: `${p.slowMovingAgeDays} days`,
      governs: "The no-movement age at which VAL-EO-001 treats stock as slow-moving.",
    },
    {
      key: "manualEntrySupportThresholdCents",
      value: `${p.manualEntrySupportThresholdCents} cents`,
      governs: "The size at or above which GL-MAN-001 requires a manual journal entry to carry support.",
    },
    {
      key: "blockerRiskLevels",
      value: p.blockerRiskLevels.join(", "),
      governs: "Which risk levels make an open exception block sign-off.",
    },
    ...p.readinessCategories.map((c) => ({
      key: `weight:${c.key}`,
      value: `${c.weightPercent}%`,
      governs: `${c.label}'s share of the readiness total.`,
    })),
  ];
}

function buildInterpretations(): readonly InterpretationOut[] {
  const fromMatrix: InterpretationOut[] = AUTHORED_INTERPRETATIONS.map((i) => ({
    id: i.id,
    dimension: i.dimension,
    subject: i.subject,
    answer: i.answer,
    basis: i.basis,
    heldIn: INTERPRETATION_HOME[i.dimension],
  }));

  // Judgements that live outside the matrix because they belong to the module
  // that makes them. Each is READ from its constant, never restated here.
  const elsewhere: InterpretationOut[] = [
    {
      id: "EO:MONTHS_OF_SUPPLY",
      dimension: "VALUATION",
      subject: "Months of supply",
      answer: MONTHS_OF_SUPPLY_ASSUMPTION,
      basis: MONTHS_OF_SUPPLY_BASIS,
      heldIn: "MONTHS_OF_SUPPLY_BASIS",
    },
    ...POLICY_V1.readinessCategories.map((c) => ({
      id: `POLICY:WEIGHT:${c.key}`,
      dimension: "READINESS",
      subject: `${c.label} weight`,
      answer: `${c.weightPercent}% of the readiness total`,
      basis:
        "A policy choice recorded in the close policy and hashed into the run, not a derivation. Changing it is a policy version change and the golden baseline will say so.",
      heldIn: "POLICY_V1",
    })),
  ];

  return [...fromMatrix, ...elsewhere];
}

/**
 * The whole methodology, for a caller authorized to read the close.
 *
 * The readiness explanation describes the LIVE position — the same effective
 * exception set `effectiveClose` scores — because that is the figure every
 * other surface shows. When somebody's conclusion has moved it, the baseline
 * travels alongside so a reader can see what moved and from where; a figure
 * that moved is only meaningful beside the one it moved from.
 */
export function getMethodology(ws: Workspace, ctx: ServiceContext): MethodologyOut {
  authorize(ctx.user, "close.read");

  const readiness = explainReadiness(
    effectiveExceptions(ws),
    ws.close.reconciliation,
    ws.close.proposedAdjustments.length,
    POLICY_V1,
  );

  return {
    policyVersion: POLICY_V1.version,
    datasetVersion: ws.dataset.manifest.datasetVersion,
    runId: ws.close.runManifest.runId,
    readiness,
    readinessDiverged: readiness.totalBasisPoints !== ws.close.readiness.totalBasisPoints,
    baselineReadinessBps: ws.close.readiness.totalBasisPoints,
    reconciliation: buildReconciliationDerivation(ws),
    matrix: buildMatrix(ws),
    policyValues: buildPolicyValues(),
    interpretations: buildInterpretations(),
    replayExclusions: REPLAY_EXCLUSIONS,
  };
}

/**
 * The constants the register points at, for the test that proves each name
 * still exists in source. A register naming a constant nobody can find is
 * the same defect as a scan whose config roots list files that are not there.
 */
export const INTERPRETATION_CONSTANT_NAMES: readonly string[] = [
  ...new Set([
    ...Object.values(INTERPRETATION_HOME),
    "MONTHS_OF_SUPPLY_BASIS",
    "POLICY_V1",
  ]),
];
