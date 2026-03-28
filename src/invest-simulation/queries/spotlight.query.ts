import { Injectable } from '@nestjs/common';
import { PrismaService } from '#app/prisma/prisma.service.js';
import type {
  SpotlightTemplateRow,
  SpotlightInstanceRow,
  SpotlightInstanceFullRow,
} from '../types/index.js';

@Injectable()
export class InvestSpotlightQuery {
  constructor(private readonly prisma: PrismaService) {}

  async findTemplates(): Promise<SpotlightTemplateRow[]> {
    return this.prisma.assetSpotlightTemplate.findMany({
      orderBy: { id: 'asc' },
    });
  }

  async findActiveInstances(): Promise<SpotlightInstanceFullRow[]> {
    return this.prisma.assetSpotlightInstance.findMany({
      where: { isActive: true },
      include: { template: true, asset: { include: { sector: true } } },
      orderBy: { id: 'asc' },
    });
  }

  async findInstancesByAsset(assetId: bigint): Promise<SpotlightInstanceRow[]> {
    return this.prisma.assetSpotlightInstance.findMany({
      where: { assetId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
