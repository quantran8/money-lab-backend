// ──────────────────────────────────────────────────────────────────
// Pure domain: mission matching from behavior patterns
// Missions are reflective labels, not tasks
// No I/O, no NestJS, no DB
// ──────────────────────────────────────────────────────────────────

export interface MissionDefinition {
  id: bigint;
  code: string;
  title: string;
  condition: MissionCondition;
}

export interface MissionCondition {
  /** Min number of behavior snapshots required. */
  minSnapshots?: number;
  /** Max average turnover across snapshots. */
  maxAvgTurnover?: number;
  /** Min average turnover. */
  minAvgTurnover?: number;
  /** Min stability factor. */
  minStabilityFactor?: number;
  /** Min number of distinct sectors held. */
  minSectorCount?: number;
  /** Min number of positions held. */
  minPositionCount?: number;
  /** Max average volatility chasing. */
  maxAvgVolatilityChasing?: number;
}

export interface UserState {
  snapshotCount: number;
  avgTurnover: number;
  avgVolatilityChasing: number;
  stabilityFactor: number;
  sectorCount: number;
  positionCount: number;
  /** Mission codes already assigned to avoid duplicates. */
  assignedMissionCodes: Set<string>;
}

export interface MatchedMission {
  missionId: bigint;
  missionCode: string;
}

function matchesMissionCondition(
  state: UserState,
  cond: MissionCondition,
): boolean {
  if (cond.minSnapshots != null && state.snapshotCount < cond.minSnapshots)
    return false;
  if (cond.maxAvgTurnover != null && state.avgTurnover > cond.maxAvgTurnover)
    return false;
  if (cond.minAvgTurnover != null && state.avgTurnover < cond.minAvgTurnover)
    return false;
  if (
    cond.minStabilityFactor != null &&
    state.stabilityFactor < cond.minStabilityFactor
  )
    return false;
  if (cond.minSectorCount != null && state.sectorCount < cond.minSectorCount)
    return false;
  if (
    cond.minPositionCount != null &&
    state.positionCount < cond.minPositionCount
  )
    return false;
  if (
    cond.maxAvgVolatilityChasing != null &&
    state.avgVolatilityChasing > cond.maxAvgVolatilityChasing
  )
    return false;
  return true;
}

/**
 * Match missions for a user based on their state.
 * Skips missions already assigned.
 */
export function matchMissions(
  missions: MissionDefinition[],
  state: UserState,
): MatchedMission[] {
  const matched: MatchedMission[] = [];

  for (const mission of missions) {
    if (state.assignedMissionCodes.has(mission.code)) continue;
    const cond = mission.condition;
    if (matchesMissionCondition(state, cond)) {
      matched.push({ missionId: mission.id, missionCode: mission.code });
    }
  }

  return matched;
}
