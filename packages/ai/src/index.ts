/**
 * @icg/ai — provider-independent AI adapter (Stage 08).
 *
 * Constraints (docs/09): Ask Gaurd operates through approved typed tools over
 * the same application services as the UI. Allowed modes: Explain,
 * Investigate, Summarize, Draft, Navigate — no Decide. Structured application
 * state is authoritative; AI output is never evidence or approval; numeric
 * values in material answers must match tool results exactly; if AI fails,
 * deterministic fallback answers still work. No provider SDK is imported
 * here — a concrete provider binding is injected at the application edge.
 */

/** Minimal provider-independent chat contract; expanded in Stage 08. */
export interface AiMessage {
  readonly role: "system" | "user" | "assistant" | "tool";
  readonly content: string;
}

export interface AiProviderAdapter {
  readonly providerName: string;
  readonly modelVersion: string;
  complete(messages: readonly AiMessage[]): Promise<AiMessage>;
}

export * from "./types.js";
export { createToolSession, runTool } from "./tools.js";
export type { AiToolContext, AiToolResult, AiToolSession } from "./tools.js";
export { answerQuestion } from "./answers.js";
export type { AiQuestionContext } from "./answers.js";
export {
  checkNarration,
  describeAvailability,
  fenceUntrusted,
  withNarration,
} from "./guardrails.js";
export type {
  AiAvailability,
  GuardrailVerdict,
  GuardrailViolation,
} from "./guardrails.js";
