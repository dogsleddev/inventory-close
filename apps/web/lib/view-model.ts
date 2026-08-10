import type { StatusView, RiskView } from "./workflow-view";

/**
 * JSON-safe view models (stage 05). Server pages assemble these from
 * @icg/services and hand them to client components — every figure is a
 * pre-formatted string derived from service output, so components carry no
 * accounting logic and no way to invent a total.
 *
 * Sections a role is not authorized to read arrive as `{ restricted: true }`
 * — fail-visible, never silently empty (docs/01 principle: an empty screen
 * must never read as a zero balance).
 */

export interface RoleOption {
  readonly userId: string;
  readonly displayName: string;
  readonly roleLabel: string;
}

export interface ShellData {
  readonly userId: string;
  readonly displayName: string;
  readonly roleLabel: string;
  readonly initials: string;
  readonly roles: readonly RoleOption[];
  readonly periodLabel: string | null;
  /** Header strip; null when the role cannot read close data. */
  readonly headerKpis: { readonly ready: string; readonly blockers: string } | null;
  readonly navOpenBlockers: number | null;
  readonly dataHealthPct: string | null;
  /**
   * Deterministic Ask Gaurd fallback (docs/09: if AI fails, deterministic
   * answers still work). Stage 05 ships the drawer shell only; the assistant
   * itself is stage 08, so asking renders this fallback.
   */
  readonly askFallback: {
    readonly blockerCount: number;
    readonly exposure: string;
    readonly blockerIds: string;
  } | null;
}

export interface Restricted {
  readonly restricted: true;
}
export const RESTRICTED: Restricted = { restricted: true };

export interface KpiTile {
  readonly label: string;
  readonly value: string;
  readonly valueSuffix?: string;
  readonly note: string;
  readonly tone?: "ember" | "warn";
  readonly warnNote?: boolean;
}

export interface GateCategory {
  readonly key: string;
  readonly label: string;
  readonly weightPct: string;
  readonly score: string;
  readonly fillPct: number;
  readonly weight: number;
  readonly tone: "ember" | "warn" | "ink";
  readonly note: string;
  readonly noteWarn: boolean;
}

export interface BlockerRow {
  readonly id: string;
  readonly title: string;
  readonly nextAction: string;
  readonly owner: string;
  readonly exposure: string;
  readonly risk: RiskView;
  readonly status: StatusView;
  readonly blocker: boolean;
}

export interface AttentionItem {
  readonly label: string;
  readonly detail: string;
  readonly ref: string;
  readonly glyph: string;
  readonly tone: "ember-strong" | "frost" | "warn";
}

export interface ActivityItem {
  readonly label: string;
  readonly detail: string;
  readonly by: string;
  readonly when: string;
  readonly glyph: string;
  readonly tone: "aurora" | "frost" | "warn";
}

export interface SourceHealthRow {
  readonly name: string;
  readonly state: string;
  readonly glyph: string;
  readonly variant: "healthy" | "partial" | "stale" | "failed";
}

export interface ExceptionDrawerData {
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly status: StatusView;
  readonly risk: RiskView;
  readonly blocker: boolean;
  readonly exposure: string;
  readonly layers: {
    readonly netsuite: string;
    readonly physical: string;
    readonly accounting: string;
    readonly accountingMissing: boolean;
  };
  readonly conclusion: string;
  readonly nextAction: string;
  /** The evidence records behind this exception — distinct from source health. */
  readonly sourceRecords: readonly {
    readonly id: string;
    readonly title: string;
    readonly source: string;
    readonly kind: string;
  }[];
  readonly coverageWarnings: readonly string[];
}

export interface OverviewData {
  readonly restricted: boolean;
  readonly roleLabel: string;
  readonly gate?: {
    readonly readinessOverview: string;
    readonly readinessExact: string;
    readonly bps: number;
    readonly categories: readonly GateCategory[];
    readonly stats: readonly KpiTile[];
    readonly blockerCount: number;
    readonly blockerSummary: string;
  };
  readonly preventing?: {
    readonly rows: readonly BlockerRow[];
    readonly shownTotal: string;
    readonly allTotal: string;
    readonly blockerCount: number;
    readonly remainingNote: string;
  };
  readonly glPanel?: {
    readonly grossGl: string;
    readonly grossSubledger: string;
    readonly difference: string;
    readonly potentialAdjusted: string;
    readonly proposedCount: number;
  };
  readonly pbcPanel?:
    | {
        readonly restricted: false;
        readonly summary: string;
        readonly rows: readonly { label: string; glyph: string; tone: string; count: number }[];
      }
    | Restricted;
  readonly attention?: {
    readonly items: readonly AttentionItem[];
    readonly auditorNote: string | null;
  };
  readonly activity?: readonly ActivityItem[];
  readonly closeAreas?: {
    readonly categories: readonly GateCategory[];
    readonly weightedResult: string;
  };
  readonly sourceHealth?: {
    readonly rows: readonly SourceHealthRow[];
    readonly summary: string;
    readonly callout: {
      readonly title: string;
      readonly body: string;
      readonly affected: string;
    } | null;
  };
  readonly drawers?: Readonly<Record<string, ExceptionDrawerData>>;
}

