import type { DemoUser } from "@icg/data";
import type {
  CountMovementFixture,
  CountResultFixture,
  CountTestFixture,
  EvidenceSensitivity,
  ProcurementMatch,
  SourceHealthFixture,
  SourceRecordRef,
  TransactionChain,
} from "@icg/domain";
import { isResolvedStatus } from "@icg/domain";
import type {
  BlockerOut,
  CloseAggregates,
  CountSummaryOut,
  DerivedException,
  PbcItemOut,
  ReadinessOut,
  ReconciliationOut,
} from "@icg/rules";
import { traceExceptionLineage, type ExceptionLineage } from "@icg/evidence";
import { authorize, canReadContent } from "@icg/permissions";
import { PBC_DEPENDENCIES, pbcDependencyHash, type Workspace } from "./workspace.js";

/**
 * Query services (prompt 04). Authorization happens HERE, before data
 * reaches any caller — the UI, exports, and the future Ask Gaurd adapter
 * all inherit it. There is no client-side permission logic anywhere.
 */

export interface ServiceContext {
  readonly user: DemoUser;
  readonly correlationId: string;
  readonly sourceInterface: string;
}

/**
 * Fail-visible source coverage (docs/05 reliability): which non-healthy
 * sources feed the queried domain. Presence of a warning never changes a
 * control result — it makes degraded evidence visible next to it.
 */
export interface SourceCoverageWarning {
  readonly sourceSystem: string;
  readonly status: string;
  readonly note?: string;
}

/**
 * Sources each rule's evaluation actually reads. Entries mirror the rule
 * implementations in packages/rules/src/rules — every feed a rule touches
 * is listed, so a degraded source can never be silently omitted from the
 * warnings this map drives.
 */
const RULE_REQUIRED_SOURCES: Readonly<Record<string, readonly string[]>> = {
  "CUT-OUT-001": ["NETSUITE_ERP", "FLIGHTPATH", "DEPLOY_OPS", "DEVICE_CLOUD", "ACCORD_VAULT"],
  "CUT-IN-001": ["NETSUITE_ERP", "FLIGHTPATH", "ACCORD_VAULT"],
  "CNT-EX-001": ["NETSUITE_WMS", "NETSUITE_ERP"],
  "CNT-COMP-001": ["NETSUITE_WMS", "NETSUITE_ERP"],
  "CNT-VAR-001": ["NETSUITE_WMS"],
  "CNT-MOVE-001": ["NETSUITE_WMS"],
  "TPI-CONF-001": ["NETSUITE_ERP"],
  "OWN-LOAN-001": ["ACCORD_VAULT", "KESTREL_CRM", "NETSUITE_ERP"],
  "RMA-DUP-001": ["NETSUITE_ERP", "RETURN_LOOP"],
  "DEMO-AGE-001": ["KESTREL_CRM", "NETSUITE_ERP"],
  "VAL-EO-001": ["FORECAST_PLATFORM", "NETSUITE_ERP"],
  "VAL-DMG-001": ["RETURN_LOOP", "NETSUITE_ERP"],
  "DQ-LOC-001": ["NETSUITE_WMS"],
  "REC-GL-001": ["NETSUITE_ERP"],
  "GL-MAN-001": ["NETSUITE_ERP"],
};

/**
 * docs/10: the auditor sees only provided/permitted support. Provided
 * workpapers define which exceptions' evidence is in scope.
 */
const isAuditor = (user: DemoUser): boolean => user.roles.includes("AUDITOR_READ_ONLY");

function providedExceptionIds(ws: Workspace): ReadonlySet<string> {
  return new Set(
    ws.close.pbc
      .filter((item) => item.status === "PROVIDED")
      .flatMap((item) =>
        (PBC_DEPENDENCIES[item.id] ?? []).filter((dep) => dep.startsWith("EXC-")),
      ),
  );
}

function auditorVisibleEvidenceIds(ws: Workspace): ReadonlySet<string> {
  const scope = providedExceptionIds(ws);
  return new Set(
    ws.evidenceGraph.links.filter((l) => scope.has(l.to)).map((l) => l.from),
  );
}

