import { Injectable } from '@nestjs/common';
import { PrismaService } from '#app/prisma/prisma.service.js';
import type { SectorRow } from '../types/index.js';

@Injectable()
export class InvestConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getSectors(): Promise<SectorRow[]> {
    return this.prisma.sector.findMany({
      orderBy: { sortOrder: 'asc' },
    });
  }
}
