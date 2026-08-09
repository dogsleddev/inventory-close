import type { IsoDateTime } from "../dates.js";
import type { SourceHealthStatus, SourceSystemId } from "../enums.js";
import { SOURCE_HEALTH_SCORE_HUNDREDTHS } from "../enums.js";

export interface SourceSystemHealth {
  readonly sourceSystem: SourceSystemId;
  readonly status: SourceHealthStatus;
  readonly lastSyncAt?: IsoDateTime;
  readonly lastSyncId?: string;
  readonly note?: string;
}

/**
 * Aggregate health in integer hundredths of a percent-point numerator:
 * baseline 7×100 + 75 + 50 = 825 over 900 → 91.67% when rendered at two
 * decimals. Returns integer basis points of the ratio (9167).
 */
export function aggregateHealthBasisPoints(
  healths: readonly SourceSystemHealth[],
): number {
  if (healths.length === 0) {
    return 0;
  }
  const numerator = healths.reduce(
    (sum, h) => sum + SOURCE_HEALTH_SCORE_HUNDREDTHS[h.status],
    0,
  );
  const denominator = healths.length * 100;
  // Round to nearest basis point, half away from zero.
  return Math.round((numerator * 10000) / denominator);
}
