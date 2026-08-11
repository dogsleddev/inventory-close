import { hashObject } from "@icg/data";
import { authorize, hasPermission } from "@icg/permissions";
import { effectiveClose, effectiveOpenExceptionIds } from "./effective.js";
import type { ServiceContext } from "./queries.js";
import type { MemoVersion, Workspace } from "./workspace.js";

/**
 * The management close memo (COMPLETION_PLAN Stage F, decision D8).
 *
 * The twentieth question the completion brief asks is whether a defensible
 * inventory close memo can be produced *from controlled state*. That is a
 * narrower question than whether somebody can type one: a memo is defensible
 * when every figure in it came from the close, the close position it was
 * sealed against is recorded, and a reader can tell whether that position has
 * moved since.
 *
 * So this module does two things and refuses a third:
 *
 * 1. **It supplies the figures.** `getMemo` returns the close position the
 *    memo speaks about, read from the same effective state every screen
 *    shows. The memo body never carries a figure the writer typed — the
 *    figures travel beside it, from here.
 * 2. **It seals.** An issued version carries a content hash and the hash of
 *    the close state at the moment of issue. A later divergence is then
 *    visible (`positionMoved`) rather than silent.
 * 3. **It is never part of the close.** The memo is not PBC #22. It lives in
 *    workspace working state, it is excluded from replay equivalence, and no
 *    rule, blocker, readiness input or locked figure reads it. Writing a memo
 *    must not change how ready the close is.
 *
 * Auditor scope: an auditor sees ISSUED versions only, and the count of what
 * was withheld travels with the result. An unissued draft is internal
 * management working paper — the same rule the PBC package already applies to
 * unsealed workpaper drafts — and an omission nobody is told about is the
 * defect that rule exists to prevent.
 */

/** Write the working draft. Preparation, not issue. */
export const MEMO_DRAFT_PERMISSION = "memo.draft" as const;
/** Issue a version. A management act, deliberately narrower than drafting. */
export const MEMO_ISSUE_PERMISSION = "memo.issue" as const;

/** The close position a memo speaks about, as it stands now. */
export interface MemoPositionOut {
  readonly asOf: string;
  readonly bookUnits: number;
  readonly subledgerCents: number;
  readonly grossGlCents: number;
  readonly differenceCents: number;
  readonly reconcilingItemCount: number;
  readonly unexplainedCents: number;
  readonly exceptionCount: number;
  readonly openExceptionCount: number;
  readonly blockerCount: number;
  readonly blockerExposureCents: number;
  readonly readinessBps: number;
  readonly pbcReady: number;
  readonly pbcTotal: number;
  readonly periodState: string;
}

export interface MemoVersionOut {
  readonly id: string;
  readonly label: string;
  readonly version: number | null;
  readonly state: MemoVersion["state"];
  readonly title: string;
  readonly body: string;
  readonly byUserId: string;
  readonly at: string;
  readonly contentHash: string | null;
  readonly closeStateHash: string | null;
  readonly sealed: boolean;
  readonly editable: boolean;
  readonly supersededByVersion: number | null;
}

export interface MemoOut {
  /** The whole visible history, newest first. */
  readonly versions: readonly MemoVersionOut[];
  /** The one editable object, when the viewer may see it. */
  readonly workingDraft: MemoVersionOut | null;
  /** The most recent issued version, if any. */
  readonly issued: MemoVersionOut | null;
  readonly position: MemoPositionOut;
  /**
   * Whether the close has moved since the latest issued version was sealed.
   * Null when nothing has been issued — "not moved" would be a claim about a
   * comparison that never happened.
   */
  readonly positionMoved: boolean | null;
  /** Drafts withheld from this viewer. Zero for anyone who may see them. */
  readonly withheldDraftCount: number;
  readonly canDraft: boolean;
  readonly canIssue: boolean;
  /**
   * Stated on every read: the memo is not part of the close it describes.
   */
  readonly notPartOfClose: string;
}

