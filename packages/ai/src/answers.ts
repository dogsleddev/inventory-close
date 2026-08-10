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
  events: readonly {
    label: string;
    ref: string;
    at?: string | undefined;
    state: "DATED" | "UNDATED" | "WITHHELD";
  }[];
  withheldCount: number;
  scopeReduced: boolean;
  missing: readonly string[];
}

/* ------------------------------------------------------------------ */
/* Intents — one per golden question, plus the object-scoped default.    */
/* ------------------------------------------------------------------ */

/**
 * Intent order is significant — the FIRST match wins — so the more specific
 * patterns come first and each is anchored on a word the other topics do not
 * use. The suggestion chips the screens ship are listed against the intent
 * they must reach, and a test asserts every shipped chip produces an answer:
 * the two lists were previously authored independently and 18 of 32 chips
 * fell through to a refusal.
 */
const INTENTS: readonly Intent[] = [
  {
    key: "missing-evidence",
    mode: "INVESTIGATE",
    match: [/evidence.*(missing|still needed|outstanding)|missing evidence|what.*evidence.*need/],
    answer: (s) => {
      const exceptions = s.run<readonly ExceptionResult[]>("list_open_exceptions");
      if (exceptions === undefined) return undefined;
      const gaps = exceptions.flatMap((e) =>
        e.exception.finding.evidenceRequirements
          .filter((r) => r.required && !r.satisfied)
          .map((r) => ({ id: e.exception.id, description: r.description })),
      );
      if (gaps.length === 0) return undefined;
      return {
        status: `${gaps.length} required item${gaps.length === 1 ? "" : "s"} of evidence outstanding`,
        knownFacts: gaps.map((g) => ({
          label: `${g.id} — ${g.description}`,
          text: "Not in evidence",
          source: "list_open_exceptions" as const,
        })),
        conflictingEvidence: [],
        missingEvidence: gaps.map((g) => `${g.id}: ${g.description} — not in evidence.`),
        assertions: [],
        managementConclusion:
          "Each open item is waiting on a specific record. None of them can be concluded on what is held today.",
        nextAction: "Obtain the outstanding records; each exception names its own.",
        citations: [...new Set(gaps.map((g) => g.id))].map((id) =>
          cite(id, { href: `/exceptions/${id}` }),
        ),
      };
    },
  },
  {
    key: "largest-exposures",
    mode: "SUMMARIZE",
    match: [/largest|biggest|top .*(exposure|risk|item)|unresolved exposure|by exposure/],
    answer: (s) => {
      const exceptions = s.run<readonly ExceptionResult[]>("list_open_exceptions");
      if (exceptions === undefined || exceptions.length === 0) return undefined;
      const ranked = [...exceptions].sort(
        (a, b) => b.exception.finding.exposureCents - a.exception.finding.exposureCents,
      );
      return {
        status: `${ranked.length} unresolved item${ranked.length === 1 ? "" : "s"}, largest first`,
        knownFacts: ranked.map((e) => ({
          label: `${e.exception.id} — ${e.exception.finding.title}`,
          valueCents: e.exception.finding.exposureCents,
          source: "list_open_exceptions" as const,
        })),
        conflictingEvidence: [],
        missingEvidence: [],
        assertions: [],
        exposure: {
          label: "Total unresolved exposure",
          valueCents: ranked.reduce((sum, e) => sum + e.exception.finding.exposureCents, 0),
          source: "list_open_exceptions",
        },
        managementConclusion:
          "Exposure is the carrying value the question touches, not a loss estimate.",
        nextAction: "Work them in exposure order; each carries its own conclusion and owner.",
        citations: ranked.map((e) => cite(e.exception.id, { href: `/exceptions/${e.exception.id}` })),
      };
    },
  },
  {
    key: "counts",
    mode: "EXPLAIN",
    match: [/count|counted|variance|recount|stocktake|physical inventory/],
    answer: (s) => {
      const detail = s.run<{
        summary: {
          populationUnits: number;
          firstPassMatchedUnits: number;
          varianceRows: number;
          movements: number;
          managementTests: number;
          auditorTests: number;
        };
        managementLensInScope: boolean;
      }>("get_cycle_count_history");
      if (detail === undefined) return undefined;
      const c = detail.summary;
      return {
        status: `${c.firstPassMatchedUnits} of ${c.populationUnits} units matched on the first pass`,
        knownFacts: [
          { label: "Counted population", count: c.populationUnits, source: "get_cycle_count_history" },
          { label: "Matched first pass", count: c.firstPassMatchedUnits, source: "get_cycle_count_history" },
          { label: "Variance rows", count: c.varianceRows, source: "get_cycle_count_history" },
          { label: "Movements during the count", count: c.movements, source: "get_cycle_count_history" },
          { label: "Management test counts", count: c.managementTests, source: "get_cycle_count_history" },
          { label: "Auditor test counts", count: c.auditorTests, source: "get_cycle_count_history" },
        ],
        conflictingEvidence: [],
        missingEvidence: [],
        assertions: ["EXISTENCE", "COMPLETENESS"],
        managementConclusion:
          "Cycle-count history is a management risk lens. It is not auditor sampling and carries no reliance.",
        nextAction: "Resolve the open count variances; each is an exception of its own.",
        citations: [cite("Physical Count", { href: "/physical-count" })],
      };
    },
  },
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
    key: "adjustments",
    mode: "EXPLAIN",
    match: [/adjustment|journal entry|\bje\b|proposed entr|posted/],
    answer: (s) => {
      const reg = s.run<{
        entries: readonly {
          exceptionId: string;
          description: string;
          amountCents: number;
          exceptionOpen: boolean;
          proposal?: { id: string } | undefined;
          undraftedReason?: string | undefined;
        }[];
        identifiedCount: number;
        draftedCount: number;
        postedCount: number;
      }>("get_proposed_adjustments");
      if (reg === undefined) return undefined;
      return {
        status: `${reg.draftedCount} of ${reg.identifiedCount} identified items carry a prepared entry; ${reg.postedCount} are posted`,
        knownFacts: reg.entries.map((e) => ({
          label: `${e.exceptionId} — ${e.proposal?.id ?? "no entry drafted"}`,
          valueCents: e.amountCents,
          source: "get_proposed_adjustments" as const,
        })),
        conflictingEvidence: [],
        missingEvidence: reg.entries
          .filter((e) => e.proposal === undefined)
          .map((e) => e.undraftedReason ?? `No entry drafted for ${e.exceptionId}.`),
        assertions: [],
        managementConclusion:
          "Nothing here has been posted. Approval is a human act recorded outside this product, and posting happens in NetSuite.",
        nextAction: "Conclude the open items, then prepare and approve the remaining entries.",
        citations: reg.entries.map((e) => cite(e.exceptionId, { href: `/exceptions/${e.exceptionId}` })),
      };
    },
  },
  {
    key: "source-health",
    mode: "SUMMARIZE",
    match: [/source health|data health|feed|stale|which systems|integration/],
    answer: (s) => {
      const health = s.run<{
        sources: readonly { sourceSystem: string; status: string; note?: string | undefined }[];
        aggregateBasisPoints: number;
      }>("get_source_health");
      if (health === undefined) return undefined;
      const degraded = health.sources.filter((x) => x.status !== "HEALTHY");
      return {
        status: `Source health ${degraded.length === 0 ? "fully healthy" : `${degraded.length} feed${degraded.length === 1 ? "" : "s"} degraded`}`,
        knownFacts: [
          { label: "Aggregate source health", valueBps: health.aggregateBasisPoints, source: "get_source_health" },
          ...health.sources.map((x) => ({
            label: x.sourceSystem,
            text: x.status,
            source: "get_source_health" as const,
          })),
        ],
        conflictingEvidence: [],
        missingEvidence: degraded.map(
          (x) => `${x.sourceSystem} is ${x.status}${x.note !== undefined ? ` — ${x.note}` : ""}.`,
        ),
        assertions: [],
        managementConclusion:
          "A degraded feed never changes a control result. It sits beside the result so the evidence behind it can be weighed.",
        nextAction: "Restore the degraded feeds; the affected controls name them.",
        citations: [cite("Evidence", { href: "/evidence" })],
      };
    },
  },
  {
    key: "procurement-chain",
    mode: "INVESTIGATE",
    match: [
      /procurement|three.?way|3wm|purchase order match|commercial chain|transaction chain/,
      // The Reconciliation screen's own chips ask it these ways.
      /native match|native netsuite|chains?\b|missing required component/,
    ],
    answer: (s) => {
      const matches = s.run<readonly { purchaseOrderNumber: string; nativeNetsuiteMatchStatus: string; closeMatchStatus: string }[]>(
        "get_procurement_match",
      );
      const chains = s.run<readonly { subjectRef: string; presentCount: number; totalCount: number; requiredMissingCount: number }[]>(
        "get_commercial_chain",
      );
      if (matches === undefined || chains === undefined) return undefined;
      const closeOpen = matches.filter((m) => m.closeMatchStatus !== "PASS");
      const incompleteChains = chains.filter((c) => c.requiredMissingCount > 0);
      return {
        status: `${closeOpen.length} procurement match${closeOpen.length === 1 ? "" : "es"} and ${incompleteChains.length} commercial chain${incompleteChains.length === 1 ? "" : "s"} carry an open close question`,
        knownFacts: [
          { label: "Procurement matches", count: matches.length, source: "get_procurement_match" },
          { label: "Open close questions", count: closeOpen.length, source: "get_procurement_match" },
          { label: "Commercial chains", count: chains.length, source: "get_commercial_chain" },
          ...incompleteChains.map((c) => ({
            label: `${c.subjectRef} — components present`,
            text: `${c.presentCount} of ${c.totalCount}`,
            source: "get_commercial_chain" as const,
          })),
        ],
        conflictingEvidence: [],
        missingEvidence: incompleteChains.map(
          (c) => `${c.subjectRef} is missing ${c.requiredMissingCount} required component(s).`,
        ),
        assertions: ["EXISTENCE", "CUTOFF"],
        managementConclusion:
          "A native three-way match asks whether a bill can be paid. The close control asks whether we owned the goods at the balance-sheet date. They are reported separately because they answer different questions.",
        nextAction: "Resolve the open close questions; completeness alone concludes nothing.",
        citations: [cite("Reconciliation", { href: "/reconciliation" })],
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
      // getFinancialLife answers for ANY string, so it cannot be used to
      // establish that a serial exists. Ask the search first: a unit no
      // source mentions must produce NO_SUCH_OBJECT, never a life story
      // whose every component reads "missing".
      const hits = s.run<readonly { serial: string }[]>("search_serial", { serial });
      if (hits !== undefined && !hits.some((h) => h.serial === serial)) return undefined;
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
              // Withheld is not undated: a restriction says so.
              text:
                e.state === "WITHHELD"
                  ? `${e.ref} · withheld by your access scope`
                  : `${e.ref}${e.at !== undefined ? ` · ${e.at}` : " · undated"}`,
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
  const met = f.evidenceRequirements.filter((r) => r.satisfied);
  const serial = f.subjects.serials?.[0];
  /**
   * Unmet requirements are only OUTSTANDING while the exception is open.
   * A resolved exception was concluded by a scenario event that addressed
   * exactly these requirements, so demanding them again contradicts the
   * recorded resolution — the engine was reporting "Resolved" and
   * "Obtain: …" in the same answer for eight of the fifteen exceptions.
   */
  const unmet = view.open
    ? f.evidenceRequirements.filter((r) => r.required && !r.satisfied)
    : [];
  const unmetWhileResolved = view.open
    ? []
    : f.evidenceRequirements.filter((r) => r.required && !r.satisfied);

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
    // Stated as missing, never inferred. This is the refusal — and it is
    // phrased from the requirement, not from EXC-001's contract language,
    // which was previously emitted verbatim for recounts and damage
    // assessments too.
    missingEvidence: unmet.map(
      (r) =>
        `${r.description} — not in evidence. It cannot be inferred; it must be obtained.`,
    ),
    assertions: [...f.assertions],
    exposure: { label: "Exposure", valueCents: f.exposureCents, source: "get_exception" },
    managementConclusion: view.open
      ? "Open. No conclusion has been recorded, and none can be reached on the evidence held."
      : unmetWhileResolved.length > 0
        ? `Resolved. The conclusion was reached without ${unmetWhileResolved
            .map((r) => r.description.toLowerCase())
            .join("; ")} — the resolving event addressed the question instead.`
        : "Resolved. The recorded conclusion stands on the evidence held.",
    nextAction: !view.open
      ? "None — resolved; the history travels with the item."
      : unmet.length > 0
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
  }
  // An intent that MATCHED but produced nothing must still fall back to the
  // scoped object — previously the two branches were mutually exclusive, so
  // "show me the history of this item" on an exception answered nothing.
  if (answer === undefined && context.exceptionId !== undefined) {
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
  const notAuthorized = () => ({
    ...base,
    toolCalls: session.calls,
    refusal: {
      reason: "NOT_AUTHORIZED" as const,
      message:
        "Your role cannot read the data this question needs. No figure is shown — this is a restriction, not a zero.",
      stillVisible: ["The close status of the item remains visible to everyone who works it."],
    },
  });

  if (session.anyDenied) return notAuthorized();

  // NO_SUCH_OBJECT is a claim about the WORLD, so it must be established by
  // asking the tools whether the object resolves — not inferred from the
  // fact that a scope was supplied. Choosing it on scope-presence made the
  // assistant deny the existence of the very object the screen was rendering.
  const scopedId = context.exceptionId ?? context.serial;
  if (scopedId !== undefined) {
    const resolves =
      context.exceptionId !== undefined
        ? session.run("get_exception", { exceptionId: context.exceptionId }) !== undefined
        : (session.run<readonly { serial: string }[]>("search_serial", {
            serial: context.serial ?? "",
          }) ?? []).some((h) => h.serial === context.serial);
    // The PROBE ITSELF can be denied, and an undefined result then means
    // "you may not look", not "it does not exist". Answering NO_SUCH_OBJECT
    // there states a fact about the world on the strength of a permission
    // check — the same substitution of a proxy for the fact it names that
    // the scope-presence version of this branch made. `anyDenied` is a live
    // getter over the call log, so it now sees the probe's own outcome.
    if (session.anyDenied) return notAuthorized();
    if (!resolves) {
      return {
        ...base,
        toolCalls: session.calls,
        refusal: {
          reason: "NO_SUCH_OBJECT",
          message: `No object in the FY2026 close population matches ${scopedId}.`,
          stillVisible: [],
        },
      };
    }
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
