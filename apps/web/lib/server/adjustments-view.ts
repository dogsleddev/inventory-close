import type { DemoUser } from "@icg/data";
import type { ExceptionView } from "@icg/services";
import { formatCents } from "../format";
import type {
  AdjustmentCard,
  AdjustmentLineRow,
  AdjustmentsData,
  ExceptionDrawerData,
} from "../view-model";
import { statusView } from "../workflow-view";
import { attempt } from "./data";
import { assembleDrawer, gatherExceptionContext } from "./exception-view";
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

  const exceptions = attempt(() => queries.listExceptions(ctx)) ?? [];
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

  const cards: AdjustmentCard[] = register.entries.map((entry) => {
    const view = exceptions.find((e) => e.exception.id === entry.exceptionId);
    const proposal = entry.proposal;
    const lines: AdjustmentLineRow[] =
      proposal?.lines.map((line) => ({
        account: line.account,
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
          : (entry.undraftedReason ?? "No entry drafted."),
      amount: formatCents(entry.amountCents),
      ember: entry.exceptionOpen,
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
              reviewer: roleName(proposal.reviewerRole),
              approval: proposal.approved ? "Approved" : "Not approved",
              approvalRequirement: proposal.approvalRequirement,
            }
          : null,
      undraftedReason: proposal === undefined ? (entry.undraftedReason ?? null) : null,
      posted: "NOT POSTED",
      drawerId: drawerFor(view),
      href: `/exceptions/${entry.exceptionId}`,
    };
  });

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
        note: `${register.identifiedCount - register.draftedCount} awaiting a management conclusion`,
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
