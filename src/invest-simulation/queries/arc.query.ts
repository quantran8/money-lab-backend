import { Injectable } from '@nestjs/common';
import { PrismaService } from '#app/prisma/prisma.service.js';
import type { ArcTypeRow, ArcInstanceWithTypeRow } from '../types/index.js';

@Injectable()
export class InvestArcQuery {
  constructor(private readonly prisma: PrismaService) {}

  async findArcTypes(): Promise<ArcTypeRow[]> {
    return this.prisma.investWorldArcType.findMany({
      orderBy: { id: 'asc' },
    });
  }

  async findActiveInstances(): Promise<ArcInstanceWithTypeRow[]> {
    return this.prisma.investWorldArcInstance.findMany({
      where: { isActive: true },
      include: { arcType: true },
      orderBy: { id: 'asc' },
    });
  }
}
