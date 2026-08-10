import type { IsoDateTime } from "../dates.js";
import type { SourceHealthStatus, SourceSystemId } from "../enums.js";
import { SOURCE_HEALTH_SCORE_HUNDREDTHS } from "../enums.js";
import { basisPoints, type BasisPoints } from "../money.js";

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
): BasisPoints {
  if (healths.length === 0) {
    // Fail-down: no health data reads as 0, never as healthy.
    return basisPoints(0);
  }
  const numerator = healths.reduce(
    (sum, h) => sum + SOURCE_HEALTH_SCORE_HUNDREDTHS[h.status],
    0,
  );
  const denominator = healths.length * 100;
  // Math.round (round-half-up). Scores are non-negative, so this coincides
  // with round-half-away-from-zero: baseline 825/900 → 9166.67 → 9167.
  return basisPoints(Math.round((numerator * 10000) / denominator));
}
