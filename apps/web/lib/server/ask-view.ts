import type { DemoUser } from "@icg/data";
import type { ExceptionStatus } from "@icg/domain";
import { answerQuestion, type AiCitation, type AiFigure } from "@icg/ai";
import { formatBpsExact, formatCents } from "../format";
import { statusView } from "../workflow-view";
import type { AskAnswerView, AskCitation, AskFigure, AskResult } from "../view-model";
import { getQueries, makeContext } from "./workspace";

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

function renderFigure(f: AiFigure): AskFigure {
  if (f.valueCents !== undefined) return { label: f.label, value: formatCents(f.valueCents) };
  if (f.valueBps !== undefined) return { label: f.label, value: formatBpsExact(f.valueBps) };
  if (f.count !== undefined) return { label: f.label, value: String(f.count) };
  return { label: f.label, value: f.text ?? "—" };
}

/**
 * A citation is a link or an honest absence — never a control that does
 * nothing. An evidence-id citation with no href routes to the object whose
 * detail screen owns that record's drawer.
 */
function renderCitation(c: AiCitation, scope: AskScope): AskCitation {
  if (c.state === "MISSING") return { label: c.label, href: null, missing: true };
  if (c.href !== undefined) return { label: c.label, href: c.href, missing: false };
  if (c.evidenceId !== undefined && scope.exceptionId !== undefined) {
    return { label: c.label, href: `/exceptions/${scope.exceptionId}`, missing: false };
  }
  return { label: c.label, href: null, missing: false };
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
  const ctx = makeContext(user, correlationId);
  const interaction = answerQuestion({ queries, ctx }, question, scope);

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

  if (interaction.answer !== undefined) {
    const a = interaction.answer;
    const answer: AskAnswerView = {
      question: interaction.question,
      mode: interaction.mode,
      status: statusLabel(a.status),
      knownFacts: a.knownFacts.map(renderFigure),
      conflictingEvidence: [...a.conflictingEvidence],
      missingEvidence: [...a.missingEvidence],
      assertions: [...a.assertions],
      exposure: a.exposure !== undefined ? renderFigure(a.exposure) : null,
      managementConclusion: a.managementConclusion,
      nextAction: a.nextAction,
      citations: a.citations.map((c) => renderCitation(c, scope)),
      // Absent unless a provider ran and its prose passed the guardrails.
      narration: interaction.narrationAvailable ? (interaction.narration ?? null) : null,
    };
    return { answer, refusal: null, toolsUsed, versions };
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
  };
}
