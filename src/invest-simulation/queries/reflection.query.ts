import { Injectable } from '@nestjs/common';
import { PrismaService } from '#app/prisma/prisma.service.js';
import type { ReflectionTemplateRow, UserReflectionWithTemplateRow } from '../types/index.js';

@Injectable()
export class InvestReflectionQuery {
  constructor(private readonly prisma: PrismaService) {}

  async findTemplates(): Promise<ReflectionTemplateRow[]> {
    return this.prisma.investReflectionTemplate.findMany({
      orderBy: { id: 'asc' },
    });
  }

  async findUserReflections(userId: string, limit: number = 20): Promise<UserReflectionWithTemplateRow[]> {
    return this.prisma.investUserReflection.findMany({
      where: { userId },
      include: { template: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
