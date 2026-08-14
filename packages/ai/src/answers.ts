import type {
  AdjustmentRegisterOut,
  ConsignmentHoldingsOut,
  CostClassificationOut,
  CostStandardsOut,
  CustodyBreakdownOut,
  DispositionsOut,
  EffectiveClose,
  EoMethodologyOut,
  GlAccountReconciliationOut,
  MemoOut,
  MethodologyOut,
  ProcurementPopulationsOut,
} from "@icg/services";
import { namesContradiction } from "@icg/domain";
import { checkDraft } from "./guardrails.js";
import {
  extractExceptionId,
  extractSerial,
  matchesQuestion,
  normalizeQuestion,
  type IntentMatch,
} from "./matching.js";
import { createToolSession, type AiToolContext, type AiToolSession } from "./tools.js";
import {
  ANSWER_ENGINE_VERSION,
  TOOLSET_VERSION,
  type AiCitation,
  type AiDraftSection,
  type AiFigure,
  type AiInteraction,
  type AiMaterialAnswer,
  type AiMode,
} from "./types.js";

/**
 * The deterministic answer engine (stage 08, extended by Stage G).
 *
 * "Deterministic Core, Generative Edge" is implemented literally here: every
 * figure, status and citation in an answer is READ FROM TOOL RESULTS, and a
 * provider — when one exists at all — may only add prose around them. (The
 * management-conclusion sentence is authored prose in this file, deliberately
 * NOT attributed to a tool result — see the guardrails note on why
 * conclusions are recorded by people, never produced by software.) That is
 * why `docs/09`'s rule that "numeric values in material status answers must
 * match tool results exactly" needs no post-hoc check: there is no path by
 * which a number could come from anywhere else.
 *
 * It also means the acceptance test passes by construction rather than by a
 * parallel fallback implementation that could drift: with the provider
 * disabled, this engine IS the answer, and every golden question still works.
 *
 * Values stay structured (integer cents, basis points, counts). The web layer
 * formats them, so @icg/ai never duplicates apps/web's formatters and the two
 * cannot disagree about what $198,950 looks like.
 *
 * **Stage G note on authored prose.** The Stage F review measured the one
 * thing that goes wrong here: where a stage DERIVED a claim it survived nine
 * review lenses untouched, and where it AUTHORED one beside a measurement,
 * several had drifted off the data they describe. So every management
 * conclusion below that names a population is built from that population —
 * a sentence saying "these agree" is emitted from the service's own measured
 * boolean, and its opposite is emitted when the boolean is false. None of
 * them is a statement of fact that happens to be true today.
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
  /**
   * Phrases, not regexes. `matching.ts` compiles the word boundaries, which
   * is why "GL account 1200" can no longer reach the physical-count handler:
   * the anchoring is not something an author can forget.
   */
  readonly match: IntentMatch;
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

/** Singular/plural without a hard-coded plural, which is invisible at one. */
const plural = (n: number, one: string, many = `${one}s`): string => (n === 1 ? one : many);

/**
 * A count written into a SENTENCE.
 *
 * Figures stay structured and apps/web formats them — that rule holds and is
 * why `AiFigure` carries `count` rather than a string. But a status line is
 * prose, the engine composes it, and `${bookUnits}` put "1500 book units" in
 * the drawer beside a screen showing "1,500". Grouping an integer is not a
 * presentation policy the way a currency or a percentage is; it is the same
 * value written legibly. `stage-g-regressions.test.ts` asserts no answer
 * sentence carries an ungrouped four-digit run, so this cannot be forgotten
 * at the next intent.
 */
const count = (n: number): string => n.toLocaleString("en-US");

/**
 * The one sentence about posting. Two intents state it and it is a claim
 * about what this product structurally cannot do, so it is written once:
 * `ProposedAdjustmentOut.posted` is typed `false`, and a second wording of
 * that fact is a second thing to keep true.
 */
const NOTHING_IS_POSTED =
  "Nothing here has been posted. Approval is a human act recorded outside this product, and posting happens in NetSuite.";

/**
 * What the reader's scope removed FROM THE POPULATION THIS ANSWER DISPLAYS,
 * in one sentence, or null when it removed nothing from it.
 *
 * Both counts are per-population. Neither is a close-wide total, and that is
 * the whole correction: the first version took the entire
 * `ProcurementPopulationsOut` and reported `withheldOrderCount` and
 * `withheldDocumentCount` — facts about the CLOSE — in a sentence whose
 * subject is "the rows above", which is a fact about this answer.
 *
 * At FY2026-DEMO-v1.2.0 that told an auditor the GRNI and price-variance
 * tables were short when both are byte-identical to a Controller's (same POs,
 * same 42 units, same $18,600), and promised "a source document withheld on
 * an order that does appear above" when the order carrying it, PO-26-1201,
 * appears in none of the three displayed populations. The single withheld
 * order is INVOICED_NOT_RECEIVED and could never have been a GRNI row.
 *
 * It is worth naming what that was, because it is this file's own recurring
 * trap arriving from the other side. The sentence was added to stop scope
 * being rendered as an ABSENCE, and it rendered scope as a FINDING instead —
 * a complete population announced to the reader as shortened by their own
 * access, under the heading MISSING EVIDENCE. A sentence about the rows above
 * can only be built from the rows above, so that is all this function is
 * given: no argument here can express a claim about a population the caller
 * is not displaying.
 */
const procurementScopeNote = (p: {
  /** Orders absent from THIS population because the reader may not see them. */
  missingRows: number;
  /** Rows THIS population displays that name a document the reader may not read. */
  rowsMissingADocument: number;
  /** The close's own order count, so the reader can size the omission. */
  totalOrders: number;
}): string | null => {
  const parts: string[] = [];
  if (p.missingRows > 0) {
    // The population noun takes the POPULATION's number and the verb takes the
    // missing count's: "1 of the close's 84 orders is", never "84 order is".
    parts.push(
      `${p.missingRows} of the close's ${p.totalOrders} ${plural(p.totalOrders, "order")} ${plural(p.missingRows, "is", "are")} outside your access scope, so ${plural(p.missingRows, "it does", "they do")} not appear in the rows above`,
    );
  }
  if (p.rowsMissingADocument > 0) {
    parts.push(
      `${p.rowsMissingADocument} ${plural(p.rowsMissingADocument, "row")} above ${plural(p.rowsMissingADocument, "names a source document", "name source documents")} you may not read, and ${plural(p.rowsMissingADocument, "that cell reads", "those cells read")} "Withheld" rather than blank`,
    );
  }
  if (parts.length === 0) return null;
  return `${parts.join(", and ")}. The close's own match figures count its whole population either way, and a period-end position is derived from the documents' own dates rather than from what you may read.`;
};

