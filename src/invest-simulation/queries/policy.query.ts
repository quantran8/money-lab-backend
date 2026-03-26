import { Injectable } from '@nestjs/common';
import { PrismaService } from '#app/prisma/prisma.service.js';
import type { PolicyInstanceWithTemplateRow } from '../types/index.js';

@Injectable()
export class InvestPolicyQuery {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveInstances(): Promise<PolicyInstanceWithTemplateRow[]> {
    return this.prisma.investPolicyThreadInstance.findMany({
      where: { isActive: true },
      include: { template: true },
      orderBy: { id: 'asc' },
    });
  }
}
