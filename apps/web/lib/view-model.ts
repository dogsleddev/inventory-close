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
