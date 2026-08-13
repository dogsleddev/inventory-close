import { DEMO_USERS } from "@icg/data";
import type { DemoUser } from "@icg/data";
import { SOURCE_HEALTH_SCORE_HUNDREDTHS } from "@icg/domain";
import type { ExceptionView, QueryService, ServiceContext } from "@icg/services";
import {
  formatBpsExact,
  formatBpsOverview,
  formatCents,
  formatCentsMillions,
  formatDateShort,
  formatInstant,
  formatScoreHundredths,
  plural,
  shortHash,
} from "../format";
import {
  conclusionLabel,
  nextActionText,
  ownerForStatus,
  riskView,
  sourceHealthView,
  statusView,
} from "../workflow-view";
import type {
  ActivityItem,
  AttentionItem,
  BlockerRow,
  ExceptionDetailData,
  ExceptionDrawerData,
  ExceptionsData,
  GateCategory,
  KpiTile,
  OverviewData,
  ShellData,
  SourceHealthRow,
} from "../view-model";
import { attempt } from "./attempt";
import { buildLenses, staleNoteText } from "./exception-lenses";
import {
  assembleChainNodes,
  assembleDrawer,
  assembleEvidenceRecord,
  assembleEvidenceState,
  assembleTimeline,
  gatherExceptionContext,
} from "./exception-view";
import {
  assertionLabel,
  eventTypeLabel,
  numberWord,
  sourceLabel,
  sourceName,
  titleCase,
} from "./humanize";
import { getQueries, initials, makeContext, roleLabel } from "./workspace";

/**
 * Page data assembly (stage 05). Every figure below is read from
 * @icg/services and converted to display strings — nothing is computed
 * beyond formatting, ordering, and counting of what the services returned.
 * Reads a role is not authorized for surface as restricted sections.
 */

/**
 * Re-exported from its own module so the nine view files that import it from
 * here keep working. It moved because `exception-view.ts` needs it and this
 * file imports `exception-view.ts`.
 */
export { attempt } from "./attempt";

export function buildShellData(user: DemoUser, correlationId: string): ShellData {
  const queries = getQueries();
  const ctx = makeContext(user, correlationId);

  const readiness = attempt(() => queries.getCloseReadiness(ctx));
  // Live, like the gate at data.ts:601-618 and for the same reason. The shell
  // is on all twenty routes: reading the rules' baseline here put "7 blockers"
  // in the header directly above an Overview gate reading 6, above a
  // /close-memo tile whose own BLOCKERS OPEN figure was already live and read
  // 6, and put a 7 on the nav rail beside a /exceptions?filter=blockers list
  // of six rows. The header is the one component that cannot be argued to be
  // reporting the rules' own answer — it carries no label saying so.
  const live = attempt(() => queries.getEffectiveClose(ctx));
  const blockers = attempt(() => queries.getBlockers(ctx));
  const period = attempt(() => queries.getPeriod(ctx));
  // Read from the service, which gates on the same permission key the reset
  // command authorizes against — never from a role list transcribed here.
  const capabilities = attempt(() => queries.getDemoCapabilities(ctx));

  return {
    userId: user.id,
    displayName: user.displayName,
    roleLabel: roleLabel(user),
    initials: initials(user.displayName),
    roles: DEMO_USERS.map((u) => ({
      userId: u.id,
      displayName: u.displayName,
      roleLabel: roleLabel(u),
    })),
    periodLabel: period !== undefined ? `PERIOD ${period.state.replace("_", " ")}` : null,
    headerKpis:
      readiness !== undefined
        ? {
            ready: `${formatBpsOverview(live?.readinessBps ?? readiness.totalBasisPoints)} ready`,
            // `plural`, because making this figure LIVE is what made a count
            // of one reachable here. The literal "blockers" was correct by
            // construction for as long as this string was the rules' constant
            // seven, and the same commit that made it move would have shipped
            // "1 blockers" into the header on all twenty routes. This is the
            // documented failure mode of this repo's fix passes — a fix that
            // reopens a class one row over — caught in the browser pass at the
            // count that exposes it.
            blockers: `${live?.blockerCount ?? readiness.aggregates.blockerCount} ${plural(live?.blockerCount ?? readiness.aggregates.blockerCount, "blocker")}`,
          }
        : null,
    navOpenBlockers: live?.blockerCount ?? readiness?.aggregates.blockerCount ?? null,
    dataHealthPct:
      readiness !== undefined ? formatBpsExact(readiness.aggregates.sourceHealthBps) : null,
    askFallback:
      readiness !== undefined && blockers !== undefined
        ? {
            blockerCount: readiness.aggregates.blockerCount,
            exposure: formatCents(readiness.aggregates.blockerExposureCents),
            blockerIds: blockers.map((b) => b.exceptionId).join(", "),
          }
        : null,
    canResetDemo: capabilities?.canResetDemo ?? false,
  };
}

