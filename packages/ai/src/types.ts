/**
 * Ask Gaurd's own vocabulary (stage 08).
 *
 * These types live in @icg/ai rather than @icg/domain deliberately. The
 * deterministic core's identity is that the close works if AI disappears;
 * putting an AI interaction record at the bottom of the dependency graph
 * would contradict that, and nothing in domain, rules or services needs
 * them. docs/06 lists AiInteraction/ToolCall/Citation as objects to type —
 * this is where they are typed. They are `Ai`-prefixed because @icg/domain
 * re-exports with `export *`, and `Session`/`Citation`/`Draft` are too
 * generic to enter a shared barrel (`Draft` already exists in @icg/services).
 */

/** docs/09: "Allowed: Explain, Investigate, Summarize, Draft, Navigate." */
export const AI_MODES = [
  "EXPLAIN",
  "INVESTIGATE",
  "SUMMARIZE",
  "DRAFT",
  "NAVIGATE",
] as const;
export type AiMode = (typeof AI_MODES)[number];

/**
 * "No Decide mode" (docs/09:5). Named so the exclusion is greppable and
 * testable rather than merely absent.
 */
export const AI_FORBIDDEN_MODE = "DECIDE";

/** The approved tool set (prompts/code/08). Nothing else may reach data. */
export const AI_TOOL_NAMES = [
  "get_close_readiness",
  "get_blocking_conditions",
  "list_open_exceptions",
  /**
   * The whole population, open and resolved (Stage G). `list_open_exceptions`
   * cannot answer "which exceptions are resolved?" — and an answer built by
   * subtracting it from a count would be describing a set it never read.
   */
  "list_exceptions",
  "get_exception",
  "get_evidence_timeline",
  "get_financial_lifecycle",
  "get_cycle_count_history",
  "get_reconciliation_status",
  "get_procurement_match",
  "get_commercial_chain",
  "get_pbc_status",
  "get_source_health",
  "get_third_party_holdings",
  "get_valuation_status",
  "get_proposed_adjustments",
  /** Establishes whether a serial exists at all, before anything is said about it. */
  "search_serial",
  /**
   * Stage G. Every one of these reaches a projection Stages B–F already
   * shipped and the screens already read — Ask Gaurd gained no new view of
   * the close here, only the ability to answer from the views that existed.
   * None of them is a rule, and none derives an exception, a blocker or a
   * readiness input.
   */
  "get_gl_account_reconciliation",
  "get_procurement_populations",
  "get_cost_standards",
  "get_cost_classification",
  "get_custody_breakdown",
  "get_consignment_holdings",
  "get_dispositions",
  "get_eo_methodology",
  "get_methodology",
  "get_memo",
  /**
   * The close as it stands NOW, and one exception's working state.
   *
   * Every tool above reads `ws.close` — the baseline the rules derived and
   * froze. That is the reproducible artifact and it must stay readable, but it
   * was the ONLY thing Ask Gaurd could read, so the drawer answered from a
   * snapshot while the screens beside it answered from the session. A
   * Controller who had concluded all seven blockers was told "Sign-off is
   * blocked", "Open blockers = 7" and "$198,950" on the same screen whose gate
   * read "Every blocker has a management conclusion", and `answerException`
   * reported "No conclusion has been recorded" beside the conclusion they had
   * just recorded — because `get_exception` carries no conclusion field, so
   * the handler could not have looked.
   *
   * Both projections already existed on the query service and both are what
   * the screens read. Adding them here gave Ask Gaurd no new view of the
   * close; it gave it the view the rest of the product already had.
   */
  "get_effective_close",
  "get_exception_workflow",
  /**
   * The live twin of `list_exceptions`. `list_exceptions` reports `open` off
   * the frozen rule status, so an intent counting resolutions from it counts
   * what the RULES resolved and words it as what management has — "8 of 15
   * exceptions carry a recorded resolution", unchanged through seven recorded
   * resolutions, listing eight items none of which was one of them.
   */
  "get_effective_exceptions",
  /**
   * What THIS reader may DO — from the same permission keys the commands
   * authorize against. An answer that prescribes an act is making a claim about
   * the reader's page, and the blockers intent was telling eight of ten roles to
   * record a sign-off the Overview beside it refuses them in words.
   */
  "get_demo_capabilities",
] as const;
export type AiToolName = (typeof AI_TOOL_NAMES)[number];

/** One executed tool call, recorded for docs/09:22 logging. */
export interface AiToolCall {
  readonly tool: AiToolName;
  readonly args: Readonly<Record<string, string>>;
  /** OK, or the reason no data came back. Never silently empty. */
  readonly outcome: "OK" | "NOT_AUTHORIZED" | "NOT_FOUND";
  /** Evidence ids this call surfaced — the only ids a citation may use. */
  readonly evidenceIds: readonly string[];
}

/**
 * A citation resolves to a record the tools actually returned. `label` is
 * for display; `evidenceId`/`href` are how the reader reaches the record.
 */
export interface AiCitation {
  readonly label: string;
  readonly evidenceId?: string | undefined;
  readonly href?: string | undefined;
  /** MISSING marks an absence that is itself evidence, never a gap in the answer. */
  readonly state: "PRESENT" | "MISSING";
}

