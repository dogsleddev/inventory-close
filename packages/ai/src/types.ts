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

/** The material-answer contract (docs/09:7), in its stated order. */
export interface AiMaterialAnswer {
  readonly status: string;
  readonly knownFacts: readonly AiFigure[];
  readonly conflictingEvidence: readonly string[];
  readonly missingEvidence: readonly string[];
  readonly assertions: readonly string[];
  readonly exposure?: AiFigure | undefined;
  readonly managementConclusion: string;
  readonly nextAction: string;
  readonly citations: readonly AiCitation[];
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

export const TOOLSET_VERSION = "ASK-GAURD-TOOLS-v1.0.0";
export const ANSWER_ENGINE_VERSION = "ASK-GAURD-ANSWERS-v1.0.0";
