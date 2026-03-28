import { Injectable } from '@nestjs/common';
import { PrismaService } from '#app/prisma/prisma.service.js';
import type { MissionRow, UserMissionWithMissionRow } from '../types/index.js';

@Injectable()
export class MissionQuery {
  constructor(private readonly prisma: PrismaService) {}

  async findAllMissions(): Promise<MissionRow[]> {
    return this.prisma.mission.findMany({
      orderBy: { id: 'asc' },
    });
  }

  async findUserMissions(userId: string): Promise<UserMissionWithMissionRow[]> {
    return this.prisma.userMission.findMany({
      where: { userId },
      include: { mission: true },
      orderBy: { unlockedAt: 'desc' },
    });
  }

  async findUserMissionCodes(userId: string): Promise<string[]> {
    const missions = await this.prisma.userMission.findMany({
      where: { userId },
      include: { mission: { select: { code: true } } },
    });
    return missions.map((m) => m.mission.code);
  }
}
