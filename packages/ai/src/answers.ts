import { createToolSession, type AiToolContext, type AiToolSession } from "./tools.js";
import {
  ANSWER_ENGINE_VERSION,
  TOOLSET_VERSION,
  type AiCitation,
  type AiFigure,
  type AiInteraction,
  type AiMaterialAnswer,
  type AiMode,
} from "./types.js";

/**
 * The deterministic answer engine (stage 08).
 *
 * "Deterministic Core, Generative Edge" is implemented literally here: every
 * figure, status, conclusion and citation in an answer is READ FROM TOOL
 * RESULTS, and a provider — when one exists at all — may only add prose
 * around them. That is why `docs/09`'s rule that "numeric values in material
 * status answers must match tool results exactly" needs no post-hoc check:
 * there is no path by which a number could come from anywhere else.
 *
 * It also means the acceptance test passes by construction rather than by a
 * parallel fallback implementation that could drift: with the provider
 * disabled, this engine IS the answer, and every golden question still works.
 *
 * Values stay structured (integer cents, basis points, counts). The web layer
 * formats them, so @icg/ai never duplicates apps/web's formatters and the two
 * cannot disagree about what $198,950 looks like.
 */

/** What the caller asks about; resolved from the question and the screen. */
export interface AiQuestionContext {
  /** The object under investigation, when the drawer is opened on one. */
  readonly exceptionId?: string | undefined;
  readonly serial?: string | undefined;
}

interface Intent {
  readonly key: string;
  readonly mode: AiMode;
  /** Matched against the lower-cased question. */
  readonly match: readonly RegExp[];
  readonly answer: (s: AiToolSession, q: AiQuestionContext) => AiMaterialAnswer | undefined;
}

const cite = (
  label: string,
  opts: { evidenceId?: string; href?: string; state?: "PRESENT" | "MISSING" } = {},
): AiCitation => ({
  label,
  ...(opts.evidenceId !== undefined ? { evidenceId: opts.evidenceId } : {}),
  ...(opts.href !== undefined ? { href: opts.href } : {}),
  state: opts.state ?? "PRESENT",
});

/* ------------------------------------------------------------------ */
/* Shapes of the query results the tools return. Declared structurally  */
/* so this module needs no import from @icg/rules.                      */
/* ------------------------------------------------------------------ */

interface ReadinessResult {
  totalBasisPoints: number;
  aggregates: {
    blockerCount: number;
    blockerExposureCents: number;
    grossGlCents: number;
    grossInventoryCents: number;
    grossGlDifferenceCents: number;
    pbcReady: number;
    pbcTotal: number;
    pbcReadinessBps: number;
    closeReadinessBps: number;
  };
}
interface BlockerResult {
  exceptionId: string;
  description: string;
  exposureCents: number;
}
interface ExceptionResult {
  open: boolean;
  exception: {
    id: string;
    status: string;
    finding: {
      title: string;
      whyFlagged: string;
      exposureCents: number;
      assertions: readonly string[];
      subjects: { serials?: readonly string[]; custodian?: string };
      evidenceRequirements: readonly {
        description: string;
        required: boolean;
        satisfied: boolean;
        reference?: string | undefined;
      }[];
    };
  };
  lineageInScope: boolean;
  lineage: { evidence: readonly { item: { id: string; title: string } }[] } | null;
}
interface ReconResult {
  subledgerCents: number;
  grossGlCents: number;
  differenceCents: number;
  potentialAdjustedGlCents: number;
  items: readonly { id: string; description: string; amountCents: number; relatedExceptionId: string }[];
}
interface HoldingResult {
  custodian: string;
  units: number;
  valueCents: number;
  confirmation: string;
  supported: boolean;
  exceptionId?: string | undefined;
}
interface ValuationResult {
  reserve: {
    conclusion: string;
    conclusionNote: string;
    recordedCents: number;
    openReviews: readonly {
      exceptionId: string;
      title: string;
      exposureCents: number;
      status: string;
      skus: readonly string[];
      units: number;
    }[];
  };
}
interface PbcItemResult {
  id: string;
  title: string;
  status: string;
  baselineStatus: string;
  blockedBy: readonly string[];
}
interface LifeResult {
  serial: string;
  unit?: { sku: string; unitCostCents: number; location: string } | undefined;
  missing: readonly string[];
  exceptions: readonly string[];
}
interface TimelineResult {
  events: readonly { label: string; ref?: string | undefined; at?: string | undefined }[];
  missing: readonly string[];
}

