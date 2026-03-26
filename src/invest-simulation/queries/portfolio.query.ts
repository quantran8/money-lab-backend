import { Injectable } from '@nestjs/common';
import { PrismaService } from '#app/prisma/prisma.service.js';
import type {
  PositionRow,
  PositionWithAssetRow,
  TransactionWithAssetRow,
  UserCreditRow,
} from '../types/index.js';

@Injectable()
export class InvestPortfolioQuery {
  constructor(private readonly prisma: PrismaService) {}

  async findUserCredit(userId: string): Promise<UserCreditRow | null> {
    return this.prisma.investUserCredit.findUnique({
      where: { userId },
    });
  }

  async findPositions(userId: string): Promise<PositionRow[]> {
    return this.prisma.investPortfolioPosition.findMany({
      where: { userId, quantity: { gt: 0 } },
      orderBy: { assetId: 'asc' },
    });
  }

  async findPositionsWithAsset(userId: string): Promise<PositionWithAssetRow[]> {
    return this.prisma.investPortfolioPosition.findMany({
      where: { userId, quantity: { gt: 0 } },
      include: { asset: { include: { sector: true } } },
      orderBy: { assetId: 'asc' },
    });
  }

  async findPosition(userId: string, assetId: bigint): Promise<PositionRow | null> {
    return this.prisma.investPortfolioPosition.findUnique({
      where: { userId_assetId: { userId, assetId } },
    });
  }

  async findTransactions(
    userId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<TransactionWithAssetRow[]> {
    return this.prisma.investPortfolioTransaction.findMany({
      where: { userId },
      include: { asset: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }
}
