import { DEMO_USERS, type DemoUser } from "@icg/data";
import type {
  CarrierShipmentFixture,
  CountMovementFixture,
  CountResultFixture,
  CountTestFixture,
  CustomerInvoiceFixture,
  EvidenceSensitivity,
  InstallationFixture,
  ItemFulfillmentFixture,
  ItemReceiptFixture,
  ProcurementMatch,
  PurchaseOrderFixture,
  SalesOrderFixture,
  SourceHealthFixture,
  PbcStatus,
  SourceRecordRef,
  TelemetryFixture,
  TransactionChain,
  VendorBillFixture,
} from "@icg/domain";
import { isResolvedStatus } from "@icg/domain";
import type {
  AdjustmentRegisterOut,
  BlockerOut,
  CloseAggregates,
  CountSummaryOut,
  DerivedException,
  PbcItemOut,
  ReadinessOut,
  ReconciliationOut,
  ValuationOut,
} from "@icg/rules";
import { RULE_DEFINITIONS } from "@icg/rules";
import { traceExceptionLineage, type ExceptionLineage } from "@icg/evidence";
import { authorize, canReadContent, hasPermission } from "@icg/permissions";
import { DEMO_RESET_PERMISSION } from "./commands.js";
import { redactRestricted } from "./redaction.js";
import {
  describeControls,
  pbcDependencySlices,
  replayCoverage,
  verifyReproduction,
  type CloseControl,
  type PbcDependencySlice,
  type ReproductionCheck,
} from "./integrity.js";
import { PBC_DEPENDENCIES, pbcDependencyHash, type Workspace } from "./workspace.js";
import { hasProvidedVersion, versionsFor, type PbcVersion } from "./pbc.js";

/**
 * Query services (prompt 04). Authorization happens HERE, before data
 * reaches any caller — the UI, exports, and the future Ask Gaurd adapter
 * all inherit it. There is no client-side permission logic anywhere.
 */

/** A rule's identity and control domain, without its schemas or doc refs. */
export interface RuleSummary {
  readonly id: string;
  readonly version: string;
  readonly controlDomain: string;
}

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

/** The demo user who holds a role, for version attribution. */
function userForRole(role: string): string {
  return DEMO_USERS.find((u) => (u.roles as readonly string[]).includes(role))?.id ?? "";
}

/**
 * Scope keys on whether a workpaper has ever been PROVIDED, not on whether
 * its status reads PROVIDED right now. FOLLOW_UP_REQUESTED means further
 * support was asked for *after* providing — the prior version stays sealed
 * in the auditor's hands, so its support is plainly in their scope.
 */