function categoryNote(
  key: string,
  queries: QueryService,
  ctx: ServiceContext,
): { note: string; warn: boolean } {
  /**
   * The live open set, shared by every case below.
   *
   * This was `listExceptions(...).filter((e) => e.open)` — the rules' frozen
   * answer — and it fed PHYSICAL_COUNT, CUTOFF, OWNERSHIP, THIRD_PARTY and
   * VALUATION. Only the EXCEPTIONS case was made live, and its own comment
   * said why. So concluding all seven blockers produced a panel whose gate
   * offered "Every blocker has a management conclusion. Signing off locks the
   * period." beside PHYSICAL_COUNT "2 open count issues", CUTOFF "Inbound and
   * outbound both open", OWNERSHIP "Contract support missing on 1 item",
   * THIRD_PARTY "$92.4K awaiting support" and VALUATION "Reserve
   * undetermined", every one of them warn:true. The commit that fixed the
   * EXCEPTIONS case wrote that "a close-control product that offers to lock
   * the period beside a list of outstanding work has failed at its own claim",
   * and reproduced it one row over. Deriving all six from one binding is what
   * makes them move together.
   *
   * `unmet` travels with each row because OWNERSHIP asks what is still
   * MISSING, and the frozen `satisfied` flag is a literal baked by the rules
   * engine that never moves.
   */
  const effective = attempt(() => queries.getEffectiveExceptions(ctx));
  const open: readonly {
    exception: ExceptionView["exception"];
    unmet: readonly string[];
  }[] =
    effective !== undefined
      ? effective
          .filter((e) => e.open)
          .map((e) => ({ exception: e.exception, unmet: e.unmetRequirements }))
      : (attempt(() => queries.listExceptions(ctx)) ?? [])
          .filter((e) => e.open)
          .map((e) => ({
            exception: e.exception,
            unmet: e.exception.finding.evidenceRequirements
              .filter((r) => r.required && !r.satisfied)
              .map((r) => r.description),
          }));
  const openByPrefix = (p: string) =>
    open.filter((e) => e.exception.finding.ruleId.startsWith(p));
  switch (key) {
    case "POPULATION_GL": {
      const recon = attempt(() => queries.getReconciliation(ctx));
      if (recon === undefined) return { note: "—", warn: false };
      return recon.differenceCents !== 0
        ? { note: `${formatCents(recon.differenceCents)} current difference`, warn: true }
        : { note: "GL and subledger agree", warn: false };
    }
    case "PHYSICAL_COUNT": {
      const n = openByPrefix("CNT-").length;
      return n > 0
        ? { note: `${n} open count issue${n === 1 ? "" : "s"}`, warn: true }
        : { note: "No open count issues", warn: false };
    }
    case "CUTOFF": {
      const out = openByPrefix("CUT-OUT").length;
      const inn = openByPrefix("CUT-IN").length;
      if (out > 0 && inn > 0) return { note: "Inbound and outbound both open", warn: true };
      if (out + inn > 0)
        return { note: `${out + inn} cutoff item${out + inn === 1 ? "" : "s"} open`, warn: true };
      return { note: "No open cutoff items", warn: false };
    }
    case "OWNERSHIP": {
      // Counted from what is STILL unmet, not from the rules' baked
      // `satisfied` literal — otherwise this says support is missing on an
      // item whose contract the Accounting Manager accepted an hour ago.
      const missing = open.filter((e) =>
        e.unmet.some((description) => /contract|provision|agreement/i.test(description)),
      ).length;
      return missing > 0
        ? { note: `Contract support missing on ${missing} item${missing === 1 ? "" : "s"}`, warn: true }
        : { note: "Ownership support on file", warn: false };
    }
    case "THIRD_PARTY": {
      const tpi = openByPrefix("TPI-");
      if (tpi.length === 0) return { note: "All custodians confirmed", warn: false };
      const cents = tpi.reduce((n, e) => n + e.exception.finding.exposureCents, 0);
      return { note: `$${(cents / 100000).toFixed(1)}K awaiting support`, warn: true };
    }
    case "VALUATION": {
      const undetermined = open.some(
        (e) => e.exception.finding.attributes?.["reserve"] === "UNDETERMINED",
      );
      return undetermined
        ? { note: "Reserve undetermined", warn: true }
        : { note: "No open valuation items", warn: false };
    }
    case "EXCEPTIONS": {
      // Live, like the gate figure four inches above it. Read from
      // `getBlockers` this panel said "7 open blockers" on a screen whose gate
      // read 6 — one screen, one fact, two numbers.
      //
      // It keeps its own lookup rather than counting `open` above: a BLOCKER
      // is not an open exception. The two happen to be equal on this dataset
      // (seven and seven), which is exactly the kind of coincidence that makes
      // a wrong count invisible until the data changes.
      const live = attempt(() => queries.getEffectiveClose(ctx));
      const count = live?.blockerCount ?? (attempt(() => queries.getBlockers(ctx)) ?? []).length;
      return {
        note: `${count} open ${count === 1 ? "blocker" : "blockers"}`,
        warn: count > 0,
      };
    }
    case "ADJUSTMENTS": {
      // The register's own vocabulary: identified (a reconciling item),
      // drafted (an entry written for it), posted (never). "Proposed" is
      // this product's word for a DRAFTED entry, so counting all three
      // identified items as proposed claims one entry that was never
      // written — and this ratio IS the ADJUSTMENTS readiness score.
      const register = attempt(() => queries.getAdjustmentRegister(ctx));
      if (register === undefined) return { note: "—", warn: false };
      return {
        note: `${register.draftedCount} of ${register.identifiedCount} drafted, none posted`,
        warn: register.draftedCount < register.identifiedCount,
      };
    }
    default:
      return { note: "—", warn: false };
  }
}

function gateCategories(
  categories: readonly { key: string; label: string; weightPercent: number; scoreHundredths: number }[],
  queries: QueryService,
  ctx: ServiceContext,
): GateCategory[] {
  return categories.map((c) => {
    const { note, warn } = categoryNote(c.key, queries, ctx);
    const pct = c.scoreHundredths / 100;
    return {
      key: c.key,
      label: c.label,
      weightPct: `${c.weightPercent}%`,
      score: formatScoreHundredths(c.scoreHundredths),
      fillPct: pct,
      weight: c.weightPercent,
      tone: pct < 70 ? "ember" : pct < 85 ? "warn" : "ink",
      note,
      noteWarn: warn,
    };
  });
}

/** Deterministic queue order: open blockers, open, resolved; exposure desc; id asc. */
export function defaultExceptionOrder(
  a: { open: boolean; blocker: boolean; exposureCents: number; id: string },
  b: { open: boolean; blocker: boolean; exposureCents: number; id: string },
): number {
  const tier = (x: typeof a) => (x.open && x.blocker ? 0 : x.open ? 1 : 2);
  if (tier(a) !== tier(b)) return tier(a) - tier(b);
  if (a.exposureCents !== b.exposureCents) return b.exposureCents - a.exposureCents;
  return a.id < b.id ? -1 : 1;
}

/**
 * An item's position NOW, looked up rather than re-derived per consumer.
 *
 * The Overview asks "what is this item's status and what does it still need?"
 * in three places — the blocker rows, the management work queue and the
 * control-area notes — and all three read the frozen finding. So with every
 * blocker concluded the gate offered sign-off ("Every blocker has a management
 * conclusion") beside five untouched "Obtain: …" lines, and the work queue
 * prescribed records the product had accepted.
 */
type LivePositionOf = (view: ExceptionView) => {
  status: ExceptionView["exception"]["status"];
  unmet: readonly string[];
};

/** The rules' own position, for a caller with no live projection. */
const frozenPositionOf: LivePositionOf = (view) => ({
  status: view.exception.status,
  unmet: view.exception.finding.evidenceRequirements
    .filter((r) => r.required && !r.satisfied)
    .map((r) => r.description),
});

function blockerRow(
  view: ExceptionView,
  blocker: boolean,
  liveOf: LivePositionOf = frozenPositionOf,
): BlockerRow {
  const finding = view.exception.finding;
  const { status, unmet } = liveOf(view);
  return {
    id: view.exception.id,
    title: finding.title,
    nextAction: nextActionText(status, unmet),
    owner: ownerForStatus(status).owner,
    exposure: formatCents(finding.exposureCents),
    risk: riskView(finding.risk),
    status: statusView(status),
    blocker,
  };
}

const MANAGEMENT_PARTIES: Readonly<Record<string, readonly string[]>> = {
  HEAD_OF_FINANCE: ["Controller", "Accounting Manager", "Legal"],
  CONTROLLER: ["Controller", "Accounting Manager", "Legal"],
  ACCOUNTING_MANAGER: ["Accounting Manager"],
  LEGAL: ["Legal"],
  WAREHOUSE: ["Warehouse"],
  SUPPLY_CHAIN: ["Supply Chain"],
};

