import type { DemoUser } from "@icg/data";
import { glAccountDescription } from "@icg/domain";
import type { ExceptionView } from "@icg/services";
import { formatCents, formatDate } from "../format";
import type {
  AdjustmentCard,
  AdjustmentLineRow,
  AdjustmentsData,
  ExceptionDrawerData,
} from "../view-model";
import { statusView } from "../workflow-view";
import { attempt } from "./data";
import { assembleDrawer, gatherExceptionContext, liveExceptionViews } from "./exception-view";
import { sourceLabel } from "./humanize";
import { liveRegister } from "./live-register";
import { ROLE_LABELS, getQueries, makeContext, roleLabel } from "./workspace";

/**
 * Adjustments — the register of proposed journal entries (stage 07).
 *
 * Every card reads NOT POSTED, because nothing here has been posted and no
 * code path in this product could post it. The register is keyed on the
 * RECONCILING ITEMS the bridge identifies, so an item with no drafted entry
 * appears as exactly that rather than being quietly omitted.
 */

const roleName = (role: string): string => ROLE_LABELS[role] ?? role;

/**
 * The evidence behind the exception an entry answers, so the workpaper can
 * be traced without leaving the card. Only records the caller may see reach
 * this list — the services redact before it is built.
 */
function evidenceRefs(
  queries: ReturnType<typeof getQueries>,
  ctx: ReturnType<typeof makeContext>,
  view: ExceptionView | undefined,
): readonly { id: string; title: string; src: string }[] {
  if (view === undefined) return [];
  const context = gatherExceptionContext(queries, ctx, view);
  return context.evidence.slice(0, 6).map((e) => ({
    id: e.id,
    title: e.title,
    src: e.sourceSystem !== undefined ? sourceLabel(e.sourceSystem) : "—",
  }));
}

