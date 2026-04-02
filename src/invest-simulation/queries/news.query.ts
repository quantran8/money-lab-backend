import { Injectable } from '@nestjs/common';
import { PrismaService } from '#app/prisma/prisma.service.js';
import type { NewsItemRow, NewsWithImpactsRow } from '../types/index.js';

@Injectable()
export class InvestNewsQuery {
  constructor(private readonly prisma: PrismaService) {}

  async findByTick(tickId: bigint): Promise<NewsWithImpactsRow[]> {
    return this.prisma.simNewsItem.findMany({
      where: { tickId },
      include: { assetImpacts: true, sectorImpacts: true },
      orderBy: { id: 'asc' },
    });
  }

  async findRecent(
    limit: number = 20,
    cursor?: bigint,
  ): Promise<NewsWithImpactsRow[]> {
    return this.prisma.simNewsItem.findMany({
      include: { assetImpacts: true, sectorImpacts: true },
      orderBy: { id: 'desc' },
      take: limit,
      ...(cursor != null && {
        skip: 1,
        cursor: { id: cursor },
      }),
    });
  }

  async findById(newsId: bigint): Promise<NewsWithImpactsRow | null> {
    return this.prisma.simNewsItem.findUnique({
      where: { id: newsId },
      include: { assetImpacts: true, sectorImpacts: true },
    });
  }
}
