import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '#app/prisma/prisma.service.js';
import { TxClient } from '#app/prisma/transaction.runner.js';

@Injectable()
export class InvestPolicyRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: TxClient) {
    return tx ?? this.prisma;
  }

  async createInstance(
    data: Prisma.PolicyThreadInstanceUncheckedCreateInput,
    tx?: TxClient,
  ) {
    return this.client(tx).policyThreadInstance.create({ data });
  }

  async updateInstanceState(
    id: bigint,
    state: string,
    ticksInCurrentState: number,
    actionsCompleted: number,
    tx?: TxClient,
  ) {
    return this.client(tx).policyThreadInstance.update({
      where: { id },
      data: { state, ticksInCurrentState, actionsCompleted },
    });
  }

  async deactivateInstance(id: bigint, resolvedAtTick: bigint, tx?: TxClient) {
    return this.client(tx).policyThreadInstance.update({
      where: { id },
      data: { isActive: false, resolvedAtTick },
    });
  }
}
