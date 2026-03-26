// ──────────────────────────────────────────────────────────────────
// Pure domain: stability factor calculation
// Combines diversification, patience, and penalties
// No I/O, no NestJS, no DB
// ──────────────────────────────────────────────────────────────────

export interface StabilityInput {
  /** Number of distinct assets held. */
  positionCount: number;
  /** Number of distinct sectors held. */
  sectorCount: number;
  /** Total number of available sectors. */
  totalSectors: number;
  /** Average holding duration in ticks (across all positions). */
  avgHoldingDuration: number;
  /** Average turnover score from recent behavior windows. */
  avgTurnover: number;
  /** Average volatility chasing score from recent behavior windows. */
  avgVolatilityChasing: number;
  /** HHI of portfolio (0–1, lower = more diversified). */
  concentrationHHI: number;
}

export interface StabilityResult {
  diversificationScore: number;
  volatilityScore: number;
  concentrationPenalty: number;
  holdingDurationScore: number;
  stabilityFactor: number;
}

/**
 * Diversification bonus: more sectors covered → higher score.
 * Range: 0 to 0.3
 */
function computeDiversificationScore(sectorCount: number, totalSectors: number): number {
  if (totalSectors <= 0) return 0;
  const coverage = sectorCount / totalSectors;
  return Math.min(0.3, coverage * 0.3);
}

/**
 * Volatility score: lower chasing + lower turnover → higher bonus.
 * Range: -0.2 to 0.2
 */
function computeVolatilityScore(avgTurnover: number, avgVolatilityChasing: number): number {
  // Low turnover bonus (turnover < 1 is calm)
  const turnoverBonus = Math.max(0, 0.1 * (1 - Math.min(avgTurnover, 2) / 2));
  // Low chasing bonus
  const chasingBonus = Math.max(0, 0.1 * (1 - avgVolatilityChasing));
  return turnoverBonus + chasingBonus;
}

/**
 * Concentration penalty: high HHI means concentrated → penalty.
 * Range: 0 to -0.3
 */
function computeConcentrationPenalty(hhi: number): number {
  // HHI above 0.5 starts penalizing
  if (hhi <= 0.25) return 0;
  return -Math.min(0.3, (hhi - 0.25) * 0.4);
}

/**
 * Holding duration bonus: longer average hold → more patient.
 * Range: 0 to 0.2
 */
function computeHoldingDurationScore(avgDuration: number): number {
  // 30+ ticks (1 month) = full bonus
  return Math.min(0.2, avgDuration / 150);
}

/**
 * Compute the stability factor.
 * stabilityFactor = 1 + diversification + volatility + holdingDuration + concentrationPenalty
 * Clamped to [0.5, 2.0].
 */
export function computeStabilityFactor(input: StabilityInput): StabilityResult {
  const diversificationScore = computeDiversificationScore(input.sectorCount, input.totalSectors);
  const volatilityScore = computeVolatilityScore(input.avgTurnover, input.avgVolatilityChasing);
  const concentrationPenalty = computeConcentrationPenalty(input.concentrationHHI);
  const holdingDurationScore = computeHoldingDurationScore(input.avgHoldingDuration);

  const raw = 1 + diversificationScore + volatilityScore + concentrationPenalty + holdingDurationScore;
  const stabilityFactor = Math.max(0.5, Math.min(2.0, raw));

  return {
    diversificationScore,
    volatilityScore,
    concentrationPenalty,
    holdingDurationScore,
    stabilityFactor,
  };
}
