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
import {
  assembleChainNodes,
  assembleDrawer,
  assembleEvidenceRecord,
  assembleEvidenceState,
  assembleTimeline,
  carrierFact,
  carrierPhrase,
  gatherExceptionContext,
} from "./exception-view";
import {
  assertionLabel,
  capitalize,
  eventTypeLabel,
  kindLabel,
  locationLabel,
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
function attempt<T>(fn: () => T): T | undefined {
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
      const recon = attempt(() => queries.getReconciliation(ctx));
      const n = recon?.items.length ?? 0;
      return { note: `${n} proposed, none posted`, warn: false };
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
  const health = attempt(() => queries.getSourceHealth(ctx));
  const units = attempt(() => queries.listInventoryUnits(ctx));
  const events = attempt(() => queries.getScenarioEvents(ctx)) ?? [];
  const pbc = attempt(() => queries.getPbcStatus(ctx));

  const blockerIds = new Set(blockers.map((b) => b.exceptionId));
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

  const stats: KpiTile[] = [
    {
      label: "ACTIVE BLOCKERS",
      value: String(agg.blockerCount),
      note: `of ${agg.exceptionCount} designed exceptions`,
      tone: "ember",
    },
    {
      label: "BLOCKER EXPOSURE",
      value: formatCents(agg.blockerExposureCents),
      note: "open blockers only",
    },
    {
      label: "CURRENT GL DIFFERENCE",
      value: formatCents(agg.grossGlDifferenceCents),
      note: "GL over subledger · gross",
      tone: "warn",
    },
    {
      label: "GROSS SUBLEDGER / GL",
      value: `${formatCentsMillions(agg.grossInventoryCents, 2)} / ${formatCentsMillions(agg.grossGlCents, 3)}`,
      note: units !== undefined ? `${units.length.toLocaleString("en-US")} book units` : "—",
    },
    {
      label: "PBC READINESS",
      value: formatBpsExact(agg.pbcReadinessBps),
      note: `${agg.pbcReady} of ${agg.pbcTotal} ready or provided`,
    },
    {
      label: "DATA HEALTH",
      value: formatBpsExact(agg.sourceHealthBps),
      note: degradedNote !== "" ? degradedNote : "all sources healthy",
      warnNote: degradedNote !== "",
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
      readinessOverview: formatBpsOverview(readiness.totalBasisPoints),
      readinessExact: formatBpsExact(readiness.totalBasisPoints),
      bps: readiness.totalBasisPoints,
      categories,
      stats,
      blockerCount: agg.blockerCount,
      blockerSummary: `${agg.blockerCount} blockers · ${formatCents(agg.blockerExposureCents)}`,
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
            proposedCount: recon.items.length,
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

export function buildExceptionsData(user: DemoUser, correlationId: string): ExceptionsData {
  const queries = getQueries();
  const ctx = makeContext(user, correlationId);
  const exceptions = attempt(() => queries.listExceptions(ctx));
  if (exceptions === undefined) {
    return {
      restricted: true,
      roleLabel: roleLabel(user),
      rows: [],
      openBlockerCount: 0,
      openBlockerExposure: "—",
      totalCount: 0,
      drawers: {},
    };
  }
  const blockers = attempt(() => queries.getBlockers(ctx)) ?? [];
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

  // Three-layer reality (generic; canonical on EXC-001 per design 03).
  const unitLoc = context.bookUnits[0]
    ? locationLabel(context.bookUnits[0].location)
    : undefined;
  const nsEvidence = context.evidence.filter(
    (e) => e.sourceSystem === "NETSUITE_ERP" || e.sourceSystem === "NETSUITE_WMS",
  );
  const physicalEvidence = context.evidence.filter(
    (e) =>
      e.sourceSystem !== undefined &&
      ["FLIGHTPATH", "DEPLOY_OPS", "DEVICE_CLOUD", "RETURN_LOOP"].includes(e.sourceSystem),
  );
  const physicalFacts: { label: string; value: string; at: string }[] = [];
  const factOf = (kind: string, label: string) => {
    const e = context.evidence.find((x) => x.kind === kind);
    if (!e || !e.content) return;
    const at =
      kind === "ITEM_FULFILLMENT"
        ? (e.content["shipDate"] as string | undefined)
        : kind === "INSTALLATION"
          ? (e.content["installedAt"] as string | undefined)
          : (e.content["firstOnlineAt"] as string | undefined);
    if (at !== undefined) physicalFacts.push({ label, value: formatDateShort(at), at });
  };
  factOf("ITEM_FULFILLMENT", "SHIPPED");
  // The carrier's label is its actual position, not an assumed delivery.
  const carrier = context.evidence.find((x) => x.kind === "CARRIER_SHIPMENT");
  const carrierPosition = carrier !== undefined ? carrierFact(carrier) : undefined;
  if (carrierPosition !== undefined) {
    physicalFacts.push({
      label: carrierPosition.label,
      value: formatDateShort(carrierPosition.at),
      at: carrierPosition.at,
    });
  }
  factOf("INSTALLATION", "INSTALLED");
  factOf("TELEMETRY", "FIRST ONLINE");

  // Deployment is a conclusion about the operational facts, not an assumption:
  // it is claimed only where installation or telemetry actually places the unit
  // with the customer on or before the period end. Inbound goods still moving
  // at year-end say exactly that instead.
  const periodEnd = attempt(() => queries.getReconciliation(ctx))?.asOf;
  const deployedAt = physicalFacts.find(
    (f) => f.label === "INSTALLED" || f.label === "FIRST ONLINE",
  )?.at;
  const physicalHeadline =
    deployedAt !== undefined && periodEnd !== undefined && deployedAt <= periodEnd
      ? "Deployed to customer before year-end"
      : carrierPosition !== undefined && carrierPosition.label !== "DELIVERED"
        ? `${capitalize(carrierPhrase(carrierPosition.label.replace(/ /g, "_")))} — no delivery recorded`
        : physicalFacts.length > 0 || physicalEvidence.length > 0
          ? "Operational evidence on file"
          : "No operational evidence in scope";

  const missingReq = finding.evidenceRequirements.find((r) => r.required && !r.satisfied);
  const requiredForEvidence = context.evidence.find((e) => e.linkType === "REQUIRED_FOR");
  const staleWarning = view.sourceCoverageWarnings[0];

  // The accounting layer states the gap this exception actually has. Only a
  // contract-provision gap may be described as a provision; a requirement with
  // no record behind it is reported as absent rather than attributed to a
  // document that does not exist.
  const provisionGap = requiredForEvidence?.kind === "CONTRACT";
  const accountingHeadline =
    missingReq === undefined
      ? conclusionLabel(status)
      : provisionGap
        ? "Required provision missing"
        : "Required evidence missing";
  const accountingSub =
    missingReq === undefined
      ? "Accounting evidence and management review state."
      : finding.ruleId === "CUT-OUT-001"
        ? "Ownership / acceptance terms governing transfer of control are not present in the executed agreement on file."
        : provisionGap && requiredForEvidence !== undefined
          ? `Not present in ${requiredForEvidence.title}: ${missingReq.description}.`
          : `Not in evidence: ${missingReq.description}. Required for the ${finding.ruleId} conclusion.`;

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
    threeLayer: {
      netsuite: {
        headline: unitLoc !== undefined ? `${unitLoc} Inventory` : "Transaction state",
        sub:
          unitLoc !== undefined
            ? "At Dec. 31, 2026 · not relieved"
            : "ERP records referenced by this exception",
        chips: nsEvidence.map((e) => ({
          src: e.sourceSystem !== undefined ? sourceLabel(e.sourceSystem) : "—",
          kind: kindLabel(e.kind),
          id: e.title,
          evidenceId: e.id,
          netsuite: true,
        })),
        note: "ERP transaction state. Read-only in this MVP — Gaurd never posts, edits or relieves inventory.",
      },
      physical: {
        headline: physicalHeadline,
        facts: physicalFacts.map(({ label, value }) => ({ label, value })),
        chips: physicalEvidence.map((e) => ({
          src: e.sourceSystem !== undefined ? sourceLabel(e.sourceSystem) : "—",
          id: e.title,
          evidenceId: e.id,
          netsuite: false,
        })),
      },
      accounting: {
        headline: accountingHeadline,
        sub: accountingSub,
        missing: missingReq !== undefined,
        missingChip:
          missingReq !== undefined
            ? {
                label: missingReq.description,
                src:
                  requiredForEvidence?.sourceSystem !== undefined
                    ? sourceLabel(requiredForEvidence.sourceSystem)
                    : "—",
                evidenceId: requiredForEvidence?.id ?? null,
              }
            : null,
        staleNote:
          staleWarning !== undefined
            ? `${sourceName(staleWarning.sourceSystem)} source ${staleWarning.status.toLowerCase()}${staleWarning.note !== undefined ? ` — ${staleWarning.note}` : ""}`
            : null,
      },
      interpretation:
        finding.ruleId === "CUT-OUT-001"
          ? {
              label: "LOCATION IS NOT OWNERSHIP",
              text: "Deployment, installation and telemetry establish where the units are and what happened. They do not establish transfer of control. The customer invoice is billing evidence only. Until the governing provision is in evidence, the conclusion stays Open.",
            }
          : null,
    },
    chain: chainData,
    whyFlagged: {
      text: finding.whyFlagged,
      assertions: finding.assertions.map(assertionLabel),
      ruleId: finding.ruleId,
      ruleVersion: finding.ruleVersion,
      result: execution?.result ?? "—",
      coverage: execution?.coverage ?? "—",
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