function attentionItems(
  user: DemoUser,
  open: readonly ExceptionView[],
  liveOf: LivePositionOf = frozenPositionOf,
): { items: AttentionItem[]; auditorNote: string | null } {
  const role = user.roles[0] ?? "";
  if (role === "AUDITOR_READ_ONLY") {
    return {
      items: [],
      auditorNote:
        "The management work queue is not auditor-facing. Provided audit support lives in the Audit Package.",
    };
  }
  const parties = MANAGEMENT_PARTIES[role];
  if (parties === undefined) return { items: [], auditorNote: null };
  const mine = open
    .filter((e) => parties.includes(ownerForStatus(liveOf(e).status).actionParty))
    .sort((a, b) => {
      const sev = (r: string) => ({ CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 })[r] ?? 4;
      const fa = a.exception.finding;
      const fb = b.exception.finding;
      if (sev(fa.risk) !== sev(fb.risk)) return sev(fa.risk) - sev(fb.risk);
      if (fa.exposureCents !== fb.exposureCents) return fb.exposureCents - fa.exposureCents;
      return a.exception.id < b.exception.id ? -1 : 1;
    });
  return {
    items: mine.map((e) => {
      const f = e.exception.finding;
      const { status, unmet } = liveOf(e);
      const sv = statusView(status);
      return {
        label: nextActionText(status, unmet),
        detail: `${f.title} · ${formatCents(f.exposureCents)} · ${riskView(f.risk).label}`,
        ref: e.exception.id,
        glyph: sv.glyph,
        tone:
          f.risk === "CRITICAL"
            ? "ember-strong"
            : sv.variant === "waiting"
              ? "warn"
              : "frost",
      };
    }),
    auditorNote: null,
  };
}

const EVENT_GLYPHS: Readonly<Record<string, { glyph: string; tone: ActivityItem["tone"] }>> = {
  RECOUNT_COMPLETED: { glyph: "✓", tone: "aurora" },
  MOVEMENT_VALIDATED: { glyph: "✓", tone: "aurora" },
  DATA_QUALITY_CORRECTED: { glyph: "✓", tone: "aurora" },
  CONTRACT_LOCATED: { glyph: "■", tone: "aurora" },
  DUPLICATE_IDENTIFIED: { glyph: "◆", tone: "frost" },
  ADJUSTMENT_PROPOSED: { glyph: "✓", tone: "aurora" },
  POLICY_REVIEW_CONCLUDED: { glyph: "✓", tone: "aurora" },
  DAMAGE_ASSESSED: { glyph: "◆", tone: "frost" },
  TIMING_VALIDATED: { glyph: "✓", tone: "aurora" },
  CONFIRMATION_RECEIVED: { glyph: "■", tone: "aurora" },
};

/**
 * Says out loud when the screen has stopped showing the rules' own baseline.
 *
 * A demo where someone concluded three items and the headline silently moved
 * is a demo that cannot be trusted the next time it says a number. The
 * baseline stays quotable, and Reset Demo restores it exactly.
 */
/**
 * Named only once the position has actually MOVED.
 *
 * `diverged` is `conclusions.length > 0 || submittedEvidence.length > 0` —
 * somebody acted, not the figures changed — and both reachable first acts
 * leave these numbers untouched: REMAINS_OPEN is documented as never moving
 * status, and Submit Support moves neither. So this announced "Showing this
 * session's position" beside figures identical to the ones it contrasted them
 * with. Gated on the comparison the sentence makes.
 *
 * It also says the readiness BARS are the rules' own. There is no live
 * per-category breakdown — `getEffectiveClose` returns one aggregate — so the
 * eight weighted areas below still render the derived scores while the
 * headline above them is live. Saying so is the honest option; inventing a
 * live per-area score is not.
 */
function buildDivergenceNote(
  live:
    | { diverged: boolean; concludedCount: number; blockerCount: number; readinessBps: number }
    | undefined,
  baselineBps: number,
  baselineBlockers: number,
): string | null {
  if (live === undefined || !live.diverged) return null;
  const moved = live.blockerCount !== baselineBlockers || live.readinessBps !== baselineBps;
  if (!moved) return null;
  const items = `${live.concludedCount} item${live.concludedCount === 1 ? "" : "s"}`;
  return `Showing this session's position: ${items} concluded since the run. The close as the rules derived it was ${formatBpsOverview(baselineBps)} ready with ${baselineBlockers} ${baselineBlockers === 1 ? "blocker" : "blockers"}, and the eight weighted areas below are still those derived scores — Reset Demo restores it.`;
}

