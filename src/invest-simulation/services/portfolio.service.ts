import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { wrapAsync } from '#common/utils/async.utils.js';
import { InvestPortfolioQuery } from '../queries/portfolio.query.js';
import { InvestMarketQuery } from '../queries/market.query.js';
import {
  calculatePortfolioSummary,
  calculateExposure,
  calculateUnrealizedPnL,
  type PositionInput,
  type PriceMap,
} from '../domain/index.js';

@Injectable()
export class InvestPortfolioService {
  private readonly logger = new Logger(InvestPortfolioService.name);

  constructor(
    private readonly portfolioQuery: InvestPortfolioQuery,
    private readonly marketQuery: InvestMarketQuery,
  ) {}

  async getPortfolio(userId: string) {
    return wrapAsync(this.logger, 'getPortfolio', async () => {
      const [credit, positions, tick] = await Promise.all([
        this.portfolioQuery.findUserCredit(userId),
        this.portfolioQuery.findPositionsWithAsset(userId),
        this.marketQuery.findCurrentTick(),
      ]);

      const balance = credit?.balance ?? 0;

      // Build price map from latest tick
      const priceMap: PriceMap = {};
      if (tick) {
        const prices = await this.marketQuery.findLatestPrices(tick.id);
        for (const p of prices) {
          priceMap[p.assetId.toString()] = p.price;
        }
      }

      // Map DB positions to domain inputs
      const posInputs: PositionInput[] = positions.map((p) => ({
        assetId: p.assetId,
        quantity: p.quantity,
        avgBuyPrice: p.avgBuyPrice,
        sectorCode: p.asset.sector?.code ?? 'unknown',
        assetType: p.asset.assetType,
      }));

      const summary = calculatePortfolioSummary(balance, posInputs, priceMap);
      const sectorExposure = calculateExposure(
        posInputs,
        priceMap,
        'sectorCode',
      );
      const typeExposure = calculateExposure(posInputs, priceMap, 'assetType');
      const pnl = calculateUnrealizedPnL(posInputs, priceMap);

      return {
        ...summary,
        sectorExposure,
        typeExposure,
        totalUnrealizedPnL: pnl.totalUnrealizedPnL,
        positions: positions.map((p) => {
          const currentPrice = priceMap[p.assetId.toString()] ?? 0;
          const marketValue = p.quantity * currentPrice;
          const costBasis = p.quantity * p.avgBuyPrice;
          return {
            assetId: p.assetId.toString(),
            assetCode: p.asset.code,
            assetName: p.asset.name,
            quantity: p.quantity,
            avgBuyPrice: p.avgBuyPrice,
            currentPrice,
            marketValue,
            unrealizedPnL: marketValue - costBasis,
          };
        }),
      };
    });
  }

  async getPositions(userId: string) {
    return wrapAsync(this.logger, 'getPositions', async () => {
      const positions =
        await this.portfolioQuery.findPositionsWithAsset(userId);
      return positions.map((p) => ({
        assetId: p.assetId.toString(),
        assetCode: p.asset.code,
        assetName: p.asset.name,
        assetType: p.asset.assetType,
        quantity: p.quantity,
        avgBuyPrice: p.avgBuyPrice,
      }));
    });
  }

  async getTransactions(userId: string, limit: number = 50, cursor?: bigint) {
    return wrapAsync(this.logger, 'getTransactions', async () => {
      const transactions = await this.portfolioQuery.findTransactions(
        userId,
        limit,
        cursor,
      );

      const nextCursor =
        transactions.length === limit
          ? transactions[transactions.length - 1].id
          : null;

      return {
        data: transactions.map((t) => ({
          id: t.id.toString(),
          assetId: t.assetId.toString(),
          assetCode: t.asset.code,
          assetName: t.asset.name,
          side: t.side,
          quantity: t.quantity,
          pricePerUnit: t.pricePerUnit,
          totalAmount: t.totalAmount,
          createdAt: t.createdAt.toISOString(),
        })),
        nextCursor: nextCursor?.toString() ?? null,
      };
    });
  }
}
