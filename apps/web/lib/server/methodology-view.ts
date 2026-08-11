import type { DemoUser } from "@icg/data";
import type { PhysicalCustodyType } from "@icg/domain";
import { getMethodology } from "@icg/services";
import { formatBpsExact, formatCents } from "../format";
import type {
  InterpretationRowView,
  MatrixRowView,
  MethodologyData,
  ProcurementStat,
  ReadinessCategoryView,
  ReadinessTermView,
} from "../view-model";
import { attempt } from "./data";
import { classificationLabel, holderLabel, titleCase } from "./humanize";
import { CUSTODY_LABELS } from "./inventory-list-view";
import { getWorkspace, makeContext, roleLabel } from "./workspace";

/**
 * Methodology & Calculations (COMPLETION_PLAN Stage F, decision D12).
 *
 * The screen that answers "where does this number come from, and who decided
 * it". Three things it must never become:
 *
 * 1. **A page of transcribed figures.** Every number here arrives from
 *    `getMethodology`, which reads the same `explainReadiness` arithmetic the
 *    close ran. A figure typed into this file would be a figure nobody
 *    derived, and this is the one screen where that would be worst.
 * 2. **A second copy of the judgements.** The interpretation register renders
 *    `interpretations`, which the services layer builds by reading the
 *    constants themselves. Prose restating a judgement here would keep
 *    describing it after it changed.
 * 3. **A claim that the product has no assumptions.** The register exists to
 *    say the opposite, and the three principles beneath it are the standard
 *    the product holds itself to, not a description of what it achieved.
 *
 * This module formats and labels. It sums nothing.
 */

const PROVENANCE_LABELS: Readonly<Record<string, string>> = {
  SPECIFIED: "Specified",
  AUTHORED: "Authored",
};

const DIMENSION_LABELS: Readonly<Record<string, string>> = {
  GL_ACCOUNT: "GL account",
  CUSTODY: "Custody",
  OWNERSHIP: "Ownership",
  COGS: "Cost relief",
  EVIDENCE: "Establishing record",
  COST_BEHAVIOR: "Cost behaviour",
  CUSTODY_HOLDER: "Who is holding it",
  VALUATION: "Valuation",
  READINESS: "Readiness",
};

const COGS_LABELS: Readonly<Record<string, string>> = {
  NOT_EXPECTED: "Not expected",
  IN_QUESTION: "In question",
};

const units = (n: number): string => n.toLocaleString("en-US");

/**
 * Enum-shaped subjects (DIRECT_MATERIAL, COMPANY_WAREHOUSE) get the same
 * humanizing every other screen gives them; anything already written as a
 * phrase is left alone, because title-casing it would render "Months of
 * supply" as "Months Of Supply" and read as a machine's idea of a heading.
 */
const subjectLabel = (subject: string): string =>
  /^[A-Z0-9_]+$/.test(subject) ? classificationLabel(subject) : subject;

/**
 * The register's answers, in the same words the tabs beside it use.
 *
 * The register reads raw enum values from the constants that hold them, which
 * is what makes it a projection rather than a second copy. Rendering those
 * raw would put "COMPANY_WAREHOUSE" here and "Company warehouse" on the
 * matrix tab — one fact, two vocabularies, on one screen. The mapping is the
 * screens' existing label maps, not new wording.
 */
function answerLabel(dimension: string, answer: string): string {
  const words = answer.split(", ").filter((w) => w !== "");
  switch (dimension) {
    case "CUSTODY":
      return words.map((w) => CUSTODY_LABELS[w as PhysicalCustodyType] ?? w).join(", ");
    case "COGS":
      return COGS_LABELS[answer] ?? answer;
    case "CUSTODY_HOLDER":
      return holderLabel(answer);
    case "COST_BEHAVIOR":
      return titleCase(answer);
    default:
      return answer;
  }
}

/** Hundredths of a percent as a percentage, at the scale scores are set. */
const score = (hundredths: number): string => `${(hundredths / 100).toFixed(2)}%`;

