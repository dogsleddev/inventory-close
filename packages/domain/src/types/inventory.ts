import type { IsoDate } from "../dates.js";
import type { Cents } from "../money.js";
import type {
  AccountingClassification,
  PeriodState,
} from "../enums.js";
import type {
  ClosePeriodId,
  GlAccountCode,
  LocationId,
  SerialNumberId,
  SkuCode,
  SourceRecordRef,
} from "../identifiers.js";

export interface Sku {
  readonly code: SkuCode;
  readonly description: string;
  readonly unitCost: Cents;
}

export interface Location {
  readonly id: LocationId;
  readonly name: string;
  /** Location is not ownership: classification is an accounting conclusion. */
  readonly defaultClassification?: AccountingClassification;
}

export interface SerialNumber {
  readonly id: SerialNumberId;
  readonly sku: SkuCode;
}

export interface InventoryItem {
  readonly serial: SerialNumberId;
  readonly sku: SkuCode;
  readonly location: LocationId;
  readonly classification: AccountingClassification;
  readonly unitCost: Cents;
  readonly sourceRef?: SourceRecordRef;
}

/** A dated, immutable book-inventory snapshot (e.g. the 12/31 population). */
export interface InventorySnapshot {
  readonly snapshotDate: IsoDate;
  readonly datasetVersion: string;
  readonly items: readonly InventoryItem[];
}

export interface GlAccount {
  readonly code: GlAccountCode;
  readonly name: string;
}

export interface GlBalance {
  readonly account: GlAccountCode;
  readonly asOf: IsoDate;
  readonly amount: Cents;
  readonly sourceRef?: SourceRecordRef;
}

export interface ClosePeriod {
  readonly id: ClosePeriodId;
  readonly label: string;
  readonly balanceSheetDate: IsoDate;
  readonly state: PeriodState;
  /** Reopening requires a reason; history is append-only. */
  readonly reopenReason?: string;
}

/** One line of the subledger-to-GL reconciliation. */
export interface ReconciliationItem {
  readonly id: string;
  readonly description: string;
  readonly amount: Cents;
  readonly relatedExceptionId?: string;
}

export interface Reconciliation {
  readonly asOf: IsoDate;
  readonly subledgerTotal: Cents;
  readonly glTotal: Cents;
  /** glTotal - subledgerTotal; sign convention: positive when GL > subledger. */
  readonly grossDifference: Cents;
  readonly items: readonly ReconciliationItem[];
}
