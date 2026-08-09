import type { Cents } from "../money.js";
import type {
  Assertion,
  ExceptionStatus,
  RiskLevel,
} from "../enums.js";
import type { EvidenceId, ExceptionId, RuleId, UserId } from "../identifiers.js";
import type { EvidenceRequirement } from "./evidence.js";

/**
 * An accounting exception is generated from source facts by deterministic
 * rules — never manually seeded as an authoritative outcome (docs/08).
 */
export interface AccountingException {
  readonly id: ExceptionId;
  readonly title: string;
  readonly ruleId: RuleId;
  readonly ruleVersion: string;
  readonly status: ExceptionStatus;
  readonly risk: RiskLevel;
  readonly assertions: readonly Assertion[];
  readonly exposure: Cents;
  readonly blocker: boolean;
  readonly reasonCodes: readonly string[];
  readonly whyFlagged: string;
  readonly evidenceRequirements: readonly EvidenceRequirement[];
  readonly evidenceIds: readonly EvidenceId[];
  readonly owner?: UserId;
  readonly reviewer?: UserId;
  readonly relatedObjectRefs: readonly string[];
}

/** A condition that blocks period sign-off until cleared. */
export interface BlockingCondition {
  readonly exceptionId: ExceptionId;
  readonly description: string;
  readonly exposure: Cents;
}
