import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '#app/prisma/prisma.service.js';
import { TxClient } from '#app/prisma/transaction.runner.js';

@Injectable()
export class InvestMarketRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: TxClient) {
    return tx ?? this.prisma;
  }

  async createTick(data: Prisma.MarketTickUncheckedCreateInput, tx?: TxClient) {
    return this.client(tx).marketTick.create({ data });
  }

  async upsertTickByIndex(
    tickIndex: bigint,
    data: Omit<Prisma.MarketTickUncheckedCreateInput, 'tickIndex'>,
    tx?: TxClient,
  ) {
    return this.client(tx).marketTick.upsert({
      where: { tickIndex },
      create: { tickIndex, ...data },
      update: {},
    });
  }

  /**
   * Resets the market_ticks id sequence to MAX(id) so autoincrement
   * won't collide with existing rows after a migration reset.
   */
  async repairIdSequence(): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `SELECT setval(
         pg_get_serial_sequence('invest.market_ticks', 'id'),
         GREATEST(COALESCE((SELECT MAX(id) FROM invest.market_ticks), 0), 1)
       )`,
    );
  }

  async createPricePoint(
    data: Prisma.AssetPricePointUncheckedCreateInput,
    tx?: TxClient,
  ) {
    return this.client(tx).assetPricePoint.create({ data });
  }

  async createPricePoints(
    data: Prisma.AssetPricePointCreateManyInput[],
    tx?: TxClient,
  ) {
    return this.client(tx).assetPricePoint.createMany({ data });
  }

  async createWorldState(
    data: Prisma.WorldStateAtTickUncheckedCreateInput,
    tx?: TxClient,
  ) {
    return this.client(tx).worldStateAtTick.create({ data });
  }
}
