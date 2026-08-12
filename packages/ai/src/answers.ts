import type {
  AdjustmentRegisterOut,
  ConsignmentHoldingsOut,
  CostClassificationOut,
  CostStandardsOut,
  CustodyBreakdownOut,
  DispositionsOut,
  EoMethodologyOut,
  GlAccountReconciliationOut,
  MemoOut,
  MethodologyOut,
  ProcurementPopulationsOut,
} from "@icg/services";
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
        status:
          memo.issued !== null
            ? `${memo.issued.label} issued; the close position is the one below`
            : memo.workingDraft !== null
              ? "A working draft exists; nothing has been issued"
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
        // Scope, said as scope. An auditor sees issued versions only, and a
        // shorter history must never read as a shorter history of work.
        missingEvidence:
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
        ],
        conflictingEvidence: [],
        // What the reproducibility check does NOT cover, from the exported
        // list the check itself reads — so this can never claim coverage the
        // replay does not have.
        missingEvidence: m.replayExclusions.map(
          (x) => `${x} is excluded from the reproducibility check — it is working state, not close output.`,
        ),
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
              text: `${r.itemReceiptNumber} · ${count(r.quantity)} units · ${r.daysOutstanding} days outstanding${r.vendorBillNumber !== undefined ? ` · billed ${r.billDate} on ${r.vendorBillNumber}` : ""}`,
              source: "get_procurement_populations",
            }),
          ),
        ],
        conflictingEvidence: [],
        missingEvidence: [],
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
              text: `${r.vendorBillNumber} · ${count(r.quantity)} units · close match ${r.closeMatchStatus}${r.recordedReceiptDate !== undefined ? ` · received ${r.recordedReceiptDate}` : ""}`,
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
        missingEvidence:
          git.inboundAgrees === null
            ? [
                `The two sides cannot be compared at your access scope: ${p.withheldOrderCount} ${plural(p.withheldOrderCount, "order is", "orders are")} withheld from the document side while the book side is not scoped.`,
              ]
            : [],
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
        ],
        conflictingEvidence: [],
        missingEvidence: [],
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
        "relieved",
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
        "vendor owned",
        "vendor-owned",
        "owned by somebody else",
        "owned by someone else",
        "not ours",
        "off book",
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
        ["third party", "confirmed"],
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
        "third party",
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
        "slow moving",
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
        "write down",
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
        "three way match",
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
        if (!view.open) return undefined;
        const unmet = view.exception.finding.evidenceRequirements.filter(
          (r) => r.required && !r.satisfied,
        );
        if (unmet.length === 0) return undefined;
        return {
          status: `${unmet.length} required ${plural(unmet.length, "item")} of evidence outstanding on ${view.exception.id}`,
          knownFacts: unmet.map((r) => ({
            label: `${view.exception.id} — ${r.description}`,
            text: "Not in evidence",
            source: "get_exception" as const,
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
      const exceptions = s.run<readonly ExceptionResult[]>("list_open_exceptions");
      if (exceptions === undefined) return undefined;
      const gaps = exceptions.flatMap((e) =>
        e.exception.finding.evidenceRequirements
          .filter((r) => r.required && !r.satisfied)
          .map((r) => ({ id: e.exception.id, description: r.description })),
      );
      if (gaps.length === 0) return undefined;
      return {
        status: `${gaps.length} required ${plural(gaps.length, "item")} of evidence outstanding`,
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
    answer: (s) => {
      const all = s.run<readonly ExceptionResult[]>("list_exceptions");
      if (all === undefined) return undefined;
      const resolved = all.filter((e) => !e.open);
      if (resolved.length === 0) return undefined;
      return {
        status: `${resolved.length} of ${all.length} exceptions carry a recorded resolution`,
        knownFacts: resolved.map(
          (e): AiFigure => ({
            label: `${e.exception.id} — ${e.exception.finding.title}`,
            text: e.exception.status,
            source: "list_exceptions",
          }),
        ),
        conflictingEvidence: [],
        missingEvidence: [],
        assertions: [],
        managementConclusion:
          "A resolution is a recorded event, not an absence of findings: the exception keeps its history and the evidence that closed it travels with the item.",
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
          conflictingEvidence: views.filter((v) => v.open).map((v) => v.exception.finding.whyFlagged),
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
      return {
        status: `${open.length} open ${plural(open.length, "item")} carry evidence that conflicts`,
        knownFacts: open.map(
          (e): AiFigure => ({
            label: `${e.exception.id} — ${e.exception.finding.title}`,
            text: e.exception.status,
            source: "list_open_exceptions",
          }),
        ),
        conflictingEvidence: open.map((e) => e.exception.finding.whyFlagged),
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
        status: `${count(c.firstPassMatchedUnits)} of ${count(c.populationUnits)} units matched on the first pass`,
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
 * Exported for the routing harness AND used by `answerQuestion`, so the two
 * cannot disagree about what the table says. It is not the whole story —
 * `answerQuestion` falls back when an intent matches and produces nothing —
 * which is why the interaction records the route that actually answered.
 */
export function routeQuestion(question: string): { key: string; mode: AiMode } | undefined {
  const q = normalizeQuestion(question);
  const intent = INTENTS.find((i) => matchesQuestion(i.match, q));
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
   * The object the question is about: the screen's scope, or an id the
   * question itself names. Extraction only proposes a candidate — whether it
   * exists is still established by asking the tools.
   */
  const scopedException = context.exceptionId ?? extractExceptionId(question);
  const scopedSerial = context.serial ?? extractSerial(question);
  const scope: AiQuestionContext = {
    ...(scopedException !== undefined ? { exceptionId: scopedException } : {}),
    ...(scopedSerial !== undefined ? { serial: scopedSerial } : {}),
  };

  // An object-scoped "why is this open" outranks the general intents.
  const asksWhyOpen = matchesQuestion(ASKS_WHY_OPEN, q);
  const intent = INTENTS.find((i) => matchesQuestion(i.match, q));

  let answer: AiMaterialAnswer | undefined;
  let mode: AiMode = "EXPLAIN";
  let route = "unrouted";

  if (asksWhyOpen && scopedException !== undefined) {
    answer = answerException(session, scopedException);
    mode = "INVESTIGATE";
    route = "exception-detail";
  } else if (intent !== undefined) {
    answer = intent.answer(session, scope);
    mode = intent.mode;
    route = intent.key;
  }
  // An intent that MATCHED but produced nothing must still fall back to the
  // scoped object — previously the two branches were mutually exclusive, so
  // "show me the history of this item" on an exception answered nothing.
  if (answer === undefined && scopedException !== undefined) {
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