export function buildOverviewData(user: DemoUser, correlationId: string): OverviewData {
  const queries = getQueries();
  const ctx = makeContext(user, correlationId);
  const readiness = attempt(() => queries.getCloseReadiness(ctx));
  if (readiness === undefined) {
    return { restricted: true, roleLabel: roleLabel(user) };
  }
  const agg = readiness.aggregates;
  const blockers = attempt(() => queries.getBlockers(ctx)) ?? [];
  const exceptions = attempt(() => queries.listExceptions(ctx)) ?? [];
  const recon = attempt(() => queries.getReconciliation(ctx));
  const register = attempt(() => queries.getAdjustmentRegister(ctx));
  const health = attempt(() => queries.getSourceHealth(ctx));
  const units = attempt(() => queries.listInventoryUnits(ctx));
  const events = attempt(() => queries.getScenarioEvents(ctx)) ?? [];
  const pbc = attempt(() => queries.getPbcStatus(ctx));
  // Live position: the rules' close plus this session's conclusions.
  const live = attempt(() => queries.getEffectiveClose(ctx));
  /**
   * Per-item live position, for every consumer on this screen that asks what
   * an exception's status is and what it still needs.
   */
  const effective = attempt(() => queries.getEffectiveExceptions(ctx));
  const effectiveById = new Map((effective ?? []).map((e) => [e.exception.id, e]));
  const liveOf: LivePositionOf = (view) => {
    const row = effectiveById.get(view.exception.id);
    if (row === undefined) return frozenPositionOf(view);
    return {
      status: row.effectiveStatus as ExceptionView["exception"]["status"],
      unmet: row.unmetRequirements,
    };
  };
  const capabilities = attempt(() => queries.getDemoCapabilities(ctx));
  const period = attempt(() => queries.getPeriod(ctx));

  const liveBlockerIds = new Set((live?.blockers ?? blockers).map((b) => b.exceptionId));
  const blockerIds = liveBlockerIds;
  const blockerViews = exceptions
    .filter((e) => blockerIds.has(e.exception.id))
    .sort((a, b) => b.exception.finding.exposureCents - a.exception.finding.exposureCents);
  const shown = blockerViews.slice(0, 5);
  const remaining = blockerViews.slice(5);
  const shownCents = shown.reduce((n, e) => n + e.exception.finding.exposureCents, 0);

  /**
   * A caption about the table it sits under, counted from that table.
   *
   * `blockerViews` is filtered by the LIVE blocker set; these two sentences
   * counted `blockers`, which is the rules' baseline. So after conclusions the
   * panel read "All seven blockers shown." under an empty table, and the header
   * beside it still carried the baseline exposure and count over rows totalling
   * nothing. Neither branch of the ternary was true — there is no reading of
   * "all seven shown" that holds above no rows.
   *
   * The baseline is not lost: `gate.divergence` names it, and Reset Demo
   * restores it. It is simply not what a caption about these rows counts.
   *
   * Making the count live also made every hard-coded agreement in these two
   * sentences reachable, and the rewrite reached for `plural` on the one noun
   * it could see: "All one blocker shown.", and a single remaining exception
   * rendered as "EXC-004 (… each) complete the six" — a plural verb, and an
   * "each" distributing over one amount. Which is the same defect the commit
   * before it was written to fix.
   * Every count-varying word here now agrees with its own count, and the
   * counts are two different sets: `remaining` governs the verb, and
   * `liveBlockerCount` governs the total the sentence closes on.
   */
  const liveBlockerCount = blockerViews.length;
  const remainingNote =
    liveBlockerCount === 0
      ? "Every blocker the rules raised carries a management conclusion recorded in this session."
      : remaining.length === 0
        ? liveBlockerCount === 1
          ? "The one open blocker is shown."
          : `All ${numberWord(liveBlockerCount)} open blockers shown.`
        : (() => {
            const amounts = remaining.map((e) => e.exception.finding.exposureCents);
            const allEqual = amounts.every((a) => a === amounts[0]);
            const ids = remaining.map((e) => e.exception.id).join(" and ");
            // "each" distributes over more than one amount. With a single
            // remaining blocker there is nothing for it to distribute over.
            const amountText =
              allEqual && amounts.length > 1
                ? `${formatCents(amounts[0] ?? 0)} each`
                : remaining.map((e) => formatCents(e.exception.finding.exposureCents)).join(", ");
            return `${ids} (${amountText}) ${plural(remaining.length, "completes", "complete")} the ${numberWord(liveBlockerCount)} still open.`;
          })();

  const staleCount = health?.sources.filter((s) => s.status === "STALE").length ?? 0;
  const partialCount = health?.sources.filter((s) => s.status === "PARTIAL").length ?? 0;
  const degradedNote = [
    staleCount > 0 ? `${staleCount} stale` : null,
    partialCount > 0 ? `${partialCount} partial` : null,
  ]
    .filter((x) => x !== null)
    .join(" · ");

  // Every headline figure resolves to the screen that derives it. A KPI a
  // reader cannot open is a figure they are asked to take on trust.
  const stats: KpiTile[] = [
    {
      // Live, because the page this tile LINKS to is live. A tile reading 7
      // over a destination listing 6 is this panel's own defect moved one
      // click along — the trap the blocker caption below it already records.
      label: "ACTIVE BLOCKERS",
      value: String(live?.blockerCount ?? agg.blockerCount),
      note: `of ${agg.exceptionCount} designed exceptions`,
      tone: "ember",
      href: "/exceptions?filter=blockers",
      hrefLabel: "the blocking items",
    },
    {
      label: "BLOCKER EXPOSURE",
      value: formatCents(live?.blockerExposureCents ?? agg.blockerExposureCents),
      note: "open blockers only",
      href: "/exceptions?filter=blockers",
      hrefLabel: "the blocking items by exposure",
    },
    {
      label: "CURRENT GL DIFFERENCE",
      value: formatCents(agg.grossGlDifferenceCents),
      note: "GL over subledger · gross",
      tone: "warn",
      href: "/reconciliation?tab=financial",
      hrefLabel: "the subledger-to-GL reconciliation",
    },
    {
      label: "GROSS SUBLEDGER / GL",
      value: `${formatCentsMillions(agg.grossInventoryCents, 2)} / ${formatCentsMillions(agg.grossGlCents, 3)}`,
      note: units !== undefined ? `${units.length.toLocaleString("en-US")} book units` : "—",
      href: "/inventory",
      hrefLabel: "the inventory population",
    },
    {
      label: "PBC READINESS",
      value: formatBpsExact(agg.pbcReadinessBps),
      note: `${agg.pbcReady} of ${agg.pbcTotal} ready or provided`,
      href: "/audit-package",
      hrefLabel: "the audit package",
    },
    {
      label: "DATA HEALTH",
      value: formatBpsExact(agg.sourceHealthBps),
      note: degradedNote !== "" ? degradedNote : "all sources healthy",
      warnNote: degradedNote !== "",
      href: "/evidence",
      hrefLabel: "the evidence index and source health",
    },
  ];

  const categories = gateCategories(readiness.categories, queries, ctx);

  const pbcRows =
    pbc !== undefined
      ? (
          [
            ["PROVIDED", "Provided", "■", "aurora"],
            ["READY", "Ready", "✓", "aurora"],
            ["PREPARING", "Preparing", "⋯", "frost"],
            ["FOLLOW_UP_REQUESTED", "Follow-Up Requested", "!", "warn"],
            ["NOT_STARTED", "Not Started", "○", "quiet"],
          ] as const
        ).map(([key, label, glyph, tone]) => ({
          label,
          glyph,
          tone,
          count: pbc.filter((p) => p.status === key).length,
        }))
      : undefined;

  // Open NOW. Filtered on `listExceptions`'s frozen `open`, the work queue
  // went on prescribing items this session had concluded.
  const open = exceptions.filter((e) => effectiveById.get(e.exception.id)?.open ?? e.open);
  const attention = attentionItems(user, open, liveOf);

  const activity: ActivityItem[] = [...events]
    .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
    .slice(0, 4)
    .map((e) => ({
      label: eventTypeLabel(e.eventType),
      detail: e.description,
      by: e.recordedBy,
      when: formatDateShort(e.occurredAt),
      ...(EVENT_GLYPHS[e.eventType] ?? { glyph: "●", tone: "frost" as const }),
    }));

  const healthRows: SourceHealthRow[] =
    health?.sources.map((s) => {
      const v = sourceHealthView(s.status);
      return { name: sourceName(s.sourceSystem), state: v.label, glyph: v.glyph, variant: v.variant };
    }) ?? [];

  const staleSource = health?.sources.find((s) => s.status === "STALE");
  const affectedByStale =
    staleSource !== undefined
      ? open
          .filter((e) =>
            e.sourceCoverageWarnings.some((w) => w.sourceSystem === staleSource.sourceSystem),
          )
          .map((e) => e.exception.id)
      : [];

  const drawers: Record<string, ExceptionDrawerData> = {};
  for (const view of blockerViews) {
    const context = gatherExceptionContext(queries, ctx, view);
    drawers[view.exception.id] = assembleDrawer(context, blockerIds.has(view.exception.id));
  }

  return {
    restricted: false,
    roleLabel: roleLabel(user),
    gate: {
      // Live, like the blocker count beside it. A panel where one figure
      // moved and its neighbour did not is a panel that cannot be read.
      readinessOverview: formatBpsOverview(live?.readinessBps ?? readiness.totalBasisPoints),
      bps: live?.readinessBps ?? readiness.totalBasisPoints,
      categories,
      stats,
      // The gate reads LIVE state: conclusions recorded in this session
      // count. The rules' own baseline stays reportable beside it, because a
      // figure that moved is only meaningful next to the one it moved from.
      blockerCount: live?.blockerCount ?? agg.blockerCount,
      // `plural` on both of these, and on the sign-off reason below. They are
      // live figures carrying a hard-coded plural — the same trap as the
      // header KPI, and the same reason it was invisible: the count was seven
      // until somebody concluded, and no baseline render can reach one. Found
      // in the browser pass at the demo's climax, where the gate read
      // "Unavailable — 1 blockers open".
      blockerSummary: `${live?.blockerCount ?? agg.blockerCount} ${plural(live?.blockerCount ?? agg.blockerCount, "blocker")} · ${formatCents(live?.blockerExposureCents ?? agg.blockerExposureCents)}`,
      blockerExposure: `${formatCents(live?.blockerExposureCents ?? agg.blockerExposureCents)} exposure`,
      signOff: {
        available: (live?.blockerCount ?? agg.blockerCount) === 0,
        permitted: capabilities?.canSignOff ?? false,
        reason:
          (live?.blockerCount ?? agg.blockerCount) > 0
            ? `Unavailable — ${live?.blockerCount ?? agg.blockerCount} ${plural(live?.blockerCount ?? agg.blockerCount, "blocker")} open`
            : capabilities?.canSignOff === true
              ? "Every blocker has a management conclusion. Signing off locks the period."
              : "Your demo role cannot record sign-off.",
        locked: period?.state === "LOCKED" || period?.state === "SOFT_LOCKED",
      },
      divergence: buildDivergenceNote(live, readiness.totalBasisPoints, agg.blockerCount),
    },
    preventing: {
      rows: shown.map((e) => blockerRow(e, true, liveOf)),
      shownTotal: formatCents(shownCents),
      // From the same live set the rows come from. These read `agg`, the
      // baseline aggregate, so the header contradicted the `shownTotal`
      // printed directly above it the moment anything was concluded.
      allTotal: formatCents(
        blockerViews.reduce((n, e) => n + e.exception.finding.exposureCents, 0),
      ),
      blockerCount: liveBlockerCount,
      // Live, like `blockerCount` on the line above and like the destination
      // it links to. Read from the baseline aggregate, OverviewScreen.tsx:390
      // rendered "View all 7 in the exception register →" beside a caption
      // reading "complete the six still open", pointing at an /exceptions
      // header reading "6 blockers".
      registerCount: live?.blockerCount ?? agg.blockerCount,
      remainingNote,
    },
    ...(recon !== undefined
      ? {
          glPanel: {
            grossGl: formatCents(recon.grossGlCents),
            grossSubledger: formatCents(recon.subledgerCents),
            difference: formatCents(recon.differenceCents),
            // The unexplained remainder IS the potential adjusted
            // difference — the deterministic core computes it; the UI
            // never does reconciliation arithmetic.
            potentialAdjusted: formatCents(recon.unexplainedCents),
            // The potential adjusted figure applies EVERY identified item,
            // so the count beside it is the identified count — but only
            // some of those have an entry drafted, and "proposed" is this
            // product's word for a drafted one. Both numbers are shown so
            // the sentence cannot overstate either.
            identifiedCount: recon.items.length,
            draftedCount: register?.draftedCount ?? 0,
          },
        }
      : {}),
    pbcPanel:
      pbc !== undefined && pbcRows !== undefined
        ? {
            restricted: false,
            summary: `${agg.pbcReady} / ${agg.pbcTotal} · ${formatBpsExact(agg.pbcReadinessBps)}`,
            rows: pbcRows,
          }
        : { restricted: true },
    attention,
    activity,
    closeAreas: {
      categories,
      // LABELLED, not made live — deliberately, and this is the one figure on
      // the page where that is the right answer. The weighted score is the
      // readiness policy's own output over the rules' own population; making
      // it live would be a second definition of readiness. What was wrong was
      // shipping it unlabelled: the bare "Weighted result …" sentence sat on
      // the same screen as a live gate showing a different percentage, and a
      // reader had no way to know they were answers to different questions.
      // One unlabelled number that disagrees with the gate is the defect; two
      // labelled numbers are the product's whole argument. The divergence note
      // at data.ts:385 says the same thing at the gate.
      //
      // No figure is written here, deliberately: `no-hardcoded-totals.test.ts`
      // scans this tree for the canonical strings and does not strip comments,
      // which is the right conservatism — a figure transcribed into a comment
      // is a figure that can go stale beside the code it describes.
      weightedResult: `Weighted result ${formatBpsExact(readiness.totalBasisPoints)} · ${readiness.totalBasisPoints} bps — the rules' baseline, before this session's conclusions`,
    },
    ...(health !== undefined
      ? {
          sourceHealth: {
            rows: healthRows,
            // Numerator summed from the domain's own score table, denominator
            // counted from the sources the service returned — neither invented
            // here, and neither reconstructed from the rounded aggregate.
            summary: `${(
              health.sources.reduce(
                (sum, s) => sum + SOURCE_HEALTH_SCORE_HUNDREDTHS[s.status],
                0,
              ) / 100
            ).toFixed(2)} / ${health.sources.length} · ${formatBpsExact(health.aggregateBasisPoints)}`,
            callout:
              staleSource !== undefined
                ? {
                    title: `${sourceName(staleSource.sourceSystem)} stale — last sync ${staleSource.lastSyncAt !== undefined ? formatDateShort(staleSource.lastSyncAt) : "unknown"}`,
                    body: staleSource.note ?? "Source is stale.",
                    affected:
                      affectedByStale.length > 0
                        ? `Coverage warnings on ${affectedByStale.join(", ")}.`
                        : "No open items affected.",
                  }
                : null,
          },
        }
      : {}),
    drawers,
  };
}