/**
 * A single figure in an answer. Values stay STRUCTURED — integer cents or
 * basis points — so the web layer formats them and @icg/ai never duplicates
 * apps/web's formatters. docs/09: "Numeric values in material status answers
 * must match tool results exactly"; keeping the raw value is how that is
 * enforced rather than asserted.
 */
export interface AiFigure {
  readonly label: string;
  readonly valueCents?: number | undefined;
  readonly valueBps?: number | undefined;
  readonly count?: number | undefined;
  /** Non-numeric values (a status enum, a serial, a date) as returned. */
  readonly text?: string | undefined;
  /** The tool this figure came from — makes drift auditable. */
  readonly source: AiToolName;
}

/**
 * One section of suggested wording (Draft mode, Stage G).
 *
 * `Draft` has been in the drawer's CAN list since stage 08 with nothing
 * behind it (COMPLETION_PLAN §3.9). What it may produce is WORDING and
 * nothing else: `body` may not carry a figure or a record identifier, for the
 * same reason narration may not — deciding whether a number in prose is the
 * right number is not reliably decidable, and the close memo screen already
 * assembles every figure it needs from `memoPosition`. The check is the same
 * function the guardrails apply to narration, not a second copy of it.
 */
export interface AiDraftSection {
  readonly heading: string;
  readonly body: string;
}

/** The material-answer contract (docs/09:7), in its stated order. */
export interface AiMaterialAnswer {
  readonly status: string;
  readonly knownFacts: readonly AiFigure[];
  readonly conflictingEvidence: readonly string[];
  /**
   * Records the close ASKED FOR and does not hold. A finding about the
   * evidence file, and the reader is expected to act on it.
   */
  readonly missingEvidence: readonly string[];
  /**
   * Records that EXIST and this reader may not read.
   *
   * A separate channel because it is a separate fact, and the drawer renders
   * the two differently. `missingEvidence` was carrying both: an auditor asking
   * about procurement read "1 source document is outside your access scope"
   * under a heading reading MISSING EVIDENCE, in ember, each entry bulleted
   * with "○", suffixed for assistive tech with " — missing, required", and
   * counted into "2 required items of evidence reported missing." Nothing was
   * missing. The documents exist, the close holds them, and the engine's own
   * sentence said the reader may not read them.
   *
   * That is the scope-as-a-finding trap at the rendering layer — the same one
   * `procurement-view.ts` closed at the data layer — and rewording the
   * sentences would not have closed it, because the heading, the glyph, the
   * colour, the screen-reader suffix and the count all say "missing"
   * independently of the words.
   *
   * Optional on the handler and normalised to `[]` by `answerQuestion`, so the
   * thirty-odd intents that have no restriction to report say nothing rather
   * than each writing an empty array. `routing-identity.test.ts` asserts over
   * every intent and every role that no restriction sentence is left in
   * `missingEvidence`, which is the check that keeps the two channels apart —
   * a field a handler may omit needs one.
   */
  readonly scopeNotes?: readonly string[];
  readonly assertions: readonly string[];
  readonly exposure?: AiFigure | undefined;
  readonly managementConclusion: string;
  readonly nextAction: string;
  readonly citations: readonly AiCitation[];
  /** Suggested wording, when the question asked for a draft. Never figures. */
  readonly draft?: readonly AiDraftSection[] | undefined;
}

/** Why an answer refused, when it did. */
export type AiRefusalReason =
  | "NOT_AUTHORIZED"
  | "OUT_OF_SCOPE"
  | "REQUIRES_HUMAN_JUDGMENT"
  | "NO_SUCH_OBJECT";

/**
 * The complete result of asking. `answer` is derived from tool results with
 * no model involved; `narration` is the only field a provider may write, and
 * it is excluded from replay equivalence (CANONICAL_SPEC §15).
 */
export interface AiInteraction {
  readonly question: string;
  readonly mode: AiMode;
  /**
   * WHICH handler answered — the intent key, `exception-detail`,
   * `unit-detail`, or `unrouted` (Stage G).
   *
   * Recorded rather than re-derived. The routing harness has to assert that a
   * shipped chip reaches the handler it was written for, and a test that
   * re-runs the matcher to predict the route would be asserting a proxy: the
   * fallbacks in `answerQuestion` mean a question can match one intent and be
   * answered by another. This is the measurement.
   */
  readonly route: string;
  readonly answer?: AiMaterialAnswer | undefined;
  readonly refusal?:
    | { readonly reason: AiRefusalReason; readonly message: string; readonly stillVisible: readonly string[] }
    | undefined;
  readonly toolCalls: readonly AiToolCall[];
  /** Provider prose. Absent when the provider is disabled or failed. */
  readonly narration?: string | undefined;
  readonly narrationAvailable: boolean;
  /** docs/09:22 — logged for saved material work. */
  readonly versions: {
    readonly toolsetVersion: string;
    readonly answerEngineVersion: string;
    readonly providerName?: string | undefined;
    readonly modelVersion?: string | undefined;
  };
}

/**
 * v1.1.0: Stage G added ten tools over the Stage B–F projections, and the
 * answer engine moved from unanchored regexes to the phrase matcher in
 * `matching.ts`. Both are recorded on every interaction, so an answer
 * captured before the change is legible as one.
 */
export const TOOLSET_VERSION = "ASK-GAURD-TOOLS-v1.1.0";
export const ANSWER_ENGINE_VERSION = "ASK-GAURD-ANSWERS-v1.1.0";
