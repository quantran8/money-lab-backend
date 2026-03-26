import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '#app/prisma/prisma.service.js';
import { TxClient } from '#app/prisma/transaction.runner.js';

@Injectable()
export class InvestSpotlightRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: TxClient) {
    return tx ?? this.prisma;
  }

  async createInstance(
    data: Prisma.InvestAssetSpotlightInstanceUncheckedCreateInput,
    tx?: TxClient,
  ) {
    return this.client(tx).investAssetSpotlightInstance.create({ data });
  }

  async updateInstanceState(
    id: bigint,
    state: string,
    ticksInCurrentState: number,
    tx?: TxClient,
  ) {
    return this.client(tx).investAssetSpotlightInstance.update({
      where: { id },
      data: { state, ticksInCurrentState },
    });
  }

  async deactivateInstance(id: bigint, endedAtTick: number, cooldownUntilTick: number, tx?: TxClient) {
    return this.client(tx).investAssetSpotlightInstance.update({
      where: { id },
      data: { isActive: false, endedAtTick, cooldownUntilTick },
    });
  }
}
