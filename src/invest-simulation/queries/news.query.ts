import { Injectable } from '@nestjs/common';
import { PrismaService } from '#app/prisma/prisma.service.js';
import type { NewsItemRow, NewsWithImpactsRow } from '../types/index.js';

@Injectable()
export class InvestNewsQuery {
  constructor(private readonly prisma: PrismaService) {}

  async findByTick(tickId: bigint): Promise<NewsWithImpactsRow[]> {
    return this.prisma.investSimNewsItem.findMany({
      where: { tickId },
      include: { assetImpacts: true, sectorImpacts: true },
      orderBy: { id: 'asc' },
    });
  }

  async findRecent(limit: number = 20): Promise<NewsWithImpactsRow[]> {
    return this.prisma.investSimNewsItem.findMany({
      include: { assetImpacts: true, sectorImpacts: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async findById(newsId: bigint): Promise<NewsWithImpactsRow | null> {
    return this.prisma.investSimNewsItem.findUnique({
      where: { id: newsId },
      include: { assetImpacts: true, sectorImpacts: true },
    });
  }
}
