import { Injectable } from '@nestjs/common';
import { PrismaService } from '#app/prisma/prisma.service.js';
import type {
  PolicyTemplateWithImpactsRow,
  PolicyInstanceWithTemplateAndImpactsRow,
} from '../types/index.js';

@Injectable()
export class InvestPolicyQuery {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveInstances(): Promise<
    PolicyInstanceWithTemplateAndImpactsRow[]
  > {
    return this.prisma.policyThreadInstance.findMany({
      where: { isActive: true },
      include: { template: { include: { sectorImpacts: true } } },
      orderBy: { id: 'asc' },
    });
  }

  /** Templates with no active instance and past cooldown. */
  async findAvailableTemplates(
    currentTick: bigint,
    cooldownTicks: bigint,
  ): Promise<PolicyTemplateWithImpactsRow[]> {
    return this.prisma.policyThreadTemplate.findMany({
      where: {
        instances: {
          none: {
            OR: [
              { isActive: true },
              { resolvedAtTick: { gt: currentTick - cooldownTicks } },
            ],
          },
        },
      },
      include: { sectorImpacts: true },
      orderBy: { id: 'asc' },
    });
  }
}
