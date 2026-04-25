import { Prisma } from '@prisma/client';
import type { SectorPulseEntry } from '../domain/index.js';
import type { BalanceChartPeriod } from '../invest-simulation.constant.js';

/** Portfolio value snapshot row (per user, per tick). */
export type PortfolioValueSnapshotRow = Prisma.PortfolioValueSnapshotGetPayload<
  Record<string, never>
>;

/**
 * Market tick with all price points and each asset's sectorId.
 * Single-query payload that supports current prices + sector grouping
 * for the dashboard endpoint.
 */
export type TickWithPricesAndSectorRow = Prisma.MarketTickGetPayload<{
  include: {
    pricePoints: {
      include: { asset: { select: { id: true; sectorId: true } } };
    };
  };
}>;

// ── Dashboard response shapes ───────────────────────────────────

export interface BalanceChartPoint {
  tickIndex: number;
  value: number;
}

export interface BalanceChartResponse {
  period: BalanceChartPeriod;
  points: BalanceChartPoint[];
}

export interface DashboardArcSnapshot {
  arcTypeId: number;
  arcTypeName: string;
  state: string;
  stateLabel: string;
  progress: number;
  progressLabel: string;
}

export interface DashboardPortfolioSnapshot {
  totalValue: number;
  availableCredits: number;
  totalPositionValue: number;
  pnlToday: number;
  pnlTodayPct: number;
  stabilityFactor: number;
  stabilityLabel: string;
  balanceChart: BalanceChartResponse;
}

export interface DashboardNewsItem {
  id: string;
  title: string;
  tone: string;
  intensity: number;
  narrativeTag: string | null;
  createdAt: string;
}

export interface DashboardPolicyItem {
  id: string;
  templateTitle: string;
  state: string;
  stateLabel: string;
  stateDescription: string | null;
}

export interface DashboardResponse {
  arc: DashboardArcSnapshot | null;
  portfolio: DashboardPortfolioSnapshot;
  sectorPulse: SectorPulseEntry[];
  latestNews: DashboardNewsItem[];
  activePolicies: DashboardPolicyItem[];
}
