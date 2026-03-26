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
    data: Prisma.InvestMarketTickUncheckedCreateInput,
    tx?: TxClient,
  ) {
    return this.client(tx).investMarketTick.create({ data });
  }

  async createPricePoint(
    data: Prisma.InvestAssetPricePointUncheckedCreateInput,
    tx?: TxClient,
  ) {
    return this.client(tx).investAssetPricePoint.create({ data });
  }

  async createPricePoints(
    data: Prisma.InvestAssetPricePointCreateManyInput[],
    tx?: TxClient,
  ) {
    return this.client(tx).investAssetPricePoint.createMany({ data });
  }

  async createWorldState(
    data: Prisma.InvestWorldStateAtTickUncheckedCreateInput,
    tx?: TxClient,
  ) {
    return this.client(tx).investWorldStateAtTick.create({ data });
  }
}