function coverageWarnings(
  ws: Workspace,
  requiredSources: readonly string[],
): SourceCoverageWarning[] {
  return ws.dataset.sourceHealth
    .filter(
      (h: SourceHealthFixture) =>
        requiredSources.includes(h.sourceSystem) && h.status !== "HEALTHY",
    )
    .map((h) => ({
      sourceSystem: h.sourceSystem,
      status: h.status,
      ...(h.note !== undefined ? { note: h.note } : {}),
    }));
}

export interface ExceptionView {
  readonly exception: DerivedException;
  readonly open: boolean;
  readonly sourceCoverageWarnings: readonly SourceCoverageWarning[];
}

/** Evidence view with restricted content withheld (existence stays visible). */
export interface EvidenceView {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
  readonly sensitivity: EvidenceSensitivity;
  readonly contentHash: string;
  readonly sourceRef?: SourceRecordRef;
  readonly content?: unknown;
  readonly contentWithheld: boolean;
}

export interface SerialSearchHit {
  readonly serial: string;
  readonly onBook: boolean;
  readonly foundIn: readonly string[];
  readonly unit?: unknown;
}

export interface FinancialLifeView {
  readonly serial: string;
  /** SERIAL: unit-level documents; BATCH: non-serialized stock tracked at batch level. */
  readonly buySideTracking: "SERIAL" | "BATCH";
  readonly unit?: {
    readonly sku: string;
    readonly serialized: boolean;
    readonly location: string;
    readonly classification: string;
    readonly unitCostCents: number;
    readonly glAccount: string;
    readonly acquiredAt?: string;
    readonly lastMovementAt?: string;
    readonly custodian?: string;
  };
  readonly buySide: {
    readonly purchaseOrder?: string;
    readonly itemReceipt?: string;
    readonly vendorBill?: string;
  };
  readonly inventoryLife: {
    readonly countRows: readonly CountResultFixture[];
    readonly countTests: readonly CountTestFixture[];
    readonly movements: readonly CountMovementFixture[];
    readonly assignment?: { kind: string; customer?: string; startedAt: string };
    readonly rmaRecordId?: string;
  };
  readonly sellSide: {
    readonly salesOrder?: string;
    readonly itemFulfillment?: string;
    readonly carrierShipment?: string;
    readonly deliveredAt?: string;
    readonly installedAt?: string;
    readonly firstOnlineAt?: string;
    readonly customerInvoice?: string;
  };
  readonly exceptions: readonly string[];
  /** Canonical steps with no record — visibly missing, never inferred. */
  readonly missing: readonly string[];
}

const CLASSIFICATION_GL: Readonly<Record<string, string>> = {
  FINISHED_HARDWARE: "1200",
  THIRD_PARTY: "1200",
  DAMAGED: "1200",
  VALUATION_REVIEW: "1200",
  GIT: "1210",
  DEMO: "1220",
  LOANER: "1220",
  RMA: "1230",
};

