import type { DemoUser } from "@icg/data";
import { isResolvedStatus } from "@icg/domain";
import type { ExceptionView, QueryService, ServiceContext } from "@icg/services";
import {
  formatCents,
  formatDate,
  formatDateShort,
  formatInstant,
  shortHash,
} from "../format";
import {
  conclusionLabel,
  nextActionText,
  ownerForStatus,
  riskView,
  statusView,
} from "../workflow-view";
import type {
  ChainNodeView,
  EvidenceRecordView,
  ExceptionDrawerData,
  TimelineEntry,
} from "../view-model";
import { attempt } from "./attempt";
import { kindLabel, locationLabel, sourceLabel } from "./humanize";

/**
 * Shared assembly for exception surfaces (stage 05). Everything here is a
 * projection of query-service output into display strings — statuses,
 * amounts, and evidence relationships pass through from the deterministic
 * core unchanged. When the projection cannot find data, the surface shows
 * the absence; it never fills a gap.
 */

interface EvidenceEntry {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly sensitivity: string;
  readonly contentHash: string;
  readonly sourceSystem: string | undefined;
  readonly internalId: string | undefined;
  readonly retrievedAt: string | undefined;
  readonly content: Record<string, unknown> | undefined;
  readonly contentWithheld: boolean;
  readonly linkType: string;
}

