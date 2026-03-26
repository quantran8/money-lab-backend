import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '#app/prisma/prisma.service.js';
import { TxClient } from '#app/prisma/transaction.runner.js';

@Injectable()
export class InvestPortfolioRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: TxClient) {
    return tx ?? this.prisma;
  }

  async createTransaction(
    data: Prisma.InvestPortfolioTransactionUncheckedCreateInput,
    tx?: TxClient,
  ) {
    return this.client(tx).investPortfolioTransaction.create({ data });
  }

  async upsertPosition(
    userId: string,
    assetId: bigint,
    quantityDelta: number,
    newAvgPrice: number,
    tx?: TxClient,
  ) {
    return this.client(tx).investPortfolioPosition.upsert({
      where: { userId_assetId: { userId, assetId } },
      update: {
        quantity: { increment: quantityDelta },
        avgBuyPrice: newAvgPrice,
      },
      create: {
        userId,
        assetId,
        quantity: quantityDelta,
        avgBuyPrice: newAvgPrice,
      },
    });
  }

  async decreasePosition(
    userId: string,
    assetId: bigint,
    quantityToSell: number,
    tx?: TxClient,
  ) {
    return this.client(tx).investPortfolioPosition.update({
      where: { userId_assetId: { userId, assetId } },
      data: { quantity: { decrement: quantityToSell } },
    });
  }

  async deletePositionIfEmpty(
    userId: string,
    assetId: bigint,
    tx?: TxClient,
  ) {
    await this.client(tx).investPortfolioPosition.deleteMany({
      where: { userId, assetId, quantity: { lte: 0 } },
    });
  }

  /**
   * Atomically deduct credits. Returns number of rows affected (0 = insufficient).
   * Uses raw SQL with WHERE balance >= amount to prevent overdraft race conditions.
   */
  async deductCredits(
    userId: string,
    amount: number,
    tx?: TxClient,
  ): Promise<number> {
    const client = this.client(tx);
    const result = await (client as PrismaService).$executeRaw`
      UPDATE invest_user_credits
      SET balance = balance - ${amount},
          updated_at = NOW()
      WHERE user_id = ${userId}::uuid
        AND balance >= ${amount}
    `;
    return result;
  }

  /** Add credits (e.g. from selling). */
  async addCredits(
    userId: string,
    amount: number,
    tx?: TxClient,
  ): Promise<void> {
    const client = this.client(tx);
    await (client as PrismaService).$executeRaw`
      UPDATE invest_user_credits
      SET balance = balance + ${amount},
          updated_at = NOW()
      WHERE user_id = ${userId}::uuid
    `;
  }

  /** Ensure credit row exists for a user. */
  async ensureUserCredit(
    userId: string,
    initialBalance: number,
    tx?: TxClient,
  ) {
    return this.client(tx).investUserCredit.upsert({
      where: { userId },
      update: {},
      create: { userId, balance: initialBalance },
    });
  }
}
