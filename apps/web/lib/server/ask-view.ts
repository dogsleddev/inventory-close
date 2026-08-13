import type { DemoUser } from "@icg/data";
import {
  ACCOUNTING_CLASSIFICATIONS,
  ASSERTIONS,
  SOURCE_SYSTEM_IDS,
  type ExceptionStatus,
} from "@icg/domain";
import { INTERPRETATION_CONSTANT_NAMES } from "@icg/services";
import {
  answerQuestion,
  describeAvailability,
  type AiCitation,
  type AiFigure,
} from "@icg/ai";
import { formatBpsExact, formatCents, formatCount, formatInstant } from "../format";
import {
  AGING_BASIS_LABELS,
  RULE_RESULT_LABELS,
  pbcStatusView,
  statusView,
} from "../workflow-view";
import type { AskAnswerView, AskCitation, AskFigure, AskResult } from "../view-model";
import {
  assertionLabel,
  classificationLabel,
  holderLabel,
  knownLocationName,
  sourceName,
} from "./humanize";
import { CONCLUSION_LABELS } from "./data";
import { CUSTODY_LABELS } from "./inventory-list-view";
import { COGS_LABELS, DIMENSION_LABELS } from "./methodology-view";
import { METHOD_LABELS } from "./custody-view";
import { BEHAVIOR_LABELS, COGS_PRESENTATION, COMPONENT_LABELS, TREATMENT_LABELS } from "./costing-view";
import { getProjections, getQueries, makeContext } from "./workspace";

/**
 * Ask Gaurd's server surface (stage 08).
 *
 * @icg/ai returns integer cents and basis points; formatting happens here so
 * a figure in an answer is produced by the same formatter the screens use and
 * the two can never disagree. The engine is called with the CALLER's context, so every
 * permission and scope decision is made inside @icg/services exactly as it
 * is for the screens.
 */

/** Where the question was asked from — what "this" refers to. */
export interface AskScope {
  readonly exceptionId?: string | undefined;
  readonly serial?: string | undefined;
}

/**
 * The engine emits the canonical status enum, because that is the structured
 * value. The human label belongs to the presentation vocabulary the screens
 * already use, so the assistant and the capsules cannot drift apart.
 */
const EXCEPTION_STATUSES = new Set<string>([
  "WAITING_ON_CONTRACT",
  "WAITING_ON_THIRD_PARTY",
  "ACCOUNTING_REVIEW",
  "RECOUNT_REQUIRED",
  "CONTROLLER_REVIEW",
  "RESOLVED_NO_ADJUSTMENT",
  "RESOLVED_ADJUSTMENT_PROPOSED",
]);
const statusLabel = (status: string): string =>
  EXCEPTION_STATUSES.has(status) ? statusView(status as ExceptionStatus).label : status;

/**
 * Canonical value → the words the SCREENS already use for it (Stage G).
 *
 * @icg/ai emits canonical tokens because that is the structured value, the
 * same way it emits integer cents rather than a formatted amount. Display wording
 * belongs to apps/web — so this is assembled from the modules that already
 * own each vocabulary rather than restated here. A second spelling of
 * "Company warehouse" living in the assistant is exactly how one screen came
 * to say "Direct labour" while another said "Direct Labor".
 *
 * The Stage F browser pass caught a register showing `COMPANY_WAREHOUSE`
 * beside a tab showing "Company warehouse". Stage G added ten tools whose
 * results carry custody types, disposition methods, cost behaviours, COGS
 * states, match results and aging bases; without this every one of them
 * would have reached the drawer as a token.
 */
