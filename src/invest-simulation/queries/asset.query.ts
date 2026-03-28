import { Injectable } from '@nestjs/common';
import { PrismaService } from '#app/prisma/prisma.service.js';
import type { AssetRow, AssetWithSectorRow, SectorRow } from '../types/index.js';

export interface AssetFilter {
  sectorId?: number;
  search?: string;
}

@Injectable()
export class AssetQuery {
  constructor(private readonly prisma: PrismaService) {}

  async findAllSectors(): Promise<SectorRow[]> {
    return this.prisma.sector.findMany({
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findAll(): Promise<AssetRow[]> {
    return this.prisma.asset.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
    });
  }

  async findAllWithSector(
    filter: AssetFilter = {},
    limit: number = 50,
    offset: number = 0,
  ): Promise<AssetWithSectorRow[]> {
    return this.prisma.asset.findMany({
      where: this.buildWhere(filter),
      include: { sector: true },
      orderBy: { id: 'asc' },
      take: limit,
      skip: offset,
    });
  }

  async countAll(filter: AssetFilter = {}): Promise<number> {
    return this.prisma.asset.count({
      where: this.buildWhere(filter),
    });
  }

  private buildWhere(filter: AssetFilter) {
    return {
      isActive: true,
      ...(filter.sectorId != null && { sectorId: filter.sectorId }),
      ...(filter.search != null && {
        OR: [
          { name: { contains: filter.search, mode: 'insensitive' as const } },
          { code: { contains: filter.search, mode: 'insensitive' as const } },
        ],
      }),
    };
  }

  async findById(assetId: bigint): Promise<AssetWithSectorRow | null> {
    return this.prisma.asset.findFirst({
      where: { id: assetId, isActive: true },
      include: { sector: true },
    });
  }

  async findBySector(sectorId: number): Promise<AssetRow[]> {
    return this.prisma.asset.findMany({
      where: { sectorId, isActive: true },
      orderBy: { id: 'asc' },
    });
  }
}