export function buildMethodologyData(
  user: DemoUser,
  correlationId: string,
): MethodologyData {
  const ctx = makeContext(user, correlationId);
  const role = roleLabel(user);

  const m = attempt(() => getMethodology(getWorkspace(), ctx));
  if (m === undefined) {
    return {
      restricted: true,
      roleLabel: role,
      headerNote: null,
      policyVersion: "",
      datasetVersion: "",
      runId: "",
      tabs: [],
      readiness: null,
      reconciliation: null,
      matrix: null,
      interpretations: null,
    };
  }


  /* ---------------- Readiness ---------------- */

  const categories: ReadinessCategoryView[] = m.readiness.categories.map((c) => ({
    key: c.key,
    label: c.label,
    weight: `${c.weightPercent}%`,
    score: score(c.scoreHundredths),
    basis: c.basis,
    contribution: units(c.weightedContribution),
    terms: c.terms.map(
      (t): ReadinessTermView => ({
        rule: t.rule,
        observed: t.observed,
        // A term that did not fire says so. An empty cell under a "penalty"
        // heading reads as a penalty of unknown size rather than as none.
        penalty:
          t.penaltyPercent === 0 ? "No deduction" : `−${t.penaltyPercent} points`,
        fired: t.penaltyPercent > 0,
        drivingExceptionIds: t.drivingExceptionIds,
      }),
    ),
  }));

  const weightsSumTo100 = m.readiness.weightPercentTotal === 100;

  const readinessStats: ProcurementStat[] = [
    {
      label: "CLOSE READINESS",
      value: formatBpsExact(m.readiness.totalBasisPoints),
      note: `${m.readiness.totalBasisPoints} basis points, under ${m.readiness.policyVersion}.`,
      ember: false,
    },
    {
      label: "WEIGHTED CATEGORIES",
      value: String(m.readiness.categories.length),
      note: "Each scored from close state, none set by hand.",
      ember: false,
    },
    {
      label: "TERMS THAT FIRED",
      value: String(
        m.readiness.categories.reduce(
          (n, c) => n + c.terms.filter((t) => t.penaltyPercent > 0).length,
          0,
        ),
      ),
      note: "Deductions actually applied at the current position.",
      ember: false,
    },
  ];

  /* ---------------- Reconciliation ---------------- */

  const r = m.reconciliation;
  const reconStats: ProcurementStat[] = [
    {
      label: "SUBLEDGER",
      value: formatCents(r.subledgerCents),
      note: `Summed over ${units(r.subledgerUnits)} units on the year-end listing.`,
      ember: false,
    },
    {
      label: "GROSS GENERAL LEDGER",
      value: formatCents(r.grossGlCents),
      note: `Accounts ${r.grossAccounts.join(", ")}, with ${r.excludedAccount} held out.`,
      ember: false,
    },
    {
      label: "DIFFERENCE",
      value: formatCents(r.differenceCents),
      note: "Ledger less subledger, before any adjustment is applied.",
      ember: r.differenceCents !== 0,
    },
    {
      label: "IDENTIFIED ITEMS",
      value: String(r.items.length),
      note: "Reconciling items the rules derived from GL-side findings.",
      ember: false,
    },
  ];

  /* ---------------- Matrix ---------------- */

  const matrixRows: MatrixRowView[] = m.matrix.rows.map((row) => {
    const custody = (list: readonly PhysicalCustodyType[]) =>
      list.map((t) => CUSTODY_LABELS[t] ?? t).join(", ");
    const differences: string[] = [];
    if (row.unexpectedCustody.length > 0) {
      differences.push(`resolves to ${custody(row.unexpectedCustody)}, which this row does not expect`);
    }
    if (row.unobservedCustody.length > 0) {
      differences.push(`expects ${custody(row.unobservedCustody)}, which no unit reaches`);
    }
    return {
      classification: classificationLabel(row.classification),
      glAccount: `${row.glAccount} · ${row.glAccountDescription}`,
      ownership: row.ownershipAssertion,
      cogs: COGS_LABELS[row.cogsRelief] ?? row.cogsRelief,
      cogsBasis: row.cogsBasis,
      record: row.establishingRecord,
      expectedCustody: custody(row.expectedCustody),
      observedCustody:
        row.observedCustody.length === 0
          ? "No unit of this classification is on the listing"
          : custody(row.observedCustody),
      custodyDifference: differences.length === 0 ? null : differences.join("; "),
      units: units(row.units),
      carrying: formatCents(row.carryingCents),
    };
  });

  /* ---------------- Interpretations ---------------- */

  const interpretationRows: InterpretationRowView[] = m.interpretations.map(
    (i): InterpretationRowView => ({
      id: i.id,
      dimension: DIMENSION_LABELS[i.dimension] ?? i.dimension,
      subject: subjectLabel(i.subject),
      answer: answerLabel(i.dimension, i.answer),
      basis: i.basis,
      heldIn: i.heldIn,
    }),
  );

  return {
    restricted: false,
    roleLabel: role,
    headerNote: null,
    policyVersion: m.policyVersion,
    datasetVersion: m.datasetVersion,
    runId: m.runId,
    tabs: [
      { key: "readiness", label: "Readiness", count: String(categories.length) },
      { key: "bridge", label: "Subledger to GL", count: String(r.items.length) },
      { key: "matrix", label: "Accounting Matrix", count: String(matrixRows.length) },
      {
        key: "interpretations",
        label: "Judgements",
        count: String(interpretationRows.length),
      },
    ],
    readiness: {
      stats: readinessStats,
      categories,
      weightedSum: units(m.readiness.weightedSum),
      roundingRule: m.readiness.roundingRule,
      total: `${formatBpsExact(m.readiness.totalBasisPoints)} · ${m.readiness.totalBasisPoints} bps`,
      // Only stated when it is true. The explanation always describes the live
      // figure, so a reader has to be told when that is no longer the one the
      // rules derived — and a figure that moved means nothing beside no
      // figure at all.
      divergenceNote: m.readinessDiverged
        ? `Someone has recorded a conclusion or submitted a record in this session, so the figure above is the LIVE position. The rules on their own derived ${formatBpsExact(m.baselineReadinessBps)}. Reset Demo restores it.`
        : null,
      weightsSumTo100: {
        holds: weightsSumTo100,
        headline: weightsSumTo100
          ? "The weights total 100, so the weighted sum divides into basis points."
          : "The weights do not total 100, so the total below is not on the basis-point scale it claims.",
        detail: weightsSumTo100
          ? "This is what makes the last step a division rather than a normalisation. It is measured here rather than assumed, because a policy edit that moved one weight would leave every figure looking exactly as plausible as it does now."
          : `The eight weights total ${m.readiness.weightPercentTotal}%. Dividing the weighted sum by 100 no longer yields basis points, and the readiness figure on every other screen is on a scale nobody chose.`,
      },
      note: "Readiness is a management workflow metric, not audit assurance. It measures how much of the close's own work is finished, and it is derived from close state through the tier rules above — resolve an exception and the score moves. It says nothing about whether the balance is fairly stated.",
    },
    reconciliation: {
      stats: reconStats,
      steps: [
        {
          k: "Subledger",
          v: `The unit cost of every unit on the year-end listing, summed. ${units(r.subledgerUnits)} units.`,
        },
        {
          k: "Gross general ledger",
          v: `The recorded balances on ${r.grossAccounts.join(", ")}, summed. ${r.excludedAccount} — ${r.excludedAccountDescription} — is held out of every gross figure in this product, because a reserve netted into gross inventory would understate the population being reconciled.`,
        },
        {
          k: "Difference",
          v: `${formatCents(r.grossGlCents)} less ${formatCents(r.subledgerCents)} = ${formatCents(r.differenceCents)}.`,
        },
        {
          k: "Reconciling items",
          v: "Derived from the GL-side rule findings, never entered. Each carries the direction its correction would apply: reversing an entry is the negative of its signed amount, recording a missing one is the positive.",
        },
        {
          k: "Unexplained",
          v: `${formatCents(r.differenceCents)} plus the ${formatCents(r.explainedCents)} the items explain = ${formatCents(r.unexplainedCents)}.`,
        },
      ],
      items: r.items.map((i) => ({
        id: i.id,
        description: i.description,
        amount: formatCents(i.amountCents),
        exceptionId: i.relatedExceptionId,
      })),
      explained: {
        holds: r.fullyExplained,
        headline: r.fullyExplained
          ? "Every part of the difference has an identified item behind it."
          : "Part of the difference has nothing identified behind it.",
        detail: r.fullyExplained
          ? "Applying all of the identified items would clear the difference exactly, with nothing left over. That is a statement about identification, not about resolution: an item can be identified, and the entry that would correct it still undrafted and unposted."
          : `${formatCents(r.unexplainedCents)} of the difference has no identified reconciling item. Until it does, the bridge names part of the gap and not the whole of it.`,
      },
      signConvention: r.signConvention,
      note: "This is the arithmetic behind the Reconciliation screen, shown as steps so each one can be checked against the figure above it. Nothing here posts, and identified is not drafted: the Adjustments register is where an entry becomes a proposal.",
    },
    matrix: {
      dimensions: m.matrix.dimensions.map((d) => ({
        label: d.label,
        question: d.question,
        provenance: PROVENANCE_LABELS[d.provenance] ?? d.provenance,
        basis: d.basis,
      })),
      rows: matrixRows,
      custodyExpectation: {
        holds: m.matrix.custodyExpectationHolds,
        headline: m.matrix.custodyExpectationHolds
          ? "Every classification's units are held where this table expects them to be."
          : "A classification's units are not held where this table expects them to be.",
        detail: m.matrix.custodyExpectationHolds
          ? "Measured in both directions rather than asserted: no unit resolves to a custody type its row does not name, and no row names a custody type nothing reaches. The first would mean the table is too narrow to describe the population; the second would mean it claims more coverage than it has. Custody itself is derived per unit from location, and this table is never an input to that derivation."
          : [
              m.matrix.rowsWithUnexpectedCustody.length > 0
                ? `${m.matrix.rowsWithUnexpectedCustody.map(classificationLabel).join(", ")} carries units in custody this table does not expect.`
                : null,
              m.matrix.rowsWithUnobservedCustody.length > 0
                ? `${m.matrix.rowsWithUnobservedCustody.map(classificationLabel).join(", ")} expects custody no unit reaches.`
                : null,
            ]
              .filter((s): s is string => s !== null)
              .join(" "),
      },
      note: "One row per accounting classification, answering the five questions a reviewer asks about a unit. The GL account is specified; everything else on the row was decided during the build and travels with its basis, so it can be disagreed with. Custody is the one column checked against the population rather than merely stated.",
    },
    interpretations: {
      rows: interpretationRows,
      policyValues: m.policyValues,
      replayExclusions: [...m.replayExclusions],
      note: "Every judgement this product makes that no source document dictates, read from the constant that holds it. Where a reader disagrees with one, the basis beside it is the thing to disagree with — not the label. This is part of how a figure is arrived at, which is why it sits here rather than on a page of its own: an assumption nobody can find beside the number it moves is one nobody can check.",
    },
  };
}