const CANONICAL_LABELS: ReadonlyMap<string, string> = new Map<string, string>([
  ...Object.entries(CUSTODY_LABELS),
  ...Object.entries(METHOD_LABELS),
  ...Object.entries(COMPONENT_LABELS),
  ...Object.entries(BEHAVIOR_LABELS),
  ...Object.entries(TREATMENT_LABELS),
  ...Object.entries(COGS_PRESENTATION).map(
    ([key, presentation]): [string, string] => [key, presentation.label],
  ),
  ...Object.entries(RULE_RESULT_LABELS),
  /**
   * CONCLUSION_LABELS is deliberately NOT here.
   *
   * Two of its three keys — RESOLVED_NO_ADJUSTMENT and
   * RESOLVED_ADJUSTMENT_PROPOSED — are also exception statuses, spread below,
   * and a Map constructor lets the later entry win. So the export that exists
   * to stop the drawer restating the vocabulary was inert for exactly the two
   * tokens that have two spellings ("Resolved — No Adjustment" as a status,
   * "Resolved — no adjustment required" as a conclusion), and only
   * REMAINS_OPEN ever came through it. Reordering would have swapped which
   * surface is wrong. A token that means two things in two contexts cannot be
   * worded by a context-free map, so a conclusion travels as
   * `AiFigure.valueConclusion` and `renderFigure` words it from the map that
   * owns it.
   */
  ...Object.entries(AGING_BASIS_LABELS),
  ...Object.entries(DIMENSION_LABELS),
  ...Object.entries(COGS_LABELS),
  ...["COMPANY", "OTHER_PARTY", "NOT_ESTABLISHED"].map(
    (holder): [string, string] => [holder, holderLabel(holder)],
  ),
  ...ACCOUNTING_CLASSIFICATIONS.map(
    (classification): [string, string] => [classification, classificationLabel(classification)],
  ),
  ...SOURCE_SYSTEM_IDS.map((source): [string, string] => [source, sourceName(source)]),
  ...ASSERTIONS.map((assertion): [string, string] => [assertion, assertionLabel(assertion)]),
  ...[...EXCEPTION_STATUSES].map(
    (status): [string, string] => [status, statusView(status as ExceptionStatus).label],
  ),
  ...[
    "PROVIDED",
    "READY",
    "PREPARING",
    "FOLLOW_UP_REQUESTED",
    "REFRESH_REQUIRED",
    "NOT_STARTED",
  ].map((status): [string, string] => [status, pbcStatusView(status).label]),
]);

/**
 * Replace canonical tokens wherever they appear in a rendered string.
 *
 * Whole-token, bounded — an `EXC-001` or a `KE-E2-1048` is an identifier the
 * reader wants to see verbatim and carries no underscore, so it cannot be
 * caught by this. `ask-chips.test.ts` asserts no rendered answer field still
 * carries a screaming-snake token, which is what keeps this map complete
 * rather than merely current.
 */
function humanizeCanonical(value: string): string {
  return value.replace(
    // Any screaming token, replaced ONLY on a hit. Single-word vocabularies
    // (`CUSTODY`, `PASS`, `READY`) need wording too, and matching them is
    // only safe because an unrecognised token is returned untouched: the
    // acronyms a reader wants verbatim — GL, PBC, GIT, RMA, NRV — are not in
    // the map, or map to themselves.
    //
    // A hyphen is a word boundary, so `\b` let this reach INSIDE a hyphenated
    // identifier: `FY2026-DEMO-v1.2.0` matched on `DEMO`, which the map words
    // as "Demo" (it is an accounting classification), and the provenance answer
    // printed the dataset version as `FY2026-Demo-v1.2.0` — a corrupted
    // identifier, in the one answer whose whole subject is that every figure is
    // reproducible from a named dataset. Excluding hyphen adjacency on both
    // sides keeps every standalone token in scope, including one followed by
    // punctuation ("AccordVault is STALE — …"), while leaving `EXC-002`,
    // `KE-X1-9025`, `PO-26-1201` and the dataset version alone.
    /(?<![\w-])[A-Z][A-Z0-9_]+(?![\w-])/g,
    // Location ids are dataset-owned rather than an enum, so they are looked
    // up rather than listed — and looked up in a way that returns nothing for
    // a token that is not a location, so an unrecognised value stays
    // canonical instead of being invented into a label.
    (token) =>
      // A code constant is not a label. `heldIn` names the module that holds
      // a judgement so a reader can go and find it, and the Methodology
      // screen prints it verbatim for the same reason.
      INTERPRETATION_CONSTANT_NAMES.includes(token)
        ? token
        : (CANONICAL_LABELS.get(token) ?? knownLocationName(token) ?? token),
  );
}

function renderFigure(f: AiFigure): AskFigure {
  const label = humanizeCanonical(f.label);
  if (f.valueCents !== undefined) return { label, value: formatCents(f.valueCents) };
  if (f.valueBps !== undefined) return { label, value: formatBpsExact(f.valueBps) };
  if (f.count !== undefined) return { label, value: formatCount(f.count) };
  // Same formatter the exception screen uses, so the drawer and the panel it
  // opens over cannot spell one recorded instant two ways.
  if (f.valueInstant !== undefined) return { label, value: formatInstant(f.valueInstant) };
  // Worded from the CONCLUSION vocabulary, which the flat token map cannot
  // reach: two of its three keys are also exception statuses.
  if (f.valueConclusion !== undefined) {
    return {
      label,
      value: CONCLUSION_LABELS[f.valueConclusion] ?? humanizeCanonical(f.valueConclusion),
    };
  }
  return { label, value: humanizeCanonical(f.text ?? "—") };
}