export interface ExceptionListRow {
  readonly id: string;
  readonly title: string;
  readonly ruleId: string;
  readonly exposure: string;
  readonly risk: RiskView;
  readonly status: StatusView;
  readonly blocker: boolean;
  readonly open: boolean;
  readonly coverageWarnings: readonly string[];
}

export interface ExceptionsData {
  readonly restricted: boolean;
  readonly roleLabel: string;
  readonly rows: readonly ExceptionListRow[];
  readonly openBlockerCount: number;
  readonly openBlockerExposure: string;
  readonly totalCount: number;
  readonly drawers: Readonly<Record<string, ExceptionDrawerData>>;
}

export interface EvidenceRecordView {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
  readonly kindLabel: string;
  readonly state: string;
  readonly stateGlyph: string;
  readonly stateVariant: "resolved" | "review" | "waiting" | "neutral" | "conflict" | "missing";
  readonly source: string;
  readonly contentWithheld: boolean;
  readonly rows: readonly { k: string; v: string; mono?: boolean; missing?: boolean }[];
  readonly related: readonly string[];
  readonly audit: readonly { k: string; v: string }[];
}

export interface ChainNodeView {
  readonly type: string;
  readonly value: string;
  readonly state: string;
  readonly glyph: string;
  readonly visual: "present" | "corroborating" | "missing" | "conflict";
  readonly flex: number;
  readonly evidenceId: string | null;
}

export interface TimelineEntry {
  readonly date: string;
  readonly label: string;
  readonly src: string;
  readonly glyph: string;
  readonly tone: "ink" | "soft" | "ember";
  readonly emphasis: boolean;
  readonly evidenceId: string | null;
}

/* ------------------------------------------------------------------ */
/* Stage 06 — Financial Life, Physical Count, Reconciliation chains    */
/* ------------------------------------------------------------------ */

/** Tab bar entry (design: ember underline · optional count). */
export interface TabDef {
  readonly key: string;
  readonly label: string;
  readonly count: string | null;
}

/**
 * One event card in the four-phase chain of custody. Visual vocabulary from
 * the design-04 relationship legend: accounting transaction · physical
 * event · corroborating · required-missing · conflicting · conclusion.
 */
export interface LifeEventCard {
  readonly key: string;
  readonly kind: string;
  readonly date: string;
  readonly title: string;
  readonly meta: string | null;
  readonly visual: "acc" | "phy" | "cor" | "miss" | "conf" | "conc";
  readonly glyph: string;
  /** Opens the record drawer; null when the card has no backing record. */
  readonly recordId: string | null;
  /** Navigates instead of opening a drawer (exception cards). */
  readonly href: string | null;
}

export interface LifePhase {
  readonly name: string;
  readonly range: string;
  readonly accent: boolean;
  readonly events: readonly LifeEventCard[];
}

export interface LifeCycleRow {
  readonly date: string;
  readonly plan: string;
  readonly snapshot: string;
  readonly counted: string;
  readonly variance: string;
  readonly varianceWarn: boolean;
  readonly approval: { readonly label: string; readonly glyph: string; readonly tone: "aurora" | "soft" | "ember" };
  readonly adjustment: string;
}

export interface FinancialLifeData {
  readonly restricted: boolean;
  readonly roleLabel: string;
  readonly serial: string;
  /** False when no source anywhere mentions the serial. */
  readonly found: boolean;
  readonly onBook: boolean;
  readonly header?: {
    readonly sku: string;
    readonly skuNote: string;
    readonly carrying: string | null;
    readonly netsuite: { readonly headline: string; readonly sub: string };
    readonly physical: { readonly headline: string; readonly sub: string; readonly ember: boolean };
    readonly exception: { readonly id: string; readonly note: string } | null;
    readonly close: {
      readonly status: StatusView | null;
      readonly blocker: boolean;
      readonly body: string;
    };
    readonly chips: readonly { readonly label: string; readonly recordId: string | null; readonly href: string | null }[];
  };
  readonly range: string | null;
  readonly phases: readonly LifePhase[];
  readonly cycle: {
    readonly rows: readonly LifeCycleRow[];
    readonly notes: readonly string[];
    readonly empty: string | null;
  } | null;
  readonly evidenceChain: readonly {
    readonly label: string;
    readonly tag: string;
    readonly glyph: string;
    readonly visual: "present" | "corroborating" | "missing" | "conflict";
    readonly recordId: string | null;
  }[];
  readonly chainFootnote: string | null;
  readonly accounting: {
    readonly rows: readonly { readonly k: string; readonly v: string; readonly mono?: boolean }[];
    readonly proposed: string;
    readonly footnote: string;
  } | null;
  readonly records: Readonly<Record<string, EvidenceRecordView>>;
}

