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
  /**
   * Records that exist and this reader may not read. A separate channel from
   * `missingEvidence` because the drawer renders the two differently, and the
   * live region counts only the first.
   */
  readonly scopeNotes: readonly string[];
  readonly assertions: readonly string[];
  readonly exposure: AskFigure | null;
  readonly managementConclusion: string;
  readonly nextAction: string;
  readonly citations: readonly AskCitation[];
  /**
   * Suggested wording, when the question asked for a draft. Empty otherwise.
   * Carries no figure and no record identifier by construction — the memo
   * screen supplies every number the wording refers to.
   */
  readonly draft: readonly { readonly heading: string; readonly body: string }[];
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
  /**
   * Set when the reader's scope, not the close, emptied the records above.
   *
   * `sourceRecords` was simply shorter for a scoped reader and the SOURCE
   * RECORDS block was omitted entirely when it hit zero, while `layers.physical`
   * fell back to "No operational events in evidence for this item" — an
   * absence claim about a close that holds five of them. Every other surface
   * in this app already distinguishes the two; the drawer had no channel to
   * do it in.
   */
  readonly scopeNotice: string | null;
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
    /** Whether sign-off is reachable now, and why not when it is not. */
    readonly signOff: {
      readonly available: boolean;
      readonly permitted: boolean;
      readonly reason: string;
      readonly locked: boolean;
    };
    /** Set when this session's work has moved the figures off the baseline. */
    readonly divergence: string | null;
  };
  readonly preventing?: {
    readonly rows: readonly BlockerRow[];
    readonly shownTotal: string;
    readonly allTotal: string;
    /** Live: what the rows are, and what the caption above them counts. */
    readonly blockerCount: number;
    /**
     * Baseline: what the Exceptions register still lists. The panel's link
     * leads there, so it has to promise what that page will show — a link
     * reading "View all 0 blockers" onto a page of seven is the same defect
     * this panel just had, moved one click along.
     */
    readonly registerCount: number;
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
    /**
     * The `?filter=` value that produced this view.
     *
     * Carried rather than inferred: the screen's filter control needs to know
     * which option is active, and matching the heading TEXT to decide would
     * be a proxy for the fact — the failure mode this codebase keeps finding.
     */
    readonly key: string;
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
/* Stage C — the Procurement section                                   */
/* ------------------------------------------------------------------ */

/** A figure in a population's summary strip. */
export interface ProcurementStat {
  readonly label: string;
  readonly value: string;
  readonly note: string | null;
  readonly ember: boolean;
}

export interface GrniRowView {
  readonly po: string;
  readonly vendor: string;
  readonly receipt: string;
  readonly receiptDate: string;
  readonly quantity: string;
  readonly value: string | null;
  /** The bill, when one has since arrived — always after the balance sheet. */
  readonly billed: string | null;
  readonly age: string;
}

export interface InvoicedNotReceivedRowView {
  readonly po: string;
  readonly vendor: string;
  readonly bill: string;
  readonly billDate: string;
  readonly quantity: string;
  readonly value: string | null;
  readonly received: string;
  readonly close: { readonly label: string; readonly glyph: string; readonly variant: "frost" | "aurora" };
  readonly exceptionId: string | null;
}

export interface PriceVarianceRowView {
  readonly key: string;
  readonly po: string;
  readonly vendor: string;
  readonly bill: string;
  readonly sku: string;
  readonly quantity: string;
  readonly ordered: string;
  readonly billed: string;
  readonly variance: string;
  readonly direction: string;
  readonly unfavorable: boolean;
}

export interface ProcurementOrderRowView {
  readonly po: string;
  readonly vendor: string;
  readonly ir: string;
  readonly vb: string;
  readonly native: string;
  readonly close: { readonly label: string; readonly glyph: string; readonly variant: "frost" | "aurora" };
  readonly position: string;
  readonly exceptionId: string | null;
}

export interface ProcurementData {
  readonly restricted: boolean;
  readonly roleLabel: string;
  readonly headerNote: string | null;
  readonly asOf: string;
  readonly tabs: readonly TabDef[];
  readonly match: {
    readonly nativeSummary: string;
    readonly closeSummary: string;
    readonly divergentNote: string;
    readonly featured: readonly ProcurementCard[];
    readonly rows: readonly ProcurementOrderRowView[];
  } | null;
  readonly grni: {
    readonly stats: readonly ProcurementStat[];
    readonly rows: readonly GrniRowView[];
    readonly note: string;
  } | null;
  readonly inr: {
    readonly stats: readonly ProcurementStat[];
    readonly rows: readonly InvoicedNotReceivedRowView[];
    readonly note: string;
  } | null;
  readonly git: {
    readonly stats: readonly ProcurementStat[];
    /** The document side and the book side, stated as one reconciliation. */
    readonly agreement: {
      /**
       * Null when the viewer's scope withheld an order: the document side is
       * scoped and the book side is not, so the two were never comparable.
       */
      readonly agrees: boolean | null;
      readonly headline: string;
      readonly detail: string;
    };
    readonly accountNote: string;
  } | null;
  readonly ppv: {
    readonly stats: readonly ProcurementStat[];
    readonly rows: readonly PriceVarianceRowView[];
    readonly treatment: string;
    readonly note: string;
  } | null;
  /**
   * The scope disclosure FOR EACH TAB, keyed by tab id — never one sentence
   * for the screen.
   *
   * It was one string, emitted once from the close-wide withheld counts and
   * rendered as the first child of the tabpanel, which is to say above all
   * five tables. It claimed "1 order … has no row in the table above" on
   * every one of them; that is true of Three-Way Match and Invoiced Not
   * Received, whose populations really are shorter for an auditor, and false
   * on Received Not Invoiced, Goods in Transit and Price Variance, whose
   * tables are identical to a Controller's. A table that is complete,
   * announced to the reader as shortened by their own access, is a scope
   * restriction rendered as a finding.
   *
   * Keyed rather than branched at the call site so the note and the table it
   * describes cannot come apart again: there is no way to write a sentence
   * here without saying which tab it belongs to.
   */
  readonly withheldNote: Readonly<Record<string, string | null>>;
  readonly drawers: Readonly<Record<string, ExceptionDrawerData>>;
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
  /** Null when the chart of accounts does not describe this code. */
  readonly accountDescription: string | null;
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
    /** Who the source event names as drafting it; null when unrecorded. */
    readonly preparedByName: string | null;
    readonly proposedAt: string | null;
    /** The period the entry adjusts — the close's, not the draft date's. */
    readonly period: string;
    readonly reviewer: string;
    readonly approval: string;
    readonly approvalRequirement: string;
    readonly evidence: readonly { id: string; title: string; src: string }[];
    readonly postingStatus: string;
  } | null;
  readonly undraftedReason: string | null;
  /** Present only where no entry is drafted: the offset is the open question. */
  readonly offsetRequirement: string | null;
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
  /** Stage E — the method behind the conclusion, never a second conclusion. */
  readonly methodology: EoMethodologyView | null;
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

/**
 * The working state of one exception: what a person has concluded, asked
 * for, or submitted — beside the rule result, never over it.
 */
export interface ExceptionWorkflowView {
  readonly exceptionId: string;
  readonly owner: string;
  readonly unmetRequirements: readonly string[];
  /** False while a required record is missing: "resolved" is not on offer. */
  readonly canResolve: boolean;
  readonly canConclude: boolean;
  readonly canRequest: boolean;
  readonly canSubmit: boolean;
  readonly conclusion: {
    readonly conclusion: string;
    readonly rationale: string;
  } | null;
  readonly conclusionLabel: string;
  readonly conclusionBy: string;
  readonly conclusionAt: string;
  readonly requests: readonly { readonly requirement: string; readonly askedOf: string }[];
  readonly submissions: readonly {
    readonly title: string;
    readonly requirement: string;
    readonly reviewState: string;
  }[];
}

/**
 * What a workflow verb did, in words a screen can render. A refusal is a
 * result, not an error: it says what is needed rather than failing silently.
 */
export interface WorkflowActionResult {
  readonly ok: boolean;
  readonly message: string;
  /** Requirements still missing, when that is why the verb refused. */
  readonly unmet: readonly string[];
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
  /** Working state: conclusions, requests and submissions on this item. */
  readonly workflow?: ExceptionWorkflowView | null;
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

/* ------------------------------------------------------------------ */
/* Stage E — Custody, consignment, disposition, E&O methodology        */
/* ------------------------------------------------------------------ */

export interface CustodyRowView {
  readonly custody: string;
  readonly units: string;
  readonly carrying: string;
  readonly locations: string;
  /** Named holders, or the stated absence of one. */
  readonly custodians: string;
  /** The service's own three-way answer, worded. Never re-derived here. */
  readonly heldBy: string;
}

export interface ConsignmentRowView {
  readonly serial: string;
  readonly sku: string;
  readonly owner: string;
  readonly location: string;
  readonly bin: string;
  readonly received: string;
  readonly agreement: string;
  readonly statedValue: string;
}

export interface DispositionRowView {
  readonly id: string;
  readonly serial: string;
  readonly sku: string;
  readonly method: string;
  readonly disposed: string;
  readonly originalCost: string;
  readonly proceeds: string;
  readonly loss: string;
  readonly reason: string;
  readonly authorizedBy: string;
  /** What the source record names, and whether the close holds it. */
  readonly adjustment: string;
  readonly evidence: string;
}

/** One agreed statement rendered from a measured boolean. */
export interface MeasuredClaimView {
  readonly holds: boolean;
  readonly headline: string;
  readonly detail: string;
}

export interface CustodyData {
  readonly restricted: boolean;
  readonly roleLabel: string;
  readonly headerNote: string | null;
  readonly asOf: string;
  readonly tabs: readonly TabDef[];
  readonly custody: {
    readonly stats: readonly ProcurementStat[];
    readonly rows: readonly CustodyRowView[];
    readonly coverage: MeasuredClaimView;
    readonly unpopulatedNote: string;
    readonly note: string;
  } | null;
  readonly consignment: {
    readonly stats: readonly ProcurementStat[];
    readonly rows: readonly ConsignmentRowView[];
    readonly byOwner: readonly { readonly key: string; readonly value: string }[];
    readonly separation: MeasuredClaimView;
    readonly countNote: string;
    readonly note: string;
    readonly withheldNote: string | null;
  } | null;
  readonly disposition: {
    readonly stats: readonly ProcurementStat[];
    readonly rows: readonly DispositionRowView[];
    readonly byMethod: readonly {
      readonly method: string;
      readonly units: string;
      readonly cost: string;
      readonly proceeds: string;
      readonly loss: string;
    }[];
    readonly removal: MeasuredClaimView;
    readonly supportNote: string;
    readonly note: string;
    readonly withheldNote: string | null;
  } | null;
}

export interface EoSignalRowView {
  readonly sku: string;
  readonly description: string;
  readonly onHand: string;
  readonly aged: string;
  readonly forecast: string;
  readonly monthsOfSupply: string;
  readonly excessUnits: string;
  readonly excessCarrying: string;
  readonly ageTest: string;
  readonly forecastTest: string;
  readonly underReview: boolean;
  readonly note: string | null;
}

/** Appended to `ValuationData`; null when the viewer cannot read it. */
export interface EoMethodologyView {
  readonly stats: readonly ProcurementStat[];
  readonly signals: readonly EoSignalRowView[];
  readonly basisNote: string;
  /** Why the excess figure is not a reserve, stated where the figure is. */
  readonly excessNote: string;
  readonly agingBasis: readonly { readonly k: string; readonly v: string }[];
  readonly agingNote: string;
  readonly condition: readonly { readonly k: string; readonly v: string }[];
  readonly conditionNote: string;
  readonly recovery: readonly { readonly k: string; readonly v: string }[];
  readonly recoveryNote: string;
}

/* ------------------------------------------------------------------ */
/* Stage F — Methodology, the accounting matrix, and the close memo     */
/* ------------------------------------------------------------------ */

/** One term in a readiness category's arithmetic. */
export interface ReadinessTermView {
  readonly rule: string;
  readonly observed: string;
  /** "−10 points", or the stated absence of a deduction. */
  readonly penalty: string;
  readonly fired: boolean;
  readonly drivingExceptionIds: readonly string[];
}

export interface ReadinessCategoryView {
  readonly key: string;
  readonly label: string;
  readonly weight: string;
  readonly score: string;
  readonly basis: string;
  readonly terms: readonly ReadinessTermView[];
  /** weight × score, shown so the sum below can be followed by hand. */
  readonly contribution: string;
}

export interface MatrixRowView {
  readonly classification: string;
  readonly glAccount: string;
  readonly ownership: string;
  readonly cogs: string;
  readonly cogsBasis: string;
  readonly record: string;
  readonly expectedCustody: string;
  readonly observedCustody: string;
  /** Stated only where observation and expectation differ. */
  readonly custodyDifference: string | null;
  readonly units: string;
  readonly carrying: string;
}

export interface InterpretationRowView {
  readonly id: string;
  readonly dimension: string;
  readonly subject: string;
  readonly answer: string;
  readonly basis: string;
  readonly heldIn: string;
}

export interface MethodologyData {
  readonly restricted: boolean;
  readonly roleLabel: string;
  readonly headerNote: string | null;
  readonly policyVersion: string;
  readonly datasetVersion: string;
  readonly runId: string;
  readonly tabs: readonly TabDef[];
  readonly readiness: {
    readonly stats: readonly ProcurementStat[];
    readonly categories: readonly ReadinessCategoryView[];
    readonly weightedSum: string;
    readonly roundingRule: string;
    readonly total: string;
    /** Stated only when a conclusion has moved the live figure. */
    readonly divergenceNote: string | null;
    readonly weightsSumTo100: MeasuredClaimView;
    readonly note: string;
  } | null;
  readonly reconciliation: {
    readonly stats: readonly ProcurementStat[];
    readonly steps: readonly { readonly k: string; readonly v: string }[];
    readonly items: readonly {
      readonly id: string;
      readonly description: string;
      readonly amount: string;
      readonly exceptionId: string;
    }[];
    readonly explained: MeasuredClaimView;
    readonly signConvention: string;
    readonly note: string;
  } | null;
  readonly matrix: {
    readonly dimensions: readonly {
      readonly label: string;
      readonly question: string;
      readonly provenance: string;
      readonly basis: string;
    }[];
    readonly rows: readonly MatrixRowView[];
    readonly custodyExpectation: MeasuredClaimView;
    readonly note: string;
  } | null;
  readonly interpretations: {
    readonly rows: readonly InterpretationRowView[];
    readonly policyValues: readonly {
      readonly key: string;
      readonly value: string;
      readonly governs: string;
    }[];
    readonly replayExclusions: readonly string[];
    readonly note: string;
  } | null;
}

export interface MemoVersionRowView {
  readonly key: string;
  readonly label: string;
  readonly state: string;
  readonly glyph: string;
  readonly lock: string;
  readonly title: string;
  readonly date: string;
  readonly by: string;
  readonly hash: string | null;
  readonly sealed: boolean;
  readonly editable: boolean;
}

export interface CloseMemoData {
  readonly restricted: boolean;
  readonly roleLabel: string;
  readonly headerNote: string | null;
  readonly asOf: string;
  readonly tabs: readonly TabDef[];
  /** The figures the memo speaks about, read from the close, never typed. */
  readonly position: readonly { readonly k: string; readonly v: string }[];
  readonly positionStats: readonly ProcurementStat[];
  readonly draft: {
    readonly title: string;
    readonly body: string;
    readonly by: string;
    readonly at: string;
  } | null;
  /** A body assembled from the close, offered as a starting point. */
  readonly suggestedBody: string;
  readonly versions: readonly MemoVersionRowView[];
  readonly issuedBody: string | null;
  /** Null until something has been issued — there is nothing to compare to. */
  readonly positionMoved: MeasuredClaimView | null;
  readonly withheldNote: string | null;
  readonly canDraft: boolean;
  readonly canIssue: boolean;
  /** Why nobody may write the memo now, or null. Separate from the role flags. */
  readonly periodBlocks: string | null;
  /** Why the memo is not part of the close it describes. */
  readonly notPartOfClose: string;
  readonly note: string;
}

/* ------------------------------------------------------------------ */
/* Stage D — Costing                                                   */
/* ------------------------------------------------------------------ */

export interface CostStandardRowView {
  readonly sku: string;
  readonly description: string;
  readonly standard: string;
  /**
   * One cell per column in `componentColumns`. A SKU whose stack has no such
   * component renders the stated absence, never an empty cell — a blank under
   * a component heading asserts a cost of zero.
   */
  readonly cells: readonly string[];
  /** Stated only when the stack does NOT tie to the standard. */
  readonly disagreement: string | null;
  readonly onHandUnits: string;
  readonly carried: string;
}

export interface CostComponentTotalView {
  readonly component: string;
  readonly amount: string;
  readonly share: string;
  readonly behavior: string;
  readonly basis: string;
}

export interface PeriodCostRowView {
  readonly id: string;
  readonly category: string;
  readonly department: string;
  readonly amount: string;
  readonly treatment: string;
  readonly basis: string;
  readonly glAccount: string;
}

export interface CogsRowView {
  readonly salesOrder: string;
  readonly state: string;
  readonly glyph: string;
  readonly variant: "frost" | "aurora" | "quiet";
  /**
   * What this row's units are doing, framed for its own state. A NOT_SHIPPED
   * row never shows the rule's serial list — units on the book are the
   * expected condition when nothing has been fulfilled.
   */
  readonly detail: string;
  readonly exceptionId: string | null;
  /** What was sold on this order, per SKU. Empty when withheld OR absent. */
  readonly lines: readonly CogsLineView[];
  /**
   * Why `lines` is empty, when it is. Rendered as a scope notice, never as
   * "no lines" — an unreadable order and an order with nothing on it are
   * different facts and this product does not let one stand for the other.
   */
  readonly linesNote: string | null;
  /** The order total, already formatted. Null when it cannot be stated. */
  readonly orderTotal: string | null;
}

export interface CogsLineView {
  readonly sku: string;
  readonly quantity: string;
  /** Formatted, or null when the line carries no amount. */
  readonly amount: string | null;
}

export interface CostingData {
  readonly restricted: boolean;
  readonly roleLabel: string;
  readonly headerNote: string | null;
  readonly asOf: string;
  readonly tabs: readonly TabDef[];
  readonly stack: {
    readonly stats: readonly ProcurementStat[];
    /** Component column headings, from the service's own union of stacks. */
    readonly componentColumns: readonly string[];
    readonly rows: readonly CostStandardRowView[];
    /** When the standards took effect — plural if they did not all agree. */
    readonly effectiveNote: string;
    /** The decomposition claim, made only because the service measured it. */
    readonly agreement: {
      readonly agrees: boolean;
      readonly headline: string;
      readonly detail: string;
    };
    readonly note: string;
  } | null;
  readonly classification: {
    readonly stats: readonly ProcurementStat[];
    readonly components: readonly CostComponentTotalView[];
    readonly note: string;
  } | null;
  readonly period: {
    readonly stats: readonly ProcurementStat[];
    readonly rows: readonly PeriodCostRowView[];
    readonly byCategory: readonly { readonly category: string; readonly amount: string }[];
    /** Whether the pools stay out of the GL the bridge sums — measured. */
    readonly containment: {
      readonly held: boolean;
      readonly headline: string;
      readonly detail: string;
    };
    readonly note: string;
  } | null;
  readonly cogs: {
    readonly stats: readonly ProcurementStat[];
    readonly rows: readonly CogsRowView[];
    readonly basisNote: string;
    readonly note: string;
  } | null;
  readonly drawers: Readonly<Record<string, ExceptionDrawerData>>;
}
