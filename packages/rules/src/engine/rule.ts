import type { ClosePolicy } from "../policy.js";
import type { RuleOutput } from "./findings.js";
import type { CloseIndex, CloseInput } from "./input.js";

export interface RuleContext {
  readonly input: CloseInput;
  readonly index: CloseIndex;
  readonly policy: ClosePolicy;
  /** Balance-sheet date, lexicographically comparable ("2026-12-31"). */
  readonly asOf: string;
}

/**
 * A versioned pure function (docs/16). Same context, same output — no
 * clocks, no randomness, no I/O. Historical runs retain their versions.
 */
export interface Rule {
  readonly id: string;
  readonly version: string;
  readonly controlDomain: string;
  evaluate(ctx: RuleContext): RuleOutput;
}