export interface InventorySearchData {
  readonly restricted: boolean;
  readonly roleLabel: string;
  readonly query: string;
  readonly bookCountNote: string | null;
  readonly hits: readonly {
    readonly serial: string;
    readonly onBook: boolean;
    readonly foundIn: readonly string[];
    readonly sku: string | null;
    readonly location: string | null;
  }[] | null;
  /** Serials referenced by open exceptions — deterministic entry points. */
  readonly notable: readonly { readonly serial: string; readonly note: string }[];
}

export interface CountVarianceRow {
  readonly key: string;
  readonly subject: string;
  readonly subjectMono: boolean;
  readonly sku: string;
  readonly location: string;
  readonly bin: string;
  readonly book: string;
  readonly counted: string;
  readonly variance: string;
  readonly exceptionId: string | null;
  readonly status: StatusView | null;
  readonly risk: RiskView | null;
  readonly exposure: string | null;
  readonly owner: string | null;
}

export interface CountTestRow {
  readonly id: string;
  readonly direction: "SHEET_TO_FLOOR" | "FLOOR_TO_SHEET";
  readonly directionLabel: string;
  readonly sku: string;
  readonly serial: string | null;
  readonly location: string;
  readonly bin: string | null;
  readonly recorded: string;
  readonly observation: string;
  readonly traced: boolean;
  readonly exceptionId: string | null;
}

export interface CycleHistoryRow {
  readonly key: string;
  readonly countDate: string;
  readonly plan: string;
  readonly planExternal: string | null;
  readonly countType: string;
  readonly sku: string;
  readonly location: string;
  readonly bin: string | null;
  readonly serial: string | null;
  readonly snapshot: string;
  readonly counted: string;
  readonly variance: string;
  readonly varianceWarn: boolean;
  readonly recount: string;
  readonly approval: { readonly label: string; readonly glyph: string; readonly tone: "aurora" | "soft" | "ember" };
  readonly adjustment: string | null;
  readonly nextDue: string | null;
}

export interface PhysicalCountData {
  readonly restricted: boolean;
  readonly roleLabel: string;
  readonly stats: readonly KpiTile[];
  readonly planNote: string | null;
  readonly locations: readonly { readonly label: string; readonly units: string }[];
  readonly locationTotal: string | null;
  readonly variances: readonly CountVarianceRow[];
  readonly discovery: {
    readonly serial: string;
    readonly location: string;
    readonly bin: string | null;
    readonly testId: string;
    readonly observation: string;
    readonly exceptionId: string | null;
    readonly status: StatusView | null;
    readonly exposure: string | null;
  } | null;
  readonly auditorTests: readonly CountTestRow[];
  readonly managementTests: readonly CountTestRow[];
  readonly testSummary: { readonly auditor: string; readonly management: string } | null;
  readonly movements: readonly {
    readonly id: string;
    readonly subject: string;
    readonly qty: string;
    readonly from: string;
    readonly to: string;
    readonly movedAt: string;
    readonly authorizedBy: string;
    readonly reason: string;
    readonly exceptionId: string | null;
  }[];
  readonly cycle: {
    readonly rows: readonly CycleHistoryRow[];
    /** Null when the viewer's role scopes the management lens out. */
    readonly indicators:
      | readonly { readonly title: string; readonly why: string; readonly rule: string }[]
      | null;
  };
  readonly drawers: Readonly<Record<string, ExceptionDrawerData>>;
}

export interface ProcurementLeg {
  readonly label: string;
  readonly glyph: string;
  readonly value: string;
  readonly note: string;
  readonly missing: boolean;
}

export interface ProcurementCard {
  readonly key: string;
  readonly po: string;
  readonly title: string;
  readonly qtyAmount: string | null;
  readonly nsTag: string;
  readonly close: { readonly label: string; readonly glyph: string; readonly variant: "frost" | "aurora" };
  readonly ember: boolean;
  readonly legs: readonly ProcurementLeg[];
  readonly footnote: { readonly glyph: string; readonly tone: "ember" | "aurora"; readonly text: string };
  readonly exceptionId: string | null;
}

