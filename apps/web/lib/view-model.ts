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
  /**
   * Whether this role may run Reset Demo (stage 09). Derived from the same
   * permission key the command authorizes against, so the control is never
   * offered to a role the service would refuse.
   */
  readonly canResetDemo: boolean;
}

export interface Restricted {
  readonly restricted: true;
}
export const RESTRICTED: Restricted = { restricted: true };

/* ------------------------------------------------------------------ */
/* Stage 08 — Ask Gaurd                                                */
/* ------------------------------------------------------------------ */

/**
 * One rendered figure. The value arrives from @icg/ai as integer cents or
 * basis points and is formatted HERE, so the assistant and the screens can
 * never disagree about what a number looks like.
 */
export interface AskFigure {
  readonly label: string;
  readonly value: string;
}

export interface AskCitation {
  readonly label: string;
  readonly href: string | null;
  readonly missing: boolean;
}

/** The material-answer contract (docs/09), pre-formatted and JSON-safe. */
export interface AskAnswerView {
  readonly question: string;
  readonly mode: string;
  readonly status: string;
  readonly knownFacts: readonly AskFigure[];
  readonly conflictingEvidence: readonly string[];
  readonly missingEvidence: readonly string[];
  readonly assertions: readonly string[];
  readonly exposure: AskFigure | null;
  readonly managementConclusion: string;
  readonly nextAction: string;
  readonly citations: readonly AskCitation[];
  /** Provider prose, when a provider ran AND its output passed guardrails. */
  readonly narration: string | null;
}

export interface AskRefusalView {
  readonly question: string;
  readonly reason: string;
  readonly title: string;
  readonly message: string;
  readonly stillVisible: readonly string[];
}

/** Exactly one of `answer` / `refusal` is set — never both, never neither. */
export interface AskResult {
  readonly answer: AskAnswerView | null;
  readonly refusal: AskRefusalView | null;
  /** Which tools ran, for the Audit Details line under the answer. */
  readonly toolsUsed: readonly string[];
  readonly versions: readonly { readonly k: string; readonly v: string }[];
  /**
   * Whether any model contributed, stated on the answer (stage 09). The
   * demo must work with AI off, and a reader cannot tell a deterministic
   * answer from a narrated one by looking at it.
   */
  readonly aiStatus: {
    readonly providerBound: boolean;
    readonly narrationAvailable: boolean;
    readonly note: string;
  };
}

