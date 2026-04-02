import type { Job, JobLevel } from '@prisma/client';

export interface CalculateMonthIncomeParams {
  job: Pick<Job, 'baseMonthlyIncome'>;
  jobLevel: Pick<JobLevel, 'incomeMultiplier'> | null;
  /** Sum of deferred OT from previous month (BUDGET_RUN_MONTHS.overtime_income_earned). */
  previousMonthOvertimeIncomeEarned: number;
}

/**
 * Resolved base monthly income: JOBS.base_monthly_income × JOB_LEVELS.income_multiplier.
 * Rounded to integer cents/units.
 */
export function resolveBaseJobIncome(
  job: Pick<Job, 'baseMonthlyIncome'>,
  jobLevel: Pick<JobLevel, 'incomeMultiplier'> | null,
): number {
  const multiplier = Number(jobLevel?.incomeMultiplier ?? 1);
  return Math.round(Number(job.baseMonthlyIncome) * multiplier);
}

/**
 * Next month BUDGET_RUN_MONTHS.income = resolved base + previous month's overtime_income_earned.
 */
export function calculateMonthIncome(
  params: CalculateMonthIncomeParams,
): number {
  const base = resolveBaseJobIncome(params.job, params.jobLevel);
  return base + Math.max(0, params.previousMonthOvertimeIncomeEarned);
}

export interface OvertimeChoiceResolutionInput {
  isAccept: boolean;
  resolvedOvertimeIncomePerUnit: number;
}

/**
 * Side effects for OT choice (caller persists): accept → +1 accepted count, +income to overtime_income_earned; skip → no change.
 */
export function resolveOvertimeChoicePersistence(
  input: OvertimeChoiceResolutionInput,
): { acceptedDelta: number; overtimeIncomeEarnedDelta: number } {
  if (!input.isAccept) {
    return { acceptedDelta: 0, overtimeIncomeEarnedDelta: 0 };
  }
  return {
    acceptedDelta: 1,
    overtimeIncomeEarnedDelta: input.resolvedOvertimeIncomePerUnit,
  };
}