function providedExceptionIds(ws: Workspace): ReadonlySet<string> {
  return new Set(
    ws.close.pbc
      .filter((item) =>
        hasProvidedVersion(
          versionsFor(
            item,
            pbcDependencyHash(ws.close, PBC_DEPENDENCIES[item.id] ?? []),
            userForRole,
          ),
        ),
      )
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

/** Record identity as the evidence graph keys it (kind is not needed here). */
const identityKey = (ref: SourceRecordRef): string =>
  `${ref.sourceSystem}|${ref.internalId}`;

/**
 * Source-document scoping for the stage-06 record projections.
 *
 * A source document that is ALSO evidence for some exception inherits that
 * evidence's visibility: if the viewer's scope hides the evidence item,
 * handing them the underlying fixture would be a side door around
 * `listEvidence` / `traceLineage`. A document that is evidence for nothing
 * is not governed by the workpaper model and stays readable under
 * `close.read`, exactly as `listInventoryUnits` does.
 */
function makeRecordScope(
  ws: Workspace,
  user: DemoUser,
): (ref: SourceRecordRef | undefined) => boolean {
  if (!isAuditor(user)) return () => true;
  const visible = auditorVisibleEvidenceIds(ws);
  const hiddenIdentities = new Set(
    ws.evidenceGraph.items
      .filter((item) => item.sourceRef !== undefined && !visible.has(item.id))
      .map((item) => identityKey(item.sourceRef as SourceRecordRef)),
  );
  return (ref) => ref === undefined || !hiddenIdentities.has(identityKey(ref));
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
  /**
   * The underlying source records for each present component (stage 06).
   * Raw fixture facts — dates, lines, source refs — so the Financial Life
   * surface can show occurred/retrieved and amounts without recomputing
   * anything. Absent components stay absent here too.
   */
  readonly records: {
    readonly purchaseOrder?: PurchaseOrderFixture | undefined;
    readonly itemReceipt?: ItemReceiptFixture | undefined;
    readonly vendorBill?: VendorBillFixture | undefined;
    readonly salesOrder?: SalesOrderFixture | undefined;
    readonly itemFulfillment?: ItemFulfillmentFixture | undefined;
    readonly carrierShipment?: CarrierShipmentFixture | undefined;
    readonly installation?: InstallationFixture | undefined;
    readonly telemetry?: TelemetryFixture | undefined;
    readonly customerInvoice?: CustomerInvoiceFixture | undefined;
  };
  /**
   * Document totals in integer cents, summed here so no caller adds money
   * up for display. Absent where a line omits its amount, or where the
   * document itself is absent or out of the viewer's scope.
   */
  readonly recordTotals: {
    readonly salesOrderCents?: number | undefined;
    readonly customerInvoiceCents?: number | undefined;
  };
}

/**
 * One PBC request as the audit-package workspace reads it (stage 07):
 * the derived request plus its version history, immutability, dependency
 * staleness, and the open exceptions holding it up.
 */
export interface PbcPackageItem extends PbcItemOut {
  /** The prepared state, preserved when `status` reports REFRESH_REQUIRED. */
  readonly baselineStatus: PbcStatus;
  readonly refreshRequired: boolean;
  readonly immutable: boolean;
  readonly hasProvidedVersion: boolean;
  readonly latestVersion?: number | undefined;
  /** Versions the viewer may see; an auditor sees only sealed ones. */
  readonly versions: readonly PbcVersion[];
  /** How many versions the viewer's scope withheld — never silently zero. */
  readonly withheldVersionCount: number;
  readonly dependsOn: readonly string[];
  readonly blockedBy: readonly string[];
  readonly preparedStateHash: string;
  readonly currentStateHash: string;
}

/**
 * One custodian's holdings recorded as company-owned (stage 08). `supported` is false
 * when a close exception stands against the holding — never inferred from
 * the confirmation state alone, so the rule stays the single authority on
 * whether a holding is a problem.
 */
export interface ThirdPartyHolding {
  readonly custodian: string;
  readonly units: number;
  readonly valueCents: number;
  readonly skus: readonly string[];
  readonly confirmation: "NOT_REQUESTED" | "REQUESTED" | "RESPONDED";
  readonly requestedAt?: string | undefined;
  readonly respondedAt?: string | undefined;
  readonly exceptionId?: string | undefined;
  readonly supported: boolean;
}

/** PO ↔ IR ↔ VB source documents behind one procurement match (stage 06). */
export interface ProcurementDetail {
  readonly purchaseOrder?: PurchaseOrderFixture | undefined;
  readonly itemReceipt?: ItemReceiptFixture | undefined;
  readonly vendorBill?: VendorBillFixture | undefined;
  /**
   * Document totals in integer cents, summed HERE so no caller adds money up
   * for display. Absent when any line omits its amount — a partial sum is
   * not a total, and the UI must show the absence rather than a wrong figure.
   */
  readonly totals: {
    readonly purchaseOrderCents?: number | undefined;
    readonly vendorBillCents?: number | undefined;
    readonly purchaseOrderQuantity?: number | undefined;
  };
}

/** Sum of line amounts, or undefined when any line has no amount. */
function documentTotalCents(
  lines: readonly { amountCents?: number | undefined }[] | undefined,
): number | undefined {
  if (lines === undefined) return undefined;
  let total = 0;
  for (const line of lines) {
    if (line.amountCents === undefined) return undefined;
    total += line.amountCents;
  }
  return total;
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
     * Location reference data (stage 06). The dataset carries each location's
     * canonical display name; without this the UI would have to transcribe
     * them, and transcribed names drift from the data they label.
     */
    listLocations(ctx: ServiceContext) {
      authorize(ctx.user, "close.read");
      return ws.dataset.locations;
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
      const inScope = makeRecordScope(ws, ctx.user);
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
        // Documents that are evidence the viewer's scope hides are withheld
        // here too — `records` must never be a side door around listEvidence.
        records: {
          ...(po && inScope(po.sourceRef) ? { purchaseOrder: po } : {}),
          ...(receipt && inScope(receipt.sourceRef) ? { itemReceipt: receipt } : {}),
          ...(bill && inScope(bill.sourceRef) ? { vendorBill: bill } : {}),
          ...(so && inScope(so.sourceRef) ? { salesOrder: so } : {}),
          ...(iff && inScope(iff.sourceRef) ? { itemFulfillment: iff } : {}),
          ...(shipment && inScope(shipment.sourceRef) ? { carrierShipment: shipment } : {}),
          ...(installation && inScope(installation.sourceRef) ? { installation } : {}),
          ...(telemetry && inScope(telemetry.sourceRef) ? { telemetry } : {}),
          ...(invoice && inScope(invoice.sourceRef) ? { customerInvoice: invoice } : {}),
        },
        recordTotals: {
          ...(so && inScope(so.sourceRef)
            ? { salesOrderCents: documentTotalCents(so.lines) }
            : {}),
          ...(invoice && inScope(invoice.sourceRef)
            ? { customerInvoiceCents: documentTotalCents(invoice.lines) }
            : {}),
        },
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
        // Adjustment trace for cycle-count history (stage 06): NetSuite
        // inventory adjustments, including relatedCountPlanId links.
        adjustments: ws.dataset.inventoryAdjustments,
        // The cycle-count lens is a MANAGEMENT risk view (locked decision
        // 3); it is never part of the auditor's provided support.
        managementIndicators: isAuditor(ctx.user) ? [] : ws.close.managementIndicators,
      };
    },

    getReconciliation(ctx: ServiceContext): ReconciliationOut {
      authorize(ctx.user, "close.read");
      return ws.close.reconciliation;
    },

    /**
     * The proposed-adjustment register (stage 07): every reconciling item
     * paired with the entry drafted for it, or with the reason none exists.
     * Nothing here is posted, and no caller can post it — there is no
     * command that writes to NetSuite.
     */
    getAdjustmentRegister(ctx: ServiceContext): AdjustmentRegisterOut {
      authorize(ctx.user, "close.read");
      return ws.close.adjustmentRegister;
    },

    /**
     * Valuation workspace (stage 07): aging, review populations, damage/RMA,
     * and the reserve position. The reserve conclusion is UNDETERMINED and
     * no query, rule, or assistant produces an amount for it.
     */
    getValuation(ctx: ServiceContext): ValuationOut {
      authorize(ctx.user, "close.read");
      return ws.close.valuation;
    },

    getProcurementMatches(ctx: ServiceContext): readonly ProcurementMatch[] {
      authorize(ctx.user, "close.read");
      return ws.close.procurementMatches;
    },

    /**
     * Source documents behind one procurement match (stage 06). Read-only
     * fixture facts so the Procurement Match surface can show dates and
     * amounts; the match STATUSES still come only from the rule output.
     */
    getProcurementDetail(ctx: ServiceContext, poNumber: string): ProcurementDetail {
      authorize(ctx.user, "close.read");
      const inScope = makeRecordScope(ws, ctx.user);
      const po = ws.dataset.purchaseOrders.find(
        (p) => p.transactionNumber === poNumber,
      );
      const receipt = ws.dataset.itemReceipts.find(
        (r) => r.purchaseOrderNumber === poNumber,
      );
      const bill = ws.dataset.vendorBills.find(
        (b) => b.purchaseOrderNumber === poNumber,
      );
      const poVisible = po !== undefined && inScope(po.sourceRef);
      const billVisible = bill !== undefined && inScope(bill.sourceRef);
      return {
        ...(poVisible ? { purchaseOrder: po } : {}),
        ...(receipt && inScope(receipt.sourceRef) ? { itemReceipt: receipt } : {}),
        ...(billVisible ? { vendorBill: bill } : {}),
        totals: {
          ...(poVisible
            ? {
                purchaseOrderCents: documentTotalCents(po.lines),
                purchaseOrderQuantity: po.lines.reduce((n, l) => n + l.quantity, 0),
              }
            : {}),
          ...(billVisible ? { vendorBillCents: documentTotalCents(bill.lines) } : {}),
        },
      };
    },

    /**
     * Third-party custodian holdings (stage 08).
     *
     * TPI-CONF-001 computes each custodian's unit count and exposure and then
     * keeps only the exposure on the finding — the count survives solely
     * inside its `whyFlagged` sentence. Ask Gaurd must answer "Redwood, 14
     * units, $92,400" from structured data, and recovering a figure by
     * parsing prose is exactly what this architecture forbids. So the
     * grouping is exposed here, alongside the confirmation state that makes
     * a holding unsupported.
     */
    getThirdPartyHoldings(ctx: ServiceContext): readonly ThirdPartyHolding[] {
      authorize(ctx.user, "close.read");
      const byCustodian = new Map<string, { units: number; valueCents: number; skus: Set<string> }>();
      for (const unit of ws.dataset.inventoryUnits) {
        if (unit.custodian === undefined) continue;
        const entry = byCustodian.get(unit.custodian) ?? {
          units: 0,
          valueCents: 0,
          skus: new Set<string>(),
        };
        entry.units += 1;
        entry.valueCents += unit.unitCostCents;
        entry.skus.add(unit.sku);
        byCustodian.set(unit.custodian, entry);
      }
      return [...byCustodian.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([custodian, holding]) => {
          const statement = ws.dataset.custodianStatements.find(
            (s) => s.custodian === custodian,
          );
          const exception = ws.close.exceptions.find(
            (e) =>
              e.finding.ruleId === "TPI-CONF-001" &&
              e.finding.subjects.custodian === custodian,
          );
          return {
            custodian,
            units: holding.units,
            valueCents: holding.valueCents,
            skus: [...holding.skus].sort(),
            // Requested-and-unanswered is weaker than confirmed but stronger
            // than never-requested; the three states stay distinct.
            confirmation:
              statement === undefined
                ? ("NOT_REQUESTED" as const)
                : statement.respondedAt === undefined
                  ? ("REQUESTED" as const)
                  : ("RESPONDED" as const),
            ...(statement?.requestedAt !== undefined
              ? { requestedAt: statement.requestedAt }
              : {}),
            ...(statement?.respondedAt !== undefined
              ? { respondedAt: statement.respondedAt }
              : {}),
            ...(exception !== undefined ? { exceptionId: exception.id } : {}),
            supported: exception === undefined,
          };
        });
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
      //
      // `content` is NOT the only copy. EvidenceItem also carries
      // `originalValue`, the value as retrieved, and the fixture pipeline is
      // an IDENTITY transformation — so the original is byte-identical to the
      // content it mirrors. Clearing one and spreading the other leaked the
      // whole restricted payload (found by the stage-08 adversarial suite:
      // a WAREHOUSE user could read EXC-001's contract provisions through
      // lineage). Both copies go; the HASHES stay, because they disclose
      // nothing and lineage integrity depends on them.
      return {
        ...lineage,
        evidence: lineage.evidence.map(({ item, linkType }) => ({
          item: redactRestricted(ctx.user, item),
          linkType,
        })),
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
     *
     * `status` is the *effective* state a reader acts on; `baselineStatus`
     * keeps the prepared state visible underneath it, so a refresh flag
     * never erases what the workpaper was.
     */
    getPbcPackage(ctx: ServiceContext): readonly PbcPackageItem[] {
      authorize(ctx.user, "pbc.read");
      return ws.close.pbc.map((item) => {
        const dependsOn = PBC_DEPENDENCIES[item.id] ?? [];
        const currentStateHash = pbcDependencyHash(ws.close, dependsOn);
        const preparedStateHash = ws.pbcPreparedState.get(item.id) ?? currentStateHash;
        const stale = preparedStateHash !== currentStateHash;
        const versions = versionsFor(item, currentStateHash, userForRole);
        const provided = hasProvidedVersion(versions);
        // docs/10: the auditor sees provided support. An internal working
        // draft has not been provided, so it is withheld — but the COUNT is
        // reported so the omission is visible rather than looking like a
        // workpaper with no history at all.
        const visible = isAuditor(ctx.user) ? versions.filter((v) => v.sealed) : versions;
        return {
          ...item,
          baselineStatus: item.status,
          status: stale ? ("REFRESH_REQUIRED" as const) : item.status,
          refreshRequired: stale,
          // A sealed version can never be edited in place, whatever the
          // request's current status says.
          immutable: provided,
          hasProvidedVersion: provided,
          latestVersion: versions.find((v) => v.version !== undefined)?.version,
          versions: visible,
          withheldVersionCount: versions.length - visible.length,
          dependsOn,
          /** The open exceptions this workpaper is waiting on, if any. */
          blockedBy: dependsOn.filter((dep) => {
            const exc = ws.close.exceptions.find((e) => e.id === dep);
            return exc !== undefined && !isResolvedStatus(exc.status);
          }),
          preparedStateHash,
          currentStateHash,
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

    /**
     * What the acting user may do with the demo controls (stage 09). Gated
     * on the SAME permission key the command authorizes against, so a
     * surface can never offer a control the service will refuse — or hide
     * one it would have allowed.
     */
    getDemoCapabilities(ctx: ServiceContext) {
      authorize(ctx.user, "close.read");
      return {
        canResetDemo: hasPermission(ctx.user, DEMO_RESET_PERMISSION),
      };
    },

    /**
     * The control totals a rebuild is checked against (stage 09). Derived
     * from the close on every call — there is no stored copy to drift.
     */
    getCloseControls(ctx: ServiceContext): readonly CloseControl[] {
      authorize(ctx.user, "close.read");
      return describeControls(ws.close, ws.dataset.manifest.controlTotals.bookUnits);
    },

    /**
     * What a replay compares and what it deliberately leaves out — the
     * same lists the check itself uses, readable without paying for a
     * rebuild.
     */
    getReplayCoverage(ctx: ServiceContext) {
      authorize(ctx.user, "close.read");
      return replayCoverage();
    },

    /**
     * Reproduce Close (CANONICAL_SPEC section 15). Rebuilds the dataset
     * from the seed, re-runs the rules, and compares structured output
     * only. This is a read: it verifies the running close, changes nothing,
     * and so appends no audit event.
     */
    verifyReproduction(ctx: ServiceContext): ReproductionCheck {
      authorize(ctx.user, "close.read");
      return verifyReproduction(ws.close);
    },

    /**
     * Which workpapers each controlled-state slice invalidates when it
     * changes (docs/10). The same edges `getPbcPackage` reads per
     * workpaper, inverted — never a second declaration of them.
     */
    getPbcDependencySlices(ctx: ServiceContext): readonly PbcDependencySlice[] {
      authorize(ctx.user, "pbc.read");
      return pbcDependencySlices(ws.close);
    },

    /**
     * The rule registry as a caller-facing summary (stage 09). Control
     * domain lives on the rule definition, so a section that filters the
     * exception list by domain reads the registry rather than hard-coding
     * which rule ids belong to it.
     */
    listRuleSummaries(ctx: ServiceContext): readonly RuleSummary[] {
      authorize(ctx.user, "close.read");
      return RULE_DEFINITIONS.map((rule) => ({
        id: String(rule.id),
        version: rule.version,
        controlDomain: rule.controlDomain,
      }));
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
