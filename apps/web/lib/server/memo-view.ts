import type { DemoUser } from "@icg/data";
import { getMemo, type MemoPositionOut, type MemoVersionOut } from "@icg/services";
import {
  formatBpsExact,
  formatCents,
  formatDate,
  formatInstant,
  plural,
  shortHash,
} from "../format";
import type { CloseMemoData, MemoVersionRowView, ProcurementStat } from "../view-model";
import { attempt } from "./data";
import { getWorkspace, makeContext, roleLabel, userById } from "./workspace";

/**
 * The management close memo (COMPLETION_PLAN Stage F, decision D8).
 *
 * The brief's twentieth question is whether a defensible memo can be produced
 * *from controlled state*. The answer this screen gives is: the prose is
 * management's, and every figure beside it is the close's.
 *
 * That split is the whole design. The editor holds a title and a body and
 * nothing else; the position panel beside it is read from the services layer
 * on every render. A memo that carried its own figures would be a memo that
 * could disagree with the close it describes, and it would go on disagreeing
 * quietly after somebody recorded a conclusion.
 *
 * The suggested body is assembled from that same live position, so a reader
 * who accepts it verbatim still has a memo whose numbers came from the close.
 * It is offered, never inserted: a draft nobody wrote is not a management
 * statement, and the screen says so.
 */

/** Human label for a demo user id, matching the audit package's wording. */
function personLabel(userId: string): string {
  const user = userById(userId);
  return user.id === userId ? `${user.displayName} · ${roleLabel(user)}` : userId;
}

function versionRow(v: MemoVersionOut): MemoVersionRowView {
  return {
    key: v.id,
    label: v.label,
    state:
      v.state === "ISSUED" ? "Issued" : v.state === "SUPERSEDED" ? "Superseded" : "Draft",
    glyph: v.state === "DRAFT" ? "○" : "■",
    // The lock is stated in words: a sealed version must never merely *look*
    // uneditable.
    lock: v.sealed ? "SEALED" : v.editable ? "EDITABLE" : "ARCHIVED",
    title: v.title,
    date: formatInstant(v.at),
    by: personLabel(v.byUserId),
    hash: v.contentHash !== null ? shortHash(v.contentHash) : null,
    sealed: v.sealed,
    editable: v.editable,
  };
}

/**
 * A starting point built from the close, not a conclusion.
 *
 * Every figure in it comes from `position`, which the services layer derived.
 * The sentences deliberately stop short of concluding anything: this product
 * does not conclude, and a suggested body that read as a conclusion would be
 * the software writing one.
 */
function suggestedBody(p: MemoPositionOut): string {
  const lines = [
    `As at ${formatDate(p.asOf)}, the inventory subledger carries ${p.bookUnits.toLocaleString("en-US")} units at ${formatCents(p.subledgerCents)}. The general ledger carries ${formatCents(p.grossGlCents)} across the gross inventory accounts, a difference of ${formatCents(p.differenceCents)}.`,
    `${p.reconcilingItemCount} reconciling ${p.reconcilingItemCount === 1 ? "item has" : "items have"} been identified against that difference, leaving ${formatCents(p.unexplainedCents)} unexplained.`,
    // Three counts, three agreements. This read "of which 1 remain open. 1 of
    // those blocks sign-off" — a plural verb and a singular verb about the
    // same item inside one sentence — because the noun was conditioned on the
    // count and the verb beside it was a bare literal. This is the prose the
    // product offers management to adopt VERBATIM into a signed memo, reached
    // by the "Start from the close position" link on /close-memo.
    `The close raised ${p.exceptionCount} ${plural(p.exceptionCount, "exception")}, of which ${p.openExceptionCount} ${plural(p.openExceptionCount, "remains", "remain")} open. ${p.blockerCount} of those ${plural(p.blockerCount, "blocks", "block")} sign-off, with ${formatCents(p.blockerExposureCents)} of exposure attached.`,
    `Audit requests stand at ${p.pbcReady} of ${p.pbcTotal} ready. Close readiness is ${formatBpsExact(p.readinessBps)}, which measures how much of the close's own work is complete and is not a statement about whether the balance is fairly stated.`,
    "",
    "Management's assessment:",
    "",
    "",
    "Matters requiring a decision:",
    "",
  ];
  return lines.join("\n");
}

