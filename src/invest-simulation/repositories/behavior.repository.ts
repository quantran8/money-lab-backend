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
    data: Prisma.InvestBehaviorWindowUncheckedCreateInput,
    tx?: TxClient,
  ) {
    return this.client(tx).investBehaviorWindow.create({ data });
  }

  async closeWindow(id: bigint, endTickIndex: number, tx?: TxClient) {
    return this.client(tx).investBehaviorWindow.update({
      where: { id },
      data: { isOpen: false, endTickIndex },
    });
  }

  async createSnapshot(
    data: Prisma.InvestUserBehaviorSnapshotUncheckedCreateInput,
    tx?: TxClient,
  ) {
    return this.client(tx).investUserBehaviorSnapshot.create({ data });
  }

  async createStabilityMetric(
    data: Prisma.InvestUserStabilityMetricUncheckedCreateInput,
    tx?: TxClient,
  ) {
    return this.client(tx).investUserStabilityMetric.create({ data });
  }
}
