import { Injectable } from '@nestjs/common';
import { PrismaService } from '#app/prisma/prisma.service.js';
import type { AssetRow, AssetWithSectorRow } from '../types/index.js';

@Injectable()
export class InvestAssetQuery {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<AssetRow[]> {
    return this.prisma.investAsset.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
    });
  }

  async findAllWithSector(): Promise<AssetWithSectorRow[]> {
    return this.prisma.investAsset.findMany({
      where: { isActive: true },
      include: { sector: true },
      orderBy: { id: 'asc' },
    });
  }

  async findById(assetId: bigint): Promise<AssetWithSectorRow | null> {
    return this.prisma.investAsset.findFirst({
      where: { id: assetId, isActive: true },
      include: { sector: true },
    });
  }

  async findBySector(sectorId: number): Promise<AssetRow[]> {
    return this.prisma.investAsset.findMany({
      where: { sectorId, isActive: true },
      orderBy: { id: 'asc' },
    });
  }
}
