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
 * Runs a query, returning undefined ONLY when the viewer's role is denied.
 * Any other failure rethrows: a bug must surface as a bug, never disguise
 * itself as a permissions boundary the Controller would try to request.
 */
export function attempt<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch (error) {
    // Matched by name, not by class: the web app reaches the domain only
    // through the query service and does not depend on @icg/permissions.
    if (error instanceof Error && error.name === "AuthorizationError") return undefined;
    throw error;
  }
}

export function buildShellData(user: DemoUser, correlationId: string): ShellData {
  const queries = getQueries();
  const ctx = makeContext(user, correlationId);

  const readiness = attempt(() => queries.getCloseReadiness(ctx));
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
            ready: `${formatBpsOverview(readiness.totalBasisPoints)} ready`,
            blockers: `${readiness.aggregates.blockerCount} blockers`,
          }
        : null,
    navOpenBlockers: readiness?.aggregates.blockerCount ?? null,
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
  const exceptions = attempt(() => queries.listExceptions(ctx)) ?? [];
  const open = exceptions.filter((e) => e.open);
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
      const missing = open.filter((e) =>
        e.exception.finding.evidenceRequirements.some(
          (r) => r.required && !r.satisfied && /contract|provision|agreement/i.test(r.description),
        ),
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
      const blockers = attempt(() => queries.getBlockers(ctx)) ?? [];
      return { note: `${blockers.length} open blockers`, warn: blockers.length > 0 };
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

function blockerRow(view: ExceptionView, blocker: boolean): BlockerRow {
  const finding = view.exception.finding;
  const status = view.exception.status;
  const unmet = finding.evidenceRequirements
    .filter((r) => r.required && !r.satisfied)
    .map((r) => r.description);
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
    .filter((e) => parties.includes(ownerForStatus(e.exception.status).actionParty))
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
      const status = e.exception.status;
      const unmet = f.evidenceRequirements
        .filter((r) => r.required && !r.satisfied)
        .map((r) => r.description);
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
function buildDivergenceNote(
  live: { diverged: boolean; concludedCount: number } | undefined,
  baselineBps: number,
  baselineBlockers: number,
): string | null {
  if (live === undefined || !live.diverged) return null;
  const items = `${live.concludedCount} item${live.concludedCount === 1 ? "" : "s"}`;
  return `Showing this session's position: ${items} concluded since the run. The close as the rules derived it was ${formatBpsOverview(baselineBps)} ready with ${baselineBlockers} blockers — Reset Demo restores it.`;
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

  const remainingNote =
    remaining.length === 0
      ? `All ${numberWord(blockers.length)} blockers shown.`
      : (() => {
          const amounts = remaining.map((e) => e.exception.finding.exposureCents);
          const allEqual = amounts.every((a) => a === amounts[0]);
          const ids = remaining.map((e) => e.exception.id).join(" and ");
          const amountText = allEqual
            ? `${formatCents(amounts[0] ?? 0)} each`
            : remaining.map((e) => formatCents(e.exception.finding.exposureCents)).join(", ");
          return `${ids} (${amountText}) complete the ${numberWord(blockers.length)}.`;
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
      label: "ACTIVE BLOCKERS",
      value: String(agg.blockerCount),
      note: `of ${agg.exceptionCount} designed exceptions`,
      tone: "ember",
      href: "/exceptions?filter=blockers",
      hrefLabel: "the blocking items",
    },
    {
      label: "BLOCKER EXPOSURE",
      value: formatCents(agg.blockerExposureCents),
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

  const open = exceptions.filter((e) => e.open);
  const attention = attentionItems(user, open);

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
      blockerSummary: `${live?.blockerCount ?? agg.blockerCount} blockers · ${formatCents(live?.blockerExposureCents ?? agg.blockerExposureCents)}`,
      blockerExposure: `${formatCents(live?.blockerExposureCents ?? agg.blockerExposureCents)} exposure`,
      signOff: {
        available: (live?.blockerCount ?? agg.blockerCount) === 0,
        permitted: capabilities?.canSignOff ?? false,
        reason:
          (live?.blockerCount ?? agg.blockerCount) > 0
            ? `Unavailable — ${live?.blockerCount ?? agg.blockerCount} blockers open`
            : capabilities?.canSignOff === true
              ? "Every blocker has a management conclusion. Signing off locks the period."
              : "Your demo role cannot record sign-off.",
        locked: period?.state === "LOCKED" || period?.state === "SOFT_LOCKED",
      },
      divergence: buildDivergenceNote(live, readiness.totalBasisPoints, agg.blockerCount),
    },
    preventing: {
      rows: shown.map((e) => blockerRow(e, true)),
      shownTotal: formatCents(shownCents),
      allTotal: formatCents(agg.blockerExposureCents),
      blockerCount: agg.blockerCount,
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
      weightedResult: `Weighted result ${formatBpsExact(readiness.totalBasisPoints)} · ${readiness.totalBasisPoints} bps`,
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
  const allBlockerIds = new Set(
    (attempt(() => queries.getBlockers(ctx)) ?? []).map((b) => b.exceptionId),
  );
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

  const blockers = (attempt(() => queries.getBlockers(ctx)) ?? []).filter((b) =>
    exceptions.some((e) => e.exception.id === b.exceptionId),
  );
  const blockerIds = new Set(blockers.map((b) => b.exceptionId));

  const ordered = [...exceptions].sort((a, b) =>
    defaultExceptionOrder(
      {
        open: a.open,
        blocker: blockerIds.has(a.exception.id),
        exposureCents: a.exception.finding.exposureCents,
        id: a.exception.id,
      },
      {
        open: b.open,
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
      status: statusView(e.exception.status),
      blocker: blockerIds.has(e.exception.id),
      open: e.open,
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
              basis:
                "Open exceptions the close identifies as blockers, ordered by exposure. An exception that is open but not blocking is not shown here.",
              shown: exceptions.length,
              outOf: all.length,
              emptyNote:
                "No exception is currently blocking sign-off in this close — verified empty, not assumed.",
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
): NonNullable<ExceptionDetailData["whyFlagged"]>["state"] {
  const unmet = finding.evidenceRequirements.filter((r) => r.required && !r.satisfied);
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
    managementConclusion: {
      label: conclusionLabel(status),
      note:
        status === "RESOLVED_NO_ADJUSTMENT"
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
  const status = view.exception.status;
  const context = gatherExceptionContext(queries, ctx, view);
  const blockers = attempt(() => queries.getBlockers(ctx)) ?? [];
  const blockerIds = blockers.map((b) => b.exceptionId);
  const isBlocker = blockerIds.includes(exceptionId);
  const manifest = attempt(() => queries.getRunManifest(ctx));
  const executions = attempt(() => queries.getRuleExecutions(ctx)) ?? [];
  const execution = executions.find((e) => String(e.ruleId) === finding.ruleId);

  const unmet = finding.evidenceRequirements
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
  // from what the rule found.
  const capabilities = attempt(() => queries.getDemoCapabilities(ctx));
  const wf = attempt(() => queries.getExceptionWorkflow(ctx, exceptionId));
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
      conclusionNote:
        status === "RESOLVED_ADJUSTMENT_PROPOSED"
          ? "Adjustment proposed — not posted"
          : "No proposed adjustment at baseline",
      nextAction: nextActionText(status, unmet),
      nextActionParty: routing.actionParty,
      positionLabel: isBlocker
        ? `Exception ${blockerIds.indexOf(exceptionId) + 1} of ${blockerIds.length} blockers`
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
      state: controlState(finding, status, execution?.coverage, view.sourceCoverageWarnings),
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
    blockerPosition: isBlocker
      ? `Exception ${blockerIds.indexOf(exceptionId) + 1} of ${blockerIds.length} blockers`
      : null,
  };
}