/**
 * Control-domain sections (stage 09). Cutoff and Ownership are filtered
 * views of the exception queue (design/IMPLEMENTATION_HANDOFF §9.4), and
 * the domains each one includes are read from the rule registry rather than
 * transcribed as a list of rule ids that would silently go stale.
 *
 * Ownership carries THIRD_PARTY as well as OWNERSHIP: units held by a third
 * party and units on loan at a customer site are the same assertion — do we
 * own what the books say we own. That is an authored grouping, so the page
 * states which domains it contains instead of leaving the reader to infer
 * why a third-party item appears there.
 */
export const EXCEPTION_SECTIONS: Readonly<
  Record<
    string,
    {
      readonly label: string;
      readonly title: string;
      readonly context: string;
      readonly domains: readonly string[];
      readonly emptyNote: string;
    }
  >
> = {
  cutoff: {
    label: "Cutoff",
    title: "Cutoff",
    context: "Did each transaction land in the right period?",
    domains: ["CUTOFF"],
    emptyNote: "No cutoff rule produced an exception in this close.",
  },
  ownership: {
    label: "Ownership",
    title: "Ownership",
    context: "Do we own what the books say we own, wherever the unit physically sits?",
    domains: ["OWNERSHIP", "THIRD_PARTY"],
    emptyNote: "No ownership or third-party rule produced an exception in this close.",
  },
};

