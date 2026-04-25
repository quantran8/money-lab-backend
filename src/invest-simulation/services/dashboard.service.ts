import { Injectable, Logger } from '@nestjs/common';
import { wrapAsync } from '#common/utils/async.utils.js';
import { InvestMarketQuery } from '../queries/market.query.js';
import { InvestArcQuery } from '../queries/arc.query.js';
import { InvestPolicyQuery } from '../queries/policy.query.js';
import { InvestSpotlightQuery } from '../queries/spotlight.query.js';
import { InvestPortfolioQuery } from '../queries/portfolio.query.js';
import { InvestNewsQuery } from '../queries/news.query.js';
import { InvestBehaviorQuery } from '../queries/behavior.query.js';
import { AssetQuery } from '../queries/asset.query.js';
import {
  BALANCE_CHART_PERIOD_TICKS,
  DEFAULT_BALANCE_CHART_PERIOD,
  type BalanceChartPeriod,
} from '../invest-simulation.constant.js';
import {
  calculatePortfolioSummary,
  computeSectorPulse,
  mapArcStateLabel,
  mapArcProgressLabel,
  mapPolicyStateLabel,
  mapStabilityLabel,
  extractPolicyStateDescription,
  type PositionInput,
  type PriceMap,
} from '../domain/index.js';
import type {
  BalanceChartPoint,
  BalanceChartResponse,
  DashboardArcSnapshot,
  DashboardNewsItem,
  DashboardPolicyItem,
  DashboardResponse,
} from '../types/index.js';

@Injectable()
export class InvestDashboardService {
  private readonly logger = new Logger(InvestDashboardService.name);

  constructor(
    private readonly marketQuery: InvestMarketQuery,
    private readonly arcQuery: InvestArcQuery,
    private readonly policyQuery: InvestPolicyQuery,
    private readonly spotlightQuery: InvestSpotlightQuery,
    private readonly portfolioQuery: InvestPortfolioQuery,
    private readonly newsQuery: InvestNewsQuery,
    private readonly behaviorQuery: InvestBehaviorQuery,
    private readonly assetQuery: AssetQuery,
  ) {}

