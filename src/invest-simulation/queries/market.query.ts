import { Injectable } from '@nestjs/common';
import { PrismaService } from '#app/prisma/prisma.service.js';
import type {
  MarketTickRow,
  TickWithWorldStateRow,
  PricePointRow,
} from '../types/index.js';

@Injectable()
export class InvestMarketQuery {
  constructor(private readonly prisma: PrismaService) {}

  async findCurrentTick(): Promise<MarketTickRow | null> {
    return this.prisma.investMarketTick.findFirst({
      orderBy: { tickIndex: 'desc' },
    });
  }

  async findCurrentTickWithWorldState(): Promise<TickWithWorldStateRow | null> {
    return this.prisma.investMarketTick.findFirst({
      orderBy: { tickIndex: 'desc' },
      include: { worldState: true },
    });
  }

  /** Latest price for each active asset at or before the given tick. */
  async findLatestPrices(tickId: bigint): Promise<PricePointRow[]> {
    return this.prisma.investAssetPricePoint.findMany({
      where: { tickId },
      orderBy: { assetId: 'asc' },
    });
  }

  /** Latest single price for one asset. */
  async findLatestPriceForAsset(assetId: bigint, tickId: bigint): Promise<PricePointRow | null> {
    return this.prisma.investAssetPricePoint.findFirst({
      where: { assetId, tickId },
    });
  }

  /** Price history for a single asset (most recent first). */
  async findPriceHistory(assetId: bigint, limit: number): Promise<PricePointRow[]> {
    return this.prisma.investAssetPricePoint.findMany({
      where: { assetId },
      orderBy: { tickId: 'desc' },
      take: limit,
    });
  }
}