export interface KpiTile {
  readonly label: string;
  readonly value: string;
  readonly valueSuffix?: string;
  readonly note: string;
  readonly tone?: "ember" | "warn";
  readonly warnNote?: boolean;
  /**
   * Where this figure is worked out in full. A headline number that cannot
   * be opened asks the reader to believe it; every one of these resolves to
   * the screen that derives it.
   */
  readonly href?: string;
  /** What the destination shows, for the link's accessible name. */
  readonly hrefLabel?: string;
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
    readonly bps: number;
    readonly categories: readonly GateCategory[];
    readonly stats: readonly KpiTile[];
    readonly blockerCount: number;
    readonly blockerSummary: string;
    /** Exposure alone, for the gate where the count is already the figure. */
    readonly blockerExposure: string;
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
    /** Reconciling items identified; the potential adjusted figure applies all of them. */
    readonly identifiedCount: number;
    /** Of those, the ones with an entry actually drafted. Never equal by assumption. */
    readonly draftedCount: number;
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
  /**
   * Present on a control-domain section (Cutoff, Ownership — stage 09).
   * A filtered list must say what it filtered on and how much of the queue
   * it is showing, or its counts read as the whole close.
   */
  readonly filter: {
    readonly title: string;
    readonly context: string;
    readonly basis: string;
    readonly shown: number;
    readonly outOf: number;
    readonly emptyNote: string;
  } | null;
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
  /** Stable per-row identity — a serial can hold two rows in one plan. */
  readonly key: string;
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
  /** Set when the viewer's scope, not the data, emptied the record set. */
  readonly recordScopeNotice: string | null;
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

/* ------------------------------------------------------------------ */
/* Stage 07 — bridge, adjustments, valuation, audit package            */
/* ------------------------------------------------------------------ */

/** A figure in the posted / potential state panels. */
export interface StateFigure {
  readonly label: string;
  readonly value: string;
  readonly note: string | null;
  readonly emphasis: boolean;
  readonly ember: boolean;
}

/**
 * One row of the reconciling bridge. `posted` is a literal string on every
 * row because the distinction between proposed and posted is a build
 * requirement, not a styling choice (§6).
 */
export interface BridgeRow {
  readonly key: string;
  readonly kind: "opening" | "item" | "net" | "total";
  readonly id: string | null;
  readonly label: string;
  readonly detail: string;
  readonly amount: string;
  readonly ember: boolean;
  readonly status: StatusView | null;
  readonly posted: string;
  readonly exceptionId: string | null;
  readonly href: string | null;
}

export interface FinancialBridgeData {
  readonly posted: {
    readonly tag: string;
    readonly figures: readonly StateFigure[];
    readonly footnote: string;
  };
  readonly potential: {
    readonly tag: string;
    readonly figures: readonly StateFigure[];
    readonly footnote: string;
  };
  /** Stated outright, so "posted" is never inferred from what is nearby. */
  readonly postedAdjustments: {
    readonly label: string;
    readonly value: string;
    readonly note: string;
  };
  readonly bridge: {
    readonly summary: string;
    readonly rows: readonly BridgeRow[];
  };
  readonly direction: string;
  readonly reserves: string;
  readonly unexplained: string | null;
  readonly audit: readonly { readonly k: string; readonly v: string }[];
}

/** One line of a proposed journal entry. Debit/credit is stated in words. */
export interface AdjustmentLineRow {
  readonly account: string;
  readonly memo: string;
  readonly amount: string;
  readonly side: "DEBIT" | "CREDIT";
}

export interface AdjustmentCard {
  readonly key: string;
  readonly exceptionId: string;
  readonly title: string;
  readonly detail: string;
  readonly amount: string;
  readonly ember: boolean;
  readonly status: StatusView | null;
  /** Null when no entry has been drafted for this reconciling item. */
  readonly entry: {
    readonly id: string;
    readonly description: string;
    readonly lines: readonly AdjustmentLineRow[];
    readonly balance: string;
    readonly balanced: boolean;
    readonly preparer: string;
    readonly reviewer: string;
    readonly approval: string;
    readonly approvalRequirement: string;
  } | null;
  readonly undraftedReason: string | null;
  readonly posted: string;
  readonly drawerId: string | null;
  readonly href: string;
}

export interface AdjustmentsData {
  readonly restricted: boolean;
  readonly roleLabel: string;
  readonly stats: readonly KpiTile[];
  readonly cards: readonly AdjustmentCard[];
  readonly postingNote: string;
  readonly bridgeNote: string;
  readonly drawers: Readonly<Record<string, ExceptionDrawerData>>;
}

export interface ValuationData {
  readonly restricted: boolean;
  readonly roleLabel: string;
  readonly reserve: {
    readonly conclusion: string;
    readonly note: string;
    readonly recordedLabel: string;
    readonly recorded: string;
    readonly recordedNote: string;
    readonly reviews: readonly {
      readonly id: string;
      readonly title: string;
      readonly exposure: string;
      readonly status: StatusView;
      readonly detail: string;
      readonly drawerId: string | null;
    }[];
  } | null;
  readonly aging: {
    readonly rows: readonly {
      readonly key: string;
      readonly label: string;
      readonly units: string;
      readonly carrying: string;
      readonly fillPct: number;
      readonly aged: boolean;
    }[];
    readonly unknown: { readonly units: string; readonly carrying: string } | null;
    readonly note: string;
  } | null;
  readonly populations: readonly {
    readonly key: string;
    readonly label: string;
    readonly basis: string;
    readonly units: string;
    readonly carrying: string;
  }[];
  readonly damaged: {
    readonly rows: readonly {
      readonly serial: string;
      readonly sku: string;
      readonly carrying: string;
      readonly rma: string;
      readonly reason: string;
      readonly exceptionId: string | null;
      /** The unit's own assessment state — never assumed for the panel. */
      readonly assessment: StatusView | null;
      readonly assessmentNote: string;
      readonly drawerId: string | null;
    }[];
    readonly note: string;
    readonly empty: string | null;
  };
  readonly drawers: Readonly<Record<string, ExceptionDrawerData>>;
}

export interface PbcVersionRow {
  readonly key: string;
  readonly label: string;
  readonly date: string;
  readonly note: string;
  readonly by: string;
  readonly state: string;
  readonly glyph: string;
  readonly lock: string;
  readonly sealed: boolean;
  readonly editable: boolean;
  readonly hash: string | null;
}

export interface PbcRow {
  readonly id: string;
  readonly title: string;
  readonly status: StatusView;
  readonly owner: string;
  readonly versions: string;
  readonly blockedBy: readonly string[];
  readonly refreshRequired: boolean;
  readonly selected: boolean;
}

export interface AuditPackageData {
  readonly restricted: boolean;
  readonly roleLabel: string;
  readonly readiness: {
    readonly pct: string;
    readonly summary: string;
    readonly note: string;
    readonly states: readonly {
      readonly label: string;
      readonly glyph: string;
      readonly count: number;
    }[];
  } | null;
  readonly attention: {
    readonly rows: readonly {
      readonly id: string;
      readonly title: string;
      readonly status: StatusView;
      readonly owner: string;
      readonly blocker: string;
      readonly selected: boolean;
    }[];
    readonly note: string;
  } | null;
  readonly rows: readonly PbcRow[];
  readonly detail: {
    readonly id: string;
    readonly title: string;
    readonly status: StatusView;
    readonly owner: string;
    readonly tabs: readonly TabDef[];
    readonly summary: readonly { readonly k: string; readonly v: string }[];
    readonly workpaper: {
      readonly lineage: readonly {
        readonly layer: string;
        readonly id: string;
        readonly note: string;
        readonly ember: boolean;
      }[];
      readonly note: string;
      readonly terminates: string | null;
      /** Set when the viewer's scope, not the data, truncated the path. */
      readonly scopeNotice: string | null;
    };
    readonly evidence: {
      readonly rows: readonly {
        readonly id: string;
        readonly source: string;
        readonly kind: string;
        readonly state: string;
        readonly glyph: string;
        readonly missing: boolean;
        readonly recordId: string | null;
      }[];
      readonly scopeNotice: string | null;
      readonly note: string;
    };
    readonly versions: {
      readonly rows: readonly PbcVersionRow[];
      /** Set when unsealed drafts were withheld from the viewer. */
      readonly scopeNotice: string | null;
    };
    readonly related: readonly {
      readonly id: string;
      readonly title: string;
      readonly status: StatusView;
      readonly exposure: string;
      readonly open: boolean;
      readonly drawerId: string | null;
    }[];
    readonly audit: readonly { readonly k: string; readonly v: string }[];
  } | null;
  readonly ladder: readonly {
    readonly label: string;
    readonly glyph: string;
    readonly meaning: string;
  }[];
  readonly acceptanceNote: string;
  readonly auditorNote: string | null;
  readonly drawers: Readonly<Record<string, ExceptionDrawerData>>;
  readonly records: Readonly<Record<string, EvidenceRecordView>>;
}

export interface ReconciliationData {
  readonly restricted: boolean;
  readonly roleLabel: string;
  readonly headerNote: string | null;
  readonly tabs: readonly TabDef[];
  readonly financial: FinancialBridgeData | null;
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

export interface EvidenceCenterData {
  readonly roleLabel: string;
  readonly restricted: boolean;
  readonly rows: readonly {
    readonly id: string;
    readonly title: string;
    readonly kind: string;
    readonly src: string;
    readonly sourceSystem: string | null;
    readonly internalId: string | null;
    readonly retrieved: string;
    readonly sensitivity: string;
    readonly withheld: boolean;
    readonly hash: string;
    readonly relations: readonly {
      readonly exceptionId: string;
      readonly linkType: string;
      readonly label: string;
      readonly conflict: boolean;
    }[];
  }[];
  readonly counts: { readonly total: number; readonly withheld: number; readonly missing: number };
  /** Required records that do not exist. Never mixed in with records that do. */
  readonly links: readonly {
    readonly exceptionId: string;
    readonly description: string;
    readonly ruleId: string;
  }[];
  readonly sources: readonly {
    readonly key: string;
    readonly name: string;
    readonly status: string;
    readonly glyph: string;
    readonly tone: string;
    readonly note: string | null;
    readonly lastSync: string;
  }[];
  readonly sourceHealth: { readonly score: string; readonly degraded: number } | null;
  readonly scopeNotice: string | null;
  readonly records: Readonly<Record<string, EvidenceRecordView>>;
  readonly selectedId: string | null;
}

/**
 * One evidence lens on an exception.
 *
 * The lenses are DOMAIN-AWARE: a cutoff exception separates what NetSuite
 * says from what physical evidence says from what accounting evidence says
 * (CANONICAL_SPEC §2, the canonical EXC-001 pattern), while a count
 * exception separates book from count from movement, and a manual-entry
 * exception has no physical dimension at all. A lens with nothing behind it
 * is OMITTED — an empty lens filled with "nothing in scope" reads as a
 * finding about the evidence when it is only a finding about the template.
 */
export interface LensView {
  /** Stable key for tests and keys; never shown. */
  readonly key: string;
  /** Column heading, e.g. "NETSUITE SAYS" or "PHYSICAL COUNT". */
  readonly label: string;
  readonly headline: string;
  readonly sub: string | null;
  readonly facts: readonly { readonly label: string; readonly value: string }[];
  readonly chips: readonly {
    readonly src: string;
    readonly kind: string | null;
    readonly id: string;
    readonly evidenceId: string | null;
    readonly netsuite: boolean;
  }[];
  readonly note: string | null;
  /** Ember treatment: this lens carries the gap or the contradiction. */
  readonly conflict: boolean;
  readonly missingChip: { readonly label: string; readonly src: string; readonly evidenceId: string | null } | null;
  readonly staleNote: string | null;
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
  readonly lenses?: {
    readonly panels: readonly LensView[];
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
    /** Canonical rule vocabulary (CANONICAL_SPEC §10). Shown under Audit Details. */
    readonly result: string;
    readonly coverage: string;
    /**
     * Three facts the one word "coverage" used to collapse. A control can be
     * fully evaluated (every in-scope input was read) while the accounting
     * evidence behind it is still incomplete, and management may not have
     * concluded either way. Display mapping only — the canonical enums above
     * are untouched, because they are hashed into the run's output.
     */
    readonly state: {
      readonly controlEvaluation: { readonly label: string; readonly note: string };
      readonly accountingEvidence: { readonly label: string; readonly note: string };
      readonly managementConclusion: { readonly label: string; readonly note: string };
    };
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

/* ------------------------------------------------------------------ */
/* Stage 09 — demo reset, replay, and the package manifest             */
/* ------------------------------------------------------------------ */

/** One controlled-state slice and the workpapers a change to it invalidates. */
export interface DependencySliceRow {
  readonly slice: string;
  readonly kind: string;
  readonly hash: string;
  readonly workpapers: string;
}

/**
 * The export package's manifest (docs/10): versions, hashes, control
 * totals, dependency map and the synthetic disclosure. Every figure is
 * formatted from a service result — nothing on this panel is authored.
 */
export interface PackageManifestData {
  readonly manifest: readonly { readonly k: string; readonly v: string }[];
  readonly controls: readonly { readonly k: string; readonly v: string }[];
  readonly dependencies: readonly DependencySliceRow[];
  readonly comparedSections: readonly string[];
  readonly excluded: readonly string[];
  readonly disclosure: string;
  readonly dependencyNote: string;
}

/** Outcome of a Reproduce Close run, rendered under the manifest. */
export interface ReplayResultView {
  readonly outcome: "MATCH" | "MISMATCH" | "DENIED";
  readonly headline: string;
  readonly rows: readonly { readonly k: string; readonly v: string }[];
  readonly mismatchPaths: readonly string[];
}

/** Outcome of a Reset Demo run, rendered in the shell header. */
export interface ResetResultView {
  readonly ok: boolean;
  readonly headline: string;
  readonly detail: string;
}
