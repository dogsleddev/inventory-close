import type { IsoDate, IsoDateTime } from "../dates.js";
import type { Cents } from "../money.js";
import type {
  CountTestDirection,
  CountTestSelectionSource,
  CountType,
  RuleResult,
} from "../enums.js";
import type {
  LocationId,
  SerialNumberId,
  SkuCode,
  SourceRecordRef,
} from "../identifiers.js";

/**
 * Read-only projections of NetSuite transactions (docs/05, docs/06).
 * Gaurd never mutates these; the source ref preserves NetSuite identity.
 */

export interface TransactionLine {
  readonly lineId: string;
  readonly sku: SkuCode;
  readonly quantity: number;
  readonly amount?: Cents;
  readonly serials?: readonly SerialNumberId[];
}

export interface PurchaseOrder {
  readonly sourceRef: SourceRecordRef;
  readonly transactionNumber: string;
  readonly vendor: string;
  readonly orderDate: IsoDate;
  readonly lines: readonly TransactionLine[];
}

export interface ItemReceipt {
  readonly sourceRef: SourceRecordRef;
  readonly transactionNumber: string;
  readonly purchaseOrderNumber: string;
  readonly receiptDate: IsoDate;
  readonly lines: readonly TransactionLine[];
}

export interface VendorBill {
  readonly sourceRef: SourceRecordRef;
  readonly transactionNumber: string;
  readonly purchaseOrderNumber?: string;
  readonly billDate: IsoDate;
  readonly lines: readonly TransactionLine[];
}

export interface SalesOrder {
  readonly sourceRef: SourceRecordRef;
  readonly transactionNumber: string;
  readonly customer: string;
  readonly orderDate: IsoDate;
  readonly lines: readonly TransactionLine[];
}

export interface ItemFulfillment {
  readonly sourceRef: SourceRecordRef;
  readonly transactionNumber: string;
  readonly salesOrderNumber: string;
  readonly shipDate: IsoDate;
  readonly lines: readonly TransactionLine[];
}

export interface CustomerInvoice {
  readonly sourceRef: SourceRecordRef;
  readonly transactionNumber: string;
  readonly salesOrderNumber?: string;
  readonly invoiceDate: IsoDate;
  readonly lines: readonly TransactionLine[];
}

/**
 * CANONICAL_SPEC §7: the native NetSuite match state and the close-control
 * state are recorded separately — a native PASS can coexist with a close
 * REVIEW_REQUIRED. Both use the canonical rule-result vocabulary; whether a
 * match blocks sign-off is a separate blocker attribute on the exception,
 * never a status value.
 */
export interface ProcurementMatch {
  readonly purchaseOrderNumber: string;
  readonly itemReceiptNumber?: string;
  readonly vendorBillNumber?: string;
  readonly nativeNetsuiteMatchStatus: RuleResult;
  readonly closeMatchStatus: RuleResult;
}

/** docs/06 NetSuite count extensions. */
export interface PhysicalCountPlan {
  readonly id: string;
  readonly countType: CountType;
  readonly sourceRef?: SourceRecordRef;
  readonly externalId?: string;
  readonly snapshotAt: IsoDateTime;
  readonly sourceStatus?: string;
  readonly approvedBy?: string;
  readonly approvedAt?: IsoDateTime;
  readonly rejectedReason?: string;
}

export interface CountResult {
  readonly countPlanId: string;
  readonly sku: SkuCode;
  readonly location: LocationId;
  readonly bin?: string;
  readonly serial?: SerialNumberId;
  readonly snapshotQuantity: number;
  readonly countQuantity: number;
  readonly adjustedQuantity?: number;
  readonly variance: number;
  readonly externalCountDetailId?: string;
}

/** Links count → variance → NetSuite inventory adjustment → GL reference. */
export interface InventoryCountAdjustment {
  readonly countPlanId: string;
  readonly adjustmentSourceRef: SourceRecordRef;
  readonly glReference?: string;
}

/**
 * A test-count selection (CANONICAL_SPEC §6, docs/07): 24 management-selected
 * plus 18 auditor-selected in the baseline. Auditor selections are recorded
 * and supported by the app; it never makes them — the auditor independently
 * determines procedures and samples (docs/03).
 */
export interface CountTest {
  readonly id: string;
  readonly countPlanId: string;
  readonly selectionSource: CountTestSelectionSource;
  readonly direction: CountTestDirection;
  readonly sku: SkuCode;
  readonly location: LocationId;
  readonly bin?: string;
  readonly serial?: SerialNumberId;
  /** For auditor tests: the external auditor, recorded verbatim, not a Gaurd user. */
  readonly selectedBy: string;
  readonly recordedAt: IsoDateTime;
}

/** A controlled movement during the count window (six exist in the baseline). */
export interface CountMovement {
  readonly id: string;
  readonly serial?: SerialNumberId;
  readonly sku: SkuCode;
  readonly fromLocation: LocationId;
  readonly toLocation: LocationId;
  readonly movedAt: IsoDateTime;
  readonly authorizedBy: string;
}
