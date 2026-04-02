// ──────────────────────────────────────────────────────────────────
// Pure domain: behavior metric computation
// Evaluates user behavior during a behavior window
// No I/O, no NestJS, no DB
// ──────────────────────────────────────────────────────────────────

export interface BehaviorInput {
  /** Transactions during the window. */
  transactions: Array<{
    side: string;
    quantity: number;
    pricePerUnit: number;
    totalAmount: number;
    tickId: bigint;
  }>;
  /** Portfolio value at window start. */
  portfolioValueStart: number;
  /** Portfolio value at window end. */
  portfolioValueEnd: number;
  /** Positions at window start: { assetId → { quantity, sectorCode, assetType } }. */
  positionsStart: Record<
    string,
    { quantity: number; sectorCode: string; assetType: string }
  >;
  /** Positions at window end. */
  positionsEnd: Record<
    string,
    { quantity: number; sectorCode: string; assetType: string }
  >;
  /** Tick indices of news items during the window. */
  newsTickIds: bigint[];
  /** Window duration in ticks. */
  windowDurationTicks: number;
}

export interface BehaviorMetrics {
  turnoverScore: number;
  reactionTimeScore: number;
  concentrationChange: number;
  volatilityChasingScore: number;
  exposureBySector: Record<string, number>;
  exposureByAssetType: Record<string, number>;
}

/**
 * Turnover = total trade volume / average portfolio value.
 * Higher = more active trading. Range roughly 0–10+.
 */
export function computeTurnover(input: BehaviorInput): number {
  const totalVolume = input.transactions.reduce(
    (sum, t) => sum + t.totalAmount,
    0,
  );
  const avgPortfolio =
    (input.portfolioValueStart + input.portfolioValueEnd) / 2;
  if (avgPortfolio <= 0) return 0;
  return totalVolume / avgPortfolio;
}

/**
 * Reaction time = average ticks between news event and next user trade.
 * Lower = more reactive (potentially chasing). Range 0–windowDuration.
 */
export function computeReactionTime(input: BehaviorInput): number {
  if (input.newsTickIds.length === 0 || input.transactions.length === 0) {
    return input.windowDurationTicks; // no reaction = max
  }

  const tradeTicks = input.transactions.map((t) => Number(t.tickId));
  let totalDelay = 0;
  let count = 0;

  for (const newsTick of input.newsTickIds) {
    const nt = Number(newsTick);
    // Find nearest trade after this news
    const nextTrade = tradeTicks.find((tt) => tt >= nt);
    if (nextTrade != null) {
      totalDelay += nextTrade - nt;
      count++;
    }
  }

  if (count === 0) return input.windowDurationTicks;
  return totalDelay / count;
}

/**
 * Concentration change = HHI(end) - HHI(start).
 * Positive = more concentrated, negative = more diversified.
 */
export function computeConcentrationChange(input: BehaviorInput): number {
  const hhiStart = computeHHI(input.positionsStart);
  const hhiEnd = computeHHI(input.positionsEnd);
  return hhiEnd - hhiStart;
}

/** Herfindahl-Hirschman Index over position values. */
function computeHHI(positions: Record<string, { quantity: number }>): number {
  const values = Object.values(positions).map((p) => p.quantity);
  const total = values.reduce((s, v) => s + v, 0);
  if (total <= 0) return 0;
  return values.reduce((s, v) => s + (v / total) ** 2, 0);
}

/**
 * Volatility chasing = ratio of trades during high-news ticks vs total trades.
 * Higher = more chasing. Range 0–1.
 */
export function computeVolatilityChasing(input: BehaviorInput): number {
  if (input.transactions.length === 0) return 0;

  const newsTickSet = new Set(input.newsTickIds.map(Number));
  const chaseTrades = input.transactions.filter((t) =>
    newsTickSet.has(Number(t.tickId)),
  );
  return chaseTrades.length / input.transactions.length;
}

/**
 * Compute exposure breakdown at window end.
 */
function computeExposure(
  positions: Record<
    string,
    { quantity: number; sectorCode: string; assetType: string }
  >,
  groupBy: 'sectorCode' | 'assetType',
): Record<string, number> {
  const groups: Record<string, number> = {};
  for (const pos of Object.values(positions)) {
    const key = pos[groupBy];
    groups[key] = (groups[key] ?? 0) + pos.quantity;
  }
  return groups;
}

/** Compute all behavior metrics for a window. */
export function computeBehaviorMetrics(input: BehaviorInput): BehaviorMetrics {
  return {
    turnoverScore: computeTurnover(input),
    reactionTimeScore: computeReactionTime(input),
    concentrationChange: computeConcentrationChange(input),
    volatilityChasingScore: computeVolatilityChasing(input),
    exposureBySector: computeExposure(input.positionsEnd, 'sectorCode'),
    exposureByAssetType: computeExposure(input.positionsEnd, 'assetType'),
  };
}
