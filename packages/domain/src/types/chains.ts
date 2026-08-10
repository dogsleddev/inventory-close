import type {
  ChainComponentImportance,
  ChainComponentState,
} from "../enums.js";

/**
 * Transaction-chain completeness (CANONICAL_SPEC §2): required and
 * corroborating components with explicit present/missing states. This is
 * component coverage — never an accounting-confidence score. A chain can be
 * 9/10 present and still blocked when the missing component is critical.
 */
export interface ChainComponent {
  readonly name: string;
  readonly importance: ChainComponentImportance;
  readonly state: ChainComponentState;
  /** Source reference (transaction number, document ref) when present. */
  readonly reference?: string;
  readonly note?: string;
}

export interface TransactionChain {
  /** What the chain reconstructs, e.g. "SO-26184" or a serial. */
  readonly subjectRef: string;
  readonly components: readonly ChainComponent[];
  readonly presentCount: number;
  readonly totalCount: number;
  readonly requiredMissingCount: number;
}

export function buildChainCounts(
  components: readonly ChainComponent[],
): Pick<TransactionChain, "presentCount" | "totalCount" | "requiredMissingCount"> {
  const applicable = components.filter((c) => c.state !== "NOT_APPLICABLE");
  return {
    presentCount: applicable.filter((c) => c.state === "PRESENT").length,
    totalCount: applicable.length,
    requiredMissingCount: applicable.filter(
      (c) => c.state === "MISSING" && c.importance === "REQUIRED",
    ).length,
  };
}