/**
 * The close state a memo is sealed against.
 *
 * The same idea as `pbcDependencyHash` — a hash over the slices the artifact
 * speaks about — but over the memo's own figures, because those are what a
 * reader would check it against. It is derived, never authored, so it
 * reproduces exactly.
 */
function closeStateHashFor(position: MemoPositionOut): string {
  return hashObject(position);
}

function label(version: MemoVersion): string {
  if (version.version !== undefined) return `Version ${version.version}`;
  return "Working draft";
}

function project(version: MemoVersion): MemoVersionOut {
  return {
    id: version.id,
    label: label(version),
    version: version.version ?? null,
    state: version.state,
    title: version.title,
    body: version.body,
    byUserId: version.byUserId,
    at: version.at,
    contentHash: version.contentHash ?? null,
    closeStateHash: version.closeStateHash ?? null,
    sealed: version.sealed,
    editable: version.editable,
    supersededByVersion: version.supersededByVersion ?? null,
  };
}

/** The close position, read from live state rather than from the memo. */
export function memoPosition(ws: Workspace): MemoPositionOut {
  const live = effectiveClose(ws);
  const recon = ws.close.reconciliation;
  return {
    asOf: recon.asOf,
    bookUnits: ws.dataset.inventoryUnits.length,
    subledgerCents: recon.subledgerCents,
    grossGlCents: recon.grossGlCents,
    differenceCents: recon.differenceCents,
    reconcilingItemCount: recon.items.length,
    unexplainedCents: recon.unexplainedCents,
    exceptionCount: ws.close.exceptions.length,
    // The live open count, from the same overlay the blocker count uses.
    openExceptionCount: effectiveOpenExceptionIds(ws).length,
    blockerCount: live.blockerCount,
    blockerExposureCents: live.blockerExposureCents,
    readinessBps: live.readinessBps,
    pbcReady: ws.close.aggregates.pbcReady,
    pbcTotal: ws.close.aggregates.pbcTotal,
    periodState: ws.period.state,
  };
}

/** The working draft, if one exists. There is at most one, by construction. */
export function workingDraftOf(ws: Workspace): MemoVersion | undefined {
  return ws.memoVersions.find((v) => v.editable);
}

/** The newest issued version, if one exists. */
export function issuedVersionOf(ws: Workspace): MemoVersion | undefined {
  return [...ws.memoVersions].reverse().find((v) => v.state === "ISSUED");
}

export function getMemo(ws: Workspace, ctx: ServiceContext): MemoOut {
  authorize(ctx.user, "close.read");

  // An auditor reads issued versions only. Drafting and issue are management
  // acts; an internal draft is not audit support, and the count says so
  // rather than the file simply being shorter.
  const auditor = ctx.user.roles.includes("AUDITOR_READ_ONLY");
  const visible = auditor ? ws.memoVersions.filter((v) => v.sealed) : ws.memoVersions;
  const withheldDraftCount = ws.memoVersions.length - visible.length;

  const position = memoPosition(ws);
  const issued = issuedVersionOf(ws);
  const draft = auditor ? undefined : workingDraftOf(ws);

  return {
    versions: [...visible].reverse().map(project),
    workingDraft: draft === undefined ? null : project(draft),
    issued: issued === undefined ? null : project(issued),
    position,
    // Null rather than false when nothing has been issued: "the position has
    // not moved" is a claim about a comparison, and there is nothing to
    // compare against until a version has been sealed.
    positionMoved:
      issued === undefined || issued.closeStateHash === undefined
        ? null
        : issued.closeStateHash !== closeStateHashFor(position),
    withheldDraftCount,
    // Offer and allow read the SAME permission keys the commands authorize
    // against, so a control is never shown to someone the service refuses.
    canDraft: hasPermission(ctx.user, MEMO_DRAFT_PERMISSION),
    canIssue: hasPermission(ctx.user, MEMO_ISSUE_PERMISSION),
    notPartOfClose:
      "The memo reports on the close; it is not one of the close's own artifacts. It is not an audit request, it is excluded from the reproducibility check, and nothing in it feeds a rule result, a blocker or the readiness figure.",
  };
}

/** Exported for the commands, which do the sealing. */
export { closeStateHashFor };