/* ------------------------------------------------------------------ */
/* Intents — one per golden question, plus the object-scoped default.    */
/* ------------------------------------------------------------------ */

const INTENTS: readonly Intent[] = [
  {
    key: "blockers",
    mode: "EXPLAIN",
    match: [/prevent.*sign|sign.?off|what.*block|blockers?\b/],
    answer: (s) => {
      const readiness = s.run<ReadinessResult>("get_close_readiness");
      const blockers = s.run<readonly BlockerResult[]>("get_blocking_conditions");
      if (readiness === undefined || blockers === undefined) return undefined;
      const a = readiness.aggregates;
      return {
        status: "Sign-off is blocked",
        knownFacts: [
          { label: "Open blockers", count: a.blockerCount, source: "get_blocking_conditions" },
          { label: "Close readiness", valueBps: a.closeReadinessBps, source: "get_close_readiness" },
          ...blockers.map(
            (b): AiFigure => ({
              label: `${b.exceptionId} — ${b.description}`,
              valueCents: b.exposureCents,
              source: "get_blocking_conditions",
            }),
          ),
        ],
        conflictingEvidence: [],
        missingEvidence: [],
        assertions: [],
        exposure: {
          label: "Blocker exposure",
          valueCents: a.blockerExposureCents,
          source: "get_blocking_conditions",
        },
        managementConclusion:
          "The period cannot be signed off while these items are open. Each carries its own conclusion and owner.",
        nextAction: "Work the blockers in exposure order; each links to its evidence and next action.",
        citations: blockers.map((b) => cite(b.exceptionId, { href: `/exceptions/${b.exceptionId}` })),
      };
    },
  },
  {
    key: "reconciliation",
    mode: "EXPLAIN",
    match: [/inventory tie|does.*tie|reconcil|gl difference|why.*doesn.?t.*tie/],
    answer: (s) => {
      const recon = s.run<ReconResult>("get_reconciliation_status");
      if (recon === undefined) return undefined;
      return {
        status: "No — the subledger and the general ledger do not agree",
        knownFacts: [
          { label: "Gross GL", valueCents: recon.grossGlCents, source: "get_reconciliation_status" },
          { label: "Gross subledger", valueCents: recon.subledgerCents, source: "get_reconciliation_status" },
          { label: "Difference", valueCents: recon.differenceCents, source: "get_reconciliation_status" },
          ...recon.items.map(
            (i): AiFigure => ({
              label: `${i.relatedExceptionId} — ${i.description}`,
              valueCents: i.amountCents,
              source: "get_reconciliation_status",
            }),
          ),
        ],
        conflictingEvidence: [],
        missingEvidence: [],
        assertions: ["EXISTENCE", "COMPLETENESS"],
        exposure: {
          label: "Unreconciled difference",
          valueCents: recon.differenceCents,
          source: "get_reconciliation_status",
        },
        managementConclusion: `Every dollar of the difference is identified and attributed. Applying all ${recon.items.length} would bring the gross GL to the subledger, but none has been posted.`,
        nextAction: "Conclude the open reconciling items, then prepare and approve the entries.",
        citations: recon.items.map((i) =>
          cite(i.relatedExceptionId, { href: `/exceptions/${i.relatedExceptionId}` }),
        ),
      };
    },
  },
  {
    key: "third-party",
    mode: "INVESTIGATE",
    match: [/third.?party|custodian|unsupported.*(inventory|third)|redwood/],
    answer: (s) => {
      const holdings = s.run<readonly HoldingResult[]>("get_third_party_holdings");
      if (holdings === undefined) return undefined;
      const unsupported = holdings.filter((h) => !h.supported);
      if (unsupported.length === 0) return undefined;
      return {
        status: `${unsupported.length} custodian holding${unsupported.length === 1 ? "" : "s"} unsupported`,
        knownFacts: [
          ...unsupported.flatMap((h): AiFigure[] => [
            { label: `${h.custodian} — units held`, count: h.units, source: "get_third_party_holdings" },
            { label: `${h.custodian} — carrying value`, valueCents: h.valueCents, source: "get_third_party_holdings" },
            { label: `${h.custodian} — confirmation`, text: h.confirmation, source: "get_third_party_holdings" },
          ]),
          // The supported holdings are stated too: an answer that implied
          // ALL third-party stock is unsupported would contradict close state.
          ...holdings
            .filter((h) => h.supported)
            .map(
              (h): AiFigure => ({
                label: `${h.custodian} — confirmed, ${h.units} units`,
                valueCents: h.valueCents,
                source: "get_third_party_holdings",
              }),
            ),
        ],
        conflictingEvidence: [],
        missingEvidence: unsupported.map(
          (h) =>
            `Year-end confirmation from ${h.custodian} (${h.confirmation === "NOT_REQUESTED" ? "never requested" : "requested, not returned"}) — existence and rights at the custodian are unevidenced.`,
        ),
        assertions: ["EXISTENCE", "RIGHTS_AND_OBLIGATIONS"],
        exposure: {
          label: "Unsupported third-party value",
          valueCents: unsupported.reduce((sum, h) => sum + h.valueCents, 0),
          source: "get_third_party_holdings",
        },
        managementConclusion:
          "The units are on the book at full value with no independent confirmation of existence or rights at the custodian.",
        nextAction: "Obtain the outstanding custodian confirmation.",
        citations: unsupported.map((h) =>
          h.exceptionId !== undefined
            ? cite(h.exceptionId, { href: `/exceptions/${h.exceptionId}` })
            : cite(h.custodian, { state: "MISSING" }),
        ),
      };
    },
  },
  {
    key: "valuation",
    mode: "EXPLAIN",
    match: [/e&o|e and o|excess|obsolet|slow.?moving|reserve|valuation/],
    answer: (s) => {
      const valuation = s.run<ValuationResult>("get_valuation_status");
      if (valuation === undefined) return undefined;
      const reviews = valuation.reserve.openReviews;
      if (reviews.length === 0) return undefined;
      return {
        status: `Valuation review open — reserve ${valuation.reserve.conclusion}`,
        knownFacts: reviews.flatMap((r): AiFigure[] => [
          {
            label: `${r.exceptionId} — units under review${r.skus.length > 0 ? ` (${r.skus.join(", ")})` : ""}`,
            count: r.units,
            source: "get_valuation_status",
          },
          { label: `${r.exceptionId} — carrying value`, valueCents: r.exposureCents, source: "get_valuation_status" },
          { label: `${r.exceptionId} — status`, text: r.status, source: "get_valuation_status" },
        ]),
        conflictingEvidence: [],
        // The refusal that matters most on this screen: no amount exists.
        missingEvidence: [
          "Management's E&O analysis and reserve conclusion. No reserve amount is proposed by any rule, model, or assistant.",
        ],
        assertions: ["VALUATION"],
        exposure: {
          label: "Carrying value under review",
          valueCents: reviews.reduce((sum, r) => sum + r.exposureCents, 0),
          source: "get_valuation_status",
        },
        managementConclusion: valuation.reserve.conclusionNote,
        nextAction: "Management to complete the E&O analysis and record a reserve conclusion.",
        citations: reviews.map((r) => cite(r.exceptionId, { href: `/exceptions/${r.exceptionId}` })),
      };
    },
  },
  {
    key: "pbc",
    mode: "SUMMARIZE",
    match: [/pbc|audit package|prepared by client|how ready/],
    answer: (s) => {
      const readiness = s.run<ReadinessResult>("get_close_readiness");
      const items = s.run<readonly PbcItemResult[]>("get_pbc_status");
      if (readiness === undefined || items === undefined) return undefined;
      const a = readiness.aggregates;
      const attention = items.filter(
        (i) => i.baselineStatus !== "READY" && i.baselineStatus !== "PROVIDED",
      );
      return {
        status: `PBC package ${a.pbcReady} of ${a.pbcTotal} ready or provided`,
        knownFacts: [
          { label: "Ready or provided", count: a.pbcReady, source: "get_pbc_status" },
          { label: "Total requests", count: a.pbcTotal, source: "get_pbc_status" },
          { label: "PBC readiness", valueBps: a.pbcReadinessBps, source: "get_close_readiness" },
          ...attention.map(
            (i): AiFigure => ({
              label: `${i.id} — ${i.title}`,
              text: i.baselineStatus,
              source: "get_pbc_status",
            }),
          ),
        ],
        conflictingEvidence: [],
        missingEvidence: attention
          .filter((i) => i.blockedBy.length > 0)
          .map((i) => `${i.id} is waiting on ${i.blockedBy.join(", ")} — a close conclusion, not preparation effort.`),
        assertions: [],
        managementConclusion:
          "Readiness is a management preparation measure. No state in this system records whether the auditor accepted anything.",
        nextAction: "Conclude the close items the remaining workpapers depend on.",
        citations: attention.map((i) => cite(i.id, { href: `/audit-package?pbc=${i.id}` })),
      };
    },
  },
  {
    key: "financial-life",
    mode: "NAVIGATE",
    match: [/walk me through|financial life|life of|history of/],
    answer: (s, q) => {
      const serial = q.serial;
      if (serial === undefined) return undefined;
      const life = s.run<LifeResult>("get_financial_lifecycle", { serial });
      const timeline = s.run<TimelineResult>("get_evidence_timeline", { serial });
      if (life === undefined || timeline === undefined) return undefined;
      return {
        status: `Financial life of ${serial}`,
        knownFacts: [
          ...(life.unit !== undefined
            ? [
                { label: "SKU", text: life.unit.sku, source: "get_financial_lifecycle" as const },
                { label: "Carrying value", valueCents: life.unit.unitCostCents, source: "get_financial_lifecycle" as const },
                { label: "NetSuite location", text: life.unit.location, source: "get_financial_lifecycle" as const },
              ]
            : []),
          ...timeline.events.map(
            (e): AiFigure => ({
              label: e.label,
              text: `${e.ref ?? ""}${e.at !== undefined ? ` · ${e.at}` : " · undated"}`,
              source: "get_evidence_timeline",
            }),
          ),
        ],
        conflictingEvidence: [],
        // Only structured existing events — absences stay absent.
        missingEvidence: life.missing.map((m) => `${m} — no record exists.`),
        assertions: [],
        managementConclusion:
          life.exceptions.length > 0
            ? `This unit carries ${life.exceptions.join(", ")}.`
            : "No close exception references this unit.",
        nextAction: "Open the Financial Life view for the full four-phase chain of custody.",
        citations: [
          cite(serial, { href: `/inventory/${serial}` }),
          ...life.exceptions.map((id) => cite(id, { href: `/exceptions/${id}` })),
          ...life.missing.map((m) => cite(m, { state: "MISSING" })),
        ],
      };
    },
  },
];

