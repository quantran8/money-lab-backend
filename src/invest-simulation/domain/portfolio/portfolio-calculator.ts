// ──────────────────────────────────────────────────────────────────
// Pure domain: portfolio value, exposure, and P&L calculations
// No I/O, no NestJS, no DB
// ──────────────────────────────────────────────────────────────────

export interface PositionInput {
  assetId: bigint;
  quantity: number;
  avgBuyPrice: number;
  /** Sector code of the asset. */
  sectorCode: string;
  /** Asset type (stock, bond, etc.). */
  assetType: string;
}

export interface PriceMap {
  [assetId: string]: number;
}

export interface PortfolioSummary {
  availableCredits: number;
  totalPositionValue: number;
  totalPortfolioValue: number;
  positionCount: number;
}

export interface ExposureEntry {
  key: string;
  value: number;
  pct: number;
}

export interface PnLEntry {
  assetId: string;
  quantity: number;
  avgBuyPrice: number;
  currentPrice: number;
  costBasis: number;
  marketValue: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
}

export interface PnLSummary {
  entries: PnLEntry[];
  totalCostBasis: number;
  totalMarketValue: number;
  totalUnrealizedPnL: number;
}

export function calculatePortfolioSummary(
  availableCredits: number,
  positions: PositionInput[],
  prices: PriceMap,
): PortfolioSummary {
  let totalPositionValue = 0;
  for (const pos of positions) {
    const price = prices[pos.assetId.toString()] ?? 0;
    totalPositionValue += pos.quantity * price;
  }
  return {
    availableCredits,
    totalPositionValue,
    totalPortfolioValue: availableCredits + totalPositionValue,
    positionCount: positions.length,
  };
}

export function calculateExposure(
  positions: PositionInput[],
  prices: PriceMap,
  groupBy: 'sectorCode' | 'assetType',
): ExposureEntry[] {
  const groups: Record<string, number> = {};
  let total = 0;

  for (const pos of positions) {
    const price = prices[pos.assetId.toString()] ?? 0;
    const value = pos.quantity * price;
    const key = pos[groupBy];
    groups[key] = (groups[key] ?? 0) + value;
    total += value;
  }

  return Object.entries(groups).map(([key, value]) => ({
    key,
    value,
    pct: total > 0 ? value / total : 0,
  }));
}

export function calculateUnrealizedPnL(
  positions: PositionInput[],
  prices: PriceMap,
): PnLSummary {
  const entries: PnLEntry[] = [];
  let totalCostBasis = 0;
  let totalMarketValue = 0;

  for (const pos of positions) {
    const currentPrice = prices[pos.assetId.toString()] ?? 0;
    const costBasis = pos.quantity * pos.avgBuyPrice;
    const marketValue = pos.quantity * currentPrice;
    const unrealizedPnL = marketValue - costBasis;
    const unrealizedPnLPct = costBasis > 0 ? unrealizedPnL / costBasis : 0;

    entries.push({
      assetId: pos.assetId.toString(),
      quantity: pos.quantity,
      avgBuyPrice: pos.avgBuyPrice,
      currentPrice,
      costBasis,
      marketValue,
      unrealizedPnL,
      unrealizedPnLPct,
    });

    totalCostBasis += costBasis;
    totalMarketValue += marketValue;
  }

  return {
    entries,
    totalCostBasis,
    totalMarketValue,
    totalUnrealizedPnL: totalMarketValue - totalCostBasis,
  };
}
