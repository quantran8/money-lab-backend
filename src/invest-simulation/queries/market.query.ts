import { Injectable } from '@nestjs/common';
import { PrismaService } from '#app/prisma/prisma.service.js';
import type {
  MarketTickRow,
  TickWithWorldStateRow,
  PricePointRow,
  TickWithPricesAndSectorRow,
} from '../types/index.js';

@Injectable()
export class InvestMarketQuery {
  constructor(private readonly prisma: PrismaService) {}

  async findCurrentTick(): Promise<MarketTickRow | null> {
    return this.prisma.marketTick.findFirst({
      orderBy: { tickIndex: 'desc' },
    });
  }

  async findCurrentTickWithWorldState(): Promise<TickWithWorldStateRow | null> {
    return this.prisma.marketTick.findFirst({
      orderBy: { tickIndex: 'desc' },
      include: { worldState: true },
    });
  }

  /** Latest price for each active asset at or before the given tick. */
  async findLatestPrices(tickId: bigint): Promise<PricePointRow[]> {
    return this.prisma.assetPricePoint.findMany({
      where: { tickId },
      orderBy: { assetId: 'asc' },
    });
  }

  /** Latest single price for one asset. */
  async findLatestPriceForAsset(
    assetId: bigint,
    tickId: bigint,
  ): Promise<PricePointRow | null> {
    return this.prisma.assetPricePoint.findFirst({
      where: { assetId, tickId },
    });
  }

  /** Price history for a single asset (most recent first). */
  async findPriceHistory(
    assetId: bigint,
    limit: number,
  ): Promise<PricePointRow[]> {
    return this.prisma.assetPricePoint.findMany({
      where: { assetId },
      orderBy: { tickId: 'desc' },
      take: limit,
    });
  }

  /**
   * Latest tick with all price points, each annotated with the asset's sectorId.
   * Single-query payload tailored for the dashboard endpoint:
   * gives tick state + current prices + sector grouping in one round-trip.
   */
  async findCurrentTickWithPricesAndSectors(): Promise<TickWithPricesAndSectorRow | null> {
    return this.prisma.marketTick.findFirst({
      orderBy: { tickIndex: 'desc' },
      include: {
        pricePoints: {
          include: { asset: { select: { id: true, sectorId: true } } },
        },
      },
    });
  }
}