/**
 * The object-scoped answer: "why is this still open?" It is the demo's trust
 * moment, so it is built from the exception's OWN unmet evidence
 * requirements — the refusal to name the missing contract term is the data
 * saying so, not a hard-coded sentence.
 */
function answerException(s: AiToolSession, exceptionId: string): AiMaterialAnswer | undefined {
  const view = s.run<ExceptionResult>("get_exception", { exceptionId });
  if (view === undefined) return undefined;
  const f = view.exception.finding;
  const unmet = f.evidenceRequirements.filter((r) => r.required && !r.satisfied);
  const met = f.evidenceRequirements.filter((r) => r.satisfied);
  const serial = f.subjects.serials?.[0];

  return {
    status: view.exception.status,
    knownFacts: [
      { label: "Exception", text: `${view.exception.id} — ${f.title}`, source: "get_exception" },
      { label: "Exposure", valueCents: f.exposureCents, source: "get_exception" },
      ...met.map(
        (r): AiFigure => ({
          label: r.description,
          text: r.reference ?? "on file",
          source: "get_exception",
        }),
      ),
    ],
    conflictingEvidence: view.open ? [f.whyFlagged] : [],
    // Stated as missing, never inferred. This is the refusal.
    missingEvidence: unmet.map(
      (r) => `${r.description} — not in evidence. The term cannot be inferred; it must be obtained.`,
    ),
    assertions: [...f.assertions],
    exposure: { label: "Exposure", valueCents: f.exposureCents, source: "get_exception" },
    managementConclusion: view.open
      ? "Open. No conclusion has been recorded, and none can be reached on the evidence held."
      : `Resolved — ${view.exception.status}.`,
    nextAction:
      unmet.length > 0
        ? `Obtain: ${unmet.map((r) => r.description).join("; ")}`
        : "Record a management conclusion.",
    citations: [
      cite(view.exception.id, { href: `/exceptions/${view.exception.id}` }),
      ...(serial !== undefined ? [cite(serial, { href: `/inventory/${serial}` })] : []),
      // Only ids the tools actually returned may be cited.
      ...(view.lineage?.evidence ?? []).map((e) =>
        cite(e.item.title, { evidenceId: e.item.id }),
      ),
      ...unmet.map((r) => cite(r.description, { state: "MISSING" })),
    ],
  };
}

