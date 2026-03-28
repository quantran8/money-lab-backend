import { Injectable } from '@nestjs/common';
import { PrismaService } from '#app/prisma/prisma.service.js';
import type { UserScoreRow } from '../types/index.js';

@Injectable()
export class InvestScoreQuery {
  constructor(private readonly prisma: PrismaService) {}

  async findUserScore(userId: string): Promise<UserScoreRow | null> {
    return this.prisma.userScore.findUnique({
      where: { userId },
    });
  }
}
