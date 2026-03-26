import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { wrapAsync } from '#common/utils/async.utils.js';
import { TransactionRunner } from '#app/prisma/transaction.runner.js';
import { InvestReportQuery } from '../queries/report.query.js';
import { InvestReportRepository } from '../repositories/report.repository.js';
import { InvestPortfolioQuery } from '../queries/portfolio.query.js';
import { InvestMarketQuery } from '../queries/market.query.js';
import { InvestBehaviorQuery } from '../queries/behavior.query.js';
import { InvestReflectionQuery } from '../queries/reflection.query.js';
import {
  buildReport,
  calculateExposure,
  type PositionInput,
  type PriceMap,
} from '../domain/index.js';

@Injectable()
export class InvestReportService {
  private readonly logger = new Logger(InvestReportService.name);

  constructor(
    private readonly transactionRunner: TransactionRunner,
    private readonly reportQuery: InvestReportQuery,
    private readonly reportRepo: InvestReportRepository,
    private readonly portfolioQuery: InvestPortfolioQuery,
    private readonly marketQuery: InvestMarketQuery,
    private readonly behaviorQuery: InvestBehaviorQuery,
    private readonly reflectionQuery: InvestReflectionQuery,
  ) {}

  async getLatestReport(userId: string) {
    return wrapAsync(this.logger, 'getLatestReport', async () => {
      const report = await this.reportQuery.findLatestReport(userId);
      if (!report) throw new NotFoundException('No reports available');
      return {
        id: report.id.toString(),
        tickIndex: report.tickIndex,
        simDay: report.simDay,
        simMonth: report.simMonth,
        simYear: report.simYear,
        sectorExposure: report.sectorExposure,
        assetTypeExposure: report.assetTypeExposure,
        avgVolatility: Number(report.avgVolatility),
        stabilityScore: Number(report.stabilityScore),
        reflectionSummary: report.reflectionSummary,
        generatedAt: report.generatedAt.toISOString(),
      };
    });
  }

  /**
   * Generate a report for a user at the current tick.
   */
  async generateForUser(userId: string, tickIndex: number, simDay: number, simMonth: number, simYear: number): Promise<void> {
    const [positions, tick, stability, reflections] = await Promise.all([
      this.portfolioQuery.findPositionsWithAsset(userId),
      this.marketQuery.findCurrentTick(),
      this.behaviorQuery.findLatestStabilityMetric(userId),
      this.reflectionQuery.findUserReflections(userId, 3),
    ]);

    // Build price map
    let priceMap: PriceMap = {};
    if (tick) {
      const prices = await this.marketQuery.findLatestPrices(tick.id);
      for (const p of prices) {
        priceMap[p.assetId.toString()] = p.price;
      }
    }

    const posInputs: PositionInput[] = positions.map((p) => ({
      assetId: p.assetId,
      quantity: p.quantity,
      avgBuyPrice: p.avgBuyPrice,
      sectorCode: p.asset.sector.code,
      assetType: p.asset.assetType,
    }));

    const sectorExposureArr = calculateExposure(posInputs, priceMap, 'sectorCode');
    const typeExposureArr = calculateExposure(posInputs, priceMap, 'assetType');

    const sectorExposure: Record<string, number> = {};
    for (const e of sectorExposureArr) sectorExposure[e.key] = e.pct;

    const assetTypeExposure: Record<string, number> = {};
    for (const e of typeExposureArr) assetTypeExposure[e.key] = e.pct;

    const reportData = buildReport({
      sectorExposure,
      assetTypeExposure,
      avgVolatility: stability ? Number(stability.volatilityScore) : 0,
      stabilityScore: stability ? Number(stability.stabilityFactor) : 1,
      recentReflections: reflections.map((r) => r.reflectionText),
    });

    await this.transactionRunner.run(async (tx) => {
      await this.reportRepo.createReport(
        {
          userId,
          tickIndex,
          simDay,
          simMonth,
          simYear,
          sectorExposure: reportData.sectorExposure,
          assetTypeExposure: reportData.assetTypeExposure,
          avgVolatility: reportData.avgVolatility,
          stabilityScore: reportData.stabilityScore,
          reflectionSummary: reportData.reflectionSummary,
        },
        tx,
      );
    });
  }
}
