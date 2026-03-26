import { Injectable, Logger } from '@nestjs/common';
import { wrapAsync } from '#common/utils/async.utils.js';
import { TransactionRunner } from '#app/prisma/transaction.runner.js';
import { PrismaService } from '#app/prisma/prisma.service.js';
import { InvestBehaviorQuery } from '../queries/behavior.query.js';
import { InvestScoreQuery } from '../queries/score.query.js';
import { InvestPortfolioQuery } from '../queries/portfolio.query.js';
import { InvestMarketQuery } from '../queries/market.query.js';
import { InvestConfigService } from './config.service.js';
import { InvestBehaviorRepository } from '../repositories/behavior.repository.js';
import { InvestScoreRepository } from '../repositories/score.repository.js';
import {
  computeStabilityFactor,
  computeScore,
  calculatePortfolioSummary,
  type PositionInput,
  type PriceMap,
} from '../domain/index.js';

@Injectable()
export class InvestStabilityScoreService {
  private readonly logger = new Logger(InvestStabilityScoreService.name);

  constructor(
    private readonly transactionRunner: TransactionRunner,
    private readonly prisma: PrismaService,
    private readonly behaviorQuery: InvestBehaviorQuery,
    private readonly scoreQuery: InvestScoreQuery,
    private readonly portfolioQuery: InvestPortfolioQuery,
    private readonly marketQuery: InvestMarketQuery,
    private readonly configService: InvestConfigService,
    private readonly behaviorRepo: InvestBehaviorRepository,
    private readonly scoreRepo: InvestScoreRepository,
  ) {}

  async getUserScore(userId: string) {
    return wrapAsync(this.logger, 'getUserScore', async () => {
      const score = await this.scoreQuery.findUserScore(userId);
      return {
        wealthPoints: score ? Number(score.wealthPoints) : 0,
        stabilityFactor: score ? Number(score.stabilityFactor) : 1,
        wealthTier: score?.wealthTier ?? 'beginner',
      };
    });
  }

  async getUserStability(userId: string) {
    return wrapAsync(this.logger, 'getUserStability', async () => {
      const metric = await this.behaviorQuery.findLatestStabilityMetric(userId);
      if (!metric) {
        return {
          diversificationScore: 0,
          volatilityScore: 0,
          concentrationPenalty: 0,
          holdingDurationScore: 0,
          stabilityFactor: 1,
        };
      }
      return {
        diversificationScore: Number(metric.diversificationScore),
        volatilityScore: Number(metric.volatilityScore),
        concentrationPenalty: Number(metric.concentrationPenalty),
        holdingDurationScore: Number(metric.holdingDurationScore),
        stabilityFactor: Number(metric.stabilityFactor),
      };
    });
  }

  /**
   * Recalculate stability and score for a single user.
   * Called from the evaluate-users internal endpoint.
   */
  async recalculateForUser(userId: string, tickIndex: number): Promise<void> {
    await this.transactionRunner.run(async (tx) => {
      // 1. Load behavior snapshots
      const snapshots = await this.behaviorQuery.findSnapshotsByUser(userId, 5);

      // 2. Load portfolio
      const [credit, positions, tick, sectors] = await Promise.all([
        this.portfolioQuery.findUserCredit(userId),
        this.portfolioQuery.findPositionsWithAsset(userId),
        this.marketQuery.findCurrentTick(),
        this.configService.getSectors(),
      ]);

      const balance = credit?.balance ?? 0;

      // Build price map
      let priceMap: PriceMap = {};
      if (tick) {
        const prices = await this.marketQuery.findLatestPrices(tick.id);
        for (const p of prices) {
          priceMap[p.assetId.toString()] = p.price;
        }
      }

      // Position inputs
      const posInputs: PositionInput[] = positions.map((p) => ({
        assetId: p.assetId,
        quantity: p.quantity,
        avgBuyPrice: p.avgBuyPrice,
        sectorCode: p.asset.sector.code,
        assetType: p.asset.assetType,
      }));

      const summary = calculatePortfolioSummary(balance, posInputs, priceMap);

      // Sector and holding duration
      const sectorSet = new Set(posInputs.map((p) => p.sectorCode));
      const avgHoldingDuration = positions.length > 0
        ? positions.reduce((s, p) => {
            const ageMs = Date.now() - p.createdAt.getTime();
            return s + ageMs / (1000 * 60 * 60 * 24); // days
          }, 0) / positions.length
        : 0;

      // Average behavior scores
      const avgTurnover = snapshots.length > 0
        ? snapshots.reduce((s, snap) => s + Number(snap.turnoverScore), 0) / snapshots.length
        : 0;
      const avgVolatilityChasing = snapshots.length > 0
        ? snapshots.reduce((s, snap) => s + Number(snap.volatilityChasingScore), 0) / snapshots.length
        : 0;

      // Concentration HHI
      const totalValue = posInputs.reduce((s, p) => {
        const price = priceMap[p.assetId.toString()] ?? 0;
        return s + p.quantity * price;
      }, 0);
      const hhi = totalValue > 0
        ? posInputs.reduce((s, p) => {
            const price = priceMap[p.assetId.toString()] ?? 0;
            const share = (p.quantity * price) / totalValue;
            return s + share * share;
          }, 0)
        : 0;

      // 3. Compute stability (pure domain)
      const stability = computeStabilityFactor({
        positionCount: positions.length,
        sectorCount: sectorSet.size,
        totalSectors: sectors.length,
        avgHoldingDuration,
        avgTurnover,
        avgVolatilityChasing,
        concentrationHHI: hhi,
      });

      // 4. Compute score (pure domain)
      const score = computeScore({
        totalPortfolioValue: summary.totalPortfolioValue,
        stabilityFactor: stability.stabilityFactor,
      });

      // 5. Persist
      await this.behaviorRepo.createStabilityMetric(
        {
          userId,
          tickIndex,
          diversificationScore: stability.diversificationScore,
          volatilityScore: stability.volatilityScore,
          concentrationPenalty: stability.concentrationPenalty,
          holdingDurationScore: stability.holdingDurationScore,
          stabilityFactor: stability.stabilityFactor,
        },
        tx,
      );

      await this.scoreRepo.upsertScore(
        userId,
        score.wealthPoints,
        stability.stabilityFactor,
        score.wealthTier,
        tx,
      );
    });
  }

  /**
   * Evaluate all users who have credits (i.e., active users).
   */
  async evaluateAllUsers(tickIndex: number): Promise<number> {
    return wrapAsync(this.logger, 'evaluateAllUsers', async () => {
      const users = await this.prisma.investUserCredit.findMany({
        select: { userId: true },
      });

      let count = 0;
      for (const u of users) {
        await this.recalculateForUser(u.userId, tickIndex);
        count++;
      }

      return count;
    });
  }
}
