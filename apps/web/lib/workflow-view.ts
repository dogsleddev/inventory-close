import type { ExceptionStatus, RiskLevel } from "@icg/domain";
import { isResolvedStatus } from "@icg/domain";

/**
 * Presentation vocabulary for workflow state (stage 05). This module maps
 * canonical enum values to the design system's labels, glyphs, and variants,
 * and routes each status to its demo owner/action party (docs/08's
 * owner/reviewer attribute — deliberately expressed HERE as presentation
 * routing, because the deterministic core carries no owner model yet).
 *
 * Nothing in this file computes an accounting result: statuses, risks, and
 * exposure all arrive from @icg/services and pass through unchanged.
 */

export interface StatusView {
  readonly label: string;
  readonly glyph: string;
  readonly variant: "neutral" | "waiting" | "review" | "resolved" | "proposed";
}

const STATUS_VIEW: Readonly<Record<ExceptionStatus, StatusView>> = {
  WAITING_ON_CONTRACT: { label: "Waiting on Contract", glyph: "⋯", variant: "waiting" },
  WAITING_ON_THIRD_PARTY: { label: "Waiting on Third Party", glyph: "⋯", variant: "waiting" },
  ACCOUNTING_REVIEW: { label: "Accounting Review", glyph: "◆", variant: "review" },
  RECOUNT_REQUIRED: { label: "Recount Required", glyph: "◆", variant: "review" },
  CONTROLLER_REVIEW: { label: "Controller Review", glyph: "◆", variant: "review" },
  RESOLVED_NO_ADJUSTMENT: { label: "Resolved — No Adjustment", glyph: "✓", variant: "resolved" },
  RESOLVED_ADJUSTMENT_PROPOSED: {
    label: "Resolved — Adjustment Proposed",
    glyph: "✓",
    variant: "proposed",
  },
};

export function statusView(status: ExceptionStatus): StatusView {
  return STATUS_VIEW[status];
}

export interface RiskView {
  readonly label: string;
  readonly glyph: string;
  readonly variant: "critical" | "high" | "medium" | "low";
}

const RISK_VIEW: Readonly<Record<RiskLevel, RiskView>> = {
  CRITICAL: { label: "Critical", glyph: "◆", variant: "critical" },
  HIGH: { label: "High", glyph: "●", variant: "high" },
  MEDIUM: { label: "Medium", glyph: "◐", variant: "medium" },
  LOW: { label: "Low", glyph: "○", variant: "low" },
};

export function riskView(risk: RiskLevel): RiskView {
  return RISK_VIEW[risk];
}

/**
 * Management conclusion derives from workflow status: open statuses have no
 * conclusion yet ("Open"); resolved statuses carry their resolution. The
 * software never records a conclusion by itself.
 */
export function conclusionLabel(status: ExceptionStatus): string {
  if (!isResolvedStatus(status)) return "Open";
  return STATUS_VIEW[status].label;
}

/**
 * Demo workflow routing: who is accountable for the item and which party
 * the next action sits with. WAITING_ON_CONTRACT stays owned by the
 * Controller while the action sits with Legal (the design-03 pattern).
 */
export function ownerForStatus(status: ExceptionStatus): {
  owner: string;
  actionParty: string;
} {
  switch (status) {
    case "WAITING_ON_CONTRACT":
      return { owner: "Controller", actionParty: "Legal" };
    case "WAITING_ON_THIRD_PARTY":
      return { owner: "Supply Chain", actionParty: "Supply Chain" };
    case "ACCOUNTING_REVIEW":
      return { owner: "Accounting Manager", actionParty: "Accounting Manager" };
    case "RECOUNT_REQUIRED":
      return { owner: "Warehouse", actionParty: "Warehouse" };
    case "CONTROLLER_REVIEW":
      return { owner: "Controller", actionParty: "Controller" };
    case "RESOLVED_NO_ADJUSTMENT":
    case "RESOLVED_ADJUSTMENT_PROPOSED":
      return { owner: "Accounting Manager", actionParty: "Accounting Manager" };
  }
}

/**
 * Next action text derives from the finding's own unmet required evidence
 * when there is any (the data says what is missing); otherwise from the
 * workflow status. It is a routing hint, never an accounting judgment.
 */
export function nextActionText(
  status: ExceptionStatus,
  unmetRequired: readonly string[],
): string {
  if (isResolvedStatus(status)) return "None — resolved; history retained";
  if (unmetRequired.length > 0) {
    return `Obtain: ${unmetRequired.join("; ")}`;
  }
  switch (status) {
    case "ACCOUNTING_REVIEW":
      return "Complete accounting review and record a management conclusion";
    case "CONTROLLER_REVIEW":
      return "Controller to review support and record a management conclusion";
    case "RECOUNT_REQUIRED":
      return "Complete the recount and reconcile the variance";
    default:
      return "Record a management conclusion";
  }
}

/** PBC status → capsule view (design-01 status system). */
export function pbcStatusView(status: string): StatusView {
  switch (status) {
    case "PROVIDED":
      return { label: "Provided", glyph: "■", variant: "resolved" };
    case "READY":
      return { label: "Ready", glyph: "✓", variant: "resolved" };
    case "PREPARING":
      return { label: "Preparing", glyph: "⋯", variant: "review" };
    case "FOLLOW_UP_REQUESTED":
      return { label: "Follow-Up Requested", glyph: "!", variant: "waiting" };
    case "REFRESH_REQUIRED":
      return { label: "Refresh Required", glyph: "!", variant: "waiting" };
    default:
      return { label: "Not Started", glyph: "○", variant: "neutral" };
  }
}

/**
 * Rule result → the words for it (Stage G).
 *
 * Nothing owned this vocabulary before: every surface that showed a match
 * result showed the canonical token. It lives here, with the other display
 * vocabularies, so the assistant and any screen that adopts it cannot come to
 * word one result two ways.
 */
export const RULE_RESULT_LABELS: Readonly<Record<string, string>> = {
  PASS: "Pass",
  FAIL: "Fail",
  REVIEW_REQUIRED: "Review required",
  INCOMPLETE: "Incomplete",
  NOT_APPLICABLE: "Not applicable",
};

/** Where the aging clock starts, in words (Stage G). */
export const AGING_BASIS_LABELS: Readonly<Record<string, string>> = {
  LAST_MOVEMENT: "last movement",
  ACQUISITION: "acquisition",
};

/** Source health → chip view (● healthy · ◐ partial · ◔ stale · ✕ failed). */
export function sourceHealthView(status: string): {
  glyph: string;
  label: string;
  variant: "healthy" | "partial" | "stale" | "failed";
} {
  switch (status) {
    case "PARTIAL":
      return { glyph: "◐", label: "PARTIAL", variant: "partial" };
    case "STALE":
      return { glyph: "◔", label: "STALE", variant: "stale" };
    case "FAILED":
      return { glyph: "✕", label: "FAILED", variant: "failed" };
    default:
      return { glyph: "●", label: "HEALTHY", variant: "healthy" };
  }
}