export function createQueryService(ws: Workspace) {
  return {
    getCloseReadiness(ctx: ServiceContext): ReadinessOut & { aggregates: CloseAggregates } {
      authorize(ctx.user, "close.read");
      return { ...ws.close.readiness, aggregates: ws.close.aggregates };
    },

    getBlockers(ctx: ServiceContext): readonly BlockerOut[] {
      authorize(ctx.user, "close.read");
      return ws.close.blockers;
    },

    listExceptions(ctx: ServiceContext): readonly ExceptionView[] {
      authorize(ctx.user, "close.read");
      return ws.close.exceptions.map((exception) => ({
        exception,
        open: !isResolvedStatus(exception.status),
        sourceCoverageWarnings: coverageWarnings(
          ws,
          RULE_REQUIRED_SOURCES[exception.finding.ruleId] ?? [],
        ),
      }));
    },

    getException(ctx: ServiceContext, id: string): ExceptionView | undefined {
      authorize(ctx.user, "close.read");
      const exception = ws.close.exceptions.find((e) => e.id === id);
      if (!exception) return undefined;
      return {
        exception,
        open: !isResolvedStatus(exception.status),
        sourceCoverageWarnings: coverageWarnings(
          ws,
          RULE_REQUIRED_SOURCES[exception.finding.ruleId] ?? [],
        ),
      };
    },

    listInventoryUnits(ctx: ServiceContext) {
      authorize(ctx.user, "close.read");
      return ws.dataset.inventoryUnits;
    },

    /**
     * Global serial search (docs/11: one click to Financial Life). Searches
     * beyond the book listing so off-book observations (KE-X1-8842) and
     * sold serials are discoverable — each hit says where it was seen and
     * whether it is on the year-end book, never implying book membership.
     */
    searchSerial(ctx: ServiceContext, query: string): readonly SerialSearchHit[] {
      authorize(ctx.user, "close.read");
      const q = query.trim().toUpperCase();
      if (q === "") return [];
      const found = new Map<string, Set<string>>();
      const note = (serial: string, source: string) => {
        if (!serial.toUpperCase().includes(q)) return;
        const entry = found.get(serial) ?? new Set<string>();
        entry.add(source);
        found.set(serial, entry);
      };
      for (const u of ws.dataset.inventoryUnits) note(u.serial, "BOOK_LISTING");
      for (const t of ws.dataset.countTests) if (t.serial) note(t.serial, "COUNT_TEST");
      for (const r of ws.dataset.countResults) if (r.serial) note(r.serial, "COUNT_RESULT");
      const txn = [
        ...ws.dataset.purchaseOrders,
        ...ws.dataset.itemReceipts,
        ...ws.dataset.vendorBills,
        ...ws.dataset.salesOrders,
        ...ws.dataset.itemFulfillments,
      ];
      for (const t of txn)
        for (const l of t.lines) for (const s of l.serials ?? []) note(s, "NETSUITE_TXN");
      for (const c of ws.dataset.carrierShipments) for (const s of c.serials) note(s, "CARRIER");
      for (const a of ws.dataset.assignments) note(a.serial, "ASSIGNMENT");
      for (const r of ws.dataset.rmaRecords) if (r.serial) note(r.serial, "RMA");
      for (const t of ws.dataset.telemetry) note(t.serial, "TELEMETRY");

      return [...found.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([serial, sources]) => {
          const unit = ws.dataset.inventoryUnits.find((u) => u.serial === serial);
          return {
            serial,
            onBook: unit !== undefined,
            foundIn: [...sources].sort(),
            ...(unit ? { unit } : {}),
          };
        });
    },

    getFinancialLife(ctx: ServiceContext, serial: string): FinancialLifeView {
      authorize(ctx.user, "close.read");
      const d = ws.dataset;
      const unit = d.inventoryUnits.find((u) => u.serial === serial);
      const serialized =
        d.skus.find((s) => s.code === unit?.sku)?.serialized ?? true;
      const hasSerial = (lines: readonly { serials?: readonly string[] | undefined }[]) =>
        lines.some((l) => l.serials?.includes(serial));

      // Non-serialized stock is procured at batch level: its unit ids never
      // appear on transaction lines, so the buy side is tracked per batch
      // rather than per unit — that is a tracking mode, not missing paper.
      const receipt = serialized ? d.itemReceipts.find((r) => hasSerial(r.lines)) : undefined;
      const po = receipt
        ? d.purchaseOrders.find((p) => p.transactionNumber === receipt.purchaseOrderNumber)
        : serialized
          ? d.purchaseOrders.find((p) => hasSerial(p.lines))
          : undefined;
      const bill = serialized
        ? d.vendorBills.find(
            (b) =>
              hasSerial(b.lines) ||
              (po !== undefined && b.purchaseOrderNumber === po.transactionNumber),
          )
        : undefined;
      const iff = d.itemFulfillments.find((f) => hasSerial(f.lines));
      const so = iff
        ? d.salesOrders.find((s) => s.transactionNumber === iff.salesOrderNumber)
        : d.salesOrders.find((s) => hasSerial(s.lines));
      const shipment = d.carrierShipments.find((c) => c.serials.includes(serial));
      const delivered = shipment?.events.find((e) => e.eventType === "DELIVERED");
      const installation = d.installations.find((i) => i.serials.includes(serial));
      const telemetry = d.telemetry.find((t) => t.serial === serial);
      const invoice = so
        ? d.customerInvoices.find((i) => i.salesOrderNumber === so.transactionNumber)
        : undefined;
      const assignment = d.assignments.find((a) => a.serial === serial);
      const rma = d.rmaRecords.find((r) => r.serial === serial);

      const missing: string[] = [];
      if (serialized) {
        if (!po) missing.push("Purchase Order");
        if (!receipt) missing.push("Item Receipt");
        if (!bill) missing.push("Vendor Bill");
      }
      if (iff) {
        if (!shipment) missing.push("Carrier shipment");
        if (!delivered) missing.push("Delivery confirmation");
        if (!invoice) missing.push("Customer Invoice");
        if (unit) missing.push("Inventory relief");
      }

      return {
        serial,
        buySideTracking: serialized ? "SERIAL" : "BATCH",
        ...(unit
          ? {
              unit: {
                sku: unit.sku,
                serialized,
                location: unit.location,
                classification: unit.classification,
                unitCostCents: unit.unitCostCents,
                glAccount: CLASSIFICATION_GL[unit.classification] ?? "1200",
                ...(unit.acquiredAt !== undefined ? { acquiredAt: unit.acquiredAt } : {}),
                ...(unit.lastMovementAt !== undefined
                  ? { lastMovementAt: unit.lastMovementAt }
                  : {}),
                ...(unit.custodian !== undefined ? { custodian: unit.custodian } : {}),
              },
            }
          : {}),
        buySide: {
          ...(po ? { purchaseOrder: po.transactionNumber } : {}),
          ...(receipt ? { itemReceipt: receipt.transactionNumber } : {}),
          ...(bill ? { vendorBill: bill.transactionNumber } : {}),
        },
        inventoryLife: {
          countRows: ws.dataset.countResults.filter((r) => r.serial === serial),
          countTests: ws.dataset.countTests.filter((t) => t.serial === serial),
          movements: ws.dataset.countMovements.filter((m) => m.serial === serial),
          ...(assignment
            ? {
                assignment: {
                  kind: assignment.kind,
                  ...(assignment.customer !== undefined
                    ? { customer: assignment.customer }
                    : {}),
                  startedAt: assignment.startedAt,
                },
              }
            : {}),
          ...(rma ? { rmaRecordId: rma.id } : {}),
        },
        sellSide: {
          ...(so ? { salesOrder: so.transactionNumber } : {}),
          ...(iff ? { itemFulfillment: iff.transactionNumber } : {}),
          ...(shipment ? { carrierShipment: shipment.id } : {}),
          ...(delivered ? { deliveredAt: delivered.occurredAt } : {}),
          ...(installation ? { installedAt: installation.installedAt } : {}),
          ...(telemetry ? { firstOnlineAt: telemetry.firstOnlineAt } : {}),
          ...(invoice ? { customerInvoice: invoice.transactionNumber } : {}),
        },
        exceptions: ws.close.exceptions
          .filter((e) => e.finding.subjects.serials?.includes(serial))
          .map((e) => e.id),
        missing,
      };
    },

    getCountSummary(ctx: ServiceContext): CountSummaryOut {
      authorize(ctx.user, "close.read");
      return ws.close.countSummary;
    },

    getCountDetail(ctx: ServiceContext) {
      authorize(ctx.user, "close.read");
      return {
        plans: ws.dataset.countPlans,
        results: ws.dataset.countResults,
        tests: ws.dataset.countTests,
        movements: ws.dataset.countMovements,
        // The cycle-count lens is a MANAGEMENT risk view (locked decision
        // 3); it is never part of the auditor's provided support.
        managementIndicators: isAuditor(ctx.user) ? [] : ws.close.managementIndicators,
      };
    },

    getReconciliation(ctx: ServiceContext): ReconciliationOut {
      authorize(ctx.user, "close.read");
      return ws.close.reconciliation;
    },

    getProcurementMatches(ctx: ServiceContext): readonly ProcurementMatch[] {
      authorize(ctx.user, "close.read");
      return ws.close.procurementMatches;
    },

    getCommercialChains(ctx: ServiceContext): readonly TransactionChain[] {
      authorize(ctx.user, "close.read");
      return ws.close.chains;
    },

    listEvidence(ctx: ServiceContext): readonly EvidenceView[] {
      authorize(ctx.user, "evidence.read");
      const auditorScope = isAuditor(ctx.user) ? auditorVisibleEvidenceIds(ws) : undefined;
      return ws.evidenceGraph.items
        .filter((item) => auditorScope === undefined || auditorScope.has(item.id))
        .map((item) => {
          const readable = canReadContent(ctx.user, item.sensitivity);
          return {
            id: item.id,
            title: item.title,
            kind: item.kind,
            sensitivity: item.sensitivity,
            contentHash: item.contentHash,
            ...(item.sourceRef ? { sourceRef: item.sourceRef } : {}),
            ...(readable ? { content: item.content } : {}),
            contentWithheld: !readable,
          };
        });
    },

    getEvidenceLinks(ctx: ServiceContext) {
      authorize(ctx.user, "evidence.read");
      if (!isAuditor(ctx.user)) return ws.evidenceGraph.links;
      const visible = auditorVisibleEvidenceIds(ws);
      return ws.evidenceGraph.links.filter((l) => visible.has(l.from));
    },

    traceLineage(ctx: ServiceContext, exceptionId: string): ExceptionLineage | undefined {
      authorize(ctx.user, "evidence.read");
      // Auditor scope: lineage exists only for provided support (docs/10).
      if (isAuditor(ctx.user) && !providedExceptionIds(ws).has(exceptionId)) {
        return undefined;
      }
      const lineage = traceExceptionLineage(exceptionId, ws.close, ws.evidenceGraph);
      if (!lineage) return undefined;
      // Restricted content is redacted here exactly as in listEvidence —
      // lineage must never be a side door around sensitivity.
      return {
        ...lineage,
        evidence: lineage.evidence.map(({ item, linkType }) =>
          canReadContent(ctx.user, item.sensitivity)
            ? { item, linkType }
            : { item: { ...item, content: undefined }, linkType },
        ),
      };
    },

    getPbcStatus(ctx: ServiceContext): readonly PbcItemOut[] {
      authorize(ctx.user, "pbc.read");
      return ws.close.pbc;
    },

    /**
     * PBC package view with version/dependency model (docs/10): provided
     * versions are immutable; a workpaper whose underlying controlled state
     * has changed since preparation becomes REFRESH_REQUIRED.
     */
    getPbcPackage(ctx: ServiceContext) {
      authorize(ctx.user, "pbc.read");
      return ws.close.pbc.map((item) => {
        const dependsOn = PBC_DEPENDENCIES[item.id] ?? [];
        const currentStateHash = pbcDependencyHash(ws.close, dependsOn);
        const preparedStateHash = ws.pbcPreparedState.get(item.id) ?? currentStateHash;
        const stale = preparedStateHash !== currentStateHash;
        return {
          ...item,
          version: 1,
          immutable: item.status === "PROVIDED",
          dependsOn,
          status: stale ? ("REFRESH_REQUIRED" as const) : item.status,
        };
      });
    },

    getSourceHealth(ctx: ServiceContext) {
      authorize(ctx.user, "close.read");
      return {
        sources: ws.dataset.sourceHealth,
        aggregateBasisPoints: ws.close.aggregates.sourceHealthBps,
      };
    },

    /** Close-period workflow state for the shell header (stage 05). */
    getPeriod(ctx: ServiceContext) {
      authorize(ctx.user, "close.read");
      return ws.period;
    },

    /**
     * Run provenance for Audit Details surfaces (stage 05). Read-only view
     * of the close run's manifest — dataset/ruleset versions and hashes.
     */
    getRunManifest(ctx: ServiceContext) {
      authorize(ctx.user, "close.read");
      return ws.close.runManifest;
    },

    /** Per-rule execution records (result + coverage shown on exception detail). */
    getRuleExecutions(ctx: ServiceContext) {
      authorize(ctx.user, "close.read");
      return ws.close.ruleExecutions;
    },

    /**
     * Scenario events, ordered by seq — the close's recorded workflow
     * history. The Overview activity feed reads these; it never invents
     * activity the dataset does not contain.
     */
    getScenarioEvents(ctx: ServiceContext) {
      authorize(ctx.user, "close.read");
      return [...ws.dataset.scenarioEvents].sort((a, b) => a.seq - b.seq);
    },

    getAuditTrail(ctx: ServiceContext) {
      authorize(ctx.user, "audit.read");
      return ws.audit.list();
    },
  };
}

export type QueryService = ReturnType<typeof createQueryService>;
