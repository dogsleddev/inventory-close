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

const RULE_REQUIRED_SOURCES: Readonly<Record<string, readonly string[]>> = {
  "CUT-OUT-001": ["NETSUITE_ERP", "FLIGHTPATH", "DEPLOY_OPS", "DEVICE_CLOUD", "ACCORD_VAULT"],
  "CUT-IN-001": ["NETSUITE_ERP", "FLIGHTPATH", "ACCORD_VAULT"],
  "CNT-EX-001": ["NETSUITE_WMS"],
  "CNT-COMP-001": ["NETSUITE_WMS"],
  "CNT-VAR-001": ["NETSUITE_WMS"],
  "CNT-MOVE-001": ["NETSUITE_WMS"],
  "TPI-CONF-001": ["NETSUITE_ERP"],
  "OWN-LOAN-001": ["ACCORD_VAULT"],
  "RMA-DUP-001": ["NETSUITE_ERP", "RETURN_LOOP"],
  "DEMO-AGE-001": ["KESTREL_CRM"],
  "VAL-EO-001": ["FORECAST_PLATFORM"],
  "VAL-DMG-001": ["RETURN_LOOP"],
  "DQ-LOC-001": ["NETSUITE_WMS"],
  "REC-GL-001": ["NETSUITE_ERP"],
  "GL-MAN-001": ["NETSUITE_ERP"],
};

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

export interface FinancialLifeView {
  readonly serial: string;
  readonly unit?: {
    readonly sku: string;
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

    searchSerial(ctx: ServiceContext, query: string) {
      authorize(ctx.user, "close.read");
      const q = query.trim().toUpperCase();
      return ws.dataset.inventoryUnits.filter((u) => u.serial.toUpperCase().includes(q));
    },

    getFinancialLife(ctx: ServiceContext, serial: string): FinancialLifeView {
      authorize(ctx.user, "close.read");
      const d = ws.dataset;
      const unit = d.inventoryUnits.find((u) => u.serial === serial);
      const hasSerial = (lines: readonly { serials?: readonly string[] | undefined }[]) =>
        lines.some((l) => l.serials?.includes(serial));

      const receipt = d.itemReceipts.find((r) => hasSerial(r.lines));
      const po = receipt
        ? d.purchaseOrders.find((p) => p.transactionNumber === receipt.purchaseOrderNumber)
        : d.purchaseOrders.find((p) => hasSerial(p.lines));
      const bill = d.vendorBills.find(
        (b) =>
          hasSerial(b.lines) ||
          (po !== undefined && b.purchaseOrderNumber === po.transactionNumber),
      );
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
      if (!po) missing.push("Purchase Order");
      if (!receipt) missing.push("Item Receipt");
      if (!bill) missing.push("Vendor Bill");
      if (iff) {
        if (!shipment) missing.push("Carrier shipment");
        if (!delivered) missing.push("Delivery confirmation");
        if (!invoice) missing.push("Customer Invoice");
        if (unit) missing.push("Inventory relief");
      }

      return {
        serial,
        ...(unit
          ? {
              unit: {
                sku: unit.sku,
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
        managementIndicators: ws.close.managementIndicators,
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
      return ws.evidenceGraph.items.map((item) => {
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
      return ws.evidenceGraph.links;
    },

    traceLineage(ctx: ServiceContext, exceptionId: string): ExceptionLineage | undefined {
      authorize(ctx.user, "evidence.read");
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

    getAuditTrail(ctx: ServiceContext) {
      authorize(ctx.user, "audit.read");
      return ws.audit.list();
    },
  };
}

export type QueryService = ReturnType<typeof createQueryService>;
