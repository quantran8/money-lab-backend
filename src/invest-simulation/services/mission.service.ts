import { Injectable, Logger } from '@nestjs/common';
import { wrapAsync } from '#common/utils/async.utils.js';
import { TransactionRunner } from '#app/prisma/transaction.runner.js';
import { InvestMissionQuery } from '../queries/mission.query.js';
import { InvestBehaviorQuery } from '../queries/behavior.query.js';
import { InvestScoreQuery } from '../queries/score.query.js';
import { InvestPortfolioQuery } from '../queries/portfolio.query.js';
import { InvestMissionRepository } from '../repositories/mission.repository.js';
import {
  matchMissions,
  type MissionDefinition,
  type UserState,
} from '../domain/index.js';

@Injectable()
export class InvestMissionService {
  private readonly logger = new Logger(InvestMissionService.name);

  constructor(
    private readonly transactionRunner: TransactionRunner,
    private readonly missionQuery: InvestMissionQuery,
    private readonly behaviorQuery: InvestBehaviorQuery,
    private readonly scoreQuery: InvestScoreQuery,
    private readonly portfolioQuery: InvestPortfolioQuery,
    private readonly missionRepo: InvestMissionRepository,
  ) {}

  async getUserMissions(userId: string) {
    return wrapAsync(this.logger, 'getUserMissions', async () => {
      const missions = await this.missionQuery.findUserMissions(userId);
      return missions.map((m) => ({
        id: m.id.toString(),
        missionCode: m.mission.code,
        missionTitle: m.mission.title,
        description: m.mission.description,
        status: m.status,
        progress: m.progress,
        unlockedAt: m.unlockedAt.toISOString(),
        completedAt: m.completedAt?.toISOString() ?? null,
      }));
    });
  }

  /**
   * Assign triggered missions for a user based on their current state.
   */
  async assignForUser(userId: string): Promise<number> {
    const [allMissions, assignedCodes, snapshots, score, positions] = await Promise.all([
      this.missionQuery.findAllMissions(),
      this.missionQuery.findUserMissionCodes(userId),
      this.behaviorQuery.findSnapshotsByUser(userId, 10),
      this.scoreQuery.findUserScore(userId),
      this.portfolioQuery.findPositionsWithAsset(userId),
    ]);

    const sectorSet = new Set(positions.map((p) => p.asset.sector.code));

    const avgTurnover = snapshots.length > 0
      ? snapshots.reduce((s, snap) => s + Number(snap.turnoverScore), 0) / snapshots.length
      : 0;
    const avgVolatilityChasing = snapshots.length > 0
      ? snapshots.reduce((s, snap) => s + Number(snap.volatilityChasingScore), 0) / snapshots.length
      : 0;

    const userState: UserState = {
      snapshotCount: snapshots.length,
      avgTurnover,
      avgVolatilityChasing,
      stabilityFactor: score ? Number(score.stabilityFactor) : 1,
      sectorCount: sectorSet.size,
      positionCount: positions.length,
      assignedMissionCodes: new Set(assignedCodes),
    };

    const domainMissions: MissionDefinition[] = allMissions.map((m) => ({
      id: m.id,
      code: m.code,
      title: m.title,
      condition: m.condition as Record<string, unknown>,
    }));

    const matched = matchMissions(domainMissions, userState);

    if (matched.length === 0) return 0;

    await this.transactionRunner.run(async (tx) => {
      for (const m of matched) {
        await this.missionRepo.createUserMission(
          { userId, missionId: m.missionId, status: 'active' },
          tx,
        );
      }
    });

    return matched.length;
  }
}
