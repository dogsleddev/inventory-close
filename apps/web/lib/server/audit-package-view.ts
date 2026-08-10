import type { DemoUser } from "@icg/data";
import type { ExceptionView, PbcPackageItem } from "@icg/services";
import { formatBpsExact, formatCents, formatDate, shortHash } from "../format";
import type {
  AuditPackageData,
  EvidenceRecordView,
  ExceptionDrawerData,
  PbcRow,
  PbcVersionRow,
  TabDef,
} from "../view-model";
import { pbcStatusView, statusView } from "../workflow-view";
import { attempt } from "./data";
import {
  assembleDrawer,
  assembleEvidenceRecord,
  gatherExceptionContext,
} from "./exception-view";
import { ROLE_LABELS, getQueries, makeContext, roleLabel, userById } from "./workspace";

/**
 * Audit Package (stage 07) — the management-prepared PBC workspace.
 *
 * Two rules govern everything here. First: **PBC Ready is not auditor
 * acceptance.** No state in this product records what the audit team
 * concluded, and the ladder says so in words rather than leaving the reader
 * to infer it. Second: **a provided version is sealed.** It carries the hash
 * it was sealed with, it is superseded rather than edited, and only the
 * working draft is ever editable.
 */

const roleName = (role: string): string => ROLE_LABELS[role] ?? role;

/** "M. Reyes · Controller" — versions are attributed to a person, not an id. */
function personLabel(userId: string): string {
  const user = userById(userId);
  return user.id === userId
    ? `${user.displayName} · ${roleLabel(user)}`
    : userId;
}

type Detail = NonNullable<AuditPackageData["detail"]>;
type LineageStep = Detail["workpaper"]["lineage"][number];
type EvidenceRow = Detail["evidence"]["rows"][number];

/** Statuses that count toward the ready/provided numerator, in ladder order. */
const STATE_ORDER = [
  "PROVIDED",
  "READY",
  "PREPARING",
  "FOLLOW_UP_REQUESTED",
  "NOT_STARTED",
] as const;

const LADDER: readonly { label: string; glyph: string; meaning: string }[] = [
  {
    label: "Ready",
    glyph: "✓",
    meaning: "Prepared and internally reviewed. Not yet handed over.",
  },
  {
    label: "Provided",
    glyph: "■",
    meaning:
      "Delivered to the audit team, sealed and versioned. Says nothing about acceptance.",
  },
  {
    label: "Follow-Up Requested",
    glyph: "!",
    meaning: "Further support asked for after providing. The prior version stays sealed.",
  },
  {
    label: "Refresh Required",
    glyph: "!",
    meaning:
      "Underlying controlled data changed after the version was provided; a new version is needed.",
  },
];

function versionRows(item: PbcPackageItem): PbcVersionRow[] {
  return item.versions.map((v, i) => ({
    key: `${item.id}-${i}`,
    label: v.label,
    date: formatDate(v.at),
    note:
      v.supersededByVersion !== undefined
        ? `${v.note} — superseded by version ${v.supersededByVersion}`
        : v.note,
    by: personLabel(v.byUserId),
    state:
      v.state === "PROVIDED"
        ? "Provided"
        : v.state === "SUPERSEDED"
          ? "Superseded"
          : v.editable
            ? "Editable draft"
            : "Archived draft",
    glyph: v.state === "DRAFT" ? "○" : "■",
    // The lock is stated in words: a sealed version must never merely *look*
    // uneditable.
    lock: v.sealed ? "SEALED" : v.editable ? "EDITABLE" : "ARCHIVED",
    sealed: v.sealed,
    editable: v.editable,
    hash: v.contentHash !== undefined ? shortHash(v.contentHash) : null,
  }));
}