/**
 * Answer a question deterministically. `provider` is never consulted here —
 * a caller that has one adds narration afterwards, and its absence changes
 * nothing about the answer.
 */
export function answerQuestion(
  t: AiToolContext,
  question: string,
  context: AiQuestionContext = {},
): AiInteraction {
  const session = createToolSession(t);
  const q = question.toLowerCase();

  // An object-scoped "why is this open" outranks the general intents.
  const asksWhyOpen = /why.*(open|still|flagged)|what.*wrong|explain this/.test(q);
  const intent = INTENTS.find((i) => i.match.some((re) => re.test(q)));

  let answer: AiMaterialAnswer | undefined;
  let mode: AiMode = "EXPLAIN";

  if (asksWhyOpen && context.exceptionId !== undefined) {
    answer = answerException(session, context.exceptionId);
    mode = "INVESTIGATE";
  } else if (intent !== undefined) {
    answer = intent.answer(session, context);
    mode = intent.mode;
  } else if (context.exceptionId !== undefined) {
    answer = answerException(session, context.exceptionId);
    mode = "INVESTIGATE";
  }

  const base = {
    question,
    mode,
    toolCalls: session.calls,
    narrationAvailable: false,
    versions: {
      toolsetVersion: TOOLSET_VERSION,
      answerEngineVersion: ANSWER_ENGINE_VERSION,
    },
  };

  if (answer !== undefined) return { ...base, answer };

  // No answer. Say WHICH kind of nothing this is — a denial, an unknown
  // object, and an out-of-scope question are three different states and an
  // empty answer must never stand for any of them.
  if (session.anyDenied) {
    return {
      ...base,
      refusal: {
        reason: "NOT_AUTHORIZED",
        message:
          "Your role cannot read the data this question needs. No figure is shown — this is a restriction, not a zero.",
        stillVisible: ["The close status of the item remains visible to everyone who works it."],
      },
    };
  }
  if (context.exceptionId !== undefined || context.serial !== undefined) {
    return {
      ...base,
      refusal: {
        reason: "NO_SUCH_OBJECT",
        message: "No object in the FY2026 close population matches that reference.",
        stillVisible: [],
      },
    };
  }
  return {
    ...base,
    refusal: {
      reason: "OUT_OF_SCOPE",
      message:
        "Ask Gaurd answers from the close's own structured data. It cannot answer this from what the tools return, and it will not guess.",
      stillVisible: [
        "Try: what prevents sign-off, why an exception is open, whether inventory ties, or how ready the PBC package is.",
      ],
    },
  };
}
