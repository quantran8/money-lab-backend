import { Injectable } from '@nestjs/common';
import { PrismaService } from '#app/prisma/prisma.service.js';
import type {
  ArcTypeRow,
  ArcInstanceRow,
  ArcInstanceWithTypeRow,
  ArcSpotlightTemplateRow,
  ArcAssetAffinityRow,
} from '../types/index.js';

@Injectable()
export class InvestArcQuery {
  constructor(private readonly prisma: PrismaService) {}

  async findArcTypes(): Promise<ArcTypeRow[]> {
    return this.prisma.worldArcType.findMany({
      orderBy: { id: 'asc' },
    });
  }

  async findActiveInstances(): Promise<ArcInstanceWithTypeRow[]> {
    return this.prisma.worldArcInstance.findMany({
      where: { isActive: true },
      include: { arcType: { include: { sectorImpacts: true } } },
      orderBy: { id: 'asc' },
    });
  }

  /** Arc types with no currently active instance (candidates for respawn). */
  async findAvailableArcTypes(): Promise<ArcTypeRow[]> {
    return this.prisma.worldArcType.findMany({
      where: {
        instances: { none: { isActive: true } },
      },
      orderBy: { id: 'asc' },
    });
  }

  /** Most recently ended instance for a given arc type (for cooldown check). */
  async findLastEndedInstance(
    arcTypeId: number,
  ): Promise<ArcInstanceRow | null> {
    return this.prisma.worldArcInstance.findFirst({
      where: { arcTypeId, isActive: false, endedAtTick: { not: null } },
      orderBy: { endedAtTick: 'desc' },
    });
  }

  /** Spotlight templates mapped to a given arc type, ordered by weight desc. */
  async findArcSpotlightTemplates(
    arcTypeId: number,
  ): Promise<ArcSpotlightTemplateRow[]> {
    return this.prisma.arcSpotlightTemplate.findMany({
      where: { arcTypeId },
      orderBy: { weight: 'desc' },
    });
  }

  /** Asset affinities for a given arc type, ordered by affinity desc. */
  async findArcAssetAffinities(
    arcTypeId: number,
  ): Promise<ArcAssetAffinityRow[]> {
    return this.prisma.arcAssetAffinity.findMany({
      where: { arcTypeId },
      orderBy: { affinity: 'desc' },
    });
  }
}
