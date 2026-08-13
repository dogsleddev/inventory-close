import type { DemoUser } from "@icg/data";
import { formatBpsExact, formatInstant, shortHash } from "../format";
import { sourceHealthView } from "../workflow-view";
import type { EvidenceCenterData } from "../view-model";
import { assembleEvidenceRecord } from "./exception-view";
import { kindLabel, sourceLabel, sourceName } from "./humanize";
import { getQueries, makeContext, roleLabel } from "./workspace";

/**
 * Evidence Center (completion Stage A).
 *
 * Every other screen shows the evidence that bears on one object. This one
 * shows the graph itself: what records exist, which sources produced them,
 * how each one relates to the exception it touches, and which sources are
 * not currently answering in full.
 *
 * Three things it must never do:
 *   - show a record whose content the viewer may not read (the services
 *     redact before this layer sees it, and the withheld state is displayed
 *     rather than silently dropped);
 *   - render an auditor's narrower graph as if it were the whole graph
 *     (scope is stated out loud);
 *   - present a required record that never arrived as anything other than
 *     missing.
 */

function attempt<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

const LINK_LABEL: Record<string, string> = {
  SUPPORTS: "Supports",
  CONFLICTS_WITH: "Conflicts with",
  REQUIRED_FOR: "Required for",
  CORROBORATES: "Corroborates",
};