/* ------------------------------------------------------------------ */
/* Shapes of the query results the tools return. Declared structurally  */
/* so this module needs no import from @icg/rules.                      */
/*                                                                      */
/* Stage G's tools import their real result types from @icg/services    */
/* instead (see the import block above). A structural copy is a second  */
/* statement of a shape somebody else owns, and it drifts silently —    */
/* these remain only because rewriting the stage-08 intents onto the    */
/* real types is a change with no test behind it.                       */
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
/** What `get_demo_capabilities` returns — the acts this reader may perform. */
interface DemoCapabilitiesResult {
  canResetDemo: boolean;
  canConclude: boolean;
  canSignOff: boolean;
}
/** What `get_effective_exceptions` returns — the close's exceptions as they now stand. */
interface EffectiveExceptionResult {
  exception: ExceptionResult["exception"];
  effectiveStatus: string;
  /** Open once conclusions count; `baselineOpen` is the rules' own answer. */
  open: boolean;
  baselineOpen: boolean;
  unmetRequirements: readonly string[];
  hasConclusion: boolean;
  /** A person's conclusion is what resolved it — not merely that one exists. */
  resolvedByConclusion: boolean;
}
/** What `get_exception_workflow` returns — one exception's live working state. */
interface ExceptionWorkflowResult {
  /**
   * Requirements still outstanding, counting a SUBMITTED one as met.
   *
   * Not "accepted": `unmetRequirements` clears a requirement on any submission
   * whose reviewState is not RETURNED, and PENDING is the only state the
   * shipped UI can produce — `reviewEvidence` is exposed by no server action.
   * A sentence built on this field may say a record was submitted; it may not
   * say a reviewer accepted it.
   */
  unmetRequirements: readonly string[];
  canResolve: boolean;
  conclusion: {
    conclusion: string;
    rationale: string;
    at: string;
  } | null;
  effectiveStatus: string;
  /** Open once conclusions are taken into account, not as the rules froze it. */
  open: boolean;
}
interface ExceptionResult {
  open: boolean;
  exception: {
    id: string;
    status: string;
    finding: {
      title: string;
      whyFlagged: string;
      /**
       * Declared because `whyFlagged` alone cannot say WHAT KIND of finding it
       * describes. A rule fires both for records that contradict each other
       * and for a record that was asked for and never arrived, and this
       * package filed both under CONFLICTING EVIDENCE. See
       * `REASON_CODE_KIND` in @icg/domain.
       */
      reasonCodes: readonly string[];
      exposureCents: number;
      assertions: readonly string[];
      /**
       * `skus` and `locations` are declared because a finding may name a
       * population rather than a unit. CNT-VAR-001 does exactly that — no
       * serial, a sku and a location — and while this interface listed only
       * `serials`, an answer joining variance rows to exceptions could not
       * see the one rule whose subject is count variances.
       */
      subjects: {
        serials?: readonly string[];
        skus?: readonly string[];
        locations?: readonly string[];
        custodian?: string;
      };
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
  /**
   * The part of the difference no reconciling item accounts for. Distinct from
   * `differenceCents`, which is the whole gap — the exposure slot called the
   * whole gap "unreconciled" while this was zero.
   */
  unexplainedCents: number;
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

/** The count-facing slice of `get_financial_lifecycle`, for one serial. */
interface SerialCountLife {
  serial: string;
  unit?: { sku: string; location: string } | undefined;
  inventoryLife: {
    countRows: readonly {
      countPlanId: string;
      sku: string;
      location: string;
      bin?: string | undefined;
      snapshotQuantity: number;
      countQuantity: number;
      variance: number;
      externalCountDetailId?: string | undefined;
    }[];
    countTests: readonly {
      id: string;
      countPlanId: string;
      selectionSource: string;
      direction: string;
      recordedAt: string;
      selectedBy: string;
    }[];
    movements: readonly { id: string }[];
  };
}

/** The plans slice of `get_cycle_count_history` — where the instants live. */
interface CountPlansResult {
  plans: readonly { id: string; countType: string; snapshotAt: string }[];
}

/** Plan ids read as vocabulary, so a status line never says "YEAR_END". */
const COUNT_TYPE_WORDS: Readonly<Record<string, string>> = {
  YEAR_END: "year-end",
  CYCLE: "cycle",
  SPOT: "spot",
};
const countTypeWord = (countType: string | undefined): string =>
  countType === undefined ? "unnamed" : (COUNT_TYPE_WORDS[countType] ?? countType.toLowerCase());

/**
 * "When was this serial last counted?", answered about THAT serial.
 *
 * Every figure is per-unit and named for the unit. The one thing this must
 * never do is report a population: the whole defect was that a per-unit
 * question about a specific serial was answered with the close's count
 * totals, so falling back to them on an absence would be the same answer
 * arriving by a longer route. An absence is therefore reported in its own
 * words, and never as a zero.
 */
function serialCountAnswer(
  serial: string,
  life: SerialCountLife,
  plans: CountPlansResult["plans"],
): AiMaterialAnswer {
  const planFor = (id: string) => plans.find((p) => p.id === id);
  const counted = life.inventoryLife.countRows
    .map((row) => ({ row, plan: planFor(row.countPlanId) }))
    // Most recent first. A row whose plan cannot be resolved sorts last
    // rather than being dropped: it is still a count line naming this unit.
    .sort((a, b) => (b.plan?.snapshotAt ?? "").localeCompare(a.plan?.snapshotAt ?? ""));
  const tests = life.inventoryLife.countTests;
  const testFacts: readonly AiFigure[] = tests.map((t) => ({
    label: `Test count ${t.id} — ${t.selectionSource.toLowerCase()}, ${t.direction.toLowerCase().replace(/_/g, " ")}`,
    text: `recorded ${t.recordedAt} by ${t.selectedBy}`,
    source: "get_financial_lifecycle" as const,
  }));

  const latest = counted[0];
  if (latest === undefined) {
    /**
     * No count LINE names this unit. That is a real and demo-relevant state —
     * KE-X1-8842 is off-book by design and is reached only through a test
     * count — and it is the state where reporting "1,061 of 1,065" was most
     * misleading, because the unit contributed to neither number.
     */
    return {
      status: `No count line names ${serial} in any plan on file`,
      knownFacts: [
        {
          label: `Count lines naming ${serial}`,
          count: 0,
          source: "get_financial_lifecycle",
        },
        ...testFacts,
        // A FACT about where the unit DOES appear, not a second missing
        // record. It sat in `missingEvidence` and the drawer therefore
        // announced "2 required items of evidence reported missing" about a
        // unit with exactly one missing record — the same overstatement
        // already removed from the counted branch of this answer, left behind
        // on this one. A test count is a selection, never required of any
        // particular unit, so its presence cannot be a gap.
        ...(tests.length > 0
          ? [
              {
                label: `${serial} — where it does appear`,
                text: `${count(tests.length)} test ${plural(tests.length, "count")}, which is an observation and not a population row`,
                source: "get_financial_lifecycle" as const,
              },
            ]
          : []),
      ],
      conflictingEvidence: [],
      // Exactly one, and it is genuinely required: the year-end count
      // population should have covered this unit and does not.
      missingEvidence: [
        `No count row for ${serial} in the year-end plan, so the close holds no counted quantity for this unit.`,
      ],
      assertions: ["EXISTENCE"],
      managementConclusion:
        "A unit with no count line was not counted. That is an absence in the count, not a quantity of zero, and the two must not be reported the same way.",
      nextAction: `Establish why ${serial} carries no count line before relying on the year-end population.`,
      citations: [cite(serial, { href: `/inventory/${serial}` })],
    };
  }

  const word = countTypeWord(latest.plan?.countType);
  const when = latest.plan?.snapshotAt;
  return {
    status:
      when !== undefined
        ? `${serial} was last counted ${when} in the ${word} plan ${latest.row.countPlanId}`
        : `${serial} was counted in the ${word} plan ${latest.row.countPlanId}, which carries no snapshot instant`,
    knownFacts: [
      {
        label: `${serial} — counted in plan`,
        text:
          when !== undefined
            ? `${latest.row.countPlanId} · ${word} · snapshot ${when}`
            : `${latest.row.countPlanId} · ${word} · no snapshot instant on file`,
        source: "get_cycle_count_history",
      },
      {
        label: `${serial} — on the book at snapshot`,
        count: latest.row.snapshotQuantity,
        source: "get_financial_lifecycle",
      },
      {
        label: `${serial} — counted on the floor`,
        count: latest.row.countQuantity,
        source: "get_financial_lifecycle",
      },
      {
        label: `${serial} — variance`,
        count: latest.row.variance,
        source: "get_financial_lifecycle",
      },
      {
        label: `${serial} — location counted`,
        text: `${latest.row.location}${latest.row.bin !== undefined ? ` · bin ${latest.row.bin}` : ""}`,
        source: "get_financial_lifecycle",
      },
      // Every earlier plan that also counted it, so "last" is a claim the
      // reader can check rather than one they have to take.
      ...counted.slice(1).map(
        (c): AiFigure => ({
          label: `${serial} — earlier count`,
          text: `${c.row.countPlanId} · ${countTypeWord(c.plan?.countType)}${c.plan !== undefined ? ` · snapshot ${c.plan.snapshotAt}` : ""} · variance ${c.row.variance}`,
          source: "get_cycle_count_history",
        }),
      ),
      ...testFacts,
      // A FACT, not a missing requirement. No test count is required of any
      // particular unit — test counts are a selection — so putting this in
      // `missingEvidence` made the drawer announce "1 required item of
      // evidence reported missing" about a unit whose count line is complete
      // and whose variance is zero. The one thing this product may never do is
      // overstate, and that includes overstating a gap.
      ...(tests.length === 0
        ? [
            {
              label: `${serial} — test counts touching it`,
              count: 0,
              source: "get_financial_lifecycle" as const,
            },
          ]
        : []),
    ],
    conflictingEvidence: [],
    missingEvidence: [],
    assertions: ["EXISTENCE", "COMPLETENESS"],
    managementConclusion:
      latest.row.variance === 0
        ? "The floor agreed with the book for this unit at the snapshot instant. That is a count outcome for one unit and concludes nothing about the population."
        : "The floor did not agree with the book for this unit. The variance is reported as counted; what it means is a management conclusion recorded against the exception that names it.",
    nextAction: `Open ${serial}'s Financial Life for the four-phase chain of custody behind this count.`,
    citations: [
      cite(serial, { href: `/inventory/${serial}` }),
      cite("Physical Count", { href: "/physical-count" }),
      ...(latest.row.externalCountDetailId !== undefined
        ? [cite(latest.row.externalCountDetailId)]
        : []),
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Intents.                                                             */
/*                                                                      */
/* ORDER IS THE DISAMBIGUATION. The first match wins, so the specific    */
/* topics come first and the broad ones last: "price variance" must beat */
/* "variance", "unsupported" must beat "who is holding", "still open"    */
/* must beat everything. That is deliberate and it is fragile, which is  */
/* why routing-identity.test.ts asserts the handler every shipped chip   */
/* and every probe question actually reaches, rather than trusting the   */
/* table to read correctly.                                             */
/* ------------------------------------------------------------------ */

const INTENTS: readonly Intent[] = [
  /* ---- Management outputs (Stage F surfaces) --------------------- */
  {
    key: "memo-draft",
    mode: "DRAFT",
    match: {
      any: ["close memo", "memo", "memos"],
      all: [
        ["management", "conclude"],
        ["draft", "wording"],
      ],
    },
    answer: (s) => {
      const memo = s.run<MemoOut>("get_memo");
      if (memo === undefined) return undefined;
      const p = memo.position;
      /**
       * The offer carries BOTH gates the commands carry. `saveMemoDraft`
       * authorizes and then checks the period; prose that prescribed
       * drafting on the period alone would prescribe an act the first gate
       * refuses, which is the defect the Stage F remediation review found in
       * the issue button.
       */
      const nextAction =
        memo.periodBlocks !== null
          ? memo.periodBlocks
          : memo.canDraft
            ? "Open Close Memo, then 'Start from the close position' — it fills the figures and leaves the assessment blank."
            : "Your role may read the memo but not draft it. Switch to a role that may, or hand this wording to whoever will.";
      return {
        /**
         * Two claims, each of which used to be made without consulting the
         * field that decides it.
         *
         * **"the close position is the one below."** `positionMoved` sits on
         * the same `MemoOut` this handler already holds and was never read, so
         * the sentence was byte-identical whether the close had moved since
         * issue or not. In the moved state the drawer printed 6 open and
         * 83.58% under a sentence saying that was the issued position, when
         * Version 1 was sealed against 7 and 81.42%. The Close Memo panel and
         * the CSV export both state the divergence from this same boolean.
         * `null` stays distinct from `false`: before anything is issued there
         * is no comparison to report, and "has not moved" would be a
         * comparison that never happened reported as a negative result.
         *
         * **"Nothing drafted and nothing issued."** That is a claim about the
         * world, made from a field the reader's own scope had nulled. An
         * auditor read it three blocks above this answer's own note that a
         * draft was withheld from them. `withheldDraftCount` is the same guard
         * `CloseMemoScreen` already applies before it will say the memo has
         * not been drafted.
         *
         * That correction then over-reached in the opposite direction: it
         * stated the count and closed with "whether one exists is not
         * something this answer can tell you". `withheldDraftCount` is
         * `memoVersions.length - visible.length`, so the branch cannot render
         * unless a draft provably exists — the first clause falsifies the
         * second. What scope withholds here is the draft's CONTENT, which is
         * what the sentence now says, and what the service's own withheldNote
         * has always said.
         *
         * **"the close has moved since it was sealed."** True of the seal,
         * which hashes fifteen fields, while the drawer prints eight of them —
         * so the sentence can sit above a set of figures identical to the
         * sealed ones and look like a contradiction. The Close Memo screen
         * renders every compared field and has no such gap. The sentence now
         * says where the whole comparison can be read.
         */
        status:
          memo.issued !== null
            ? memo.positionMoved === true
              ? `${memo.issued.label} issued; the close has moved since it was sealed, and the position below is the close as it stands now — the Close Memo screen shows every field the seal compares, which is more than the figures here`
              : `${memo.issued.label} issued; the close position is the one below`
            : memo.workingDraft !== null
              ? "A working draft exists; nothing has been issued"
              : memo.withheldDraftCount > 0
                ? `Nothing issued. ${count(memo.withheldDraftCount)} unissued ${plural(memo.withheldDraftCount, "draft is", "drafts are")} withheld from your role — a draft is internal management working paper, so its text is not shown here`
                : "Nothing drafted and nothing issued",
        knownFacts: [
          { label: "Book units", count: p.bookUnits, source: "get_memo" },
          { label: "Subledger", valueCents: p.subledgerCents, source: "get_memo" },
          { label: "Gross GL", valueCents: p.grossGlCents, source: "get_memo" },
          { label: "Difference", valueCents: p.differenceCents, source: "get_memo" },
          { label: "Unexplained", valueCents: p.unexplainedCents, source: "get_memo" },
          { label: "Open exceptions", count: p.openExceptionCount, source: "get_memo" },
          { label: "Blockers", count: p.blockerCount, source: "get_memo" },
          { label: "Close readiness", valueBps: p.readinessBps, source: "get_memo" },
        ],
        conflictingEvidence: [],
        missingEvidence: [],
        /**
         * Scope, said as scope, and carried in the channel that says so.
         *
         * This sentence was the reason `scopeNotes` was built, and it is the
         * one call site the move missed — so the drawer went on announcing
         * "1 required item of evidence reported missing" about a draft the
         * close holds and the reader may not read, while four other sites had
         * been moved. The commit that edited the status line two lines above
         * even quoted this reader's experience in its own message and left the
         * note where it was.
         *
         * Five roles are scoped here, not one: the withholding is derived from
         * `memo.draft`, and every role that lacks it lands in this branch.
         */
        scopeNotes:
          memo.withheldDraftCount > 0 && memo.withheldNote !== null
            ? [memo.withheldNote]
            : [],
        assertions: [],
        draft: MEMO_DRAFT_SECTIONS,
        managementConclusion:
          "The wording above is a structure to write into. Management's assessment is the part of a close memo this product will not produce, and the figures beside it are the close as it stands, not a conclusion about it.",
        nextAction,
        citations: [cite("Close Memo", { href: "/close-memo" })],
      };
    },
  },
  {
    key: "readiness-explained",
    mode: "EXPLAIN",
    match: {
      any: ["readiness", "readiness score", "how is the score", "weightings"],
    },
    answer: (s) => {
      const m = s.run<MethodologyOut>("get_methodology");
      if (m === undefined) return undefined;
      const r = m.readiness;
      const firing = r.categories.flatMap((c) =>
        c.terms
          .filter((t) => t.penaltyPercent > 0)
          .map((t) => ({ category: c.label, term: t })),
      );
      return {
        status: "Close readiness, category by category",
        knownFacts: [
          { label: "Close readiness", valueBps: r.totalBasisPoints, source: "get_methodology" },
          ...r.categories.map(
            (c): AiFigure => ({
              label: `${c.label} — weight ${c.weightPercent}%`,
              valueBps: c.scoreHundredths,
              source: "get_methodology",
            }),
          ),
          ...firing.map(
            (f): AiFigure => ({
              label: `${f.category} — ${f.term.rule}`,
              text: f.term.observed,
              source: "get_methodology",
            }),
          ),
          { label: "Rounding", text: r.roundingRule, source: "get_methodology" },
          { label: "Policy", text: r.policyVersion, source: "get_methodology" },
        ],
        conflictingEvidence: [],
        missingEvidence: [],
        assertions: [],
        managementConclusion:
          m.readinessDiverged
            ? "This is the live score. Work recorded in this session has moved it away from the run's baseline, and both are shown on the Methodology screen."
            : "Readiness measures how much of the close's own work is complete. It is not a statement about whether the balance is fairly stated.",
        nextAction: "Open Methodology → Readiness for the full derivation and its weights.",
        citations: [cite("Methodology", { href: "/methodology?tab=readiness" })],
      };
    },
  },
  {
    key: "judgements",
    mode: "SUMMARIZE",
    match: {
      any: [
        "judgement",
        "judgements",
        "judgment",
        "judgments",
        "interpretation",
        "interpretations",
        "assumption",
        "assumptions",
        "authored",
      ],
    },
    answer: (s) => {
      const m = s.run<MethodologyOut>("get_methodology");
      if (m === undefined || m.interpretations.length === 0) return undefined;
      return {
        status: `${m.interpretations.length} authored ${plural(m.interpretations.length, "judgement")}, each with the module that holds it`,
        knownFacts: m.interpretations.map(
          (i): AiFigure => ({
            label: `${i.dimension} — ${i.subject}`,
            text: `${i.answer} · held in ${i.heldIn}`,
            source: "get_methodology",
          }),
        ),
        conflictingEvidence: [],
        missingEvidence: [],
        assertions: [],
        managementConclusion:
          "Everything else on these screens is derived from the dataset by a rule. These are the places this product decided something, and each names where the decision lives so it can be disagreed with.",
        nextAction: "Open Methodology → Judgements; each row sits beside the figures it moves.",
        citations: [cite("Methodology", { href: "/methodology?tab=interpretations" })],
      };
    },
  },
  {
    key: "provenance",
    mode: "EXPLAIN",
    match: {
      any: ["provenance", "reproducible", "reproduce the close"],
      all: [
        ["numbers", "come from"],
        ["figures", "come from"],
        ["where", "derived"],
        ["how", "derived"],
      ],
    },
    answer: (s) => {
      const m = s.run<MethodologyOut>("get_methodology");
      if (m === undefined) return undefined;
      const r = m.reconciliation;
      return {
        status: "Every figure is derived from one dataset by one policy, and the run is named",
        knownFacts: [
          { label: "Run", text: m.runId, source: "get_methodology" },
          { label: "Dataset", text: m.datasetVersion, source: "get_methodology" },
          { label: "Policy", text: m.policyVersion, source: "get_methodology" },
          { label: "Subledger", valueCents: r.subledgerCents, source: "get_methodology" },
          { label: "Gross GL", valueCents: r.grossGlCents, source: "get_methodology" },
          { label: "Difference", valueCents: r.differenceCents, source: "get_methodology" },
          { label: "Sign convention", text: r.signConvention, source: "get_methodology" },
          ...m.replayExclusions.map(
            (x): AiFigure => ({
              label: "Outside the reproducibility check",
              text: `${x} — working state, not close output.`,
              source: "get_methodology",
            }),
          ),
        ],
        conflictingEvidence: [],
        /**
         * What the replay does NOT cover is a FACT about the check's scope, so
         * it is reported as one.
         *
         * These lines sat in `missingEvidence`, whose contract is "records the
         * close asked for and does not hold… the reader is expected to act on
         * it". Nothing here is a record and nothing is outstanding: they are
         * the check's own deliberate exclusions, read from the list the check
         * itself uses. The drawer counted them anyway, so the one answer whose
         * whole subject is that every figure is reproducible announced "3
         * required items of evidence reported missing" to every role.
         *
         * They are not access restrictions either, so `scopeNotes` would be
         * the same mistake one channel over.
         */
        missingEvidence: [],
        assertions: [],
        managementConclusion:
          "A figure on any screen is reproducible from the run named above. Reproduce Close re-derives it from the seed and reports which sections it compared.",
        nextAction: "Open Methodology for the derivation, or Audit Package → Reproduce Close to re-run it.",
        citations: [
          cite("Methodology", { href: "/methodology" }),
          cite("Audit Package", { href: "/audit-package" }),
        ],
      };
    },
  },

  /* ---- Ledger and procurement populations (Stages B and C) ------- */
  {
    key: "gl-accounts",
    mode: "EXPLAIN",
    match: {
      any: [
        "gl account",
        "gl accounts",
        "general ledger account",
        "general ledger accounts",
        "chart of accounts",
        "which account",
        "what account",
        "per account",
        "by account",
        "account 1200",
        "account 1210",
        "account 1220",
        "account 1230",
        "account 1290",
      ],
    },
    answer: (s) => {
      const gl = s.run<GlAccountReconciliationOut>("get_gl_account_reconciliation");
      if (gl === undefined) return undefined;
      const open = gl.accounts.filter((a) => a.state !== "RECONCILED");
      const unexplained = gl.accounts.filter((a) => a.state === "DIFFERENCE_NOT_EXPLAINED");
      return {
        status:
          open.length === 0
            ? "Every gross inventory account agrees with its subledger"
            : `${open.length} of ${gl.accounts.length} gross inventory ${plural(gl.accounts.length, "account")} ${plural(open.length, "carries", "carry")} a difference`,
        knownFacts: [
          ...gl.accounts.map(
            (a): AiFigure => ({
              label: `${a.account} ${a.description} — subledger`,
              valueCents: a.subledgerCents,
              source: "get_gl_account_reconciliation",
            }),
          ),
          ...open.map(
            (a): AiFigure => ({
              label: `${a.account} ${a.description} — difference`,
              valueCents: a.differenceCents,
              source: "get_gl_account_reconciliation",
            }),
          ),
          { label: "Subledger", valueCents: gl.subledgerCents, source: "get_gl_account_reconciliation" },
          { label: "Gross GL", valueCents: gl.grossGlCents, source: "get_gl_account_reconciliation" },
          { label: "Difference", valueCents: gl.differenceCents, source: "get_gl_account_reconciliation" },
          // The reserve travels as its own figure and is never summed into
          // gross inventory: it is a credit balance the bridge holds out.
          ...(gl.reserve !== null
            ? [
                {
                  label: `${gl.reserve.account} ${gl.reserve.description} — held out of gross inventory`,
                  valueCents: gl.reserve.glCents,
                  source: "get_gl_account_reconciliation" as const,
                },
              ]
            : []),
        ],
        conflictingEvidence: [],
        missingEvidence: [
          ...unexplained.map(
            (a) =>
              `${a.account}: the close's identified items do not account for the whole difference on this account.`,
          ),
          ...gl.unattributedItems.map(
            (i) =>
              `${i.id} cannot be placed on a single gross inventory account from its GL entries — it is reported, never distributed.`,
          ),
        ],
        assertions: ["EXISTENCE", "COMPLETENESS"],
        managementConclusion:
          unexplained.length === 0
            ? "Each account's difference is fully attributed to the close's own reconciling items. Attribution is not conclusion: none of them has been concluded or posted."
            : "At least one account carries a difference the close's identified items do not explain. That gap is the finding, not a rounding note.",
        nextAction: "Open Reconciliation → Financial for the per-account bridge.",
        citations: [cite("Reconciliation", { href: "/reconciliation?tab=financial" })],
      };
    },
  },
  {
    key: "grni",
    mode: "INVESTIGATE",
    match: {
      any: ["grni", "goods received not invoiced", "accrued liability", "accrual"],
      all: [
        ["received", "not invoiced"],
        ["received", "not been invoiced"],
        ["receipt", "no bill"],
      ],
    },
    answer: (s) => {
      const p = s.run<ProcurementPopulationsOut>("get_procurement_populations");
      if (p === undefined) return undefined;
      const rows = p.grni;
      return {
        status: `${rows.length} purchase ${plural(rows.length, "order")} received before year-end with no vendor bill at the balance-sheet date`,
        knownFacts: [
          { label: "Orders received not invoiced", count: rows.length, source: "get_procurement_populations" },
          { label: "Units", count: p.grniUnits, source: "get_procurement_populations" },
          // Absent when any line omits its amount: a partial sum is not a
          // total, and the service says so by returning undefined.
          ...(p.grniCents !== undefined
            ? [
                {
                  label: "Received value",
                  valueCents: p.grniCents,
                  source: "get_procurement_populations" as const,
                },
              ]
            : []),
          ...rows.map(
            (r): AiFigure => ({
              label: `${r.purchaseOrderNumber} — ${r.vendor}, received ${r.receiptDate}`,
              // A bill withheld by scope is not a bill that has not arrived,
              // and "no vendor bill" is the entire claim of this population.
              text: `${r.itemReceiptNumber} · ${count(r.quantity)} units · ${r.daysOutstanding} days outstanding${r.withheldDocuments.includes("VENDOR_BILL") ? " · a bill on this order is outside your access scope" : r.vendorBillNumber !== undefined ? ` · billed ${r.billDate} on ${r.vendorBillNumber}` : ""}`,
              source: "get_procurement_populations",
            }),
          ),
        ],
        conflictingEvidence: [],
        missingEvidence: [],
        // A restriction, not a gap: these documents exist.
        scopeNotes: [
          procurementScopeNote({
            missingRows: p.withheldFrom.grni,
            rowsMissingADocument: p.grni.filter((r) => r.withheldDocuments.length > 0).length,
            totalOrders: p.summary.orders,
          }),
        ].filter((n): n is string => n !== null),
        assertions: ["COMPLETENESS", "CUTOFF"],
        managementConclusion:
          "Goods received without a bill are an accrued liability at the balance-sheet date. This product identifies the population; the accrual is management's entry and is not proposed here.",
        nextAction: "Open Procurement → Received Not Invoiced.",
        citations: [cite("Procurement", { href: "/procurement?tab=grni" })],
      };
    },
  },
  {
    key: "invoiced-not-received",
    mode: "INVESTIGATE",
    match: {
      any: [
        "invoiced not received",
        "billed not received",
        "goods in transit",
        "in transit",
        "inbound transit",
        "git",
      ],
      all: [
        ["billed", "not received"],
        ["invoiced", "not received"],
        ["paid", "not received"],
      ],
    },
    answer: (s) => {
      const p = s.run<ProcurementPopulationsOut>("get_procurement_populations");
      if (p === undefined) return undefined;
      const rows = p.invoicedNotReceived;
      const git = p.goodsInTransit;
      return {
        status: `${rows.length} purchase ${plural(rows.length, "order")} billed before year-end with the receipt recorded after it`,
        knownFacts: [
          ...rows.map(
            (r): AiFigure => ({
              label: `${r.purchaseOrderNumber} — ${r.vendor}, billed ${r.billDate}`,
              // The recorded receipt date is what makes the cutoff visible. A
              // receipt withheld by scope must not read as no receipt at all.
              text: `${r.vendorBillNumber} · ${count(r.quantity)} units · close match ${r.closeMatchStatus}${r.withheldDocuments.includes("ITEM_RECEIPT") ? " · the receipt on this order is outside your access scope" : r.recordedReceiptDate !== undefined ? ` · received ${r.recordedReceiptDate}` : ""}`,
              source: "get_procurement_populations",
            }),
          ),
          { label: `${git.glAccount} — inbound goods in transit, units`, count: git.inboundUnits, source: "get_procurement_populations" },
          { label: `${git.glAccount} — inbound goods in transit`, valueCents: git.inboundCents, source: "get_procurement_populations" },
          // 1210 holds both directions. Reporting only the inbound half
          // against the account would contradict the GL-account screen.
          { label: `${git.glAccount} — outbound goods in transit, units`, count: git.outboundUnits, source: "get_procurement_populations" },
          { label: "Units on the document side", count: git.documentUnits, source: "get_procurement_populations" },
          ...(p.withheldOrderCount > 0
            ? [
                {
                  label: "Orders withheld by your access scope",
                  count: p.withheldOrderCount,
                  source: "get_procurement_populations" as const,
                },
              ]
            : []),
        ],
        // `inboundAgrees` is null when the reader's scope shortened the
        // document side and not the book side. Reporting that as a
        // disagreement is scope rendered as a finding — the recurring trap in
        // this codebase, and it was live on the Procurement screen for every
        // auditor until Stage G.
        conflictingEvidence:
          git.inboundAgrees === false
            ? [
                "The document side and the book side describe different inbound populations. They are the same units seen two ways, so a difference is a finding rather than a rounding note.",
              ]
            : [],
        missingEvidence: [],
        /**
         * Both of these are restrictions, not gaps, so they travel in the
         * channel that says so. Under MISSING EVIDENCE an auditor read them in
         * ember, bulleted "○", suffixed " — missing, required" for a screen
         * reader, and counted into "required items of evidence reported
         * missing" — about documents the close holds and they simply may not
         * read.
         *
         * The second clause is derived from the rows this answer DISPLAYS, and
         * only those. It used to be written from the close-wide
         * `withheldDocumentCount` and promised "an order that does appear
         * above" whose row set never contained it: the withheld document sits
         * on PO-26-1201 while the auditor's rows are PO-26-1241/1242/1243. The
         * promise was the damaging half — an instruction to go looking for a
         * cell that is not on the page, pointing away from the Three-Way Match
         * tab where the disclosure is true.
         */
        scopeNotes: [
          git.inboundAgrees === null
            ? `The two sides cannot be compared at your access scope: ${p.withheldOrderCount} ${plural(p.withheldOrderCount, "order is", "orders are")} withheld from the document side while the book side is not scoped.`
            : null,
          procurementScopeNote({
            missingRows: p.withheldFrom.invoicedNotReceived,
            rowsMissingADocument: p.invoicedNotReceived.filter(
              (r) => r.withheldDocuments.length > 0,
            ).length,
            totalOrders: p.summary.orders,
          }),
        ].filter((n): n is string => n !== null),
        assertions: ["EXISTENCE", "CUTOFF"],
        managementConclusion:
          git.inboundAgrees === null
            ? "No comparison of the two sides is offered on this run. The difference between the counts above is your access scope, and reading it as a control difference would be reading an omission as a finding."
            : git.inboundAgrees
              ? "The orders billed and not received and the units carried as inbound transit are the same population seen from two sides — checked, not assumed. They must never be added together."
              : "The document side and the book side of inbound transit do not agree. Until they do, neither figure stands alone.",
        nextAction: "Open Procurement → Invoiced Not Received, and its Goods in Transit tab.",
        citations: [cite("Procurement", { href: "/procurement?tab=inr" })],
      };
    },
  },
  {
    key: "price-variance",
    mode: "EXPLAIN",
    match: {
      any: ["price variance", "purchase price variance", "ppv", "overbilled"],
      all: [["billed", "ordered price"]],
    },
    answer: (s) => {
      const p = s.run<ProcurementPopulationsOut>("get_procurement_populations");
      if (p === undefined) return undefined;
      const v = p.priceVariance;
      return {
        status: `${v.rows.length} of ${v.ordersCompared} compared ${plural(v.ordersCompared, "order")} billed away from the ordered price`,
        knownFacts: [
          ...v.rows.map(
            (r): AiFigure => ({
              label: `${r.purchaseOrderNumber} — ${r.sku}, ${r.direction.toLowerCase()}`,
              valueCents: r.varianceCents,
              source: "get_procurement_populations",
            }),
          ),
          { label: "Unfavourable", valueCents: v.unfavorableCents, source: "get_procurement_populations" },
          { label: "Favourable", valueCents: v.favorableCents, source: "get_procurement_populations" },
          { label: "Net", valueCents: v.netCents, source: "get_procurement_populations" },
          // `ordersCompared` is the denominator in the status above and counts
          // comparisons that happened, so where scope prevented one the reader
          // needs both numbers to read the ratio at all.
          ...(v.ordersNotComparedAtScope > 0
            ? [
                {
                  label: "Orders the close matched",
                  count: p.summary.orders,
                  source: "get_procurement_populations" as const,
                },
                {
                  label: "Orders your scope left uncompared",
                  count: v.ordersNotComparedAtScope,
                  source: "get_procurement_populations" as const,
                },
              ]
            : []),
        ],
        conflictingEvidence: [],
        missingEvidence: [],
        // A restriction, not a gap: these documents exist.
        scopeNotes: [
          procurementScopeNote({
            missingRows: p.withheldFrom.priceVariance,
            // A price-variance row is a line comparison, and it names no
            // document the row itself could withhold: an order whose bill this
            // reader may not see produces no row at all. That omission is the
            // shortened DENOMINATOR, disclosed as the two figures above.
            rowsMissingADocument: 0,
            totalOrders: p.summary.orders,
          }),
        ].filter((n): n is string => n !== null),
        assertions: ["VALUATION"],
        managementConclusion:
          "Variance here is billed against ORDERED price, extended. It is a purchasing signal reported beside the close; no rule reads it and nothing is proposed from it.",
        nextAction: "Open Procurement → Price Variance.",
        citations: [cite("Procurement", { href: "/procurement?tab=ppv" })],
      };
    },
  },

  /* ---- Costing (Stage D) ----------------------------------------- */
  {
    key: "cost-stack",
    mode: "EXPLAIN",
    match: {
      any: [
        "standard cost",
        "cost stack",
        "cost component",
        "cost components",
        "unit cost",
        "makes up the cost",
      ],
    },
    answer: (s) => {
      const c = s.run<CostStandardsOut>("get_cost_standards");
      if (c === undefined) return undefined;
      return {
        status: c.decompositionAgrees
          ? "The inventory subledger decomposes exactly into its cost components"
          : "The cost components do not sum to the inventory subledger",
        knownFacts: [
          ...c.byComponent.map(
            (b): AiFigure => ({
              // The component and how it behaves with volume. `basis` is a
              // paragraph explaining WHY it behaves that way, and it belongs
              // on the screen this answer links to: as a figure label it
              // wrapped to five lines in the drawer and buried the amount.
              label: `${b.component} — ${b.behavior.toLowerCase()}`,
              valueCents: b.amountCents,
              source: "get_cost_standards",
            }),
          ),
          { label: "Components total", valueCents: c.componentTotalCents, source: "get_cost_standards" },
          { label: "Inventory subledger", valueCents: c.subledgerCents, source: "get_cost_standards" },
          { label: "SKUs with a stack", count: c.rows.length, source: "get_cost_standards" },
          { label: "Units carried off standard", count: c.unitsOffStandard, source: "get_cost_standards" },
        ],
        conflictingEvidence: c.decompositionAgrees
          ? []
          : [
              "The component total and the subledger disagree. A cost stack that does not sum to the balance it explains cannot support the balance.",
            ],
        missingEvidence: [
          ...c.skusWithoutStack.map((sku) => `${sku}: no standard cost stack is on file.`),
          ...(c.unitsWithoutStack > 0
            ? [`${count(c.unitsWithoutStack)} units are carried at a SKU with no stack behind them.`]
            : []),
        ],
        assertions: ["VALUATION"],
        managementConclusion: c.decompositionAgrees
          ? "The decomposition is measured against the subledger on every run, not promised by the generator. It says what the balance is made of; it concludes nothing about whether it is recoverable."
          : "The decomposition does not agree with the subledger, so the component figures do not explain the balance.",
        nextAction: "Open Costing → Standard Cost Stack.",
        citations: [cite("Costing", { href: "/costing?tab=stack" })],
      };
    },
  },
  {
    key: "cost-classification",
    mode: "EXPLAIN",
    match: {
      any: [
        "out of inventory",
        "period cost",
        "period costs",
        "expensed",
        "r&d",
        "research and development",
        "capitalised",
        "capitalized",
      ],
    },
    answer: (s) => {
      const c = s.run<CostClassificationOut>("get_cost_classification");
      if (c === undefined) return undefined;
      const p = c.period;
      return {
        status: `${p.rows.length} period-cost ${plural(p.rows.length, "pool")} kept out of inventory`,
        knownFacts: [
          ...p.byCategory.map(
            (b): AiFigure => ({
              label: `${b.category} — ${b.rowCount} ${plural(b.rowCount, "pool")}`,
              valueCents: b.amountCents,
              source: "get_cost_classification",
            }),
          ),
          { label: "Period costs total", valueCents: p.totalCents, source: "get_cost_classification" },
          { label: "Capitalized in inventory", valueCents: c.capitalized.totalCents, source: "get_cost_classification" },
          { label: "Of which variable", valueCents: c.capitalized.variableCents, source: "get_cost_classification" },
          { label: "Of which fixed", valueCents: c.capitalized.fixedCents, source: "get_cost_classification" },
        ],
        conflictingEvidence: p.keptOutOfInventory
          ? []
          : p.accountsInGlBalances.map(
              (a) =>
                `${a} carries both a period cost and a recorded inventory balance, so a cost this screen calls expensed is inside the balance the reconciliation sums.`,
            ),
        missingEvidence: [],
        assertions: ["VALUATION", "COMPLETENESS"],
        managementConclusion: p.keptOutOfInventory
          ? "None of these pools posts to a GL account the inventory bridge sums — checked against the recorded balances on this run, not asserted. Each row carries the basis for keeping it out."
          : "At least one period-cost pool posts to an account the inventory bridge sums, so the separation these figures describe does not hold.",
        nextAction: "Open Costing → Period Costs; each row states the basis for the treatment.",
        citations: [cite("Costing", { href: "/costing?tab=period" })],
      };
    },
  },
  {
    key: "cogs-relief",
    mode: "EXPLAIN",
    match: {
      any: [
        "cogs",
        "cost of goods sold",
        "left the book",
        "inventory relief",
        /**
         * A STEM. "relieved" alone lost "Which chains relieve inventory?" to
         * `procurement-chain`, an intent below this one — a wrong answer, not
         * a refusal. `reliev*` is unambiguous in this domain: no other word
         * in the corpus begins with it.
         */
        "reliev*",
        "accounting impact",
      ],
      all: [["sold", "book"]],
    },
    answer: (s) => {
      const c = s.run<CostClassificationOut>("get_cost_classification");
      if (c === undefined) return undefined;
      const g = c.cogs;
      /**
       * `expectedOnBook` is what separates a finding from an expectation.
       * `O2C-CHAIN-001` emits "still on the year-end book" whenever fulfilled
       * serials are on hand, independently of the component's state, so an
       * order with nothing shipped carries the same sentence. Framed as a
       * relief failure that reads as units that failed to relieve.
       */
      const findings = g.rows.filter((r) => r.state !== "RELIEVED" && !r.expectedOnBook);
      return {
        status: `${g.relieved} of ${g.rows.length} commercial ${plural(g.rows.length, "chain")} show inventory relief`,
        knownFacts: [
          { label: "Relieved", count: g.relieved, source: "get_cost_classification" },
          { label: "Not relieved", count: g.notRelieved, source: "get_cost_classification" },
          { label: "Nothing shipped", count: g.notShipped, source: "get_cost_classification" },
          ...findings.map(
            (r): AiFigure => ({
              label: `${r.salesOrder} — ${r.state}`,
              text: r.note ?? "The chain carries no note on this component.",
              source: "get_cost_classification",
            }),
          ),
        ],
        conflictingEvidence: [],
        missingEvidence:
          g.chainsWithoutReliefComponent > 0
            ? [
                `${count(g.chainsWithoutReliefComponent)} ${plural(g.chainsWithoutReliefComponent, "chain")} carry no inventory-relief component at all. Their state is reported as absent rather than read off the absence.`,
              ]
            : [],
        assertions: ["COMPLETENESS", "CUTOFF"],
        managementConclusion:
          findings.length === 0
            ? "Every chain that shipped has relieved inventory, or is expected to still carry it for a stated reason. Nothing here proposes an entry."
            : "At least one chain shipped without relieving inventory, and that is not the expected condition for it. Each names the component that is missing.",
        nextAction: "Open Costing → COGS State; each row links to the chain behind it.",
        citations: [cite("Costing", { href: "/costing?tab=cogs" })],
      };
    },
  },

  /* ---- Ownership, custody and valuation (Stage E) ---------------- */
  {
    key: "disposition",
    mode: "INVESTIGATE",
    match: {
      any: [
        "scrap",
        "scrapped",
        "dispose",
        "disposed",
        "disposal",
        "disposition",
        "dispositions",
        "salvage",
        "wrote off",
        "written off",
      ],
    },
    answer: (s) => {
      const d = s.run<DispositionsOut>("get_dispositions");
      if (d === undefined) return undefined;
      const withoutEvidence = d.rows.filter((r) => !r.evidenceOnFile);
      return {
        status: `${count(d.units)} ${plural(d.units, "unit")} disposed of, in ${d.byMethod.length} ${plural(d.byMethod.length, "way")}`,
        knownFacts: [
          ...d.byMethod.map(
            (m): AiFigure => ({
              label: `${m.method} — ${count(m.units)} ${plural(m.units, "unit")}, loss`,
              valueCents: m.lossCents,
              source: "get_dispositions",
            }),
          ),
          { label: "Original cost", valueCents: d.originalCostCents, source: "get_dispositions" },
          { label: "Proceeds recovered", valueCents: d.proceedsCents, source: "get_dispositions" },
          { label: "Loss on disposal", valueCents: d.lossCents, source: "get_dispositions" },
          ...d.rows.map(
            (r): AiFigure => ({
              label: `${r.serial} — ${r.method}, ${r.disposedAt}`,
              text: `${r.reason} · authorized by ${r.authorizedBy}`,
              source: "get_dispositions",
            }),
          ),
          ...(d.withheldRowCount > 0
            ? [
                {
                  label: "Rows withheld by your access scope",
                  count: d.withheldRowCount,
                  source: "get_dispositions" as const,
                },
              ]
            : []),
        ],
        // A unit cannot be both disposed of and on hand. Empty is the only
        // correct answer; a non-empty one is a double count no other figure
        // would show.
        conflictingEvidence: d.disposedSerialsOnBook.map(
          (serial) =>
            `${serial} is recorded as disposed of and still appears on the year-end listing.`,
        ),
        missingEvidence: withoutEvidence.map(
          (r) =>
            `${r.id}: ${r.evidenceRef ?? "no certificate is named"} — the disposal certificate is not in the evidence index (${d.evidenceIndexSize} external references indexed).`,
        ),
        assertions: ["EXISTENCE", "RIGHTS_AND_OBLIGATIONS"],
        managementConclusion: d.removedFromBook
          ? "The disposed units are off the year-end book — checked against the listing, not assumed. The loss shown is what the records carry, not a conclusion about recoverability."
          : "At least one disposed unit is still on the year-end book, so the disposal and the listing contradict each other.",
        nextAction: "Open Custody & Disposition → Disposition.",
        citations: [cite("Custody & Disposition", { href: "/custody?tab=disposition" })],
      };
    },
  },
  {
    key: "consignment",
    mode: "INVESTIGATE",
    match: {
      any: [
        "consignment",
        "consigned",
        "consignment-in",
        "vendor-owned",
        "owned by somebody else",
        "owned by someone else",
        "not ours",
        "off-book",
      ],
    },
    answer: (s) => {
      const c = s.run<ConsignmentHoldingsOut>("get_consignment_holdings");
      if (c === undefined) return undefined;
      return {
        status: `${count(c.units)} vendor-owned ${plural(c.units, "unit")} held on our floor and not on our book`,
        knownFacts: [
          ...c.byOwner.map(
            (g): AiFigure => ({
              label: `${g.key} — ${count(g.units)} ${plural(g.units, "unit")}, stated value`,
              valueCents: g.statedValueCents,
              source: "get_consignment_holdings",
            }),
          ),
          ...c.rows.map(
            (r): AiFigure => ({
              label: `${r.serial} — ${r.sku}, ${r.location}`,
              text: `owned by ${r.owner} · agreement ${r.agreementRef} · received ${r.receivedAt}`,
              source: "get_consignment_holdings",
            }),
          ),
          { label: "Stated value (not ours)", valueCents: c.statedValueCents, source: "get_consignment_holdings" },
          {
            label: "Count lines touching consignment bins",
            count: c.countLinesTouchingConsignmentBins,
            source: "get_consignment_holdings",
          },
          ...(c.withheldRowCount > 0
            ? [
                {
                  label: "Rows withheld by your access scope",
                  count: c.withheldRowCount,
                  source: "get_consignment_holdings" as const,
                },
              ]
            : []),
        ],
        conflictingEvidence: c.consignedSerialsOnBook.map(
          (serial) =>
            `${serial} is recorded as vendor-owned and also appears on our own year-end listing.`,
        ),
        missingEvidence: [],
        assertions: ["RIGHTS_AND_OBLIGATIONS", "EXISTENCE"],
        managementConclusion: c.outsideSubledger
          ? "These units are held, not owned: they are off the book and outside the subledger, and both were checked on this run rather than assumed. Nothing about them reaches a rule."
          : "The consigned units are not cleanly outside the owned population on this run, which is a finding about the book rather than about the agreement.",
        nextAction: "Open Custody & Disposition → Consignment-In.",
        citations: [cite("Custody & Disposition", { href: "/custody?tab=consignment" })],
      };
    },
  },
  {
    key: "third-party",
    mode: "INVESTIGATE",
    match: {
      any: ["unsupported", "redwood", "unconfirmed"],
      all: [
        ["third party", "confirmation"],
        ["custodian", "confirmation"],
        /**
         * A STEM, not the past participle. Declared as "confirmed", the
         * present tense fell through this intent and was claimed by `custody`
         * — which sits BELOW it, so ordering could not arbitrate — and "Does
         * the third party confirm the units it holds?" was answered with a
         * custody breakdown. `confirm*` covers confirm / confirms /
         * confirmed / confirming, and confirmation is this intent's own
         * subject, so the widening cannot reach a question it should lose.
         */
        ["third party", "confirm*"],
      ],
    },
    answer: (s) => {
      const holdings = s.run<readonly HoldingResult[]>("get_third_party_holdings");
      if (holdings === undefined) return undefined;
      const unsupported = holdings.filter((h) => !h.supported);
      if (unsupported.length === 0) return undefined;
      return {
        status: `${unsupported.length} custodian ${plural(unsupported.length, "holding")} unsupported`,
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
                label: `${h.custodian} — confirmed, ${count(h.units)} units`,
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
    key: "custody",
    mode: "EXPLAIN",
    match: {
      any: [
        "custody",
        "custodian",
        "custodians",
        "who is holding",
        "who holds",
        "holding our inventory",
        "physically held",
        "physically holds",
        "third-party",
        "3pl",
      ],
      all: [
        ["where", "held"],
        ["where", "physically"],
      ],
    },
    answer: (s) => {
      const c = s.run<CustodyBreakdownOut>("get_custody_breakdown");
      if (c === undefined) return undefined;
      return {
        status: `${count(c.bookUnits)} book ${plural(c.bookUnits, "unit")} across ${c.rows.length} custody ${plural(c.rows.length, "type")}`,
        knownFacts: [
          ...c.rows.map(
            (r): AiFigure => ({
              // A middle dot, not a second em dash: several custody types
              // carry one of their own ("In transit — outbound"), and three
              // dashes in a row stop reading as a label.
              label: `${r.custodyType} · held by ${r.heldBy} · ${count(r.units)} ${plural(r.units, "unit")}`,
              valueCents: r.carryingCents,
              source: "get_custody_breakdown",
            }),
          ),
          { label: "Book units", count: c.bookUnits, source: "get_custody_breakdown" },
          { label: "Units held by someone other than us", count: c.heldByOthersUnits, source: "get_custody_breakdown" },
          { label: "Carrying value held by others", valueCents: c.heldByOthersCents, source: "get_custody_breakdown" },
          { label: "Units whose custody is undetermined", count: c.undeterminedUnits, source: "get_custody_breakdown" },
        ],
        conflictingEvidence: [],
        missingEvidence:
          c.undeterminedUnits > 0
            ? [
                `${count(c.undeterminedUnits)} ${plural(c.undeterminedUnits, "unit")} cannot be placed in a custody type from location, classification and custodian alone.`,
              ]
            : [],
        assertions: ["EXISTENCE", "RIGHTS_AND_OBLIGATIONS"],
        managementConclusion: c.coversBook
          ? "Custody is who holds the goods; ownership is who carries them. Every book unit is placed in exactly one custody type, and the rows sum to the book — checked on this run."
          : "The custody rows do not account for the whole book population, so this breakdown is not a complete view of where the goods are.",
        nextAction: "Open Custody & Disposition → Custody.",
        citations: [cite("Custody & Disposition", { href: "/custody?tab=custody" })],
      };
    },
  },
  {
    key: "eo-aging",
    mode: "EXPLAIN",
    match: {
      any: [
        "not moved",
        "has not moved",
        "hasn't moved",
        "no movement",
        "aging",
        "ageing",
        "aged",
        "months of supply",
        "last movement",
        "slow-moving",
      ],
    },
    answer: (s) => {
      const e = s.run<EoMethodologyOut>("get_eo_methodology");
      if (e === undefined) return undefined;
      const a = e.agingBasis;
      const agedSkus = e.signals.filter((x) => x.metAgeTest);
      return {
        status: `${count(a.agedOnPolicyBasis)} ${plural(a.agedOnPolicyBasis, "unit")} past the ${a.thresholdDays}-day threshold on the ${a.policyBasis} basis`,
        knownFacts: [
          { label: "Units past the threshold", count: a.agedOnPolicyBasis, source: "get_eo_methodology" },
          { label: "Units with a movement date", count: a.unitsWithMovementDate, source: "get_eo_methodology" },
          { label: "Units without a movement date", count: a.unitsWithoutMovementDate, source: "get_eo_methodology" },
          ...agedSkus.map(
            (x): AiFigure => ({
              label: `${x.sku} — ${count(x.agedUnits)} aged ${plural(x.agedUnits, "unit")} of ${count(x.onHandUnits)} on hand`,
              valueCents: x.agedCarryingCents,
              source: "get_eo_methodology",
            }),
          ),
          { label: "Basis", text: e.basisNote, source: "get_eo_methodology" },
        ],
        conflictingEvidence: [],
        // The absences that decide whether an E&O conclusion can be reached
        // at all, each stated as the lookup it is rather than as a zero.
        missingEvidence: [
          ...(a.ageBasisComplete
            ? []
            : [
                `${count(a.unitsWithoutAcquisitionDate)} ${plural(a.unitsWithoutAcquisitionDate, "unit")} carry neither a movement date nor an acquisition date, so age cannot be established for them.`,
              ]),
          ...(e.condition.conditionBasisOnFile
            ? []
            : [
                `Condition records are not on file for ${count(e.condition.unitsWithoutConditionRecord)} ${plural(e.condition.unitsWithoutConditionRecord, "unit")} — age alone does not establish impairment.`,
              ]),
          ...(e.recovery.recoveryBasisOnFile
            ? []
            : [
                `No observed recovery price is on file for ${e.recovery.skusWithoutObservedPrice.join(", ")} — net realisable value is not computed by this product.`,
              ]),
        ],
        assertions: ["VALUATION"],
        managementConclusion:
          "Age is a signal, not a conclusion. No reserve amount is proposed by any rule, model or assistant here; management records the conclusion.",
        nextAction: "Open Valuation for the E&O methodology and the signals behind it.",
        citations: [cite("Valuation", { href: "/valuation" })],
      };
    },
  },
  {
    key: "valuation",
    mode: "EXPLAIN",
    match: {
      any: [
        "e&o",
        "e and o",
        "excess",
        "obsolete",
        "obsolescence",
        "reserve",
        "valuation",
        "write-down",
      ],
    },
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

  /* ---- Adjustments and the bridge -------------------------------- */
  {
    key: "journal-entry",
    mode: "EXPLAIN",
    match: {
      any: ["journal entry", "journal entries", "je", "entry lines", "debits and credits"],
    },
    answer: (s) => {
      const reg = s.run<AdjustmentRegisterOut>("get_proposed_adjustments");
      if (reg === undefined) return undefined;
      const drafted = reg.entries.filter((e) => e.proposal !== undefined);
      return {
        status: `${reg.draftedCount} prepared ${plural(reg.draftedCount, "entry", "entries")}; ${reg.postedCount} posted`,
        knownFacts: drafted.flatMap((e): AiFigure[] => {
          const p = e.proposal!;
          return [
            {
              label: `${p.id} — ${p.description}`,
              text: `${e.exceptionId} · prepared by ${p.preparedByRole} · reviewed by ${p.reviewerRole} · ${p.balanced ? "balanced" : "OUT OF BALANCE"}`,
              source: "get_proposed_adjustments",
            },
            ...p.lines.map(
              (line): AiFigure => ({
                label: `${p.id} — ${line.account} ${line.memo}`,
                valueCents: line.amountCents,
                source: "get_proposed_adjustments",
              }),
            ),
            {
              label: `${p.id} — net effect on inventory`,
              valueCents: p.inventoryEffectCents,
              source: "get_proposed_adjustments",
            },
          ];
        }),
        conflictingEvidence: drafted
          .filter((e) => !e.proposal!.balanced)
          .map(
            (e) =>
              `${e.proposal!.id} does not net to zero. The imbalance is reported rather than assumed away.`,
          ),
        missingEvidence: reg.entries
          .filter((e) => e.proposal === undefined)
          .map((e) => e.undraftedReason ?? `No entry has been drafted for ${e.exceptionId}.`),
        assertions: [],
        exposure: {
          label: "Effect of the drafted entries on the GL",
          valueCents: reg.draftedEffectCents,
          source: "get_proposed_adjustments",
        },
        managementConclusion: NOTHING_IS_POSTED,
        nextAction: "Open Adjustments; each entry shows its lines, its preparer and its reviewer.",
        citations: drafted.map((e) => cite(e.exceptionId, { href: `/exceptions/${e.exceptionId}` })),
      };
    },
  },
  {
    key: "adjustments",
    mode: "EXPLAIN",
    match: {
      any: ["adjustment", "adjustments", "proposed entry", "proposed entries", "posted", "proposal", "proposals"],
      all: [
        ["entry", "reconciling"],
        ["entries", "reconciling"],
      ],
    },
    answer: (s) => {
      const reg = s.run<AdjustmentRegisterOut>("get_proposed_adjustments");
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
        managementConclusion: NOTHING_IS_POSTED,
        nextAction: "Conclude the open items, then prepare and approve the remaining entries.",
        citations: reg.entries.map((e) => cite(e.exceptionId, { href: `/exceptions/${e.exceptionId}` })),
      };
    },
  },
  {
    key: "procurement-chain",
    mode: "INVESTIGATE",
    match: {
      any: [
        "procurement",
        "three-way match",
        "3wm",
        "purchase order match",
        "commercial chain",
        "commercial chains",
        "transaction chain",
        "transaction chains",
        "native match",
        "native netsuite",
        "chain",
        "chains",
      ],
      all: [["missing", "required component"]],
    },
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
        status: `${closeOpen.length} procurement ${plural(closeOpen.length, "match", "matches")} and ${incompleteChains.length} commercial ${plural(incompleteChains.length, "chain")} carry an open close question`,
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
        // `plural`, like the status line directly above it. Rendered, this
        // produced eleven missingEvidence lines, seven of them reading "is
        // missing 1 required component(s)." while the same answer's status one
        // line up said "1 procurement match and 11 commercial chains"
        // correctly. Reachable with no typing from three shipped chips:
        // ProcurementScreen.tsx:67 and ReconciliationScreen.tsx:91.
        missingEvidence: incompleteChains.map(
          (c) =>
            `${c.subjectRef} is missing ${c.requiredMissingCount} required ${plural(c.requiredMissingCount, "component")}.`,
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
    key: "reconciliation",
    mode: "EXPLAIN",
    match: {
      any: [
        "inventory tie",
        "tie to",
        "ties to",
        "reconcil*",
        "gl difference",
        "subledger",
        "sub-ledger",
        "the difference",
      ],
      all: [
        ["difference", "ledger"],
        ["explains", "difference"],
        ["explain", "difference"],
      ],
    },
    answer: (s) => {
      const recon = s.run<ReconResult>("get_reconciliation_status");
      if (recon === undefined) return undefined;
      /**
       * The exceptions this answer CITES, resolved to their findings once and
       * used for both the assertion list and the citations, so the two cannot
       * drift apart.
       *
       * `assertions` was the hand-written literal ["EXISTENCE",
       * "COMPLETENESS"]. The citations on this dataset are EXC-009, EXC-014
       * and EXC-015, whose findings assert ACCURACY, ACCURACY+CUTOFF and
       * ACCURACY (rma.ts:33, glReconciliation.ts:24 and :66). The two lists
       * were DISJOINT: the rendered answer's ASSERTIONS row read "Existence ·
       * Completeness", neither Accuracy nor Cutoff appeared anywhere in it,
       * and neither Existence nor Completeness was asserted by any cited
       * record. `answerException` renders `[...f.assertions]` from the
       * finding, so EXC-015's own drawer — ONE CLICK away, through that very
       * citation — read "Accuracy". This is the Overview's suggested chip #2,
       * "Why doesn't inventory tie?" (OverviewScreen.tsx:54).
       *
       * A cited exception that cannot be resolved to a finding is omitted
       * rather than guessed at, which is the same rule the rest of this file
       * follows (answers.ts:56-63): a conclusion that names a population is
       * built from that population.
       */
      const citedViews = recon.items
        .map((i) => s.run<ExceptionResult>("get_exception", { exceptionId: i.relatedExceptionId }))
        .filter((v): v is ExceptionResult => v !== undefined);
      const citedAssertions = [
        ...new Set(citedViews.flatMap((v) => v.exception.finding.assertions)),
      ].sort();
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
        assertions: citedAssertions,
        /**
         * Named for what was summed, and named the way the screen names it.
         *
         * This read "Unreconciled difference" over `differenceCents`, while
         * `unexplainedCents` on the same tool result is zero — and three lines
         * above, the same answer says "Every dollar of the difference is
         * identified and attributed." So the exposure slot, which is the figure
         * a reader is most likely to carry off, contradicted the sentence
         * beside it and disagreed with `recon-view.ts`, which calls this same
         * number "Current GL difference". One number, two names, across the
         * assistant and the screen.
         *
         * "Unreconciled" is the right word for `unexplainedCents` and only for
         * that, so it is used exactly when there is some.
         */
        exposure:
          recon.unexplainedCents > 0
            ? {
                label: "Unreconciled difference",
                valueCents: recon.unexplainedCents,
                source: "get_reconciliation_status",
              }
            : {
                label: "GL difference",
                valueCents: recon.differenceCents,
                source: "get_reconciliation_status",
              },
        /**
         * Branched on the SAME predicate as the exposure label above it.
         *
         * It was unconditional, so the arm that says "Unreconciled difference"
         * would have printed directly under "Every dollar of the difference is
         * identified and attributed" — the label/sentence contradiction the
         * exposure fix was written to remove, re-created in the arm the fix
         * added. Unreachable on this dataset, because `ws.close.reconciliation`
         * is baseline-derived and `unexplainedCents` is structurally zero, so
         * no test can reach it and a change that made the reconciliation live
         * would have shipped the original defect back in silence.
         */
        managementConclusion:
          recon.unexplainedCents > 0
            ? `Part of the difference is attributed to no reconciling item — the unreconciled amount is the exposure figure above. Applying all ${recon.items.length} identified ${plural(recon.items.length, "item")} would not close the gap.`
            : `Every dollar of the difference is identified and attributed. Applying all ${recon.items.length} would bring the gross GL to the subledger, but none has been posted.`,
        nextAction: "Conclude the open reconciling items, then prepare and approve the entries.",
        citations: recon.items.map((i) =>
          cite(i.relatedExceptionId, { href: `/exceptions/${i.relatedExceptionId}` }),
        ),
      };
    },
  },

  /* ---- Audit package, evidence and the exception population ------ */
  {
    key: "pbc",
    mode: "SUMMARIZE",
    match: {
      any: [
        "pbc",
        "audit package",
        "prepared by client",
        "how ready",
        "workpaper",
        "workpapers",
        "audit request",
        "audit requests",
      ],
    },
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
          // All three read `readiness.aggregates`, so all three cite the tool
          // that produced it. The first two named `get_pbc_status` — the other
          // tool this intent calls, and the one a reader would assume — while
          // the third, one line down, named the right one. `AiFigure.source` is
          // documented as the tool the figure came FROM, and the drawer prints
          // it as "Answered from …", so a plausible-looking citation is worse
          // than none: it makes a drift audit agree with itself.
          { label: "Ready or provided", count: a.pbcReady, source: "get_close_readiness" },
          { label: "Total requests", count: a.pbcTotal, source: "get_close_readiness" },
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
        /**
         * Branches on the set it prescribes work over.
         *
         * `blockedBy` is now the LIVE set (queries.ts), so this sentence had to
         * stop being a constant with it: it told a reader to "conclude the
         * close items the remaining workpapers depend on" in a session where
         * every one of them had been concluded and there was nothing left to
         * act on. A prescription is a claim about what is outstanding, and it
         * has to branch on the same field the claim above it does.
         */
        nextAction: attention.some((i) => i.blockedBy.length > 0)
          ? "Conclude the close items the remaining workpapers depend on."
          : "No workpaper is waiting on a close conclusion; the rest is preparation effort.",
        citations: attention.map((i) => cite(i.id, { href: `/audit-package?pbc=${i.id}` })),
      };
    },
  },
  {
    key: "source-health",
    mode: "SUMMARIZE",
    match: {
      any: ["source health", "data health", "feed", "feeds", "stale", "integration", "integrations"],
      all: [
        ["source", "healthy"],
        ["sources", "healthy"],
        ["source", "health"],
        ["which", "systems"],
      ],
    },
    answer: (s) => {
      const health = s.run<{
        sources: readonly { sourceSystem: string; status: string; note?: string | undefined }[];
        aggregateBasisPoints: number;
      }>("get_source_health");
      if (health === undefined) return undefined;
      const degraded = health.sources.filter((x) => x.status !== "HEALTHY");
      return {
        status: `Source health ${degraded.length === 0 ? "fully healthy" : `${degraded.length} ${plural(degraded.length, "feed")} degraded`}`,
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
    key: "evidence-support",
    mode: "INVESTIGATE",
    match: {
      any: ["supports", "supported by", "supporting evidence", "backs up"],
      all: [["evidence", "behind"]],
    },
    /**
     * Answers about the object the QUESTION names when the screen is not
     * scoped to one — "What supports EXC-001?" from the Evidence screen. It
     * delegates to `answerException` rather than assembling a second view of
     * the same exception: two constructions of "what is on file for this
     * item" would be two answers to a question that has one.
     */
    answer: (s, q) => {
      // `q.exceptionId` already carries an id the QUESTION named:
      // `answerQuestion` resolves the scope once, so there is no second
      // extraction here to fall out of step with it.
      if (q.exceptionId === undefined) return undefined;
      return answerException(s, q.exceptionId);
    },
  },
  {
    key: "missing-evidence",
    mode: "INVESTIGATE",
    match: {
      any: ["missing evidence"],
      all: [
        ["evidence", "missing"],
        ["evidence", "still needed"],
        ["evidence", "outstanding"],
        ["evidence", "need"],
        ["evidence", "obtain"],
      ],
    },
    answer: (s, q) => {
      /**
       * Scoped to the object on screen when there is one. Asked from an
       * exception's own drawer, "what evidence is missing?" means THIS
       * exception; answering with the whole close's gaps describes a
       * population the reader did not ask about and buries the one they did.
       * A scoped exception with nothing outstanding returns undefined, and
       * the fallback in `answerQuestion` then answers about the object.
       */
      if (q.exceptionId !== undefined) {
        const view = s.run<ExceptionResult>("get_exception", { exceptionId: q.exceptionId });
        if (view === undefined) return undefined;
        /**
         * Both the open gate and the outstanding set come from the workflow
         * projection, not from the frozen finding.
         *
         * `view.open` is the rules' status, which a conclusion never moves, and
         * `evidenceRequirements[].satisfied` is frozen the same way — so a
         * record submitted through the product's own Submit Support button, and
         * accepted by a reviewer, was still reported "not in evidence… it must
         * be obtained", beside a workspace reporting `canResolve: true`. One
         * click of a shipped control was enough, and the answer then told the
         * reader to go and get a document already on file.
         */
        const workflow = s.run<ExceptionWorkflowResult>("get_exception_workflow", {
          exceptionId: view.exception.id,
        });
        if (!(workflow?.open ?? view.open)) return undefined;
        const outstanding = new Set(
          workflow?.unmetRequirements ??
            view.exception.finding.evidenceRequirements
              .filter((r) => r.required && !r.satisfied)
              .map((r) => r.description),
        );
        const unmet = view.exception.finding.evidenceRequirements.filter(
          (r) => r.required && outstanding.has(r.description),
        );
        if (unmet.length === 0) return undefined;
        return {
          status: `${unmet.length} required ${plural(unmet.length, "item")} of evidence outstanding on ${view.exception.id}`,
          knownFacts: unmet.map((r) => ({
            label: `${view.exception.id} — ${r.description}`,
            text: "Not in evidence",
            source: "get_exception_workflow" as const,
          })),
          conflictingEvidence: [],
          missingEvidence: unmet.map(
            (r) => `${view.exception.id}: ${r.description} — not in evidence.`,
          ),
          assertions: [...view.exception.finding.assertions],
          managementConclusion:
            "This item is waiting on specific records. It cannot be concluded on what is held today.",
          nextAction: `Obtain: ${unmet.map((r) => r.description).join("; ")}`,
          citations: [
            cite(view.exception.id, { href: `/exceptions/${view.exception.id}` }),
            ...unmet.map((r) => cite(r.description, { state: "MISSING" })),
          ],
        };
      }
      // The whole-close branch, from the live view for the same reason: both
      // which exceptions are still open and what each still needs.
      const exceptions = s.run<readonly EffectiveExceptionResult[]>("get_effective_exceptions");
      if (exceptions === undefined) return undefined;
      const stillOpen = exceptions.filter((e) => e.open);
      const gaps = stillOpen.flatMap((e) =>
        e.unmetRequirements.map((description) => ({ id: e.exception.id, description })),
      );
      /**
       * "Nothing is outstanding" is an ANSWER, and this returned undefined.
       *
       * The branch was unreachable while the count came off the frozen finding
       * — gaps could never empty — so returning nothing cost nothing. Sourcing
       * it from the live view makes it reachable, and an intent that returns
       * undefined falls through to the OUT_OF_SCOPE refusal: "It cannot answer
       * this from what the tools return, and it will not guess." That is a
       * shipped chip (EvidenceScreen.tsx, OverviewScreen.tsx) refusing a
       * question the product suggested, at the moment the answer is best.
       *
       * A fix that makes a dead branch live has to answer for the branch.
       */
      if (gaps.length === 0) {
        /**
         * Bounded to the population it measured.
         *
         * `gaps` is built from `stillOpen`, so it can only ever see the open
         * set — and the first version of this branch put a UNIVERSAL claim on
         * top of that narrow measurement: "Every required record the rules
         * asked for is on file", while nine required records on the
         * rules-resolved exceptions have no evidence at all and the product's
         * own exception pages said so in the same session. The old code
         * measured just as narrowly but only printed a count, so the widening
         * arrived with the sentence.
         *
         * It also said the records were "accepted". A PENDING submission
         * satisfies `unmetRequirements` — only RETURNED unsatisfies — so that
         * was a claim about review state from a field that does not carry it.
         */
        const resolvedWithGaps = exceptions.filter(
          (e) => !e.open && e.unmetRequirements.length > 0,
        );
        return {
          status:
            stillOpen.length === 0
              ? "No exception is open"
              : "No required record is outstanding on the open items",
          knownFacts: [
            { label: "Open exceptions", count: stillOpen.length, source: "get_effective_exceptions" },
            {
              label: "Exceptions carrying a management conclusion",
              count: exceptions.filter((e) => e.hasConclusion).length,
              source: "get_effective_exceptions",
            },
          ],
          conflictingEvidence: [],
          missingEvidence: [],
          assertions: [],
          managementConclusion:
            resolvedWithGaps.length > 0
              ? `Every open item holds the records its rule asked for, counting evidence submitted in this session. ${count(resolvedWithGaps.length)} resolved ${plural(resolvedWithGaps.length, "exception")} still ${plural(resolvedWithGaps.length, "carries", "carry")} a required record that was never filed — the resolving event addressed the question instead, and that is visible on each item.`
              : "Every required record the rules asked for is on file. That is a statement about the evidence file, not an opinion on the close.",
          nextAction:
            stillOpen.length > 0
              ? "Conclude the open items; each has the records its rule asked for."
              : "Nothing outstanding on evidence.",
          citations: stillOpen.map((e) =>
            cite(e.exception.id, { href: `/exceptions/${e.exception.id}` }),
          ),
        };
      }
      return {
        status: `${gaps.length} required ${plural(gaps.length, "item")} of evidence outstanding`,
        knownFacts: gaps.map((g) => ({
          label: `${g.id} — ${g.description}`,
          text: "Not in evidence",
          source: "get_effective_exceptions" as const,
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
    /**
     * The NEGATED ask, and it must sit immediately above `resolved-exceptions`.
     *
     * "Which exceptions are not resolved?" matched that intent's
     * `["which", "resolved"]` group — both words are present — so the product
     * answered with the RESOLVED population and listed eight items, every one
     * of which was the opposite of what was asked. Confidently, with a
     * correct-looking list. It was the worst of the open findings.
     *
     * The fix is an intent that CLAIMS the phrasing, not a negation operator
     * in the pattern language: `matching.ts` states plainly that there is no
     * negation and that disambiguation lives in the ORDER of this table,
     * asserted probe by probe. Adding `not:` here would move the
     * disambiguation somewhere invisible. Ordering is the mechanism, so
     * ordering is what this uses — and `routing-identity.test.ts` pins it.
     *
     * A reader asking this deserves the real answer, not a refusal: the open
     * population is exactly what they asked for.
     */
    key: "unresolved-exceptions",
    mode: "SUMMARIZE",
    /**
     * `unresolved` is NOT in `any`, and that is not fussiness.
     *
     * The first version declared it there and the routing harness caught it
     * stealing "Show largest unresolved exposures." from `largest-exposures`
     * — an intent that sits BELOW this one, so ordering could not arbitrate.
     * The bare adjective describes exposures, chains and differences too; only
     * the negated VERB phrases are unambiguous on their own. So the adjective
     * has to name its subject, and the verb phrases do not.
     */
    match: {
      any: ["not resolved", "not been resolved", "not concluded", "not been concluded"],
      all: [
        ["unresolved", "exceptions"],
        ["unresolved", "items"],
        ["without a conclusion"],
      ],
    },
    answer: (s) => {
      const all = s.run<readonly EffectiveExceptionResult[]>("get_effective_exceptions");
      if (all === undefined) return undefined;
      const open = all.filter((e) => e.open);
      if (open.length === 0) {
        // Verified empty, said as a conclusion rather than an empty list.
        return {
          status: `Every one of the ${all.length} exceptions carries a resolution`,
          knownFacts: [],
          conflictingEvidence: [],
          missingEvidence: [],
          assertions: [],
          managementConclusion:
            "Nothing is outstanding. That is a measured position over the whole population, not an empty filter.",
          nextAction: "Open the close memo to state the position, or Overview to sign off.",
          citations: [],
        };
      }
      return {
        status: `${open.length} of ${all.length} ${plural(all.length, "exception")} ${plural(open.length, "is", "are")} not resolved`,
        knownFacts: open.map(
          (e): AiFigure => ({
            label: `${e.exception.id} — ${e.exception.finding.title}`,
            // What is OUTSTANDING is the subject of the question, so each row
            // says what it is waiting on rather than restating its status.
            text:
              e.unmetRequirements.length > 0
                ? `${e.effectiveStatus} · waiting on ${count(e.unmetRequirements.length)} required ${plural(e.unmetRequirements.length, "record")}`
                : `${e.effectiveStatus} · every required record is in evidence; awaiting a management conclusion`,
            source: "get_effective_exceptions",
          }),
        ),
        conflictingEvidence: [],
        missingEvidence: [],
        assertions: [],
        managementConclusion:
          "An exception is resolved when a person records a conclusion against it. Software does not resolve one, so every item above is waiting on evidence, a conclusion, or both.",
        nextAction: "Open Exceptions to work these; each row links to what it is waiting on.",
        citations: open.map((e) => cite(e.exception.id, { href: `/exceptions/${e.exception.id}` })),
      };
    },
  },
  {
    key: "resolved-exceptions",
    mode: "SUMMARIZE",
    match: {
      any: ["already resolved"],
      all: [
        ["resolved", "exceptions"],
        ["resolved", "items"],
        ["which", "resolved"],
        ["what", "resolved"],
      ],
    },
    /**
     * "Carry a recorded resolution" is a claim about RECORDS, and it was
     * counted off the frozen rule status — the one field a recorded resolution
     * provably cannot enter, because `concludeException` writes to
     * `ws.conclusions` and never to `exception.status`. So the answer sat at "8
     * of 15" through seven recorded resolutions, listing eight items none of
     * which was one of them, directly above its own sentence explaining that a
     * resolution is a recorded event rather than an absence of findings.
     *
     * Counted from the live view now, and each row says which of the two closed
     * it — the rules or a person — because that difference is the whole subject
     * of the question.
     */
    answer: (s) => {
      const all = s.run<readonly EffectiveExceptionResult[]>("get_effective_exceptions");
      if (all === undefined) return undefined;
      const resolved = all.filter((e) => !e.open);
      if (resolved.length === 0) return undefined;
      // `hasConclusion` is true of REMAINS_OPEN as well, and a rules-resolved
      // exception can carry one — counting it here credited a person with
      // resolving an item they had recorded as remaining open.
      const byConclusion = resolved.filter((e) => e.resolvedByConclusion).length;
      return {
        status: `${resolved.length} of ${all.length} exceptions carry a recorded resolution`,
        knownFacts: resolved.map(
          (e): AiFigure => ({
            label: `${e.exception.id} — ${e.exception.finding.title}`,
            text: e.resolvedByConclusion
              ? `${e.effectiveStatus} · concluded in this session`
              : e.effectiveStatus,
            source: "get_effective_exceptions",
          }),
        ),
        conflictingEvidence: [],
        missingEvidence: [],
        assertions: [],
        managementConclusion:
          byConclusion > 0
            ? `A resolution is a recorded event, not an absence of findings: the exception keeps its history and the evidence that closed it travels with the item. ${count(byConclusion)} of these ${plural(byConclusion, "was", "were")} concluded by a person in this session; the rest are as the rules derived them, and Reset Demo restores that position.`
            : "A resolution is a recorded event, not an absence of findings: the exception keeps its history and the evidence that closed it travels with the item.",
        nextAction: "Open Exceptions and filter to the resolved lens; each row links to what resolved it.",
        citations: resolved.map((e) => cite(e.exception.id, { href: `/exceptions/${e.exception.id}` })),
      };
    },
  },
  {
    key: "serials-with-exceptions",
    mode: "SUMMARIZE",
    match: {
      all: [
        ["serials", "exceptions"],
        ["serial numbers", "exceptions"],
        ["units", "exceptions"],
      ],
    },
    answer: (s) => {
      const open = s.run<readonly ExceptionResult[]>("list_open_exceptions");
      if (open === undefined) return undefined;
      const named = open.filter((e) => (e.exception.finding.subjects.serials?.length ?? 0) > 0);
      const unnamed = open.length - named.length;
      const serials = new Set(named.flatMap((e) => [...(e.exception.finding.subjects.serials ?? [])]));
      return {
        status: `${serials.size} ${plural(serials.size, "serial")} named by ${named.length} of ${open.length} open exceptions`,
        knownFacts: [
          ...named.map(
            (e): AiFigure => ({
              label: `${e.exception.id} — ${e.exception.finding.title}`,
              text: (e.exception.finding.subjects.serials ?? []).join(", "),
              source: "list_open_exceptions",
            }),
          ),
          // Stated rather than dropped: an exception scoped to a SKU or an
          // account names no serial, and a list that silently omitted those
          // would read as a complete list of open work.
          {
            label: "Open exceptions that name no serial",
            count: unnamed,
            source: "list_open_exceptions",
          },
        ],
        conflictingEvidence: [],
        missingEvidence: [],
        assertions: [],
        managementConclusion:
          "An exception is scoped to whatever the rule found: a serial, a SKU, an account or a document. The ones naming no serial are not units without problems.",
        nextAction: "Open Inventory and search a serial, or open the exception itself.",
        citations: [
          cite("Inventory", { href: "/inventory" }),
          ...named.map((e) => cite(e.exception.id, { href: `/exceptions/${e.exception.id}` })),
        ],
      };
    },
  },
  {
    key: "unit-conflicts",
    mode: "INVESTIGATE",
    match: {
      any: ["conflict", "conflicts", "conflicting", "contradict", "contradicts", "disagree"],
    },
    answer: (s, q) => {
      const serial = q.serial;
      if (serial !== undefined) {
        // A unit no source mentions must not produce a conflict report whose
        // every line reads "none".
        const hits = s.run<readonly { serial: string }[]>("search_serial", { serial });
        if (hits !== undefined && !hits.some((h) => h.serial === serial)) return undefined;
        const life = s.run<LifeResult>("get_financial_lifecycle", { serial });
        if (life === undefined) return undefined;
        const views = life.exceptions
          .map((id) => s.run<ExceptionResult>("get_exception", { exceptionId: id }))
          .filter((v): v is ExceptionResult => v !== undefined);
        if (views.length === 0) return undefined;
        return {
          status: `${serial} is named by ${views.length} ${plural(views.length, "exception")}`,
          knownFacts: views.map(
            (v): AiFigure => ({
              label: `${v.exception.id} — ${v.exception.finding.title}`,
              text: v.exception.status,
              source: "get_exception",
            }),
          ),
          conflictingEvidence: conflictNarratives(views.filter((v) => v.open)),
          missingEvidence: views
            .filter((v) => v.open)
            .flatMap((v) =>
              v.exception.finding.evidenceRequirements
                .filter((r) => r.required && !r.satisfied)
                .map((r) => `${v.exception.id}: ${r.description} — not in evidence.`),
            ),
          assertions: [...new Set(views.flatMap((v) => v.exception.finding.assertions))],
          managementConclusion:
            "A conflict is two records that cannot both be right about this unit. The records are shown as they stand; which one is wrong is a management conclusion.",
          nextAction: "Open the unit's Financial Life for the four-phase chain of custody.",
          citations: [
            cite(serial, { href: `/inventory/${serial}` }),
            ...views.map((v) => cite(v.exception.id, { href: `/exceptions/${v.exception.id}` })),
          ],
        };
      }
      const open = s.run<readonly ExceptionResult[]>("list_open_exceptions");
      if (open === undefined || open.length === 0) return undefined;
      /**
       * Counted from the items that actually carry a contradiction, not from
       * `open.length`. The status said "7 open items carry evidence that
       * conflicts" while three of the seven carried no contradiction at all —
       * a count over one population describing another.
       */
      const conflicting = open.filter((e) => namesContradiction(e.exception.finding.reasonCodes));
      if (conflicting.length === 0) return undefined;
      return {
        status: `${conflicting.length} open ${plural(conflicting.length, "item")} ${plural(conflicting.length, "carries", "carry")} evidence that conflicts`,
        knownFacts: open.map(
          (e): AiFigure => ({
            label: `${e.exception.id} — ${e.exception.finding.title}`,
            text: e.exception.status,
            source: "list_open_exceptions",
          }),
        ),
        conflictingEvidence: conflictNarratives(conflicting),
        missingEvidence: [],
        assertions: [...new Set(open.flatMap((e) => e.exception.finding.assertions))],
        managementConclusion:
          "Each sentence above is the rule's own account of what disagreed. None of them is a conclusion about which record is wrong.",
        nextAction: "Open each exception; the conflicting records sit side by side on its detail screen.",
        citations: open.map((e) => cite(e.exception.id, { href: `/exceptions/${e.exception.id}` })),
      };
    },
  },

  /* ---- Where to start, and the broad close questions ------------- */
  {
    key: "work-priority",
    mode: "SUMMARIZE",
    match: {
      any: [
        "work on first",
        "start first",
        "where do i start",
        "where should i start",
        "what should i do first",
        "most urgent",
        "priority",
        "priorities",
        "focus on",
      ],
      all: [
        ["work", "first"],
        ["tackle", "first"],
      ],
    },
    answer: (s) => {
      const blockers = s.run<readonly BlockerResult[]>("get_blocking_conditions");
      const open = s.run<readonly ExceptionResult[]>("list_open_exceptions");
      if (blockers === undefined || open === undefined) return undefined;
      const blockerIds = new Set(blockers.map((b) => b.exceptionId));
      const byExposure = (a: ExceptionResult, b: ExceptionResult) =>
        b.exception.finding.exposureCents - a.exception.finding.exposureCents;
      const blocking = open.filter((e) => blockerIds.has(e.exception.id)).sort(byExposure);
      const rest = open.filter((e) => !blockerIds.has(e.exception.id)).sort(byExposure);
      const ordered = [...blocking, ...rest];
      if (ordered.length === 0) return undefined;
      return {
        // At the demo baseline every open item blocks sign-off, so the
        // two-part sentence would end "then 0 more open" — a clause about an
        // empty set, which reads as a second group the reader should look for.
        status:
          rest.length === 0
            ? `${blocking.length} open ${plural(blocking.length, "item")}, and every one of them blocks sign-off`
            : `${blocking.length} ${plural(blocking.length, "item")} blocking sign-off, then ${rest.length} more open`,
        knownFacts: ordered.map(
          (e, i): AiFigure => ({
            label: `${i + 1}. ${e.exception.id} — ${e.exception.finding.title}${blockerIds.has(e.exception.id) ? " (blocks sign-off)" : ""}`,
            valueCents: e.exception.finding.exposureCents,
            source: "list_open_exceptions",
          }),
        ),
        conflictingEvidence: [],
        missingEvidence: [],
        assertions: [],
        exposure: {
          label: "Exposure held by the blocking items",
          valueCents: blockers.reduce((sum, b) => sum + b.exposureCents, 0),
          source: "get_blocking_conditions",
        },
        /**
         * The ordering is mechanical and says so. Ranking by "importance"
         * would be a judgement, and a judgement produced by software is the
         * one thing this product refuses to make.
         */
        managementConclusion:
          "This order is mechanical: items that block sign-off first, then the rest by exposure. It is not a view about which matters most — nothing here ranks judgement, and exposure is carrying value rather than a loss estimate.",
        nextAction: "Take the first item; each carries its own owner, evidence and conclusion.",
        citations: ordered.map((e) => cite(e.exception.id, { href: `/exceptions/${e.exception.id}` })),
      };
    },
  },
  {
    key: "largest-exposures",
    mode: "SUMMARIZE",
    match: {
      any: ["largest", "biggest", "unresolved exposure", "unresolved exposures", "by exposure", "highest exposure"],
      all: [
        ["top", "exposure"],
        ["top", "risk"],
        ["top", "item"],
      ],
    },
    answer: (s) => {
      const exceptions = s.run<readonly ExceptionResult[]>("list_open_exceptions");
      if (exceptions === undefined || exceptions.length === 0) return undefined;
      const ranked = [...exceptions].sort(
        (a, b) => b.exception.finding.exposureCents - a.exception.finding.exposureCents,
      );
      return {
        status: `${ranked.length} unresolved ${plural(ranked.length, "item")}, largest first`,
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
    key: "blockers",
    mode: "EXPLAIN",
    match: {
      any: ["sign off", "signoff", "blocker", "blockers", "blocking", "blocked"],
      all: [
        ["prevent", "sign"],
        ["prevents", "sign"],
        ["what", "block"],
        ["holding up", "close"],
      ],
    },
    /**
     * Answered from the LIVE close, not the frozen baseline.
     *
     * Every figure here used to come from `get_close_readiness` and
     * `get_blocking_conditions`, both of which read `ws.close` — the position
     * the rules derived, before anyone did anything. So a Controller who had
     * recorded a conclusion on all seven blockers was told "Sign-off is
     * blocked", "Open blockers = 7", "$198,950" and "81.42%", from a shipped
     * chip on five screens, at the moment the Overview's own gate beside it
     * read "Every blocker has a management conclusion. Signing off locks the
     * period." Not a stale count: a present-tense PROHIBITION, false against
     * the product's own published gate.
     *
     * The baseline is still reported — it is the reproducible artifact and
     * losing it would tell a reader their work had no effect — but it is
     * reported AS the baseline, beside the position it has been superseded by.
     * `effectiveClose` returns both for exactly this reason.
     */
    answer: (s) => {
      // `get_close_readiness` is deliberately NOT called: it contributes no
      // figure now, and a recorded tool call that reached no rendered value
      // makes the interaction record claim a provenance the answer does not
      // have.
      const live = s.run<EffectiveClose>("get_effective_close");
      if (live === undefined) return undefined;
      // What THIS reader may do, from the same permission keys the commands
      // authorize against — so the answer never prescribes a control the
      // service would refuse them.
      const caps = s.run<DemoCapabilitiesResult>("get_demo_capabilities");
      const open = live.blockerCount > 0;
      return {
        // Branches on the count. The old sentence was a constant, so it was
        // "true today" rather than measured — and today it is false.
        status: open
          ? `Sign-off is blocked by ${count(live.blockerCount)} ${plural(live.blockerCount, "item")}`
          : "No blocker is open. Sign-off is available.",
        knownFacts: [
          { label: "Open blockers", count: live.blockerCount, source: "get_effective_close" },
          { label: "Close readiness", valueBps: live.readinessBps, source: "get_effective_close" },
          ...live.blockers.map(
            (b): AiFigure => ({
              label: `${b.exceptionId} — ${b.description}`,
              valueCents: b.exposureCents,
              source: "get_effective_close",
            }),
          ),
          /**
           * The rules' own position, named as such. Shown only once it differs
           * from the live one, so a reader who has changed nothing is not
           * offered two numbers to reconcile.
           *
           * Which means gating on the difference. This gated on
           * `live.diverged`, and `diverged` is `conclusions.length > 0 ||
           * submittedEvidence.length > 0` — somebody acted, not the figures
           * moved. Both reachable first acts leave these two figures untouched:
           * REMAINS_OPEN is the conclusion the codebase documents as never
           * moving status, and Submit Support moves neither. So the comment
           * above described a property its own gate did not enforce, and the
           * visible result was the outcome it says it prevents — 7 and 7 under
           * two contrasting labels. Each figure is now emitted only when its
           * own twin differs.
           */
          ...(live.blockerCount !== live.baselineBlockerCount
            ? [
                {
                  label: "Blockers the rules derived, before this session",
                  count: live.baselineBlockerCount,
                  source: "get_effective_close" as const,
                },
              ]
            : []),
          ...(live.readinessBps !== live.baselineReadinessBps
            ? [
                {
                  label: "Close readiness as the rules derived it",
                  valueBps: live.baselineReadinessBps,
                  source: "get_effective_close" as const,
                },
              ]
            : []),
        ],
        conflictingEvidence: [],
        missingEvidence: [],
        assertions: [],
        exposure: {
          label: "Blocker exposure",
          valueCents: live.blockerExposureCents,
          // The exposure slot is the figure a reader is most likely to carry
          // off this answer, so it is the one that must not be a snapshot.
          source: "get_effective_close",
        },
        /**
         * The zero-blocker branch names two controls — sign-off and Reset Demo
         * — and eight of the ten demo roles may operate neither. An auditor was
         * told to "Record management sign-off on the Overview" while the
         * Overview beside the drawer said, in words, "Your demo role cannot
         * record sign-off."
         *
         * That is the same shape this commit called the damaging half of the
         * procurement note it was fixing: an instruction to go looking for a
         * control that is not on the reader's page. The file's own precedent is
         * twelve hundred lines up, where the memo intent branches on
         * `memo.canDraft`; `getDemoCapabilities` computes these two from the
         * same permission keys the commands authorize against.
         */
        managementConclusion: open
          ? "The period cannot be signed off while these items are open. Each carries its own conclusion and owner."
          : `Every blocker the rules raised carries a management conclusion recorded in this session. The close as the rules derived it had ${count(live.baselineBlockerCount)} ${plural(live.baselineBlockerCount, "blocker")}.${caps?.canResetDemo === false ? "" : " Reset Demo restores that position."}`,
        nextAction: open
          ? "Work the blockers in exposure order; each links to its evidence and next action."
          : caps?.canSignOff === false
            ? "Nothing is outstanding to work. Your role may read the close but not record sign-off; a role that may can lock the period from the Overview."
            : "Record management sign-off on the Overview, which locks the period.",
        citations: live.blockers.map((b) =>
          cite(b.exceptionId, { href: `/exceptions/${b.exceptionId}` }),
        ),
      };
    },
  },
  {
    key: "counts",
    mode: "EXPLAIN",
    match: {
      any: [
        "count",
        "counts",
        "counted",
        "counting",
        "recount",
        "recounts",
        "stocktake",
        "physical inventory",
        "count window",
        "first pass",
        "variance",
        "variances",
        "cycle count",
        "test count",
        "test counts",
      ],
    },
    answer: (s, q) => {
      /**
       * Scoped to the serial when the question carries one.
       *
       * `routeQuestion("When was this serial last counted?")` resolves here,
       * and this function never read `q.serial`. Rendered with the real chip
       * scope {serial:"KE-E2-1048"} it returned "1,061 of 1,065 units matched
       * on the first pass", seven population facts, NO DATE, and never named
       * the serial — naming it in the question did not help either. That chip
       * is the FLAGSHIP unit page's suggested chip #2
       * (FinancialLifeScreen.tsx:53-58): one click on /inventory/KE-E2-1048.
       *
       * The per-serial data exists (queries.ts:431 `countedAt`, :863-865
       * countRows/countTests/movements per serial), so answering with close
       * totals was not a limit of the data.
       *
       * This is the shape of the serial-scoped branch of the `conflicts`
       * intent above: guard on `search_serial` first, so a serial no source
       * mentions falls through to `answerQuestion`'s unknown-serial answer
       * rather than producing a report whose every line reads "none".
       */
      const serial = q.serial;
      if (serial !== undefined) {
        const hits = s.run<readonly { serial: string }[]>("search_serial", { serial });
        if (hits !== undefined && !hits.some((h) => h.serial === serial)) return undefined;
        const life = s.run<SerialCountLife>("get_financial_lifecycle", { serial });
        const history = s.run<CountPlansResult>("get_cycle_count_history");
        if (life === undefined || history === undefined) return undefined;
        return serialCountAnswer(serial, life, history.plans);
      }
      /**
       * `managementLensInScope` is deliberately NOT declared here.
       *
       * The tool computes it so a caller can tell an auditor's empty
       * `managementIndicators` list from a genuinely empty one. This answer
       * reports no indicator — every figure below is identical for all ten
       * demo users, `managementTests` included — so there is no emptiness on
       * this surface to qualify, and a flag declared and dropped reads as a
       * disclosure that was made. If an indicator is ever surfaced here, the
       * flag has to come with it.
       */
      const detail = s.run<{
        summary: {
          populationUnits: number;
          firstPassMatchedUnits: number;
          varianceRows: number;
          movements: number;
          managementTests: number;
          auditorTests: number;
        };
        results: readonly {
          countType: string;
          sku: string;
          location: string;
          serial?: string | undefined;
          variance: number;
        }[];
      }>("get_cycle_count_history");
      if (detail === undefined) return undefined;
      const c = detail.summary;
      /**
       * How many of those variance rows are still OPEN.
       *
       * `varianceRows` counts every year-end variance the count produced,
       * open or not, and the imperative under it — "Resolve the open count
       * variances" — was unconditional. The shipped chip on the Physical Count
       * screen asks "Which count issues are still open?", so a reader was
       * answered "4" where one is open, and told to go and resolve three items
       * that were resolved. A count of a filtered population and a sentence
       * asserting work outstanding are the same claim, so both branch on the
       * same set.
       *
       * Cross-referenced through the exceptions rather than re-derived: a
       * variance is open exactly when an exception naming it is open, and that
       * is the effective open set, not the frozen one.
       *
       * Two things that first version got wrong, both of which made the new
       * sentence assert a zero it had not measured.
       *
       * **The population.** `varianceRows` beside it counts the YEAR-END plan
       * (`close.ts:107`); `detail.results` is every plan the dataset holds. Two
       * figures under one heading, counted over different sets.
       *
       * **The join.** It matched only on `serial`, and `CNT-VAR-001` — the one
       * rule whose entire subject IS count variances — fires on rows where
       * `serial === undefined` and names `{skus, locations}` instead. So the
       * count-variance exception could never be seen, and the branch below
       * could tell a reader "No count variance is still open" with that very
       * exception open. A variance row is now attributed by serial OR by its
       * sku-and-location pair, and a row that matches neither is reported as
       * unattributed rather than counted as closed.
       */
      const effective = s.run<readonly EffectiveExceptionResult[]>("get_effective_exceptions");
      const openExceptions = (effective ?? []).filter((e) => e.open);
      const openSerials = new Set(
        openExceptions.flatMap((e) => [...(e.exception.finding.subjects.serials ?? [])]),
      );
      const openSkuLocations = new Set(
        openExceptions.flatMap((e) =>
          (e.exception.finding.subjects.skus ?? []).flatMap((sku) =>
            (e.exception.finding.subjects.locations ?? []).map(
              (location) => `${sku} ${location}`,
            ),
          ),
        ),
      );
      const yearEndVariances = detail.results.filter(
        (r) => r.countType === "YEAR_END" && r.variance !== 0,
      );
      const attribution = (r: (typeof yearEndVariances)[number]): "OPEN" | "CLOSED" | "UNKNOWN" => {
        if (r.serial !== undefined) return openSerials.has(r.serial) ? "OPEN" : "CLOSED";
        if (openSkuLocations.has(`${r.sku} ${r.location}`)) return "OPEN";
        // A non-serialized row is attributable only through sku+location. If
        // no exception of any state names that pair, nothing here established
        // that it is closed.
        return effective !== undefined &&
          (effective ?? []).some((e) =>
            (e.exception.finding.subjects.skus ?? []).includes(r.sku) &&
            (e.exception.finding.subjects.locations ?? []).includes(r.location),
          )
          ? "CLOSED"
          : "UNKNOWN";
      };
      const openVariances = yearEndVariances.filter((r) => attribution(r) === "OPEN");
      const unattributedVariances = yearEndVariances.filter((r) => attribution(r) === "UNKNOWN");
      return {
        status: `${count(c.firstPassMatchedUnits)} of ${count(c.populationUnits)} units matched on the first pass`,
        knownFacts: [
          { label: "Counted population", count: c.populationUnits, source: "get_cycle_count_history" },
          { label: "Matched first pass", count: c.firstPassMatchedUnits, source: "get_cycle_count_history" },
          { label: "Variance rows", count: c.varianceRows, source: "get_cycle_count_history" },
          /**
           * The figure the chip actually asks for, beside the total it was
           * being answered with.
           *
           * Cited to `get_cycle_count_history`, which is the tool the counted
           * ROWS come from — `get_effective_exceptions` only decides which of
           * them are still open. The routing-identity harness settles this
           * rather than taste: it perturbs one tool at a time and requires a
           * figure to move with what it cites, and this one moves with the
           * count history. A citation that merely looks plausible is worse
           * than none, because the drawer prints it as "Answered from …".
           */
          ...(effective === undefined
            ? []
            : [
                {
                  label: "Variance rows still open",
                  count: openVariances.length,
                  source: "get_cycle_count_history" as const,
                },
              ]),
          // Stated, never folded into either side. A row nothing names is not
          // evidence that it is closed.
          ...(unattributedVariances.length > 0
            ? [
                {
                  label: "Variance rows no exception names",
                  count: unattributedVariances.length,
                  source: "get_cycle_count_history" as const,
                },
              ]
            : []),
          { label: "Movements during the count", count: c.movements, source: "get_cycle_count_history" },
          { label: "Management test counts", count: c.managementTests, source: "get_cycle_count_history" },
          { label: "Auditor test counts", count: c.auditorTests, source: "get_cycle_count_history" },
        ],
        conflictingEvidence: [],
        missingEvidence: [],
        assertions: ["EXISTENCE", "COMPLETENESS"],
        managementConclusion:
          "Cycle-count history is a management risk lens. It is not auditor sampling and carries no reliance.",
        nextAction:
          effective === undefined || openVariances.length > 0
            ? "Resolve the open count variances; each is an exception of its own."
            : unattributedVariances.length > 0
              ? "No count variance with an exception against it is still open. The rows above that no exception names are not evidence of a conclusion — establish what happened to them."
              : "No count variance is still open; each was concluded as an exception of its own.",
        citations: [cite("Physical Count", { href: "/physical-count" })],
      };
    },
  },
  {
    key: "financial-life",
    mode: "NAVIGATE",
    match: {
      any: ["walk me through", "financial life", "life of", "history of", "last seen"],
    },
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
          // The per-event labels above distinguish a withheld component from an
          // absent one, but a reader scanning nine rows should not have to
          // count them. `scopeReduced` and `withheldCount` were computed for
          // exactly this and declared here without ever being read.
          ...(timeline.scopeReduced
            ? [
                {
                  label: "Components withheld from you",
                  count: timeline.withheldCount,
                  source: "get_evidence_timeline" as const,
                },
              ]
            : []),
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
 * Suggested memo wording (Draft mode).
 *
 * Prose only, and every sentence here is checked by
 * `stage-g-regressions.test.ts` against the SAME quantity and identifier
 * guards `checkNarration` applies to provider narration. That is not
 * belt-and-braces: the close memo screen assembles the figures from
 * `memoPosition`, so a figure written here would be a second, unsourced copy
 * of a number the screen derives — which is exactly the bypass the narration
 * rule exists to prevent, arriving through a door marked Draft.
 */
const MEMO_DRAFT_SECTIONS: readonly AiDraftSection[] = [
  {
    heading: "Scope and basis",
    body: "State the period, the balance-sheet date and the populations this memo covers, and name the systems the figures were derived from. The amounts belong on the Close Memo screen, which seals them with the version.",
  },
  {
    heading: "Position",
    body: "Describe the inventory subledger, the general ledger and the gap between them in words. Say which direction the ledger sits relative to the subledger; the screen supplies the amounts.",
  },
  {
    heading: "Reconciling items",
    body: "Say what has been identified against the gap, what remains unattributed, and whether any entry has been prepared. Nothing in this product has been posted, so the memo should not describe the ledger as corrected.",
  },
  {
    heading: "Exceptions and what holds sign-off",
    body: "Name the items that hold sign-off, who owns each, and what each is waiting on. Where an item is waiting on a record that is not on file, say that the record is absent rather than that the matter is under review.",
  },
  {
    heading: "Management's assessment",
    body: "This paragraph is management's own. Nothing in this product writes it, and the figures beside it are not a substitute for it: they say where the close stands, not whether the balance is fairly stated.",
  },
  {
    heading: "Matters requiring a decision",
    body: "List the judgements a person must make and record — the excess-and-obsolete conclusion, the treatment of each unattributed item, and whether the period may be signed. Each belongs to a named owner.",
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
  /**
   * The exception's WORKING state — what a person has concluded and what they
   * have submitted since the rules ran.
   *
   * `get_exception` returns the frozen finding and nothing else: no conclusion
   * field, no accepted submissions, no effective status. So "No conclusion has
   * been recorded" was not a wrong lookup, it was a comparison that never
   * happened reported as a negative result, and the handler printed it beside
   * a conclusion the reader had recorded one click earlier — on the product's
   * trust screen, in the sentence the sign-off gate turns on. For U-007 and
   * U-009 it is worse than a contradiction: the ConclusionPanel early-returns
   * for roles with no action rights, so an external auditor is told no
   * conclusion exists with nothing on the page to correct it.
   *
   * `evidenceRequirements[].satisfied` is frozen in the same way, which is the
   * second half and reachable one action earlier: evidence submitted AND
   * accepted against every requirement still read "not in evidence… it must be
   * obtained" while the workspace reported `canResolve: true, unmet: []`.
   */
  const workflow = s.run<ExceptionWorkflowResult>("get_exception_workflow", { exceptionId });
  const f = view.exception.finding;
  const met = f.evidenceRequirements.filter((r) => r.satisfied);
  const serial = f.subjects.serials?.[0];
  const conclusion = workflow?.conclusion ?? null;
  // Open as the close reads it NOW. The rule that a recorded conclusion
  // supersedes the derived status — except REMAINS_OPEN, which records that a
  // person looked and decided it stays open — lives in `effectiveStatus`, and
  // the projection returns the answer rather than the inputs so this file
  // cannot hold a second copy of it.
  const open = workflow?.open ?? view.open;
  const status = workflow?.effectiveStatus ?? view.exception.status;
  /**
   * Unmet requirements are only OUTSTANDING while the exception is open.
   * A resolved exception was concluded by a scenario event that addressed
   * exactly these requirements, so demanding them again contradicts the
   * recorded resolution — the engine was reporting "Resolved" and
   * "Obtain: …" in the same answer for eight of the fifteen exceptions.
   *
   * Taken from the workflow projection, which counts a submission that has not
   * been RETURNED as satisfying, rather than from the finding's frozen flags.
   * Submitted, not accepted — nothing the shipped UI can do reaches ACCEPTED.
   */
  const outstanding = new Set(
    workflow?.unmetRequirements ?? f.evidenceRequirements.filter((r) => r.required && !r.satisfied).map((r) => r.description),
  );
  const stillRequired = f.evidenceRequirements.filter(
    (r) => r.required && outstanding.has(r.description),
  );
  const unmet = open ? stillRequired : [];
  const unmetWhileResolved = open ? [] : stillRequired;

  return {
    status,
    knownFacts: [
      { label: "Exception", text: `${view.exception.id} — ${f.title}`, source: "get_exception" },
      { label: "Exposure", valueCents: f.exposureCents, source: "get_exception" },
      /**
       * The conclusion itself, from the projection that holds it. Rendered as
       * a fact rather than folded into prose so the reader can see WHO
       * concluded and WHEN, which is the part an auditor relies on.
       *
       * Three fields, not one composed string. The composed version put the
       * canonical token and a raw `2027-01-07T06:03:00Z` in front of the
       * reader: the token because the drawer's flat label map spells
       * `RESOLVED_NO_ADJUSTMENT` from the exception-status vocabulary, which
       * is a different sentence from the one the ConclusionPanel prints for
       * the same record; the instant because @icg/ai has no formatter and
       * must not grow one. Both now leave as structured values and are worded
       * by the app, the way cents and basis points already are.
       */
      ...(conclusion === null
        ? []
        : [
            {
              label: "Management conclusion",
              valueConclusion: conclusion.conclusion,
              source: "get_exception_workflow" as const,
            },
            {
              label: "Conclusion recorded",
              valueInstant: conclusion.at,
              source: "get_exception_workflow" as const,
            },
            {
              label: "Conclusion rationale",
              text: conclusion.rationale,
              source: "get_exception_workflow" as const,
            },
          ]),
      ...met.map(
        (r): AiFigure => ({
          label: r.description,
          text: r.reference ?? "on file",
          source: "get_exception",
        }),
      ),
      /**
       * `lineageInScope` exists — and says so at `tools.ts:71` — to keep
       * "withheld from you" apart from "there is none". It was declared here
       * and never read, so the citation list below simply got shorter: on
       * thirteen of the fifteen exceptions an auditor sees fewer cited
       * workpapers than a Controller, with the same status, the same missing
       * evidence and nothing saying anything was withheld. On the screen whose
       * whole job is to show the reader where an answer came from.
       */
      ...(view.lineageInScope
        ? []
        : [
            {
              label: "Evidence lineage",
              text: "Not available at your access scope, so the workpapers behind this exception are not among the citations below. This is a restriction on what you may read, not an absence of support.",
              source: "get_exception" as const,
            },
          ]),
    ],
    /**
     * `open` is necessary but no longer sufficient. A resolved item reports no
     * live conflict; an OPEN item reports one only when its own reason codes
     * name a contradiction. EXC-007 filed "the year-end custodian confirmation
     * requested 2026-12-28 has not been answered" under CONFLICTING EVIDENCE
     * while the same answer filed the same absence under MISSING EVIDENCE.
     */
    conflictingEvidence: open && namesContradiction(f.reasonCodes) ? [f.whyFlagged] : [],
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
    /**
     * Three states, not two. The old sentence had one branch for "open" and
     * asserted BOTH that no conclusion exists and that none could be reached —
     * the first a record claim the handler had no way to check, the second the
     * product judging rather than reporting, since `concludeException` itself
     * permits REMAINS_OPEN on absent evidence.
     *
     * The token and the instant left this prose for the fact rows above: the
     * engine cannot word the first correctly or format the second at all, and
     * "which conclusion, by whom, when" is what a fact row is for. The prose
     * says what happened.
     */
    managementConclusion: !open
      ? unmetWhileResolved.length > 0
        ? `Resolved. The conclusion was reached without ${unmetWhileResolved
            .map((r) => r.description.toLowerCase())
            .join("; ")} — the resolving event addressed the question instead.`
        : "Resolved. The recorded conclusion stands on the evidence held."
      : conclusion !== null
        ? conclusion.conclusion === "REMAINS_OPEN"
          ? "Open. A management conclusion is recorded against this item: a person looked and decided it stays open. It does not change the rule's status. The conclusion, who recorded it and when are above."
          : // A resolving conclusion that is NOT superseding the rule means the
            // record behind it was returned, and `effectiveStatus` withdrew its
            // power to supersede. Saying "a person decided it stays open" would
            // re-characterise what management actually recorded, which is the
            // one thing this product may never do.
            "Open. A resolving management conclusion is recorded against this item, and it no longer supersedes the rule: a required record behind it is outstanding again. The conclusion stays in the trail; the item is open until the record is back."
        : unmet.length > 0
          ? // What the command will actually accept. `concludeException` calls
            // the requirements gate "the one rule this command will not bend"
            // and throws for both resolving conclusions while anything is
            // unmet — which, on this dataset, is every open exception. Offering
            // two routes where the product permits one sends the reader to a
            // refusal, which is the same defect as prescribing a control the
            // reader's role may not operate.
            "Open. No conclusion has been recorded. Management may record that the item remains open; resolving it requires the outstanding records first."
          : "Open. No conclusion has been recorded; every required record is now in evidence.",
    /**
     * An outstanding record is reported whether or not a conclusion exists.
     *
     * This branched on `conclusion !== null` FIRST, so recording a conclusion
     * suppressed the obtain-instruction outright: the answer said "None
     * outstanding on this item" while its own MISSING EVIDENCE block named the
     * record, its own citations carried it as MISSING, and the service
     * reported it unmet. And it is the ordinary path, not a corner —
     * `ConclusionPanel` defaults the selection to REMAINS_OPEN exactly when a
     * requirement is outstanding, so it is the first conclusion most readers
     * record on a blocked exception.
     *
     * G25's defect was this handler asserting a record claim it had no way to
     * check. Replacing it with a different record claim the answer itself
     * contradicts one field away is the same defect wearing the fix's clothes.
     */
    nextAction: !open
      ? "None — resolved; the history travels with the item."
      : unmet.length > 0
        ? `Obtain: ${unmet.map((r) => r.description).join("; ")}`
        : conclusion !== null
          ? "None outstanding on this item — every required record is in evidence, and the conclusion recorded against it keeps it open by choice."
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
 * "Why is this still open?" and its neighbours, as phrases rather than as
 * `/why.*(open|still|flagged)/` — whose `.*` spanned whole sentences, so
 * "Why can a native match pass while the close stays open?" satisfied it and
 * would have been answered as an exception detail on any object-scoped
 * screen.
 */
const ASKS_WHY_OPEN: IntentMatch = {
  any: ["why is this open", "explain this"],
  all: [
    ["why", "still open"],
    ["why", "flagged"],
    ["what", "wrong"],
  ],
};

/**
 * Deliberately narrow. A broader `["why", "open"]` group would also claim
 * "Why can a native match pass while the close stays open?" — which is a
 * procurement question with the word "open" at the end of it, and on any
 * object-scoped screen the old `/why.*(open|still|flagged)/` answered it as
 * that object's detail. Nothing is lost by the narrowing: a question this
 * spec declines still reaches the object through the fallback in
 * `answerQuestion`, which runs only after the intent table has produced
 * nothing.
 */

/** Every intent key, in table order — the population the harness walks. */
export const INTENT_KEYS: readonly string[] = INTENTS.map((i) => i.key);

/** Every phrase spec, exposed so one test can assert the boundary property. */
export const INTENT_MATCHES: readonly { key: string; match: IntentMatch }[] = [
  ...INTENTS.map((i) => ({ key: i.key, match: i.match })),
  { key: "exception-detail", match: ASKS_WHY_OPEN },
];

/**
 * Which intent a question reaches, before any tool runs.
 *
 * The ONE place the intent table is searched.
 *
 * Both `routeQuestion` (the harness) and `answerQuestion` (production) call
 * this. They used to run the same `INTENTS.find(...)` expression in two
 * places, under a comment claiming routeQuestion was "used by answerQuestion,
 * so the two cannot disagree about what the table says" — which was false
 * about the code. The two agreed only because the duplicated expressions
 * happened to be identical, and nothing made them stay identical: the harness
 * could have gone on validating a path production no longer took.
 *
 * `q` is already normalised by the caller.
 */
function selectIntent(q: string) {
  return INTENTS.find((i) => matchesQuestion(i.match, q));
}

/**
 * The rules' own conflict narratives, for the findings that HAVE a conflict.
 *
 * One helper for the three call sites that emit this channel, because the
 * defect was reachable through all three and a fix at one leaves the identical
 * sentences on the other two — the reopen pattern this repo has measured at
 * one in three. The sentence itself is the rule's and is never re-authored:
 * a finding is routinely a real contradiction WITH an absence clause welded
 * on (EXC-001, EXC-002), and rewriting rule prose here to split them would
 * put an authored sentence in the assistant's mouth.
 */
function conflictNarratives(
  views: readonly { exception: { finding: { reasonCodes: readonly string[]; whyFlagged: string } } }[],
): string[] {
  return views
    .filter((v) => namesContradiction(v.exception.finding.reasonCodes))
    .map((v) => v.exception.finding.whyFlagged);
}

/**
 * Exported for the routing harness AND used by `answerQuestion` — both
 * through `selectIntent`, so the two genuinely cannot disagree about what the
 * table says. It is not the whole story — `answerQuestion` falls back when an
 * intent matches and produces nothing — which is why the interaction records
 * the route that actually answered.
 */
export function routeQuestion(question: string): { key: string; mode: AiMode } | undefined {
  const intent = selectIntent(normalizeQuestion(question));
  return intent === undefined ? undefined : { key: intent.key, mode: intent.mode };
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
  const q = normalizeQuestion(question);

  /**
   * The object the question is about.
   *
   * The question's OWN id wins over the screen's scope. `??` had it the other
   * way, and short-circuits, so when a screen supplied a scope the id the
   * reader typed was never even evaluated: asking "Walk me through
   * KE-X1-9025's financial life." from KE-E2-1048's page returned
   * KE-E2-1048's carrying value, location and document chain, under a header
   * naming KE-E2-1048, with the question the reader typed rendered directly
   * above it — and no sentence anywhere saying a different unit had been
   * answered. A reader who names a record is asking about that record; the
   * screen is where they happen to be standing.
   *
   * Extraction still only PROPOSES a candidate. Whether the named object
   * exists is established by asking the tools, exactly as before — nothing
   * here asserts it does, which is the substitution that once made the
   * assistant deny the existence of objects it was looking at.
   *
   * `askedAbout` records that the reader named something other than the
   * screen's subject, so the answer can say which record it answered rather
   * than leaving the swap silent. Extraction runs on the NORMALIZED question:
   * the matcher folds typographic dashes and the extractor did not, so
   * `KE–E2–1048` pasted from a memo refused about a unit the product renders.
   */
  const namedException = extractExceptionId(q);
  const namedSerial = extractSerial(q);
  const scopedException = namedException ?? context.exceptionId;
  const scopedSerial = namedSerial ?? context.serial;
  /**
   * A scope is DISPLACED only when the reader did not name it themselves.
   *
   * `extractSerial` returns the first match, so "Compare KE-X1-9025 and
   * KE-E2-1048." from KE-E2-1048's page answered the first and then told the
   * reader the second was merely "what this screen is scoped to" — denying that
   * they had named a record they had just named. That is the substitution this
   * disclosure exists to stop, asserted in prose.
   *
   * Tested against the normalized question, which is where the ids were folded.
   */
  const namesInQuestion = (id: string): boolean => q.includes(id.toLowerCase());
  const displacedScope = [
    namedException !== undefined &&
    context.exceptionId !== undefined &&
    context.exceptionId !== namedException &&
    !namesInQuestion(context.exceptionId)
      ? context.exceptionId
      : undefined,
    namedSerial !== undefined &&
    context.serial !== undefined &&
    context.serial !== namedSerial &&
    !namesInQuestion(context.serial)
      ? context.serial
      : undefined,
  ].filter((id): id is string => id !== undefined);
  const scope: AiQuestionContext = {
    ...(scopedException !== undefined ? { exceptionId: scopedException } : {}),
    ...(scopedSerial !== undefined ? { serial: scopedSerial } : {}),
  };

  // An object-scoped "why is this open" outranks the general intents.
  const asksWhyOpen = matchesQuestion(ASKS_WHY_OPEN, q);
  // Through `selectIntent`, the same call the routing harness makes — see the
  // comment there. This was a second copy of the expression.
  const intent = selectIntent(q);

  /**
   * Where the ANSWERING route's calls begin.
   *
   * `session.anyDenied` is session-wide, and the engine may run an intent that
   * is denied, abandon it, and answer from the screen's object instead. Read
   * session-wide, the disclosure was attached to answers no denial touched: a
   * WAREHOUSE reader on a unit screen got "1 of the lookups behind this answer
   * was refused (get_pbc_status). It is not a complete answer." over a complete
   * financial-life answer that never called it.
   */
  let answeringCallsFrom = 0;
  let answer: AiMaterialAnswer | undefined;
  let mode: AiMode = "EXPLAIN";
  let route = "unrouted";

  answeringCallsFrom = session.calls.length;
  if (asksWhyOpen && scopedException !== undefined) {
    answer = answerException(session, scopedException);
    mode = "INVESTIGATE";
    route = "exception-detail";
  } else if (intent !== undefined) {
    answeringCallsFrom = session.calls.length;
    answer = intent.answer(session, scope);
    mode = intent.mode;
    route = intent.key;
  }
  // An intent that MATCHED but produced nothing must still fall back to the
  // scoped object — previously the two branches were mutually exclusive, so
  // "show me the history of this item" on an exception answered nothing.
  if (answer === undefined && scopedException !== undefined) {
    answeringCallsFrom = session.calls.length;
    answer = answerException(session, scopedException);
    mode = "INVESTIGATE";
    route = answer !== undefined ? "exception-detail" : route;
  }
  /**
   * The same fallback for a unit-scoped screen, which had none: on the
   * Financial Life screen every question that missed the table refused,
   * while the object the reader was looking at could have answered it.
   */
  if (answer === undefined && scopedSerial !== undefined) {
    // Marked like the other three routes. This one was missed, and it is the
    // route the denial defect's own example runs through: a WAREHOUSE reader
    // asks a PBC question from a unit screen, `get_pbc_status` is refused, and
    // the financial-life fallback answers from tools that were all permitted.
    // Without this line the disclosure still reached back across the abandoned
    // route and called that complete answer incomplete.
    answeringCallsFrom = session.calls.length;
    const lifeIntent = INTENTS.find((i) => i.key === "financial-life")!;
    answer = lifeIntent.answer(session, { serial: scopedSerial });
    if (answer !== undefined) {
      mode = "NAVIGATE";
      route = "unit-detail";
    }
  }

  const base = {
    question,
    mode,
    route,
    toolCalls: session.calls,
    narrationAvailable: false,
    versions: {
      toolsetVersion: TOOLSET_VERSION,
      answerEngineVersion: ANSWER_ENGINE_VERSION,
    },
  };

  /**
   * Draft prose runs the guard HERE, not inside the intent that produced it.
   *
   * The stage's claim was that Draft output is checked by the same quantity and
   * identifier guards as provider narration; what existed was a test walking
   * the frozen `MEMO_DRAFT_SECTIONS` constant, so the claim held for today's
   * wording and for no mechanism. Checking at the single point where a draft
   * becomes part of an interaction covers every intent that ever emits one,
   * including one that interpolates a live value.
   *
   * A failing section is dropped rather than corrected, and the reader is told
   * a section was withheld — the same shape as `withNarration`, which renders
   * the answer as though no provider had spoken. Silently rendering prose that
   * fails the figure rule would be the bypass arriving through the Draft door.
   */
  if (answer?.draft !== undefined) {
    const verdict = checkDraft(answer.draft);
    if (!verdict.ok) {
      const kept = answer.draft.filter(
        (section) => checkDraft([section]).ok,
      );
      answer = {
        ...answer,
        draft: kept,
        missingEvidence: [
          ...answer.missingEvidence,
          `${answer.draft.length - kept.length} suggested ${plural(answer.draft.length - kept.length, "section is", "sections are")} withheld: suggested wording may not state a figure or name a record, because a number inside prose is one no tool sourced. The figures are on the Close Memo screen, which seals them with the version.`,
        ],
      };
    }
  }

  /**
   * A denial is DISCLOSED. It is not prevented from reaching the answer.
   *
   * `session.run` returns `undefined` for NOT_FOUND and NOT_AUTHORIZED alike,
   * and three handlers treat that as permission to skip an existence check:
   * `if (hits !== undefined && !hits.some(...)) return undefined` passes when
   * the lookup was REFUSED, and a `.filter(v => v !== undefined)` quietly drops
   * a denied item from a list. So a reader was handed a confident answer with
   * no mention that part of it had been refused — the "restricted, not empty"
   * rule the tool layer states in its own header, lost one layer up.
   *
   * What this block adds is the sentence, not the guard: the answer's CONTENT
   * still absorbs the denial, and the three skipped existence checks are still
   * skipped. Making them distinguish NOT_FOUND from NOT_AUTHORIZED is the
   * remaining half, and it needs `session.run` to return the outcome.
   *
   * The reachable denial on the shipped role matrix is `get_pbc_status`, which
   * WAREHOUSE, SUPPLY_CHAIN and LEGAL do not hold `pbc.read` for. Denied
   * `get_exception` requires SYSTEM_ADMIN, who has no `close.read` and so
   * never reaches an answer at all — do not reason about this block from that
   * case.
   *
   * Disclosed here rather than in each handler, so a handler added later cannot
   * forget: this runs over whatever the engine actually produced.
   */
  const answeringDenials = [
    ...new Set(
      session.calls
        .slice(answeringCallsFrom)
        .filter((c) => c.outcome === "NOT_AUTHORIZED")
        .map((c) => c.tool),
    ),
  ].sort();
  if (answer !== undefined && answeringDenials.length > 0) {
    const denied = answeringDenials;
    answer = {
      ...answer,
      // A refusal is a restriction, so it goes in the restriction channel. Put
      // in `missingEvidence` it would be rendered as a required record the
      // close does not hold — which is the very confusion G04 is about, and
      // this disclosure exists to prevent one like it.
      scopeNotes: [
        ...(answer.scopeNotes ?? []),
        `${denied.length} of the lookups behind this answer ${plural(denied.length, "was", "were")} refused at your access scope (${denied.join(", ")}). What is reported above is what the permitted lookups returned; it is not a complete answer, and the refusal is a restriction on what you may read rather than a finding about the close.`,
      ],
    };
  }

  /**
   * The reader named a record other than the one the screen is scoped to, and
   * the answer is about the one they named. Said out loud, because the swap is
   * otherwise invisible: the drawer echoes the question above the answer and
   * prints no subject label of its own, so two records one keystroke apart
   * look identical.
   *
   * Stated as a fact about which SCOPE was set aside — not as a claim that
   * either record exists. Existence is the tools' answer, and an answer that
   * reached this line already has one.
   *
   * In `scopeNotes`, not appended to `managementConclusion`. That field renders
   * under MANAGEMENT CONCLUSION, which exists to carry the human judgement and
   * nothing else — a routing fact the software authored has no business inside
   * it, and it was landing in the same sentence as "No conclusion has been
   * recorded". The restriction channel is where engine statements about what
   * this answer covers belong; the denial disclosure above already uses it.
   */
  if (answer !== undefined && displacedScope.length > 0) {
    answer = {
      ...answer,
      scopeNotes: [
        ...(answer.scopeNotes ?? []),
        `This answer is about the record your question names, not ${displacedScope.join(" or ")}, which is what this screen is scoped to.`,
      ],
    };
  }

  // Normalised once, so a handler with no restriction to report writes nothing
  // and every consumer still receives an array.
  if (answer !== undefined) {
    return { ...base, answer: { ...answer, scopeNotes: answer.scopeNotes ?? [] } };
  }

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
  const scopedId = scopedException ?? scopedSerial;
  if (scopedId !== undefined) {
    const resolves =
      scopedException !== undefined
        ? session.run("get_exception", { exceptionId: scopedException }) !== undefined
        : (session.run<readonly { serial: string }[]>("search_serial", {
            serial: scopedSerial ?? "",
          }) ?? []).some((h) => h.serial === scopedSerial);
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