export interface ReconciliationData {
  readonly restricted: boolean;
  readonly roleLabel: string;
  readonly headerNote: string | null;
  readonly tabs: readonly TabDef[];
  readonly procurement: {
    readonly nativeSummary: string;
    readonly closeSummary: string;
    readonly featured: readonly ProcurementCard[];
    readonly rows: readonly {
      readonly po: string;
      readonly ir: string;
      readonly vb: string;
      readonly native: string;
      readonly close: { readonly label: string; readonly glyph: string; readonly variant: "frost" | "aurora" };
      readonly exceptionId: string | null;
    }[];
  } | null;
  readonly commercial: {
    readonly featured: {
      readonly subject: string;
      readonly subNote: string;
      readonly exceptionId: string | null;
      readonly nodes: readonly ChainNodeView[];
      readonly summary: string;
      readonly completeness: {
        readonly big: string;
        readonly rows: readonly { readonly glyph: string; readonly tone: string; readonly label: string; readonly value: string; readonly ember: boolean }[];
        readonly footnote: string;
      };
      readonly accounting: {
        readonly big: string;
        readonly sub: string;
        readonly rows: readonly { readonly k: string; readonly v: string }[];
        readonly footnote: string;
      } | null;
    } | null;
    readonly others: readonly {
      readonly subject: string;
      readonly customer: string | null;
      readonly presence: string;
      readonly requiredMissing: number;
      readonly note: string | null;
      readonly exceptionId: string | null;
    }[];
  } | null;
  readonly serialTab: {
    readonly query: string;
    readonly notable: readonly string[];
    readonly card: {
      readonly serial: string;
      readonly sku: string;
      readonly carrying: string | null;
      readonly onBook: boolean;
      readonly facts: readonly { readonly label: string; readonly value: string; readonly sub: string; readonly ember: boolean }[];
      readonly jump: readonly { readonly label: string; readonly meta: string; readonly href: string }[];
      readonly chainRows: readonly {
        readonly type: string;
        readonly value: string;
        readonly state: string;
        readonly glyph: string;
        readonly missing: boolean;
      }[];
      readonly related: readonly { readonly id: string; readonly status: StatusView; readonly exposure: string; readonly note: string }[];
      readonly relatedEmpty: string | null;
    } | null;
    readonly notFound: string | null;
  };
  readonly drawers: Readonly<Record<string, ExceptionDrawerData>>;
  /** Evidence records behind the featured chain's nodes. */
  readonly records: Readonly<Record<string, EvidenceRecordView>>;
}

export interface ExceptionDetailData {
  readonly restricted: boolean;
  readonly roleLabel: string;
  readonly found: boolean;
  readonly id: string;
  readonly header?: {
    readonly title: string;
    readonly status: StatusView;
    readonly risk: RiskView;
    readonly blocker: boolean;
    readonly owner: string;
    readonly exposure: string;
    readonly exposureDetail: string;
    readonly primarySerial: string | null;
    readonly description: string;
    readonly conclusion: string;
    readonly conclusionNote: string;
    readonly nextAction: string;
    readonly nextActionParty: string;
    readonly positionLabel: string;
  };
  readonly threeLayer?: {
    readonly netsuite: {
      readonly headline: string;
      readonly sub: string;
      readonly chips: readonly { src: string; kind: string; id: string; evidenceId: string | null; netsuite: boolean }[];
      readonly note: string;
    };
    readonly physical: {
      readonly headline: string;
      readonly facts: readonly { label: string; value: string }[];
      readonly chips: readonly { src: string; id: string; evidenceId: string | null; netsuite: boolean }[];
    };
    readonly accounting: {
      readonly headline: string;
      readonly sub: string;
      readonly missing: boolean;
      readonly missingChip: { label: string; src: string; evidenceId: string | null } | null;
      readonly staleNote: string | null;
    };
    readonly interpretation: {
      readonly label: string;
      readonly text: string;
    } | null;
  };
  readonly chain?: {
    readonly summary: string;
    readonly nodes: readonly ChainNodeView[];
  } | null;
  readonly whyFlagged?: {
    readonly text: string;
    readonly assertions: readonly string[];
    readonly ruleId: string;
    readonly ruleVersion: string;
    readonly result: string;
    readonly coverage: string;
    readonly audit: readonly { k: string; v: string }[];
  };
  readonly evidenceState?: {
    readonly known: readonly { label: string; src: string; evidenceId: string }[];
    readonly conflicting: readonly { title: string; detail: string; evidenceId: string | null }[];
    readonly missing: readonly {
      readonly title: string;
      readonly detail: string;
      readonly evidenceId: string | null;
    }[];
    readonly scopeNotice: string | null;
  };
  readonly timeline?: {
    readonly entries: readonly TimelineEntry[];
    readonly missingBlocks: readonly { label: string; detail: string; evidenceId: string | null }[];
    readonly scopeNotice: string | null;
  };
  readonly evidenceRecords?: Readonly<Record<string, EvidenceRecordView>>;
  readonly blockerPosition?: string | null;
}
