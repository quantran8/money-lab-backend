import { Injectable } from '@nestjs/common';
import { PrismaService } from '#app/prisma/prisma.service.js';
import type {
  PositionRow,
  PositionWithAssetRow,
  TransactionWithAssetRow,
  UserCreditRow,
  PortfolioValueSnapshotRow,
} from '../types/index.js';

@Injectable()
export class InvestPortfolioQuery {
  constructor(private readonly prisma: PrismaService) {}

  async findUserCredit(userId: string): Promise<UserCreditRow | null> {
    return this.prisma.userCredit.findUnique({
      where: { userId },
    });
  }

  async findPositions(userId: string): Promise<PositionRow[]> {
    return this.prisma.portfolioPosition.findMany({
      where: { userId, quantity: { gt: 0 } },
      orderBy: { assetId: 'asc' },
    });
  }

  async findPositionsWithAsset(
    userId: string,
  ): Promise<PositionWithAssetRow[]> {
    return this.prisma.portfolioPosition.findMany({
      where: { userId, quantity: { gt: 0 } },
      include: { asset: { include: { sector: true } } },
      orderBy: { assetId: 'asc' },
    });
  }

  async findPosition(
    userId: string,
    assetId: bigint,
  ): Promise<PositionRow | null> {
    return this.prisma.portfolioPosition.findUnique({
      where: { userId_assetId: { userId, assetId } },
    });
  }

  async findTransactions(
    userId: string,
    limit: number = 50,
    cursor?: bigint,
  ): Promise<TransactionWithAssetRow[]> {
    return this.prisma.portfolioTransaction.findMany({
      where: { userId },
      include: { asset: true },
      orderBy: { id: 'desc' },
      take: limit,
      ...(cursor != null && {
        skip: 1,
        cursor: { id: cursor },
      }),
    });
  }

  /** Recent portfolio value snapshots for a user (most recent first). */
  async findRecentSnapshots(
    userId: string,
    limit: number = 30,
  ): Promise<PortfolioValueSnapshotRow[]> {
    return this.prisma.portfolioValueSnapshot.findMany({
      where: { userId },
      orderBy: { tickIndex: 'desc' },
      take: limit,
    });
  }

  /**
   * Snapshots within a tick window: tickIndex >= sinceTickIndex.
   * Returned ascending by tickIndex (chart-ready order).
   */
  async findSnapshotsSinceTick(
    userId: string,
    sinceTickIndex: bigint,
  ): Promise<PortfolioValueSnapshotRow[]> {
    return this.prisma.portfolioValueSnapshot.findMany({
      where: { userId, tickIndex: { gte: sinceTickIndex } },
      orderBy: { tickIndex: 'asc' },
    });
  }
}
