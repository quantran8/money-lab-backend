import { Injectable } from '@nestjs/common';
import { PrismaService } from '#app/prisma/prisma.service.js';
import { TxClient } from '#app/prisma/transaction.runner.js';

@Injectable()
export class InvestScoreRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: TxClient) {
    return tx ?? this.prisma;
  }

  async upsertScore(
    userId: string,
    wealthPoints: number,
    stabilityFactor: number,
    wealthTier: string,
    tx?: TxClient,
  ) {
    return this.client(tx).investUserScore.upsert({
      where: { userId },
      update: { wealthPoints, stabilityFactor, wealthTier, lastCalculatedAt: new Date() },
      create: { userId, wealthPoints, stabilityFactor, wealthTier },
    });
  }
}