/**
 * A citation is a link or an honest absence — never a control that does
 * nothing. An evidence-id citation with no href routes to the object whose
 * detail screen owns that record's drawer.
 */
function renderCitation(c: AiCitation, scope: AskScope): AskCitation {
  const label = humanizeCanonical(c.label);
  if (c.state === "MISSING") return { label, href: null, missing: true };
  if (c.href !== undefined) return { label, href: c.href, missing: false };
  if (c.evidenceId !== undefined && scope.exceptionId !== undefined) {
    return { label, href: `/exceptions/${scope.exceptionId}`, missing: false };
  }
  return { label, href: null, missing: false };
}

const REFUSAL_TITLES: Readonly<Record<string, string>> = {
  NOT_AUTHORIZED: "Access restricted",
  NO_SUCH_OBJECT: "No such object",
  OUT_OF_SCOPE: "Outside what Gaurd can answer",
  REQUIRES_HUMAN_JUDGMENT: "This is a management judgment",
};

export function askGaurdData(
  user: DemoUser,
  question: string,
  scope: AskScope,
  correlationId: string,
): AskResult {
  const queries = getQueries();
  const projections = getProjections();
  const ctx = makeContext(user, correlationId);
  const interaction = answerQuestion({ queries, projections, ctx }, question, scope);

  const versions = [
    { k: "Toolset", v: interaction.versions.toolsetVersion },
    { k: "Answer engine", v: interaction.versions.answerEngineVersion },
    // Named so the reader can see there was no model, rather than assuming one.
    {
      k: "Provider",
      v: interaction.versions.providerName ?? "None — deterministic answer",
    },
  ];
  const toolsUsed = [
    ...new Set(interaction.toolCalls.filter((c) => c.outcome === "OK").map((c) => c.tool)),
  ].sort();
  // The AI-off state is reported, not left to be inferred from a missing
  // paragraph: docs/12 requires the primary demo to work without live AI,
  // and a reader cannot tell a deterministic answer from a narrated one by
  // looking at it.
  const availability = describeAvailability(interaction);
  const aiStatus = {
    providerBound: availability.providerBound,
    narrationAvailable: availability.narrationAvailable,
    note: availability.note,
  };

  if (interaction.answer !== undefined) {
    const a = interaction.answer;
    const answer: AskAnswerView = {
      question: interaction.question,
      mode: interaction.mode,
      status: humanizeCanonical(statusLabel(a.status)),
      knownFacts: a.knownFacts.map(renderFigure),
      // The engine's own sentences quote canonical values too — a chain state
      // inside a rule's verbatim note, a match result inside a scope
      // explanation. Every string a reader sees goes through the same map.
      conflictingEvidence: a.conflictingEvidence.map(humanizeCanonical),
      missingEvidence: a.missingEvidence.map(humanizeCanonical),
      scopeNotes: (a.scopeNotes ?? []).map(humanizeCanonical),
      // Worded with the same helper the exception screens use. Until Stage G
      // the drawer rendered these raw, so one screen said "Rights &
      // Obligations" and the assistant beside it said
      // "RIGHTS_AND_OBLIGATIONS" about the same assertion.
      assertions: a.assertions.map(assertionLabel),
      exposure: a.exposure !== undefined ? renderFigure(a.exposure) : null,
      managementConclusion: humanizeCanonical(a.managementConclusion),
      nextAction: humanizeCanonical(a.nextAction),
      citations: a.citations.map((c) => renderCitation(c, scope)),
      // Passed through unformatted: there is nothing to format. Draft prose
      // carries no figure, which is the whole reason it is safe to show.
      draft: (a.draft ?? []).map((d) => ({ heading: d.heading, body: d.body })),
      // Absent unless a provider ran and its prose passed the guardrails.
      narration: interaction.narrationAvailable ? (interaction.narration ?? null) : null,
    };
    return { answer, refusal: null, toolsUsed, versions, aiStatus };
  }

  const r = interaction.refusal;
  return {
    answer: null,
    refusal: {
      question: interaction.question,
      reason: r?.reason ?? "OUT_OF_SCOPE",
      title: REFUSAL_TITLES[r?.reason ?? "OUT_OF_SCOPE"] ?? "Unavailable",
      message: r?.message ?? "",
      stillVisible: r?.stillVisible ?? [],
    },
    toolsUsed,
    versions,
    aiStatus,
  };
}