export function buildAdjustmentsData(
  user: DemoUser,
  correlationId: string,
): AdjustmentsData {
  const queries = getQueries();
  const ctx = makeContext(user, correlationId);
  const role = roleLabel(user);

  const register = attempt(() => queries.getAdjustmentRegister(ctx));
  if (register === undefined) {
    return {
      restricted: true,
      roleLabel: role,
      stats: [],
      cards: [],
      postingNote: "",
      bridgeNote: "",
      drawers: {},
    };
  }

  // Live: the card's status pill, its ember treatment, its undrafted reason
  // and the KPI note beneath "Entries drafted" all report the close NOW. Read
  // frozen, the EXC-015 card kept the ember alarm and the sentence "EXC-015
  // has not reached a management conclusion" after the Controller reached one.
  const exceptions = liveExceptionViews(queries, ctx);
  const live = liveRegister(exceptions);
  const blockers = attempt(() => queries.getBlockers(ctx)) ?? [];
  const blockerIds = new Set(blockers.map((b) => b.exceptionId));
  const recon = attempt(() => queries.getReconciliation(ctx));

  const drawers: Record<string, ExceptionDrawerData> = {};
  const drawerFor = (view: ExceptionView | undefined): string | null => {
    if (view === undefined) return null;
    const id = view.exception.id;
    drawers[id] ??= assembleDrawer(
      gatherExceptionContext(queries, ctx, view),
      blockerIds.has(id),
    );
    return id;
  };

  // The period an entry adjusts is the close's, not the draft date's: these
  // are drafted in January against the year-end being closed, so the
  // reconciliation's own balance-sheet date is the honest answer.
  const periodLabel =
    recon !== undefined ? `Balance-sheet date ${formatDate(recon.asOf)}` : "—";

  const cards: AdjustmentCard[] = register.entries.map((entry) => {
    const view = exceptions.find((e) => e.exception.id === entry.exceptionId);
    const proposal = entry.proposal;
    const lines: AdjustmentLineRow[] =
      proposal?.lines.map((line) => ({
        account: line.account,
        // The account's own description, so a reviewer is not asked to know
        // the chart of accounts by heart. Unknown codes render bare rather
        // than being given a description this product cannot vouch for.
        accountDescription: glAccountDescription(line.account) ?? null,
        memo: line.memo,
        amount: formatCents(Math.abs(line.amountCents)),
        // Sign convention comes from the domain: positive is a debit.
        side: line.amountCents >= 0 ? ("DEBIT" as const) : ("CREDIT" as const),
      })) ?? [];

    return {
      key: entry.reconcilingItemId,
      exceptionId: entry.exceptionId,
      title: entry.description,
      // The proposal's own description is the line memo below; repeating it
      // here would say the same thing twice.
      detail:
        proposal !== undefined
          ? `${proposal.id} · ${proposal.lines.length} lines · prepared, awaiting approval`
          : (live.undraftedReason(entry) ?? "No entry drafted."),
      amount: formatCents(entry.amountCents),
      ember: live.isOpen(entry),
      status: view !== undefined ? statusView(view.exception.status) : null,
      entry:
        proposal !== undefined
          ? {
              id: proposal.id,
              description: proposal.description,
              lines,
              // The imbalance is reported rather than assumed away.
              balance: formatCents(proposal.imbalanceCents),
              balanced: proposal.balanced,
              preparer: roleName(proposal.preparedByRole),
              preparedByName: proposal.preparedByName ?? null,
              proposedAt: proposal.proposedAt !== undefined ? formatDate(proposal.proposedAt) : null,
              period: periodLabel,
              reviewer: roleName(proposal.reviewerRole),
              approval: proposal.approved ? "Approved" : "Not approved",
              approvalRequirement: proposal.approvalRequirement,
              // A workpaper a reviewer cannot trace is not support. These are
              // the evidence records behind the exception this entry answers.
              evidence: evidenceRefs(queries, ctx, view),
              postingStatus: "Not posted in NetSuite — no write path exists",
            }
          : null,
      undraftedReason: proposal === undefined ? (live.undraftedReason(entry) ?? null) : null,
      // Where no entry exists, the offset is the open question — never an
      // account picked to make the entry balance.
      offsetRequirement:
        proposal === undefined
          ? "Offset account: Accounting Review Required — the evidence on file does not establish which account carries the other side."
          : null,
      posted: "NOT POSTED",
      drawerId: drawerFor(view),
      href: `/exceptions/${entry.exceptionId}`,
    };
  });

  const awaitingConclusion = live.openCount(register.entries);

  return {
    restricted: false,
    roleLabel: role,
    stats: [
      {
        label: "Identified items",
        value: String(register.identifiedCount),
        note: "Reconciling items on the GL bridge",
      },
      {
        label: "Entries drafted",
        value: String(register.draftedCount),
        // Counted from the items still WAITING on a conclusion, not from
        // `identifiedCount - draftedCount`. Those two are only equal at the
        // baseline: the arithmetic version said "1 awaiting a management
        // conclusion" on the same screen as a card whose own drawer read
        // "Resolved — No Adjustment", because an undrafted entry and an
        // unconcluded exception are different facts that happened to have the
        // same count until somebody concluded one.
        note:
          awaitingConclusion > 0
            ? `${awaitingConclusion} awaiting a management conclusion`
            : "Every identified item has a management conclusion",
        ...(register.draftedCount < register.identifiedCount
          ? { tone: "warn" as const }
          : {}),
      },
      {
        label: "Posted",
        value: String(register.postedCount),
        note: "Gaurd proposes and explains; it never posts",
      },
      {
        label: "Net proposed effect",
        value: formatCents(register.draftedEffectCents),
        note: "Effect on the GL if every drafted entry were approved and posted",
      },
    ],
    cards,
    postingNote:
      "No proposal here has been posted. Approval is a human act recorded outside this product, and posting happens in NetSuite — Gaurd has no write path to it.",
    bridgeNote:
      recon !== undefined
        ? `These are the same items the reconciling bridge lists: applying every one of them would move the gross GL to ${formatCents(recon.potentialAdjustedGlCents)}.`
        : "These are the same items the reconciling bridge lists.",
    drawers,
  };
}