export function buildCloseMemoData(
  user: DemoUser,
  correlationId: string,
): CloseMemoData {
  const ctx = makeContext(user, correlationId);
  const role = roleLabel(user);

  const memo = attempt(() => getMemo(getWorkspace(), ctx));
  if (memo === undefined) {
    return {
      restricted: true,
      roleLabel: role,
      headerNote: null,
      asOf: "",
      tabs: [],
      position: [],
      positionStats: [],
      draft: null,
      suggestedBody: "",
      versions: [],
      issuedBody: null,
      positionMoved: null,
      withheldNote: null,
      canDraft: false,
      canIssue: false,
      periodBlocks: null,
      notPartOfClose: "",
      note: "",
    };
  }

  const p = memo.position;

  const positionStats: ProcurementStat[] = [
    {
      label: "SUBLEDGER",
      value: formatCents(p.subledgerCents),
      note: `${p.bookUnits.toLocaleString("en-US")} units on the year-end listing.`,
      ember: false,
    },
    {
      label: "UNEXPLAINED DIFFERENCE",
      value: formatCents(p.unexplainedCents),
      note: `Of a ${formatCents(p.differenceCents)} gap, with ${p.reconcilingItemCount} items identified.`,
      ember: p.unexplainedCents !== 0,
    },
    {
      label: "BLOCKERS OPEN",
      value: String(p.blockerCount),
      note: `${formatCents(p.blockerExposureCents)} of exposure attached.`,
      ember: p.blockerCount > 0,
    },
    {
      label: "CLOSE READINESS",
      value: formatBpsExact(p.readinessBps),
      note: `${p.pbcReady} of ${p.pbcTotal} audit requests ready.`,
      ember: false,
    },
  ];

  return {
    restricted: false,
    roleLabel: role,
    headerNote: null,
    asOf: formatDate(p.asOf),
    tabs: [
      { key: "memo", label: "Memo", count: null },
      { key: "versions", label: "Version History", count: String(memo.versions.length) },
    ],
    position: [
      { k: "Balance-sheet date", v: formatDate(p.asOf) },
      { k: "Units on the listing", v: p.bookUnits.toLocaleString("en-US") },
      { k: "Inventory subledger", v: formatCents(p.subledgerCents) },
      { k: "Gross inventory in the general ledger", v: formatCents(p.grossGlCents) },
      { k: "Difference", v: formatCents(p.differenceCents) },
      { k: "Reconciling items identified", v: String(p.reconcilingItemCount) },
      { k: "Unexplained", v: formatCents(p.unexplainedCents) },
      { k: "Exceptions raised", v: String(p.exceptionCount) },
      { k: "Exceptions open", v: String(p.openExceptionCount) },
      { k: "Blockers", v: String(p.blockerCount) },
      { k: "Blocker exposure", v: formatCents(p.blockerExposureCents) },
      { k: "Close readiness", v: formatBpsExact(p.readinessBps) },
      { k: "Audit requests ready", v: `${p.pbcReady} of ${p.pbcTotal}` },
      { k: "Period", v: p.periodState.replace(/_/g, " ").toLowerCase() },
    ],
    positionStats,
    draft:
      memo.workingDraft === null
        ? null
        : {
            title: memo.workingDraft.title,
            body: memo.workingDraft.body,
            by: personLabel(memo.workingDraft.byUserId),
            at: formatInstant(memo.workingDraft.at),
          },
    suggestedBody: suggestedBody(p),
    versions: memo.versions.map(versionRow),
    issuedBody: memo.issued === null ? null : memo.issued.body,
    // Null, not false, until something has been issued: "the position has not
    // moved" is a claim about a comparison, and there is nothing to compare
    // against before a version is sealed.
    positionMoved:
      memo.positionMoved === null
        ? null
        : {
            holds: !memo.positionMoved,
            headline: memo.positionMoved
              ? "The close has moved since this version was issued."
              : "The close is where it was when this version was issued.",
            detail: memo.positionMoved
              ? // The remedy is only offered where the command would be
                // accepted, and `issueMemoVersion` has TWO gates: the role
                // (`authorize`) and the period (`requireMutable`). A preparer
                // holds memo.draft without memo.issue, so it gets the editor,
                // no Issue panel, and — without the role half of this
                // condition — an instruction to issue anyway.
                `The close is no longer in the state the issued version was sealed against — the position below is the close as it stands now. The issued version is not edited to catch up; it says what was said at the time.${memo.periodBlocks === null && memo.canIssue ? " Issue a new version to state the current position." : ""}`
              : "The issued version was sealed against a hash of the position below, and it still agrees. This is a comparison of the close state, not of the prose: it says that nothing the memo speaks about has changed.",
          },
    withheldNote: memo.withheldNote,
    canDraft: memo.canDraft,
    canIssue: memo.canIssue,
    periodBlocks: memo.periodBlocks,
    notPartOfClose: memo.notPartOfClose,
    note: "The prose is management's. Every figure beside it is read from the close on each render, so the memo cannot come to disagree with the close it describes. Issuing seals both the text and a hash of the close position it was written against — which is what makes a later divergence visible instead of silent.",
  };
}