export function buildExceptionsData(
  user: DemoUser,
  correlationId: string,
  /** A key of EXCEPTION_SECTIONS; omitted for the full queue. */
  sectionKey?: string,
  /**
   * "blockers" narrows the queue to the items preventing sign-off — the
   * destination of the Overview's blocker and exposure figures. It is a
   * filter over the same queue, so the page states what it is showing and
   * out of how many, exactly as the control-domain sections do.
   */
  filterKey?: string,
): ExceptionsData {
  const queries = getQueries();
  const ctx = makeContext(user, correlationId);
  const section = sectionKey !== undefined ? EXCEPTION_SECTIONS[sectionKey] : undefined;
  const blockersOnly = filterKey === "blockers";
  const all = attempt(() => queries.listExceptions(ctx));
  if (all === undefined) {
    return {
      restricted: true,
      roleLabel: roleLabel(user),
      rows: [],
      openBlockerCount: 0,
      openBlockerExposure: "—",
      totalCount: 0,
      drawers: {},
      filter: null,
    };
  }
  const rules = attempt(() => queries.listRuleSummaries(ctx)) ?? [];
  const domainOf = new Map(rules.map((r) => [r.id, r.controlDomain]));

  /**
   * The queue answers from the LIVE close, and names the rules' position.
   *
   * `listExceptions` returns the frozen status and `open = !isResolvedStatus`
   * of it, and the blocker set came from `getBlockers`, which is the rules'
   * own. So an exception concluded in this session kept its baseline status
   * capsule here and stayed in "Preventing sign-off" — a page whose caption
   * reads "The open items management must conclude", listing an item
   * management had just concluded, while the Overview that links here had
   * already moved. `getEffectiveExceptions` carries both positions per row,
   * which is why the baseline is still reportable below.
   */
  const effective = attempt(() => queries.getEffectiveExceptions(ctx));
  const effectiveById = new Map(
    (effective ?? []).map((e) => [e.exception.id, e]),
  );
  const live = attempt(() => queries.getEffectiveClose(ctx));
  const baselineBlockerIds = new Set(
    (attempt(() => queries.getBlockers(ctx)) ?? []).map((b) => b.exceptionId),
  );
  const allBlockerIds =
    live !== undefined
      ? new Set(live.blockers.map((b) => b.exceptionId))
      : baselineBlockerIds;
  /** The effective status of a row, falling back to the rules' own. */
  const statusOf = (e: (typeof all)[number]) =>
    (effectiveById.get(e.exception.id)?.effectiveStatus as typeof e.exception.status | undefined) ??
    e.exception.status;
  const openOf = (e: (typeof all)[number]) =>
    effectiveById.get(e.exception.id)?.open ?? e.open;
  const domainFiltered =
    section === undefined
      ? all
      : all.filter((e) => {
          const domain = domainOf.get(e.exception.finding.ruleId);
          return domain !== undefined && section.domains.includes(domain);
        });
  const exceptions = blockersOnly
    ? domainFiltered.filter((e) => allBlockerIds.has(e.exception.id))
    : domainFiltered;

  const blockers = (live?.blockers ?? attempt(() => queries.getBlockers(ctx)) ?? []).filter((b) =>
    exceptions.some((e) => e.exception.id === b.exceptionId),
  );
  const blockerIds = new Set(blockers.map((b) => b.exceptionId));

  const ordered = [...exceptions].sort((a, b) =>
    defaultExceptionOrder(
      {
        open: openOf(a),
        blocker: blockerIds.has(a.exception.id),
        exposureCents: a.exception.finding.exposureCents,
        id: a.exception.id,
      },
      {
        open: openOf(b),
        blocker: blockerIds.has(b.exception.id),
        exposureCents: b.exception.finding.exposureCents,
        id: b.exception.id,
      },
    ),
  );

  const drawers: Record<string, ExceptionDrawerData> = {};
  for (const view of ordered) {
    const context = gatherExceptionContext(queries, ctx, view);
    drawers[view.exception.id] = assembleDrawer(context, blockerIds.has(view.exception.id));
  }

  return {
    restricted: false,
    roleLabel: roleLabel(user),
    rows: ordered.map((e) => ({
      id: e.exception.id,
      title: e.exception.finding.title,
      ruleId: e.exception.finding.ruleId,
      exposure: formatCents(e.exception.finding.exposureCents),
      risk: riskView(e.exception.finding.risk),
      status: statusView(statusOf(e)),
      blocker: blockerIds.has(e.exception.id),
      open: openOf(e),
      coverageWarnings: e.sourceCoverageWarnings.map(
        (w) => `${sourceLabel(w.sourceSystem)} ${w.status}`,
      ),
    })),
    openBlockerCount: blockers.length,
    openBlockerExposure: formatCents(
      blockers.reduce((n, b) => n + b.exposureCents, 0),
    ),
    totalCount: exceptions.length,
    drawers,
    filter:
      section !== undefined
        ? {
            title: section.title,
            context: section.context,
            // The basis is stated, not implied: this page is a filter over
            // the queue, and its counts are the filter's, not the close's.
            basis: `Exceptions whose rule belongs to the ${section.domains.join(" or ")} control ${section.domains.length === 1 ? "domain" : "domains"}.`,
            shown: exceptions.length,
            outOf: all.length,
            emptyNote: section.emptyNote,
          }
        : blockersOnly
          ? {
              title: "Preventing sign-off",
              context: "The open items management must conclude before the period can be signed off.",
              /**
               * Live, and the rules' own count named beside it once they
               * differ — so a reader who has concluded something is told their
               * work moved this page, rather than being shown a shorter list
               * with no explanation for why it shortened.
               */
              basis:
                live !== undefined && live.blockers.length !== baselineBlockerIds.size
                  ? `Blockers still open, ordered by exposure. The rules raised ${baselineBlockerIds.size}; ${baselineBlockerIds.size - live.blockers.length} ${baselineBlockerIds.size - live.blockers.length === 1 ? "has" : "have"} been concluded in this session and ${baselineBlockerIds.size - live.blockers.length === 1 ? "is" : "are"} no longer listed. An exception that is open but not blocking is not shown here.`
                  : "Open exceptions the close identifies as blockers, ordered by exposure. An exception that is open but not blocking is not shown here.",
              shown: exceptions.length,
              outOf: all.length,
              emptyNote:
                live !== undefined && baselineBlockerIds.size > 0
                  ? `Every blocker the rules raised carries a management conclusion recorded in this session. The rules' own position — ${baselineBlockerIds.size} ${baselineBlockerIds.size === 1 ? "blocker" : "blockers"} — is unchanged and is what Reproduce Close replays.`
                  : "No exception is currently blocking sign-off in this close — verified empty, not assumed.",
            }
          : null,
  };
}

/**
 * How a recorded conclusion reads on screen.
 *
 * Exported so the Ask Gaurd drawer words it from the module that owns the
 * vocabulary rather than restating it. Stage G gave the drawer a path to the
 * recorded conclusion; without this it would have printed `REMAINS_OPEN` at
 * the reader, which is the canonical-token leak `humanizeCanonical` exists to
 * stop.
 */
export const CONCLUSION_LABELS: Readonly<Record<string, string>> = {
  RESOLVED_NO_ADJUSTMENT: "Resolved — no adjustment required",
  RESOLVED_ADJUSTMENT_PROPOSED: "Resolved — adjustment proposed",
  REMAINS_OPEN: "Remains open",
};

