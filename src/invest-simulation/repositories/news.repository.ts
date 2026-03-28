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
    data: Prisma.SimNewsItemUncheckedCreateInput,
    tx?: TxClient,
  ) {
    return this.client(tx).simNewsItem.create({ data });
  }

  async createAssetImpacts(
    data: Prisma.SimNewsAssetImpactCreateManyInput[],
    tx?: TxClient,
  ) {
    if (data.length === 0) return;
    return this.client(tx).simNewsAssetImpact.createMany({ data });
  }

  async createSectorImpacts(
    data: Prisma.SimNewsSectorImpactCreateManyInput[],
    tx?: TxClient,
  ) {
    if (data.length === 0) return;
    return this.client(tx).simNewsSectorImpact.createMany({ data });
  }
}
