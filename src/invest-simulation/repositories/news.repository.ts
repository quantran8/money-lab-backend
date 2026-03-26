import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '#app/prisma/prisma.service.js';
import { TxClient } from '#app/prisma/transaction.runner.js';

@Injectable()
export class InvestNewsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: TxClient) {
    return tx ?? this.prisma;
  }

  async createNewsItem(
    data: Prisma.InvestSimNewsItemUncheckedCreateInput,
    tx?: TxClient,
  ) {
    return this.client(tx).investSimNewsItem.create({ data });
  }

  async createAssetImpacts(
    data: Prisma.InvestSimNewsAssetImpactCreateManyInput[],
    tx?: TxClient,
  ) {
    if (data.length === 0) return;
    return this.client(tx).investSimNewsAssetImpact.createMany({ data });
  }

  async createSectorImpacts(
    data: Prisma.InvestSimNewsSectorImpactCreateManyInput[],
    tx?: TxClient,
  ) {
    if (data.length === 0) return;
    return this.client(tx).investSimNewsSectorImpact.createMany({ data });
  }
}