export function buildEvidenceData(
  user: DemoUser,
  correlationId: string,
  selectedId?: string,
): EvidenceCenterData {
  const queries = getQueries();
  const ctx = makeContext(user, correlationId);
  const base = { roleLabel: roleLabel(user) };

  const items = attempt(() => queries.listEvidence(ctx));
  if (items === undefined) {
    // evidence.read denied. The page says so; it does not render an empty table.
    return {
      ...base,
      restricted: true,
      rows: [],
      counts: { total: 0, withheld: 0, missing: 0 },
      links: [],
      sources: [],
      sourceHealth: null,
      scopeNotice: null,
      records: {},
      selectedId: null,
    };
  }

  const links = attempt(() => queries.getEvidenceLinks(ctx)) ?? [];
  const health = attempt(() => queries.getSourceHealth(ctx));
  const manifest = attempt(() => queries.getRunManifest(ctx));
  const exceptions = attempt(() => queries.listExceptions(ctx)) ?? [];
  const datasetVersion = manifest?.datasetVersion ?? "—";

  // Which exceptions each record touches, and how. A record can bear on more
  // than one exception, and the relationship is not always support.
  const relations = new Map<string, { exceptionId: string; linkType: string }[]>();
  for (const l of links) {
    const list = relations.get(l.from) ?? [];
    list.push({ exceptionId: l.to, linkType: String(l.linkType) });
    relations.set(l.from, list);
  }

  const rows = items
    .map((item) => {
      const rel = relations.get(item.id) ?? [];
      const source = item.sourceRef?.sourceSystem;
      return {
        id: item.id,
        title: item.title,
        kind: kindLabel(item.kind),
        src: source !== undefined ? sourceLabel(source) : "—",
        sourceSystem: source ?? null,
        internalId: item.sourceRef?.internalId ?? null,
        retrieved:
          typeof item.sourceRef?.retrievedAt === "string"
            ? formatInstant(item.sourceRef.retrievedAt)
            : "—",
        sensitivity: item.sensitivity,
        withheld: item.contentWithheld,
        hash: shortHash(item.contentHash),
        relations: rel.map((r) => ({
          exceptionId: r.exceptionId,
          linkType: r.linkType,
          label: LINK_LABEL[r.linkType] ?? r.linkType,
          conflict: r.linkType === "CONFLICTS_WITH",
        })),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  // Required records that do not exist. They are not rows in the graph —
  // that is the point — so they are listed separately and never mixed in
  // with records that arrived.
  //
  // Only OPEN exceptions contribute. A resolved item's unmet requirement is
  // not an outstanding gap: management concluded on the evidence it had, and
  // that conclusion is the record. Listing those here would have shown more
  // outstanding gaps than the close actually has.
  //
  // BOTH halves are live. `view.open` from `listExceptions` never moves, and
  // `satisfied` is a literal baked by the rules engine (counts.ts:62
  // `satisfied: false`) that never moves either — so for EXC-003 a Controller
  // could submit the one required record, have the Accounting Manager accept
  // it, and this panel still returned {exceptionId:'EXC-003', description:
  // 'Supervised recount locating the unit'} with counts.missing stuck at 8.
  // Then record the conclusion and the row STILL appeared, under the panel's
  // own subtitle at EvidenceScreen.tsx:211 promising "Open exceptions only —
  // a resolved item's requirement is answered by management's conclusion".
  // There is a warning comment against exactly this read at
  // packages/services/src/queries.ts:1265-1278, and 295a8c4 fixed the sibling
  // in export-csv.ts:315 without carrying the overlay here.
  const live = attempt(() => queries.getEffectiveExceptions(ctx));
  const missing =
    live !== undefined
      ? live
          .filter((view) => view.open)
          .flatMap((view) =>
            view.unmetRequirements.map((description) => ({
              exceptionId: view.exception.id,
              description,
              ruleId: view.exception.finding.ruleId,
            })),
          )
      : exceptions
          .filter((view) => view.open)
          .flatMap((view) =>
            view.exception.finding.evidenceRequirements
              .filter((r) => r.required && !r.satisfied)
              .map((r) => ({
                exceptionId: view.exception.id,
                description: r.description,
                ruleId: view.exception.finding.ruleId,
              })),
          );

  const sources = (health?.sources ?? []).map((s) => {
    const view = sourceHealthView(String(s.status));
    return {
      key: String(s.sourceSystem),
      name: sourceName(String(s.sourceSystem)),
      status: String(s.status),
      glyph: view.glyph,
      tone: view.variant,
      note: typeof s.note === "string" ? s.note : null,
      lastSync: typeof s.lastSyncAt === "string" ? formatInstant(s.lastSyncAt) : "—",
    };
  });

  const records: Record<string, EvidenceCenterData["records"][string]> = {};
  for (const item of items) {
    // The record drawer is assembled from the same projection the exception
    // screens use, so one record reads identically wherever it is opened.
    const rel = relations.get(item.id) ?? [];
    const content = (item as { content?: Record<string, unknown> }).content;
    records[item.id] = assembleEvidenceRecord(
      {
        id: item.id,
        kind: item.kind,
        title: item.title,
        sensitivity: String(item.sensitivity),
        contentHash: item.contentHash,
        sourceSystem: item.sourceRef?.sourceSystem,
        internalId: item.sourceRef?.internalId,
        retrievedAt:
          typeof item.sourceRef?.retrievedAt === "string" ? item.sourceRef.retrievedAt : undefined,
        content,
        contentWithheld: item.contentWithheld,
        // A record's relationship is the one it has to the exception it is
        // being read against. Outside a single exception the first link is
        // the record's own primary role in the graph.
        linkType: rel[0]?.linkType ?? "SUPPORTS",
      },
      undefined,
      datasetVersion,
      user,
      rel.map((r) => r.exceptionId),
    );
  }

  const auditorScoped = user.roles.includes("AUDITOR_READ_ONLY");

  return {
    ...base,
    restricted: false,
    rows,
    counts: {
      total: rows.length,
      withheld: rows.filter((r) => r.withheld).length,
      missing: missing.length,
    },
    links: missing,
    sources,
    sourceHealth:
      health !== undefined
        ? {
            score: formatBpsExact(health.aggregateBasisPoints),
            degraded: sources.filter((s) => s.status !== "HEALTHY").length,
          }
        : null,
    // Scope is stated, never implied by a shorter list.
    scopeNotice: auditorScoped
      ? "Auditor scope: this index lists the evidence behind workpapers management has provided. Records supporting items that have not been provided are withheld, and internal drafts are never in scope."
      : null,
    records,
    selectedId: selectedId !== undefined && records[selectedId] !== undefined ? selectedId : null,
  };
}
