import { Injectable } from '@nestjs/common';
import { PrismaService } from '#app/prisma/prisma.service.js';
import type { BehaviorWindowRow, BehaviorSnapshotRow, StabilityMetricRow } from '../types/index.js';

@Injectable()
export class InvestBehaviorQuery {
  constructor(private readonly prisma: PrismaService) {}

  async findOpenWindows(): Promise<BehaviorWindowRow[]> {
    return this.prisma.investBehaviorWindow.findMany({
      where: { isOpen: true },
      orderBy: { startTickIndex: 'asc' },
    });
  }

  async findSnapshotsByUser(userId: string, limit: number = 10): Promise<BehaviorSnapshotRow[]> {
    return this.prisma.investUserBehaviorSnapshot.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async findLatestStabilityMetric(userId: string): Promise<StabilityMetricRow | null> {
    return this.prisma.investUserStabilityMetric.findFirst({
      where: { userId },
      orderBy: { tickIndex: 'desc' },
    });
  }
}