export interface ExceptionContext {
  readonly view: ExceptionView;
  readonly evidence: readonly EvidenceEntry[];
  readonly bookUnits: readonly {
    serial: string;
    sku: string;
    location: string;
    unitCostCents: number;
  }[];
  /**
   * True when the viewer's scope hid every evidence row. Each exception
   * carries at least one link for a full-access role, so an empty list is
   * always a scope result — and it has to be said out loud rather than
   * rendered as an empty section.
   */
  readonly evidenceOutOfScope: boolean;
  /**
   * The item's position NOW — the rules' status as this session has moved it,
   * and what is still outstanding counting what has been submitted.
   *
   * It lives here rather than on each consumer because "what is outstanding"
   * is asked by six surfaces built from this one context, and the previous
   * attempt at this fix answered it live in ONE of them. The result was a
   * queue row reading "Resolved — No Adjustment" whose own drawer, assembled
   * twelve lines later in the same loop, read "Recount Required · Open ·
   * Obtain: Supervised recount locating the unit" — the exact contradiction
   * the fix was written to remove, re-created one click away from where it
   * was removed. One lookup, on the object every consumer already receives.
   *
   * `null` only when the projection is unavailable to this caller, in which
   * case every consumer falls back to the rules' frozen position.
   */
  readonly live: {
    readonly effectiveStatus: string;
    readonly unmet: readonly string[];
    readonly hasConclusion: boolean;
  } | null;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** Gather the evidence graph rows for one exception, redactions intact. */
export function gatherExceptionContext(
  queries: QueryService,
  ctx: ServiceContext,
  view: ExceptionView,
): ExceptionContext {
  let evidence: EvidenceEntry[] = [];
  try {
    const items = queries.listEvidence(ctx);
    const links = queries.getEvidenceLinks(ctx);
    evidence = links
      .filter((l) => l.to === view.exception.id)
      .flatMap((l) => {
        const item = items.find((i) => i.id === l.from);
        if (!item) return [];
        const content =
          item.content !== null && typeof item.content === "object"
            ? (item.content as Record<string, unknown>)
            : undefined;
        return [
          {
            id: item.id,
            kind: item.kind,
            title: item.title,
            sensitivity: item.sensitivity,
            contentHash: item.contentHash,
            sourceSystem: item.sourceRef?.sourceSystem,
            internalId: item.sourceRef?.internalId,
            retrievedAt: str(item.sourceRef?.retrievedAt),
            content,
            contentWithheld: item.contentWithheld,
            linkType: l.linkType,
          },
        ];
      });
  } catch {
    // evidence.read denied. The surfaces report the scope (see
    // evidenceOutOfScope) rather than showing empty lists.
    evidence = [];
  }

  const serials = view.exception.finding.subjects.serials ?? [];
  let bookUnits: ExceptionContext["bookUnits"] = [];
  try {
    const units = queries.listInventoryUnits(ctx) as readonly {
      serial: string;
      sku: string;
      location: string;
      unitCostCents: number;
    }[];
    bookUnits = units.filter((u) => serials.includes(u.serial));
  } catch {
    bookUnits = [];
  }
  // The live position, fetched once for every surface built from this context.
  let live: ExceptionContext["live"] = null;
  try {
    const wf = queries.getExceptionWorkflow(ctx, view.exception.id);
    live = {
      effectiveStatus: wf.effectiveStatus,
      unmet: wf.unmetRequirements,
      hasConclusion: wf.conclusion !== null,
    };
  } catch {
    live = null;
  }

  return { view, evidence, bookUnits, evidenceOutOfScope: evidence.length === 0, live };
}

/**
 * What this item's status is NOW, and what it still needs.
 *
 * Every surface built from an `ExceptionContext` asks these two questions, and
 * they must all get the same answer on the same run — that is the whole point
 * of putting the lookup on the context. The frozen finding remains the
 * fallback, and remains the right answer where a surface explicitly reports
 * the rules' own position.
 */
export function livePosition(context: ExceptionContext): {
  status: ExceptionView["exception"]["status"];
  unmet: readonly string[];
  moved: boolean;
} {
  const frozen = context.view.exception.status;
  const status = (context.live?.effectiveStatus as typeof frozen | undefined) ?? frozen;
  const unmet =
    context.live?.unmet ??
    context.view.exception.finding.evidenceRequirements
      .filter((r) => r.required && !r.satisfied)
      .map((r) => r.description);
  return { status, unmet, moved: status !== frozen };
}

/**
 * Every exception as the close reads it NOW, in `ExceptionView` shape.
 *
 * This is `livePosition(context)` above, at list scale: the same question
 * ("what is this item's position now?") asked about the whole population
 * rather than about one context object. A surface that REPORTS CURRENT STATE
 * binds its list here. A surface that explicitly reports the rules' own
 * answer calls `queries.listExceptions` directly — and must label it, because
 * an unlabelled frozen figure beside a live one is two numbers for one fact.
 *
 * The rows are `listExceptions`' rows with `open` and `exception.status`
 * replaced by the effective ones, matched by id; a row with no effective
 * match passes through untouched, and if the effective projection is
 * unavailable to this caller the whole baseline list passes through.
 *
 * It exists because there were already four hand-rolled copies of
 * "`effectiveStatus` if there is one, else the frozen status" in this app, and
 * that duplication is the documented mechanism behind the reopen rate: each
 * copy is a place the next fix can miss. `financial-life-view.ts:1122` built
 * a fifth, then handed the FROZEN list to the function that renders from it.
 */
export function liveExceptionViews(
  queries: QueryService,
  ctx: ServiceContext,
): readonly ExceptionView[] {
  const baseline = attempt(() => queries.listExceptions(ctx)) ?? [];
  const effective = attempt(() => queries.getEffectiveExceptions(ctx));
  if (effective === undefined) return baseline;
  const byId = new Map(effective.map((e) => [e.exception.id, e]));
  return baseline.map((view) => {
    const live = byId.get(view.exception.id);
    if (live === undefined) return view;
    return {
      ...view,
      open: live.open,
      exception: {
        ...view.exception,
        // `effectiveStatus` is typed `string` on EffectiveExceptionView. This
        // is the ONE point where it becomes the DerivedException status
        // union; no consumer downstream should have to cast it again.
        status: live.effectiveStatus as ExceptionView["exception"]["status"],
      },
    };
  });
}

/** Said out loud wherever a viewer's scope, not the data, empties a section. */
const SCOPE_NOTICE =
  "Evidence records for this exception are outside your scope. Provided audit support lives in the Audit Package.";

/**
 * The carrier event that represents where a shipment stands: the delivery if
 * one occurred, otherwise the latest event on file. A shipment still moving at
 * period end is a fact the close has to see — it must not drop out of the
 * chronology just because it never reached DELIVERED.
 */
function carrierEvent(e: EvidenceEntry): { type: string; at: string } | undefined {
  const events = e.content?.["events"];
  if (!Array.isArray(events)) return undefined;
  const rows = (events as Record<string, unknown>[]).flatMap((ev) => {
    const at = str(ev["occurredAt"]);
    const type = str(ev["eventType"]);
    return at !== undefined && type !== undefined ? [{ type, at }] : [];
  });
  const delivered = rows.find((r) => r.type === "DELIVERED");
  if (delivered !== undefined) return delivered;
  return rows.reduce<{ type: string; at: string } | undefined>(
    (latest, r) => (latest === undefined || r.at > latest.at ? r : latest),
    undefined,
  );
}

/**
 * Carrier position as a labelled fact for the three-layer physical strip.
 * Reports the shipment's real state, so a shipment still moving at period end
 * reads as in transit and a delivered one never can.
 */
export function carrierFact(
  e: ExceptionContext["evidence"][number],
): { label: string; at: string } | undefined {
  const ev = carrierEvent(e);
  return ev === undefined ? undefined : { label: ev.type.replace(/_/g, " "), at: ev.at };
}

/** Human phrase for a carrier position — never "in transit" for a delivery. */
export function carrierPhrase(type: string): string {
  const map: Record<string, string> = {
    DELIVERED: "delivered",
    OUT_FOR_DELIVERY: "out for delivery",
    IN_TRANSIT: "in transit",
    PICKUP: "picked up",
    EXCEPTION: "carrier exception",
  };
  return map[type] ?? type.toLowerCase().replace(/_/g, " ");
}

/** Primary occurrence instant for an evidence record, by kind. */
function occurredAt(e: EvidenceEntry): string | undefined {
  const c = e.content;
  if (!c) return undefined;
  switch (e.kind) {
    case "SALES_ORDER":
      return str(c["orderDate"]);
    case "ITEM_FULFILLMENT":
      return str(c["shipDate"]);
    case "CUSTOMER_INVOICE":
      return str(c["invoiceDate"]);
    case "PURCHASE_ORDER":
      return str(c["orderDate"]);
    case "ITEM_RECEIPT":
      return str(c["receiptDate"]);
    case "VENDOR_BILL":
      return str(c["billDate"]);
    case "GL_ENTRY":
      return str(c["postedAt"]) ?? str(c["entryDate"]);
    case "CARRIER_SHIPMENT":
      return carrierEvent(e)?.at;
    case "INSTALLATION":
      return str(c["installedAt"]);
    case "TELEMETRY":
      return str(c["firstOnlineAt"]);
    case "CONTRACT":
      return str(c["effectiveDate"]);
    case "FORECAST":
      return str(c["asOf"]);
    default:
      return undefined;
  }
}

/** Timeline label per evidence kind. */
function timelineLabel(e: EvidenceEntry): string {
  const c = e.content;
  switch (e.kind) {
    case "SALES_ORDER":
      return `Sales Order ${e.title}`;
    case "ITEM_FULFILLMENT":
      return `Item Fulfillment ${e.title} — shipped`;
    case "CARRIER_SHIPMENT": {
      const ev = carrierEvent(e);
      if (ev === undefined) return "Carrier shipment";
      return ev.type === "DELIVERED"
        ? "Carrier delivery"
        : `Carrier shipment — ${carrierPhrase(ev.type)}`;
    }
    case "INSTALLATION":
      return "Installation complete";
    case "TELEMETRY":
      return "Device first online";
    case "CUSTOMER_INVOICE":
      return `Customer invoice ${e.title}`;
    case "GL_ENTRY":
      return `GL entry ${e.title}`;
    default:
      return `${kindLabel(e.kind)} ${str(c?.["id"]) ?? e.title}`;
  }
}

const CONFLICT_REASON = "SHIPPED_NOT_RELIEVED";

/**
 * The evidence-state groups. "Conflicting" combines graph CONFLICTS_WITH
 * links with the book-position conflict the cutoff reason codes assert
 * (both facts are real service output; the pairing is presentation).
 */
export function assembleEvidenceState(context: ExceptionContext): {
  known: { label: string; src: string; evidenceId: string }[];
  conflicting: { title: string; detail: string; evidenceId: string | null }[];
  missing: { title: string; detail: string; evidenceId: string | null }[];
  scopeNotice: string | null;
} {
  const { view, evidence, bookUnits } = context;
  const finding = view.exception.finding;

  const known = evidence
    .filter((e) => e.linkType === "SUPPORTS" || e.linkType === "CORROBORATES")
    .map((e) => ({
      label: kindLabel(e.kind),
      src: e.sourceSystem !== undefined ? sourceLabel(e.sourceSystem) : "—",
      evidenceId: e.id,
    }));

  const conflicting: { title: string; detail: string; evidenceId: string | null }[] =
    evidence
      .filter((e) => e.linkType === "CONFLICTS_WITH")
      .map((e) => ({
        title: `${kindLabel(e.kind)} conflicts with the book position`,
        detail: e.title,
        evidenceId: e.id,
      }));
  // The conflict is a claim ABOUT the evidence above it. With none of that
  // evidence visible to this viewer, the claim has nothing to stand on and
  // must not be asserted.
  if (
    finding.reasonCodes.includes(CONFLICT_REASON) &&
    bookUnits.length > 0 &&
    evidence.length > 0
  ) {
    const loc = bookUnits[0] ? locationLabel(bookUnits[0].location) : "the book";
    conflicting.push({
      title: `NetSuite ${loc} state at period end vs. pre-year-end deployment evidence`,
      detail:
        "Both facts are sourced and both cannot be true of the same unit at the same date.",
      evidenceId: null,
    });
  }

  // Outstanding NOW. Read from the frozen finding, this listed a record the
  // product itself had accepted a submission against — under a heading saying
  // the close does not hold it.
  const stillUnmet = new Set(livePosition(context).unmet);
  const missing: { title: string; detail: string; evidenceId: string | null }[] = [];
  for (const req of finding.evidenceRequirements) {
    if (!req.required || !stillUnmet.has(req.description)) continue;
    const requiredFor = evidence.find((e) => e.linkType === "REQUIRED_FOR");
    const stale = view.sourceCoverageWarnings
      .map(
        (w) =>
          `${sourceLabel(w.sourceSystem)} ${w.status.toLowerCase()}${w.note !== undefined ? ` — ${w.note}` : ""}`,
      )
      .join("; ");
    missing.push({
      title: req.description,
      detail:
        `Required for the ${finding.ruleId} conclusion.` + (stale !== "" ? ` ${stale}.` : ""),
      evidenceId: requiredFor?.id ?? null,
    });
  }
  return {
    known,
    conflicting,
    missing,
    scopeNotice: context.evidenceOutOfScope ? SCOPE_NOTICE : null,
  };
}

/** Chronological evidence timeline; undated missing evidence stays outside. */
export function assembleTimeline(context: ExceptionContext): {
  entries: TimelineEntry[];
  missingBlocks: { label: string; detail: string; evidenceId: string | null }[];
  scopeNotice: string | null;
} {
  const { view, evidence, bookUnits } = context;
  const finding = view.exception.finding;

  const dated = evidence
    .flatMap((e) => {
      // A record whose link is REQUIRED_FOR marks an evidence GAP (e.g. the
      // contract whose provision is missing). Its document date must not
      // appear as a chronological event — the gap renders outside the
      // timeline instead, per design 03.
      if (e.linkType === "REQUIRED_FOR") return [];
      const at = occurredAt(e);
      if (at === undefined) return [];
      return [
        {
          at,
          entry: {
            date: formatDateShort(at),
            label: timelineLabel(e),
            src: `${e.sourceSystem !== undefined ? sourceLabel(e.sourceSystem) : "—"} · ${e.title}`,
            glyph: e.linkType === "CORROBORATES" ? "≈" : "●",
            tone: (e.linkType === "CORROBORATES" ? "soft" : "ink") as TimelineEntry["tone"],
            emphasis: false,
            evidenceId: e.id,
          },
        },
      ];
    })
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

  const entries: TimelineEntry[] = dated.map((d) => d.entry);

  // The period-end book position that conflicts with the operational story
  // is a dated fact from the inventory snapshot — shown in the chronology.
  // "conflicts with the evidence above" needs evidence above it.
  if (finding.reasonCodes.includes(CONFLICT_REASON) && bookUnits.length > 0 && dated.length > 0) {
    const first = bookUnits[0];
    const loc = first ? locationLabel(first.location) : "book";
    const conflictEntry: TimelineEntry = {
      date: formatDateShort("2026-12-31"),
      label: `NetSuite inventory = ${loc}`,
      src: "NETSUITE · conflicts with the evidence above",
      glyph: "✕",
      tone: "ember",
      emphasis: true,
      evidenceId: null,
    };
    // Insert before any post-period-end entries (e.g. the January invoice).
    const idx = dated.findIndex((d) => d.at > "2026-12-31");
    if (idx === -1) entries.push(conflictEntry);
    else entries.splice(idx, 0, conflictEntry);
  }

  // Same live set. "No date, because no event exists" is a flat non-existence
  // claim, and it was being made about a record the workspace holds.
  const outstanding = new Set(livePosition(context).unmet);
  const missingBlocks = finding.evidenceRequirements
    .filter((r) => r.required && outstanding.has(r.description))
    .map((r) => ({
      label: `${r.description} — Missing`,
      detail:
        "No date, because no event exists. Held outside the chronology so it cannot be read as an event that occurred.",
      evidenceId: evidence.find((e) => e.linkType === "REQUIRED_FOR")?.id ?? null,
    }));

  return {
    entries,
    missingBlocks,
    scopeNotice: context.evidenceOutOfScope ? SCOPE_NOTICE : null,
  };
}

/** Chain components → strip nodes (design 03: missing drawn largest, in ember dash). */
export function assembleChainNodes(components: readonly {
  readonly name: string;
  readonly importance: string;
  readonly state: string;
  readonly reference?: string | undefined;
  readonly note?: string | undefined;
}[], evidenceByRef: ReadonlyMap<string, string>): ChainNodeView[] {
  return components.map((c) => {
    const missing = c.state === "MISSING";
    const corroborating = c.importance === "CORROBORATING";
    const stateLabel = missing
      ? c.importance === "REQUIRED"
        ? "Missing — required"
        : "Missing"
      : corroborating
        ? "Corroborating"
        : "Present";
    return {
      type: c.name.toUpperCase(),
      value: c.reference ?? c.note ?? stateLabel,
      state: c.note !== undefined && c.reference !== undefined ? `${stateLabel} — ${c.note}` : stateLabel,
      glyph: missing ? "○" : corroborating ? "≈" : "✓",
      visual: missing ? "missing" : corroborating ? "corroborating" : "present",
      flex: missing && c.importance === "REQUIRED" ? 1.5 : 1,
      evidenceId: c.reference !== undefined ? (evidenceByRef.get(c.reference) ?? null) : null,
    };
  });
}

/** Evidence record → drawer payload (occurred vs retrieved, original vs normalized). */
export function assembleEvidenceRecord(
  e: EvidenceEntry,
  /**
   * The exception this record was opened from, when there is one. The
   * Evidence Center opens records outside any single exception, so it passes
   * undefined and supplies its own related-object list instead.
   */
  view: ExceptionView | undefined,
  datasetVersion: string,
  user: DemoUser,
  relatedOverride?: readonly string[],
): EvidenceRecordView {
  // A REQUIRED_FOR link marks an evidence GAP for ANY record kind: the
  // contract whose provision is absent, the custodian statement that was
  // requested but never returned. It must never render as a positive state.
  const gap = e.linkType === "REQUIRED_FOR";
  const provisionGap = gap && e.kind === "CONTRACT";
  const stateVariant = gap
    ? "missing"
    : e.linkType === "CONFLICTS_WITH"
      ? "conflict"
      : e.linkType === "CORROBORATES"
        ? "review"
        : "resolved";
  const state = provisionGap
    ? "Required provision missing"
    : gap
      ? "Required — not received"
      : e.linkType === "CONFLICTS_WITH"
        ? "Conflicting"
        : e.linkType === "CORROBORATES"
          ? "Corroborating"
          : "Known";

  const occurred = occurredAt(e);
  const rows: { k: string; v: string; mono?: boolean; missing?: boolean }[] = [
    { k: "Record type", v: kindLabel(e.kind) },
    occurred !== undefined
      ? { k: "Occurred", v: occurred.includes("T") ? formatInstant(occurred) : formatDate(occurred) }
      : { k: "Occurred", v: "— no dated event", missing: true },
    e.retrievedAt !== undefined
      ? { k: "Retrieved", v: formatInstant(e.retrievedAt) }
      : { k: "Retrieved", v: "— not recorded", missing: true },
  ];

  if (e.contentWithheld) {
    rows.push({
      k: "Content",
      v: "Withheld — restricted for your role",
      missing: true,
    });
  } else if (e.content) {
    const c = e.content;
    const qty = Array.isArray(c["lines"])
      ? (c["lines"] as Record<string, unknown>[]).reduce(
          (n, l) => n + (typeof l["quantity"] === "number" ? l["quantity"] : 0),
          0,
        )
      : undefined;
    if (qty !== undefined && qty > 0) rows.push({ k: "Quantity", v: String(qty) });
    const provisions = c["provisions"];
    if (Array.isArray(provisions)) {
      for (const p of provisions as Record<string, unknown>[]) {
        rows.push({
          k: String(p["provisionType"] ?? "Provision"),
          v: String(p["status"] ?? "—"),
          mono: true,
          missing: p["status"] === "MISSING",
        });
      }
    }
    const compact = JSON.stringify(c, (key, value: unknown) =>
      key === "sourceRef" ? undefined : value,
    );
    rows.push({
      k: "Original value",
      v: compact.length > 140 ? `${compact.slice(0, 140)}…` : compact,
      mono: true,
    });
    rows.push({ k: "Normalized", v: "Identity transformation — original preserved", mono: true });
  }
  rows.push({ k: "Sensitivity", v: kindLabel(e.sensitivity) });

  const related =
    relatedOverride ??
    (view !== undefined
      ? [...(view.exception.finding.subjects.serials ?? []).slice(0, 2), view.exception.id]
      : []);

  return {
    id: e.id,
    title: provisionGap ? `${e.title} — provision missing` : gap ? `${e.title} — not received` : e.title,
    kind: e.kind,
    kindLabel: kindLabel(e.kind),
    state,
    stateGlyph: gap ? "○" : e.linkType === "CONFLICTS_WITH" ? "✕" : e.linkType === "CORROBORATES" ? "≈" : "✓",
    stateVariant,
    source: e.sourceSystem !== undefined ? sourceLabel(e.sourceSystem) : "—",
    contentWithheld: e.contentWithheld,
    rows,
    related,
    audit: [
      { k: "Evidence ID", v: e.id },
      { k: "Source ID", v: e.internalId ?? "—" },
      { k: "Dataset", v: datasetVersion },
      { k: "Content hash", v: `sha256:${shortHash(e.contentHash)}` },
      { k: "Viewer role", v: user.roles[0] ?? "—" },
      { k: "History", v: "Append-only" },
    ],
  };
}

/**
 * Compact drawer summary used by the Overview and queue row drawers.
 *
 * `isBlocker` is the CALLER'S BASELINE HINT, and the live status can only ever
 * narrow it, never widen it: an item management has concluded is not blocking
 * anything, whichever set the caller had in hand. Eight call sites build this
 * drawer and seven of them passed the rules' frozen blocker set, so concluding
 * EXC-015 produced `{status: 'Resolved — No Adjustment', blocker: true}` on
 * /reconciliation, /adjustments, /count, /valuation, /costing, /procurement and
 * the Audit Package — the green resolved capsule and the red BLOCKER badge
 * rendered 6px apart by `ExceptionDrawer.tsx:52-66`. Commit 212d219 went after
 * that contradiction by correcting the caller, and reached one of the eight.
 * Narrowing here is what makes the other seven unable to reintroduce it.
 */
export function assembleDrawer(
  context: ExceptionContext,
  isBlocker: boolean,
): ExceptionDrawerData {
  const { view, evidence, bookUnits } = context;
  const finding = view.exception.finding;
  // Live, like the row this drawer opens from. These two read the frozen
  // close while the row beside them read the live one, so one call to
  // `buildExceptionsData` returned a row saying "Resolved — No Adjustment"
  // and a drawer saying "Recount Required · Open · Obtain: …", with
  // `accountingMissing` painting a satisfied requirement in the ember alarm
  // treatment.
  const { status, unmet } = livePosition(context);

  const loc = bookUnits[0] ? locationLabel(bookUnits[0].location) : undefined;
  const netsuite =
    bookUnits.length > 0
      ? `${bookUnits.length} unit${bookUnits.length === 1 ? "" : "s"} on the year-end book — ${loc ?? "book"}`
      : "See transaction records";

  const physicalBits: string[] = [];
  for (const e of evidence) {
    if (e.kind === "ITEM_FULFILLMENT") {
      const d = occurredAt(e);
      if (d !== undefined) physicalBits.push(`shipped ${formatDateShort(d)}`);
    }
    if (e.kind === "CARRIER_SHIPMENT") {
      const ev = carrierEvent(e);
      if (ev !== undefined) physicalBits.push(`${carrierPhrase(ev.type)} ${formatDateShort(ev.at)}`);
    }
    if (e.kind === "INSTALLATION") {
      const d = occurredAt(e);
      if (d !== undefined) physicalBits.push(`installed ${formatDateShort(d)}`);
    }
    if (e.kind === "TELEMETRY" && !physicalBits.some((b) => b.startsWith("first online"))) {
      const d = occurredAt(e);
      if (d !== undefined) physicalBits.push(`first online ${formatDateShort(d)}`);
    }
  }
  /**
   * A restriction is never reported as an absence.
   *
   * This fell back to "No operational events in evidence for this item"
   * whenever the scoped list was empty — with no qualifier. For U-009 that
   * sentence printed on EXC-002, where the close holds five source records a
   * Controller can see, and on thirteen of the fifteen drawers overall. The
   * product's whole argument is that it never claims more than it can support;
   * asserting that a record does not exist when the truth is that this reader
   * may not read it is the one sentence it must not print. `evidenceOutOfScope`
   * already existed and already fed two other assemblers — the drawer had no
   * channel for it.
   */
  const physical =
    physicalBits.length > 0
      ? physicalBits.join(" · ")
      : context.evidenceOutOfScope
        ? // Says only what `evidenceOutOfScope` supports. The first version of
          // this sentence claimed OPERATIONAL records exist and are withheld —
          // but the flag means "this reader saw no evidence rows of any kind",
          // and on eleven of the fifteen exceptions the full-access Controller
          // sees no operational events either. So it asserted the existence of
          // records that do not exist, to the one role least able to check:
          // the standing rule broken in the mirror of the direction it was
          // written to fix. What is true is that the reader's scope emptied the
          // evidence, so no operational position can be formed here at all.
          "Evidence records for this item are outside your access scope, so no operational position can be shown here."
        : "No operational events in evidence for this item";

  const accounting =
    unmet.length > 0
      ? `Required: ${unmet.join("; ")} — missing`
      : conclusionLabel(status) === "Open"
        ? "Under management review"
        : conclusionLabel(status);

  const routing = ownerForStatus(status);
  return {
    id: view.exception.id,
    title: finding.title,
    ...(finding.subjects.serials?.[0] !== undefined
      ? { subtitle: finding.subjects.serials[0] }
      : {}),
    status: statusView(status),
    risk: riskView(finding.risk),
    // Narrowed by the LIVE status, from the same `livePosition` call that
    // produced the capsule two lines up. Without this the two disagree on the
    // same 200px of drawer.
    blocker: isBlocker && !isResolvedStatus(status),
    exposure: formatCents(finding.exposureCents),
    layers: {
      netsuite,
      physical,
      accounting,
      accountingMissing: unmet.length > 0,
    },
    conclusion: conclusionLabel(status),
    nextAction: `${nextActionText(status, unmet)} · ${routing.actionParty}`,
    sourceRecords: evidence.map((e) => ({
      id: e.id,
      title: e.title,
      source: e.sourceSystem !== undefined ? sourceLabel(e.sourceSystem) : "—",
      kind: kindLabel(e.kind),
    })),
    // The same notice the evidence-state and timeline assemblers already
    // carry, on the surface that omitted its records block entirely.
    scopeNotice: context.evidenceOutOfScope ? SCOPE_NOTICE : null,
    coverageWarnings: view.sourceCoverageWarnings.map(
      (w) => `${sourceLabel(w.sourceSystem)} ${w.status}`,
    ),
  };
}