  async getDashboard(userId: string): Promise<DashboardResponse> {
    return wrapAsync(this.logger, 'getDashboard', async () => {
      // ── LOAD ──────────────────────────────────────────────────
      // Round 1: tick + prices + per-asset sectorId in a single query
      const tick = await this.marketQuery.findCurrentTickWithPricesAndSectors();

      // Default balance chart window: last 1 day (1 tick) → at least 2 snapshots
      // (today + previous) so P/L today is also derivable from the same query.
      const sinceTick = computeSinceTick(
        tick?.tickIndex ?? 0n,
        DEFAULT_BALANCE_CHART_PERIOD,
      );

      // Round 2: 8 independent queries in parallel
      const [
        activeArcs,
        activePolicies,
        activeSpotlights,
        credit,
        positions,
        snapshots,
        stabilityMetric,
        recentNews,
        sectors,
      ] = await Promise.all([
        this.arcQuery.findActiveInstances(),
        this.policyQuery.findActiveInstances(),
        this.spotlightQuery.findActiveInstances(),
        this.portfolioQuery.findUserCredit(userId),
        this.portfolioQuery.findPositionsWithAsset(userId),
        this.portfolioQuery.findSnapshotsSinceTick(userId, sinceTick),
        this.behaviorQuery.findLatestStabilityMetric(userId),
        this.newsQuery.findRecent(5),
        this.assetQuery.findAllSectors(),
      ]);

      // ── COMPUTE ───────────────────────────────────────────────

      // 1. Build price map and sector→changePct grouping
      const priceMap: PriceMap = {};
      const priceChangeBySector: Record<number, number[]> = {};
      if (tick) {
        for (const point of tick.pricePoints) {
          priceMap[point.assetId.toString()] = point.price;
          const sectorId = point.asset.sectorId;
          const changePct = Number(point.changePct);
          if (!priceChangeBySector[sectorId]) {
            priceChangeBySector[sectorId] = [];
          }
          priceChangeBySector[sectorId].push(changePct);
        }
      }

      // 2. Portfolio summary
      const balance = credit?.balance ?? 0;
      const posInputs: PositionInput[] = positions.map((p) => ({
        assetId: p.assetId,
        quantity: p.quantity,
        avgBuyPrice: p.avgBuyPrice,
        sectorCode: p.asset.sector?.code ?? 'unknown',
        assetType: p.asset.assetType,
      }));
      const summary = calculatePortfolioSummary(balance, posInputs, priceMap);

      // 3. Balance chart + P/L today (snapshots already ascending by tickIndex)
      const points: BalanceChartPoint[] = snapshots.map((s) => ({
        tickIndex: Number(s.tickIndex),
        value: s.totalValue,
      }));
      const balanceChart: BalanceChartResponse = {
        period: DEFAULT_BALANCE_CHART_PERIOD,
        points,
      };

      const latestSnap = snapshots[snapshots.length - 1];
      const prevSnap = snapshots[snapshots.length - 2];
      const pnlToday =
        latestSnap && prevSnap
          ? latestSnap.totalValue - prevSnap.totalValue
          : 0;
      const pnlTodayPct =
        prevSnap && prevSnap.totalValue > 0
          ? pnlToday / prevSnap.totalValue
          : 0;

      // 4. Stability
      const stabilityFactor = stabilityMetric
        ? Number(stabilityMetric.stabilityFactor)
        : 1;
      const stabilityLabel = mapStabilityLabel(stabilityFactor);

      // 5. Arc snapshot — pick the most advanced active arc by progress
      const primaryArc =
        activeArcs.length > 0
          ? [...activeArcs].sort(
              (a, b) => Number(b.progress) - Number(a.progress),
            )[0]
          : null;
      const arcSnapshot: DashboardArcSnapshot | null = primaryArc
        ? {
            arcTypeId: primaryArc.arcTypeId,
            arcTypeName: primaryArc.arcType.name,
            state: primaryArc.state,
            stateLabel: mapArcStateLabel(primaryArc.state),
            progress: Number(primaryArc.progress),
            progressLabel: mapArcProgressLabel(Number(primaryArc.progress)),
          }
        : null;

      // 6. Sector pulse (pure domain)
      const sectorPulse = computeSectorPulse({
        sectors: sectors.map((s) => ({
          id: s.id,
          code: s.code,
          name: s.name,
        })),
        activeArcs: activeArcs.map((a) => ({
          state: a.state,
          sectorImpacts: a.arcType.sectorImpacts.map((si) => ({
            sectorId: si.sectorId,
            weight: Number(si.weight),
          })),
        })),
        activePolicies: activePolicies.map((p) => ({
          state: p.state,
          sectorImpacts: p.template.sectorImpacts.map((si) => ({
            sectorId: si.sectorId,
            weight: Number(si.weight),
          })),
        })),
        activeSpotlights: activeSpotlights.map((s) => ({
          state: s.state,
          sectorId: s.asset.sectorId,
        })),
        priceChangeBySector,
      });

      // 7. Latest news
      const latestNews: DashboardNewsItem[] = recentNews.map((n) => ({
        id: n.id.toString(),
        title: n.title,
        tone: n.tone,
        intensity: Number(n.intensity),
        narrativeTag: n.narrativeTag,
        createdAt: n.createdAt.toISOString(),
      }));

      // 8. Active policies
      const policyItems: DashboardPolicyItem[] = activePolicies.map((p) => ({
        id: p.id.toString(),
        templateTitle: p.template.title,
        state: p.state,
        stateLabel: mapPolicyStateLabel(p.state),
        stateDescription: extractPolicyStateDescription(
          p.template.stateDescriptions,
          p.state,
        ),
      }));

      return {
        arc: arcSnapshot,
        portfolio: {
          totalValue: summary.totalPortfolioValue,
          availableCredits: summary.availableCredits,
          totalPositionValue: summary.totalPositionValue,
          pnlToday,
          pnlTodayPct,
          stabilityFactor,
          stabilityLabel,
          balanceChart,
        },
        sectorPulse,
        latestNews,
        activePolicies: policyItems,
      };
    });
  }

  /**
   * Balance chart for a given period.
   * Periods are anchored to the current tick: e.g. `1w` returns
   * snapshots with tickIndex >= currentTick - 7.
   */
  async getBalanceChart(
    userId: string,
    period: BalanceChartPeriod = DEFAULT_BALANCE_CHART_PERIOD,
  ): Promise<BalanceChartResponse> {
    return wrapAsync(this.logger, 'getBalanceChart', async () => {
      const tick = await this.marketQuery.findCurrentTick();
      const sinceTick = computeSinceTick(tick?.tickIndex ?? 0n, period);
      const snapshots = await this.portfolioQuery.findSnapshotsSinceTick(
        userId,
        sinceTick,
      );
      return {
        period,
        points: snapshots.map((s) => ({
          tickIndex: Number(s.tickIndex),
          value: s.totalValue,
        })),
      };
    });
  }
}

/**
 * Compute the inclusive lower bound tickIndex for a given period.
 * 1 tick = 1 day in sim calendar. Never returns negative.
 */
function computeSinceTick(
  currentTickIndex: bigint,
  period: BalanceChartPeriod,
): bigint {
  const window = BigInt(BALANCE_CHART_PERIOD_TICKS[period]);
  const since = currentTickIndex - window;
  return since < 0n ? 0n : since;
}