/**
 * The three facts the single word "coverage" used to collapse.
 *
 * A control can be fully evaluated — every in-scope input read — while the
 * accounting evidence behind it is still incomplete, and management may not
 * have concluded either way. Printing "Coverage COMPLETE" beside "Required
 * evidence missing" made those read as a contradiction when they are three
 * separate, simultaneously-true statements.
 *
 * This is a DISPLAY mapping. The canonical rule vocabulary (PASS / FAIL /
 * REVIEW_REQUIRED / INCOMPLETE / NOT_APPLICABLE and COMPLETE / PARTIAL /
 * INCOMPLETE, CANONICAL_SPEC §10) is hashed into the run's output and is
 * reported unchanged under Audit Details.
 */
function controlState(
  finding: ExceptionView["exception"]["finding"],
  status: ExceptionView["exception"]["status"],
  coverage: string | undefined,
  warnings: ExceptionView["sourceCoverageWarnings"],
  recordedConclusion: string | null,
  /**
   * Outstanding NOW, passed in rather than re-derived. This computed its own
   * set off the frozen finding, so "Accounting evidence · Incomplete · Still
   * required: …" named a record the page's own header had already stopped
   * asking for.
   */
  liveUnmet: readonly string[],
): NonNullable<ExceptionDetailData["whyFlagged"]>["state"] {
  const outstanding = new Set(liveUnmet);
  const unmet = finding.evidenceRequirements.filter(
    (r) => r.required && outstanding.has(r.description),
  );
  const evaluated = coverage === "COMPLETE";
  const warned = warnings
    .map((w) => `${sourceName(w.sourceSystem)} ${w.status.toLowerCase()}`)
    .join(" · ");
  return {
    controlEvaluation: {
      label: evaluated ? "Complete" : "Incomplete",
      note: evaluated
        ? "Every input in scope for this rule was evaluated."
        : warned !== ""
          ? `A source did not answer in full: ${warned}.`
          : "One or more inputs could not be evaluated.",
    },
    accountingEvidence: {
      label: unmet.length === 0 ? "Complete" : "Incomplete",
      note:
        unmet.length === 0
          ? "Every required record is in evidence."
          : `Still required: ${unmet.map((r) => r.description).join("; ")}.`,
    },
    /**
     * Whether a conclusion was RECORDED is a question about the trail, not
     * about the status.
     *
     * This branched on the status alone, and `effectiveStatus` deliberately
     * does not move for REMAINS_OPEN — so a reader who recorded that the item
     * stays open was told on this very panel that no conclusion had been
     * recorded, while the Ask Gaurd drawer over the same exception named their
     * conclusion, who made it and when. Two surfaces, one record, opposite
     * answers. The status still names the label; the recorded conclusion
     * names the note.
     */
    managementConclusion: {
      label: conclusionLabel(status),
      note:
        recordedConclusion === "RESOLVED_NO_ADJUSTMENT"
          ? "Management concluded the item is supported and no adjustment is required."
          : recordedConclusion === "RESOLVED_ADJUSTMENT_PROPOSED"
            ? "Management concluded an adjustment is required. Proposed — never posted by this product."
            : recordedConclusion === "REMAINS_OPEN"
              ? "Management reviewed this item and recorded that it remains open. That is a decision about the review, not about the rule — the status is unchanged."
              : status === "RESOLVED_NO_ADJUSTMENT"
                ? "Management concluded the item is supported and no adjustment is required."
                : status === "RESOLVED_ADJUSTMENT_PROPOSED"
                  ? "Management concluded an adjustment is required. Proposed — never posted by this product."
                  : "No management conclusion has been recorded. Software does not conclude on management's behalf.",
    },
  };
}

