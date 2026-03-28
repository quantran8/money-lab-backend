import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '#app/prisma/prisma.service.js';
import { TxClient } from '#app/prisma/transaction.runner.js';

@Injectable()
export class InvestBehaviorRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: TxClient) {
    return tx ?? this.prisma;
  }

  async createWindow(
    data: Prisma.BehaviorWindowUncheckedCreateInput,
    tx?: TxClient,
  ) {
    return this.client(tx).behaviorWindow.create({ data });
  }

  async closeWindow(id: bigint, endTickIndex: bigint, tx?: TxClient) {
    return this.client(tx).behaviorWindow.update({
      where: { id },
      data: { isOpen: false, endTickIndex },
    });
  }

  async createSnapshot(
    data: Prisma.UserBehaviorSnapshotUncheckedCreateInput,
    tx?: TxClient,
  ) {
    return this.client(tx).userBehaviorSnapshot.create({ data });
  }

  async createStabilityMetric(
    data: Prisma.UserStabilityMetricUncheckedCreateInput,
    tx?: TxClient,
  ) {
    return this.client(tx).userStabilityMetric.create({ data });
  }
}
