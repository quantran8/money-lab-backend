import { Injectable } from '@nestjs/common';
import { PrismaService } from '#app/prisma/prisma.service.js';
import type { SimReportRow } from '../types/index.js';

@Injectable()
export class InvestReportQuery {
  constructor(private readonly prisma: PrismaService) {}

  async findLatestReport(userId: string): Promise<SimReportRow | null> {
    return this.prisma.simReport.findFirst({
      where: { userId },
      orderBy: { generatedAt: 'desc' },
    });
  }

  async findReports(userId: string, limit: number = 10): Promise<SimReportRow[]> {
    return this.prisma.simReport.findMany({
      where: { userId },
      orderBy: { generatedAt: 'desc' },
      take: limit,
    });
  }
}
