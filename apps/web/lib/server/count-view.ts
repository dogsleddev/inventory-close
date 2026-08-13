import type { DemoUser } from "@icg/data";
import type { ExceptionView } from "@icg/services";
import { formatCents, formatDate, formatInstant } from "../format";
import type {
  CountTestRow,
  CountVarianceRow,
  CycleHistoryRow,
  ExceptionDrawerData,
  KpiTile,
  PhysicalCountData,
} from "../view-model";
import { ownerForStatus, riskView, statusView } from "../workflow-view";
import { attempt } from "./data";
import { assembleDrawer, gatherExceptionContext, liveExceptionViews } from "./exception-view";
import { locationLabel } from "./humanize";
import { getQueries, makeContext, roleLabel } from "./workspace";

/**
 * Physical Count (stage 06, prompts/design/05 Parts A/B). Every figure is a
 * count of rows @icg/services returned — the summary numbers come from the
 * deterministic core's own count summary, never recomputed here.
 */

const DIRECTION_LABEL: Record<CountTestRow["direction"], string> = {
  // Sheet→Floor principally supports Existence; Floor→Sheet Completeness.
  SHEET_TO_FLOOR: "Sheet → Floor · Existence",
  FLOOR_TO_SHEET: "Floor → Sheet · Completeness",
};

function emptyData(role: string): PhysicalCountData {
  return {
    restricted: true,
    roleLabel: role,
    stats: [],
    planNote: null,
    locations: [],
    locationTotal: null,
    variances: [],
    discovery: null,
    auditorTests: [],
    managementTests: [],
    testSummary: null,
    movements: [],
    cycle: { rows: [], indicators: null },
    drawers: {},
  };
}