export function buildAuditPackageData(
  user: DemoUser,
  selectedId: string,
  correlationId: string,
): AuditPackageData {
  const queries = getQueries();
  const ctx = makeContext(user, correlationId);
  const role = roleLabel(user);

  const pkg = attempt(() => queries.getPbcPackage(ctx));
  if (pkg === undefined) {
    return {
      restricted: true,
      roleLabel: role,
      readiness: null,
      attention: null,
      rows: [],
      detail: null,
      ladder: LADDER,
      acceptanceNote: "",
      auditorNote: null,
      drawers: {},
      records: {},
    };
  }

  const readinessOut = attempt(() => queries.getCloseReadiness(ctx));
  const exceptions = attempt(() => queries.listExceptions(ctx)) ?? [];
  const blockers = attempt(() => queries.getBlockers(ctx)) ?? [];
  const blockerIds = new Set(blockers.map((b) => b.exceptionId));
  const manifest = attempt(() => queries.getRunManifest(ctx));
  const isAuditor = user.roles.includes("AUDITOR_READ_ONLY");

  const drawers: Record<string, ExceptionDrawerData> = {};
  const records: Record<string, EvidenceRecordView> = {};
  const viewFor = (id: string): ExceptionView | undefined =>
    exceptions.find((e) => e.exception.id === id);
  const drawerFor = (view: ExceptionView | undefined): string | null => {
    if (view === undefined) return null;
    const id = view.exception.id;
    drawers[id] ??= assembleDrawer(
      gatherExceptionContext(queries, ctx, view),
      blockerIds.has(id),
    );
    return id;
  };

  /* ---------------- readiness and the state ladder ---------------- */

  const counts = new Map<string, number>();
  for (const item of pkg) {
    // Count the PREPARED state, not the refresh flag: a workpaper whose
    // dependencies moved is still whatever it was prepared as.
    counts.set(item.baselineStatus, (counts.get(item.baselineStatus) ?? 0) + 1);
  }

  const attentionItems = pkg.filter(
    (item) => item.baselineStatus !== "PROVIDED" && item.baselineStatus !== "READY",
  );

  /* ---------------- the selected workpaper ---------------- */

  // Default to the workpaper most in need of a decision: an outstanding
  // external follow-up outranks internal preparation, which outranks work
  // that has not begun. `?pbc=` overrides it.
  const ATTENTION_PRIORITY = ["FOLLOW_UP_REQUESTED", "PREPARING", "NOT_STARTED"];
  const byPriority = [...attentionItems].sort((a, b) => {
    const rank =
      ATTENTION_PRIORITY.indexOf(a.baselineStatus) -
      ATTENTION_PRIORITY.indexOf(b.baselineStatus);
    return rank !== 0 ? rank : a.id < b.id ? -1 : 1;
  });
  const selected =
    pkg.find((item) => item.id === selectedId) ?? byPriority[0] ?? pkg[0];

  let detail: AuditPackageData["detail"] = null;
  if (selected !== undefined) {
    const relatedIds = selected.dependsOn.filter((dep) => dep.startsWith("EXC-"));
    const related = relatedIds
      .map((id) => viewFor(id))
      .filter((v): v is ExceptionView => v !== undefined);

    // Lineage: PBC → exception → subject unit → source record. Built from
    // the first exception whose lineage the viewer can actually trace, so
    // the path never claims a step the services withheld.
    const lineageSource = related
      .map((view) => ({
        view,
        lineage: attempt(() => queries.traceLineage(ctx, view.exception.id)),
      }))
      .find((x) => x.lineage !== undefined);

    const lineage: LineageStep[] = [];
    let terminates: string | null = null;
    lineage.push({
      layer: "PBC REQUEST",
      id: selected.id,
      note: `${selected.title} · ${pbcStatusView(selected.status).label}`,
      ember: false,
    });
    if (lineageSource !== undefined) {
      const { view, lineage: traced } = lineageSource;
      const f = view.exception.finding;
      lineage.push({
        layer: "CLOSE EXCEPTION",
        id: view.exception.id,
        note: `${statusView(view.exception.status).label} · ${formatCents(f.exposureCents)}`,
        ember: view.open,
      });
      const serial = f.subjects.serials?.[0];
      if (serial !== undefined) {
        lineage.push({
          layer: "SERIALIZED UNIT",
          id: serial,
          note: f.subjects.skus?.[0] !== undefined ? `SKU ${f.subjects.skus[0]}` : "",
          ember: false,
        });
      }
      const sourced = traced?.evidence.find(
        ({ item }) => item.sourceRef !== undefined,
      );
      if (sourced !== undefined && sourced.item.sourceRef !== undefined) {
        // The human reference leads; the system and internal id qualify it.
        lineage.push({
          layer: "SOURCE RECORD",
          id: sourced.item.title,
          note: `${sourced.item.sourceRef.sourceSystem} · id ${sourced.item.sourceRef.internalId}`,
          ember: false,
        });
      }
      // Where the path ends in absence, say so — an unmet required
      // requirement is itself traceable evidence.
      const unmet = f.evidenceRequirements.find((r) => r.required && !r.satisfied);
      if (unmet !== undefined) {
        terminates = `One branch of this lineage terminates at no record: ${unmet.description}. The absence is the finding, not a gap in the trace.`;
      }
    }

    /* ---------------- attached evidence ---------------- */

    const evidenceRows: EvidenceRow[] = [];
    const datasetVersion = manifest?.datasetVersion ?? "—";
    for (const view of related) {
      const context = gatherExceptionContext(queries, ctx, view);
      for (const item of context.evidence) {
        if (evidenceRows.some((r) => r.id === item.id)) continue;
        records[item.id] = assembleEvidenceRecord(item, view, datasetVersion, user);
        const missing = records[item.id]?.stateVariant === "missing";
        evidenceRows.push({
          id: item.internalId ?? item.id,
          source: item.sourceSystem ?? "—",
          kind: item.title,
          state: missing ? "MISSING" : "ATTACHED",
          glyph: missing ? "○" : "✓",
          missing,
          recordId: item.id,
        });
      }
    }

    const tabs: TabDef[] = [
      { key: "summary", label: "Summary", count: null },
      { key: "workpaper", label: "Workpaper", count: null },
      { key: "evidence", label: "Evidence", count: String(evidenceRows.length) },
      {
        key: "versions",
        label: "Version History",
        count: String(selected.versions.length),
      },
      {
        key: "related",
        label: "Related Exceptions",
        count: String(related.length),
      },
      { key: "audit", label: "Audit Details", count: null },
    ];

    detail = {
      id: selected.id,
      title: selected.title,
      status: pbcStatusView(selected.status),
      owner: roleName(selected.owner),
      tabs,
      summary: [
        { k: "Request", v: `${selected.id} · ${selected.title}` },
        { k: "Prepared by", v: roleName(selected.owner) },
        { k: "State", v: pbcStatusView(selected.status).label },
        ...(selected.refreshRequired
          ? [
              {
                k: "Why refresh required",
                v: "Controlled state this workpaper depends on changed after it was prepared.",
              },
            ]
          : []),
        {
          k: "Provided versions",
          v:
            selected.latestVersion !== undefined
              ? `${selected.latestVersion} · latest sealed`
              : "None — nothing has been handed over",
        },
        {
          k: "Waiting on",
          v:
            selected.blockedBy.length > 0
              ? `${selected.blockedBy.join(", ")} — open close ${selected.blockedBy.length === 1 ? "item" : "items"}, not preparation effort`
              : "Nothing — no open exception holds this workpaper",
        },
        { k: "Auditor acceptance", v: "Not recorded in this system" },
      ],
      workpaper: {
        lineage,
        note: "Every figure in this workpaper traces to a source record. Follow one without leaving the product.",
        terminates,
      },
      evidence: {
        rows: evidenceRows,
        // An empty list under a scope is not "no evidence".
        scopeNotice:
          isAuditor && evidenceRows.length === 0
            ? `${selected.id} has not been provided, so its supporting evidence is outside your scope. This is not an empty workpaper.`
            : null,
        note: "Attached evidence is referenced, never copied — each row resolves to the same record the exception and the serial view read from.",
      },
      versions: versionRows(selected),
      related: related.map((view) => ({
        id: view.exception.id,
        title: view.exception.finding.title,
        status: statusView(view.exception.status),
        exposure: formatCents(view.exception.finding.exposureCents),
        open: view.open,
        drawerId: drawerFor(view),
      })),
      audit: [
        { k: "Object ID", v: selected.id },
        { k: "Prepared state", v: selected.baselineStatus },
        { k: "Effective state", v: selected.status },
        { k: "Immutable", v: selected.immutable ? "Yes — a sealed version exists" : "No" },
        { k: "Depends on", v: selected.dependsOn.join(", ") || "—" },
        { k: "Prepared against", v: shortHash(selected.preparedStateHash) },
        { k: "Current state", v: shortHash(selected.currentStateHash) },
        ...(manifest !== undefined
          ? [
              { k: "Run", v: manifest.runId },
              { k: "Dataset", v: manifest.datasetVersion },
              { k: "Ruleset", v: manifest.rulesetVersion },
            ]
          : []),
      ],
    };
  }

  const rows: PbcRow[] = pkg.map((item) => ({
    id: item.id,
    title: item.title,
    status: pbcStatusView(item.status),
    owner: roleName(item.owner),
    versions:
      item.latestVersion !== undefined ? `v${item.latestVersion} sealed` : "None provided",
    blockedBy: item.blockedBy,
    refreshRequired: item.refreshRequired,
    selected: item.id === detail?.id,
  }));

  return {
    restricted: false,
    roleLabel: role,
    readiness:
      readinessOut !== undefined
        ? {
            pct: formatBpsExact(readinessOut.aggregates.pbcReadinessBps),
            summary: `${readinessOut.aggregates.pbcReady} of ${readinessOut.aggregates.pbcTotal} Ready or Provided`,
            note: "Readiness is a management preparation measure. It says nothing about whether the auditor has accepted any item.",
            states: STATE_ORDER.map((key) => ({
              label: pbcStatusView(key).label,
              glyph: pbcStatusView(key).glyph,
              count: counts.get(key) ?? 0,
            })),
          }
        : null,
    attention:
      attentionItems.length > 0
        ? {
            rows: attentionItems.map((item) => ({
              id: item.id,
              title: item.title,
              status: pbcStatusView(item.baselineStatus),
              owner: roleName(item.owner),
              // The blocker is read from close state, not authored per item.
              blocker:
                item.blockedBy.length > 0
                  ? `Waiting on ${item.blockedBy.join(", ")}`
                  : "In preparation",
              selected: item.id === detail?.id,
            })),
            note: (() => {
              const waiting = attentionItems.filter((i) => i.blockedBy.length > 0);
              return waiting.length > 0
                ? `${waiting.length} of ${attentionItems.length} are waiting on close conclusions rather than on preparation effort — ${waiting
                    .map((i) => `${i.id} on ${i.blockedBy.join("/")}`)
                    .join(", ")}.`
                : "None are waiting on a close conclusion.";
            })(),
          }
        : null,
    rows,
    detail,
    ladder: LADDER,
    acceptanceNote:
      "There is no state in this system that records auditor acceptance. Providing is a management act; what the auditor concludes is recorded outside this product.",
    auditorNote: isAuditor
      ? "You are viewing the read-only auditor package. Only workpapers that have been provided, and the evidence beneath them, are in scope — management's own risk indicators are not part of it."
      : null,
    drawers,
    records,
  };
}
