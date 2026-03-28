import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '#app/prisma/prisma.service.js';
import { TxClient } from '#app/prisma/transaction.runner.js';

@Injectable()
export class InvestReflectionRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: TxClient) {
    return tx ?? this.prisma;
  }

  async createReflection(
    data: Prisma.UserReflectionUncheckedCreateInput,
    tx?: TxClient,
  ) {
    return this.client(tx).userReflection.create({ data });
  }
}
