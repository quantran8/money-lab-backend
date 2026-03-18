import type { Job, JobLevel } from '@prisma/client';

/**
 * Resolves overtime income and HI penalty for the player's current job level.
 * Job-level overrides fall back to base Job when null.
 *
 * @param job - Base job row
 * @param level - Current JobLevel row or null
 * @returns incomePerUnit (money gained when accepting OT), healthPenalty (HI delta, typically negative)
 */
export function resolveOvertimeEffectsFromJobLevel(
  job: Pick<Job, 'overtimeIncomePerUnit' | 'overtimeHealthPenalty'>,
  level: Pick<
    JobLevel,
    'overtimeIncomePerUnit' | 'overtimeHealthPenalty'
  > | null,
): { incomePerUnit: number; healthPenalty: number } {
  const incomePerUnit =
    level?.overtimeIncomePerUnit != null
      ? Number(level.overtimeIncomePerUnit)
      : Number(job.overtimeIncomePerUnit ?? 0);
  const healthPenalty =
    level?.overtimeHealthPenalty != null
      ? Number(level.overtimeHealthPenalty)
      : Number(job.overtimeHealthPenalty ?? 0);
  return { incomePerUnit, healthPenalty };
}

/**
 * True if the option is the "accept overtime" choice (lowest sortOrder on template).
 */
export function isOvertimeAcceptOption(
  sortedOptionIds: bigint[],
  chosenOptionId: bigint,
): boolean {
  if (sortedOptionIds.length === 0) return false;
  return chosenOptionId === sortedOptionIds[0];
}