export function buildPhysicalCountData(
  user: DemoUser,
  correlationId: string,
): PhysicalCountData {
  const queries = getQueries();
  const ctx = makeContext(user, correlationId);
  const role = roleLabel(user);

  const summary = attempt(() => queries.getCountSummary(ctx));
  const detail = attempt(() => queries.getCountDetail(ctx));
  if (summary === undefined || detail === undefined) return emptyData(role);

  // Live: the variance row's status pill, its owner routing and the
  // floor-to-sheet discovery card all report an item's position NOW. Read
  // frozen, a concluded EXC-003 still routed to a recount and still showed
  // "Recount Required" on the screen its own drawer had stopped saying it on.
  const exceptions = liveExceptionViews(queries, ctx);
  const blockers = attempt(() => queries.getBlockers(ctx)) ?? [];
  const blockerIds = new Set(blockers.map((b) => b.exceptionId));

  const bySerial = (serial: string | undefined): ExceptionView | undefined =>
    serial === undefined
      ? undefined
      : exceptions.find((e) =>
          e.exception.finding.subjects.serials?.includes(serial),
        );
  const byCountCell = (sku: string, location: string): ExceptionView | undefined =>
    exceptions.find(
      (e) =>
        e.exception.finding.ruleId.startsWith("CNT-") &&
        (e.exception.finding.subjects.skus?.includes(sku) ?? false) &&
        ((e.exception.finding.subjects.locations?.includes(location) ?? true) ||
          e.exception.finding.subjects.locations === undefined),
    );

  /* Year-end tab */
  const yePlan = detail.plans.find((p) => p.countType === "YEAR_END");
  const yeRows = detail.results.filter((r) => r.countType === "YEAR_END");

  const locationUnits = new Map<string, number>();
  for (const row of yeRows) {
    locationUnits.set(
      row.location,
      (locationUnits.get(row.location) ?? 0) + row.snapshotQuantity,
    );
  }
  const locations = [...locationUnits.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([loc, units]) => ({
      label: locationLabel(loc),
      units: units.toLocaleString("en-US"),
    }));
  const locationTotal = [...locationUnits.values()]
    .reduce((n, v) => n + v, 0)
    .toLocaleString("en-US");

  const stats: KpiTile[] = [
    {
      label: "BOOK COUNT POPULATION",
      value: summary.populationUnits.toLocaleString("en-US"),
      note: "units in counted locations",
    },
    {
      label: "FIRST-PASS MATCHED",
      value: summary.firstPassMatchedUnits.toLocaleString("en-US"),
      note: "of the book population",
    },
    {
      label: "INITIAL DIFFERENCES",
      value: String(summary.varianceRows),
      note: "first-pass variance rows",
      ...(summary.varianceRows > 0 ? { tone: "warn" as const } : {}),
    },
    {
      label: "COUNT-PERIOD MOVEMENTS",
      value: String(summary.movements),
      note: "controlled and authorized",
    },
    {
      label: "TEST COUNTS",
      value: String(summary.managementTests + summary.auditorTests),
      note: `${summary.managementTests} management · ${summary.auditorTests} auditor-selected`,
    },
  ];

  const drawers: Record<string, ExceptionDrawerData> = {};
  const drawerFor = (view: ExceptionView | undefined): string | null => {
    if (view === undefined) return null;
    const id = view.exception.id;
    if (drawers[id] === undefined) {
      drawers[id] = assembleDrawer(
        gatherExceptionContext(queries, ctx, view),
        blockerIds.has(id),
      );
    }
    return id;
  };

  const varianceRows: CountVarianceRow[] = yeRows
    .filter((row) => row.variance !== 0)
    .map((row) => {
      const view = bySerial(row.serial) ?? byCountCell(row.sku, row.location);
      const f = view?.exception.finding;
      return {
        key: row.externalCountDetailId ?? `${row.sku}:${row.location}:${row.bin ?? ""}`,
        subject: row.serial ?? `${row.sku} · quantity-tracked`,
        subjectMono: row.serial !== undefined,
        sku: row.sku,
        location: locationLabel(row.location),
        bin: row.bin ?? "—",
        book: String(row.snapshotQuantity),
        counted: String(row.countQuantity),
        variance: row.variance > 0 ? `+${row.variance}` : String(row.variance),
        exceptionId: drawerFor(view),
        status: view !== undefined ? statusView(view.exception.status) : null,
        risk: f !== undefined ? riskView(f.risk) : null,
        exposure: f !== undefined ? formatCents(f.exposureCents) : null,
        owner: view !== undefined ? ownerForStatus(view.exception.status).owner : null,
      };
    })
    .sort((a, b) => {
      const open = (x: CountVarianceRow) =>
        x.status !== null && x.status.variant !== "resolved" && x.status.variant !== "proposed" ? 0 : 1;
      if (open(a) !== open(b)) return open(a) - open(b);
      return a.key < b.key ? -1 : 1;
    });

  /* Floor-to-sheet discovery (EXC-004): a test-count observation, not a
     population row — it must never render as an addition to inventory. */
  const discoveryTest = detail.tests.find((t) => !t.traced);
  const discoveryView = bySerial(discoveryTest?.serial);
  const discovery =
    discoveryTest !== undefined
      ? {
          serial: discoveryTest.serial ?? discoveryTest.sku,
          location: locationLabel(discoveryTest.location),
          bin: discoveryTest.bin ?? null,
          testId: discoveryTest.id,
          observation: discoveryTest.observation,
          exceptionId: drawerFor(discoveryView),
          status:
            discoveryView !== undefined
              ? statusView(discoveryView.exception.status)
              : null,
          exposure:
            discoveryView !== undefined
              ? formatCents(discoveryView.exception.finding.exposureCents)
              : null,
        }
      : null;

  const testRow = (t: (typeof detail.tests)[number]): CountTestRow => ({
    id: t.id,
    direction: t.direction,
    directionLabel: DIRECTION_LABEL[t.direction],
    sku: t.sku,
    serial: t.serial ?? null,
    location: locationLabel(t.location),
    bin: t.bin ?? null,
    recorded: formatInstant(t.recordedAt),
    observation: t.observation,
    traced: t.traced,
    exceptionId: t.traced ? null : drawerFor(bySerial(t.serial)),
  });
  const auditorTests = detail.tests
    .filter((t) => t.selectionSource === "AUDITOR")
    .map(testRow);
  const managementTests = detail.tests
    .filter((t) => t.selectionSource === "MANAGEMENT")
    .map(testRow);
  const dirCount = (rows: CountTestRow[], d: CountTestRow["direction"]) =>
    rows.filter((r) => r.direction === d).length;
  const testSummary = {
    auditor: `${auditorTests.length} selections · ${dirCount(auditorTests, "SHEET_TO_FLOOR")} sheet → floor · ${dirCount(auditorTests, "FLOOR_TO_SHEET")} floor → sheet`,
    management: `${managementTests.length} selections · ${dirCount(managementTests, "SHEET_TO_FLOOR")} sheet → floor · ${dirCount(managementTests, "FLOOR_TO_SHEET")} floor → sheet`,
  };

  const movements = [...detail.movements]
    .sort((a, b) => (a.movedAt < b.movedAt ? -1 : 1))
    .map((m) => ({
      id: m.id,
      subject: m.serial ?? m.sku,
      qty: String(m.quantity),
      from: locationLabel(m.fromLocation),
      to: locationLabel(m.toLocation),
      movedAt: formatInstant(m.movedAt),
      authorizedBy: m.authorizedBy,
      reason: m.reason,
      exceptionId: drawerFor(bySerial(m.serial)),
    }));

  /* Cycle count history */
  const planById = new Map(detail.plans.map((p) => [p.id, p]));
  const cycleResults = detail.results.filter((r) => r.countType !== "YEAR_END");
  const cycleRows: CycleHistoryRow[] = cycleResults
    .map((row) => {
      const plan = planById.get(row.countPlanId);
      const rejected = plan?.sourceStatus === "REJECTED";
      const adj = detail.adjustments.find(
        (a) =>
          a.relatedCountPlanId === row.countPlanId &&
          a.lines.some((l) => l.sku === row.sku),
      );
      // A later spot count of the same SKU × location cell is that cell's
      // recount; referenced by its plan id, never inferred otherwise.
      const recountRow =
        row.variance !== 0 && row.countType === "CYCLE"
          ? cycleResults.find(
              (r2) =>
                r2.countType === "SPOT" &&
                r2.sku === row.sku &&
                r2.location === row.location &&
                (planById.get(r2.countPlanId)?.snapshotAt ?? "") >
                  (plan?.snapshotAt ?? ""),
            )
          : undefined;
      return {
        at: plan?.snapshotAt ?? "",
        row: {
          key: row.externalCountDetailId ?? `${row.countPlanId}:${row.sku}:${row.bin ?? ""}`,
          countDate: plan !== undefined ? formatDate(plan.snapshotAt) : "—",
          plan: row.countPlanId,
          planExternal: plan?.externalId ?? null,
          countType: row.countType === "SPOT" ? "Spot / recount" : "Cycle",
          sku: row.sku,
          location: locationLabel(row.location),
          bin: row.bin ?? null,
          serial: row.serial ?? null,
          snapshot: String(row.snapshotQuantity),
          counted: String(row.countQuantity),
          variance: row.variance > 0 ? `+${row.variance}` : String(row.variance),
          varianceWarn: row.variance !== 0,
          recount:
            recountRow !== undefined ? recountRow.countPlanId : row.countType === "SPOT" ? "Is recount" : "No",
          approval: rejected
            ? {
                label: `Rejected — ${planById.get(row.countPlanId)?.rejectedReason ?? "no reason recorded"}`,
                glyph: "✕",
                tone: "ember" as const,
              }
            : plan?.approvedBy !== undefined
              ? { label: `Approved · ${plan.approvedBy}`, glyph: "✓", tone: "aurora" as const }
              : { label: "Recorded", glyph: "○", tone: "soft" as const },
          adjustment: adj !== undefined ? adj.transactionNumber : null,
          nextDue: plan?.nextCountDue !== undefined ? formatDate(plan.nextCountDue) : null,
        },
      };
    })
    .sort((a, b) => (a.at > b.at ? -1 : a.at < b.at ? 1 : a.row.key < b.row.key ? -1 : 1))
    .map((x) => x.row);

  // The management risk lens is management-only (locked decision 3): for an
  // auditor the service returns nothing, and the screen says why instead of
  // rendering an empty panel.
  const isAuditor = user.roles.includes("AUDITOR_READ_ONLY");
  const indicators = isAuditor
    ? null
    : detail.managementIndicators.map((f) => ({
        title: f.title,
        why: f.whyFlagged,
        rule: `${f.ruleId} · v${f.ruleVersion}`,
      }));

  return {
    restricted: false,
    roleLabel: role,
    stats,
    planNote:
      yePlan !== undefined
        ? `${yePlan.externalId ?? yePlan.id} · snapshot ${formatInstant(yePlan.snapshotAt)}${yePlan.approvedBy !== undefined ? ` · approved by ${yePlan.approvedBy}` : ""}`
        : null,
    locations,
    locationTotal,
    variances: varianceRows,
    discovery,
    auditorTests,
    managementTests,
    testSummary,
    movements,
    cycle: { rows: cycleRows, indicators },
    drawers,
  };
}