export function buildExceptionDetailData(
  user: DemoUser,
  exceptionId: string,
  correlationId: string,
): ExceptionDetailData {
  const queries = getQueries();
  const ctx = makeContext(user, correlationId);
  const base = { roleLabel: roleLabel(user), id: exceptionId };

  const view = attempt(() => queries.getException(ctx, exceptionId));
  if (view === undefined) {
    const authorized = attempt(() => queries.listExceptions(ctx)) !== undefined;
    return { ...base, restricted: !authorized, found: false };
  }

  const finding = view.exception.finding;
  /**
   * The rules' own position. Still read, still reported — it is the
   * reproducible artifact — but it is no longer what the header states.
   */
  const baselineStatus = view.exception.status;
  const context = gatherExceptionContext(queries, ctx, view);

  /**
   * This page answers from the LIVE close, and names the baseline where the
   * two differ.
   *
   * `getEffectiveClose` was called in exactly one place in this file — the
   * Overview — while `getBlockers` was called in six. So concluding an
   * exception moved the Overview to "6 blockers · $189,750" and left this page
   * saying, about the item just concluded: status "Recount Required",
   * conclusion "Open", `blocker: true`, "Exception 3 of 7 blockers" and
   * "Obtain: Supervised recount locating the unit" — directly above a panel
   * reading "Resolved — no adjustment required" with nothing outstanding.
   * One page, both answers, on the product's own trust screen, in the one
   * loop the product exists for.
   *
   * `b1cf8aa` closed this family for Ask Gaurd and the Overview. These are the
   * surfaces it did not reach.
   */
  const wf = attempt(() => queries.getExceptionWorkflow(ctx, exceptionId));
  const live = attempt(() => queries.getEffectiveClose(ctx));
  const status = (wf?.effectiveStatus as typeof baselineStatus | undefined) ?? baselineStatus;
  const statusMoved = status !== baselineStatus;

  const liveBlockerIds = (live?.blockers ?? []).map((b) => b.exceptionId);
  const baselineBlockers = attempt(() => queries.getBlockers(ctx)) ?? [];
  const blockerIds = live !== undefined ? liveBlockerIds : baselineBlockers.map((b) => b.exceptionId);
  const isBlocker = blockerIds.includes(exceptionId);
  const wasBaselineBlocker = baselineBlockers.some((b) => b.exceptionId === exceptionId);

  const manifest = attempt(() => queries.getRunManifest(ctx));
  const executions = attempt(() => queries.getRuleExecutions(ctx)) ?? [];
  const execution = executions.find((e) => String(e.ruleId) === finding.ruleId);

  /**
   * Outstanding NOW, counting what this session has submitted — the same
   * field the ConclusionPanel eighteen lines below already reads. Read from
   * the frozen finding, the header demanded a record the panel beneath it
   * showed as obtained.
   */
  const unmet =
    wf?.unmetRequirements !== undefined
      ? [...wf.unmetRequirements]
      : finding.evidenceRequirements
          .filter((r) => r.required && !r.satisfied)
          .map((r) => r.description);
  const routing = ownerForStatus(status);

  const serials = finding.subjects.serials ?? [];
  const skus = [...new Set(context.bookUnits.map((u) => u.sku))];
  const exposureDetail =
    serials.length > 0
      ? `${formatCents(finding.exposureCents)} · ${serials.length} × ${skus.join(", ") || "unit"}`
      : formatCents(finding.exposureCents);

  // Evidence lenses. The three-layer reality is the CUTOFF/OWNERSHIP pattern
  // (canonical on EXC-001 per design 03); other control domains get lenses
  // that name what their own evidence actually is, and a lens with nothing
  // behind it is omitted rather than filled. See exception-lenses.ts.
  const periodEnd = attempt(() => queries.getReconciliation(ctx))?.asOf;
  const staleWarning = view.sourceCoverageWarnings[0];
  const lenses = buildLenses({
    finding,
    status,
    context,
    periodEnd,
    staleNote: staleNoteText(staleWarning),
  });

  // Working state: what a person has done about this item, kept separate
  // from what the rule found. `wf` is fetched above, because the header now
  // answers from it too — one lookup, one position, no chance of the two
  // halves of this page reading different runs.
  const capabilities = attempt(() => queries.getDemoCapabilities(ctx));
  const conclusionRecord = wf?.conclusion ?? null;
  const workflow: ExceptionDetailData["workflow"] =
    wf === undefined
      ? null
      : {
          exceptionId,
          owner: routing.actionParty,
          unmetRequirements: wf.unmetRequirements,
          canResolve: wf.canResolve,
          canConclude: capabilities?.canConclude ?? false,
          canRequest: capabilities?.canRequestEvidence ?? false,
          canSubmit: capabilities?.canSubmitEvidence ?? false,
          conclusion:
            conclusionRecord !== null
              ? { conclusion: conclusionRecord.conclusion, rationale: conclusionRecord.rationale }
              : null,
          conclusionLabel:
            conclusionRecord !== null ? CONCLUSION_LABELS[conclusionRecord.conclusion] ?? conclusionRecord.conclusion : "",
          conclusionBy:
            conclusionRecord !== null
              ? (DEMO_USERS.find((u) => u.id === conclusionRecord.byUserId)?.displayName ??
                conclusionRecord.byUserId)
              : "",
          conclusionAt: conclusionRecord !== null ? formatInstant(conclusionRecord.at) : "",
          requests: wf.requests.map((r) => ({ requirement: r.requirement, askedOf: r.askedOf })),
          submissions: wf.submissions.map((s) => ({
            title: s.title,
            requirement: s.requirement,
            reviewState: s.reviewState,
          })),
        };

  const evidenceState = assembleEvidenceState(context);
  const timeline = assembleTimeline(context);

  // Commercial chain whose subject matches this exception's transactions/serials.
  const chains = attempt(() => queries.getCommercialChains(ctx)) ?? [];
  const chain = chains.find(
    (c) =>
      (finding.subjects.transactionNumbers ?? []).includes(c.subjectRef) ||
      serials.includes(c.subjectRef),
  );
  const evidenceByRef = new Map<string, string>();
  for (const e of context.evidence) {
    evidenceByRef.set(e.title, e.id);
    if (e.internalId !== undefined) evidenceByRef.set(e.internalId, e.id);
  }
  const chainData =
    chain !== undefined
      ? {
          summary: `${chain.presentCount} of ${chain.totalCount} components present — completeness is not a conclusion. ${
            chain.requiredMissingCount === 1
              ? "The missing component is required."
              : `${titleCase(numberWord(chain.requiredMissingCount))} missing components are required.`
          }`,
          nodes: assembleChainNodes(chain.components, evidenceByRef),
        }
      : null;

  const datasetVersion = manifest?.datasetVersion ?? "—";
  const evidenceRecords: Record<string, ReturnType<typeof assembleEvidenceRecord>> = {};
  for (const e of context.evidence) {
    evidenceRecords[e.id] = assembleEvidenceRecord(e, view, datasetVersion, user);
  }

  return {
    ...base,
    restricted: false,
    found: true,
    header: {
      title: finding.title,
      status: statusView(status),
      risk: riskView(finding.risk),
      blocker: isBlocker,
      owner: routing.owner,
      exposure: formatCents(finding.exposureCents),
      exposureDetail,
      primarySerial: serials[0] ?? null,
      description: finding.whyFlagged,
      conclusion: conclusionLabel(status),
      /**
       * Where the live position differs from the rules', this line is what
       * names the difference — the reader is looking straight at the
       * conclusion, so it is where the baseline belongs. The rules' position
       * is not lost by being superseded: it is the reproducible artifact, and
       * Reproduce Close replays it.
       */
      conclusionNote: statusMoved
        ? `The rules derived this as "${statusView(baselineStatus).label}". A management conclusion recorded in this session supersedes that; the rules' own position is unchanged.`
        : status === "RESOLVED_ADJUSTMENT_PROPOSED"
          ? "Adjustment proposed — not posted"
          : "No proposed adjustment at baseline",
      nextAction: nextActionText(status, unmet),
      nextActionParty: routing.actionParty,
      /**
       * Three states, not two. `!isBlocker → "Resolved exception"` was true
       * only by coincidence — every open exception is a blocker on this
       * baseline — and the coincidence does not survive a session: an item
       * concluded REMAINS_OPEN stays open, and one whose blocker status is
       * lifted while it stays open would have read "Resolved" outright.
       */
      positionLabel: isBlocker
        ? `Exception ${blockerIds.indexOf(exceptionId) + 1} of ${blockerIds.length} ${blockerIds.length === 1 ? "blocker" : "blockers"}`
        : conclusionLabel(status) === "Open"
          ? wasBaselineBlocker
            ? "Open — no longer blocking sign-off"
            : "Open exception — not blocking sign-off"
          : "Resolved exception",
    },
    lenses,
    workflow,
    chain: chainData,
    whyFlagged: {
      text: finding.whyFlagged,
      assertions: finding.assertions.map(assertionLabel),
      ruleId: finding.ruleId,
      ruleVersion: finding.ruleVersion,
      result: execution?.result ?? "—",
      coverage: execution?.coverage ?? "—",
      state: controlState(
        finding,
        status,
        execution?.coverage,
        view.sourceCoverageWarnings,
        conclusionRecord?.conclusion ?? null,
        unmet,
      ),
      audit: [
        { k: "Object ID", v: exceptionId },
        { k: "Rule", v: `${finding.ruleId} · v${finding.ruleVersion}` },
        {
          k: "Result / coverage",
          v: execution !== undefined ? `${execution.result} · ${execution.coverage}` : "—",
        },
        { k: "Dataset", v: datasetVersion },
        { k: "Run", v: manifest?.runId ?? "—" },
        { k: "Evidence IDs", v: context.evidence.map((e) => e.id).join(", ") || "—" },
        {
          k: "Sources",
          v:
            [...new Set(context.evidence.flatMap((e) => (e.sourceSystem !== undefined ? [e.sourceSystem] : [])))].join(
              " · ",
            ) || "—",
        },
        {
          k: "Evaluated",
          v: execution !== undefined ? formatInstant(String(execution.executedAt)) : "—",
        },
        {
          k: "Output hash",
          v: execution !== undefined ? `sha256:${shortHash(execution.outputHash)}` : "—",
        },
      ],
    },
    evidenceState,
    timeline,
    evidenceRecords,
    // `plural` on the denominator: this reads "Exception 1 of 1 blockers" on
    // the last blocker left, which is exactly where a Controller working the
    // queue down ends up. Found by the sweep in
    // `count-agreement-sweep.test.ts` on its first run.
    blockerPosition: isBlocker
      ? `Exception ${blockerIds.indexOf(exceptionId) + 1} of ${blockerIds.length} ${plural(blockerIds.length, "blocker")}`
      : null,
  };
}
