// ──────────────────────────────────────────────────────────────────
// Pure domain: wealth points and tier calculation
// WealthPoints = PortfolioValue × StabilityFactor
// No I/O, no NestJS, no DB
// ──────────────────────────────────────────────────────────────────

export interface ScoreInput {
  /** Total portfolio value (credits + position market value). */
  totalPortfolioValue: number;
  /** Current stability factor (0.5–2.0). */
  stabilityFactor: number;
}

export interface ScoreResult {
  wealthPoints: number;
  wealthTier: string;
}

const TIER_THRESHOLDS: Array<{ min: number; tier: string }> = [
  { min: 500_000, tier: 'elite' },
  { min: 200_000, tier: 'advanced' },
  { min: 100_000, tier: 'steady' },
  { min: 50_000, tier: 'developing' },
  { min: 0, tier: 'beginner' },
];

export function computeScore(input: ScoreInput): ScoreResult {
  const wealthPoints = Math.round(input.totalPortfolioValue * input.stabilityFactor * 100) / 100;

  let wealthTier = 'beginner';
  for (const t of TIER_THRESHOLDS) {
    if (wealthPoints >= t.min) {
      wealthTier = t.tier;
      break;
    }
  }

  return { wealthPoints, wealthTier };
}
