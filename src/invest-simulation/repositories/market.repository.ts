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

  async createTick(
    data: Prisma.MarketTickUncheckedCreateInput,
    tx?: TxClient,
  ) {
    return this.client(tx).marketTick.create({ data });
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
