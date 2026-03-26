import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '#app/prisma/prisma.service.js';
import { TxClient } from '#app/prisma/transaction.runner.js';

@Injectable()
export class InvestArcRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: TxClient) {
    return tx ?? this.prisma;
  }

  async createInstance(
    data: Prisma.InvestWorldArcInstanceUncheckedCreateInput,
    tx?: TxClient,
  ) {
    return this.client(tx).investWorldArcInstance.create({ data });
  }

  async updateInstanceState(
    id: bigint,
    state: string,
    ticksInCurrentState: number,
    progress: number,
    tx?: TxClient,
  ) {
    return this.client(tx).investWorldArcInstance.update({
      where: { id },
      data: { state, ticksInCurrentState, progress },
    });
  }

  async deactivateInstance(id: bigint, endedAtTick: number, tx?: TxClient) {
    return this.client(tx).investWorldArcInstance.update({
      where: { id },
      data: { isActive: false, endedAtTick },
    });
  }
}
