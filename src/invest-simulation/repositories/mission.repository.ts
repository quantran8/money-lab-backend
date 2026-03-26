import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '#app/prisma/prisma.service.js';
import { TxClient } from '#app/prisma/transaction.runner.js';

@Injectable()
export class InvestMissionRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: TxClient) {
    return tx ?? this.prisma;
  }

  async createUserMission(
    data: Prisma.InvestUserMissionUncheckedCreateInput,
    tx?: TxClient,
  ) {
    return this.client(tx).investUserMission.create({ data });
  }

  async updateMissionStatus(
    userId: string,
    missionId: bigint,
    status: string,
    tx?: TxClient,
  ) {
    return this.client(tx).investUserMission.update({
      where: { userId_missionId: { userId, missionId } },
      data: {
        status,
        completedAt: status === 'completed' ? new Date() : undefined,
      },
    });
  }
}
