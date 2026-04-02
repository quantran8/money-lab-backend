import {
  type BudgetSimulationModuleConfig,
  NUMBER_OF_WEEKS_PER_MONTH,
  FUN_SPEND_THRESHOLD_FULL,
  FUN_SPEND_THRESHOLD_HALF,
  FUN_BONUS_FULL,
  FUN_BONUS_HALF,
  RECOVERY_EFFICIENCY_DIVISOR,
} from '../../budget-simulation.constant';
import {
  clampHi,
  clampLqi,
  resolveLqiState,
} from '../../budget-simulation.helpers';

export type LqiStateType = 'stable' | 'compressed' | 'strained';

export type WeeklyIndexProgressItem = {
  hiStart: number;
  hiEnd: number;
  hiNetChange: number;
  lqiStart: number;
  lqiEnd: number;
  lqiNetChange: number;
  lqiStateStart: string;
  lqiStateEnd: string;
  baselineRecovery: number;
  funRecoveryBonus: number;
  jobDrain: number;
  eventHiEffectTotal: number;
  eventLqiEffectTotal: number;
  stressEffect: number;
  baselineRecoveryEfficiencyPct: number;
  funRecoveryEfficiencyPct: number;
  forcedRestTriggered: boolean;
  incomeLossFromForcedRest: number;
  hiRecoveryFromForcedRest: number;
};

export interface RecoveryEfficiencyResult {
  baselinePct: number;
  funPct: number;
}

export interface WeeklyIndexInput {
  config: BudgetSimulationModuleConfig;
  hiStart: number;
  lqiStart: number;
  weeklySpend: { fun: number; learning: number; give: number };
  weeklyJobDrain: number;
  eventHealthDeltaTotal: number;
  eventLqiDeltaTotal: number;
  forcedRestRecovery: number;
  forcedRestIncomeLoss?: number;
}

export interface WeeklyIndexResult {
  hiEnd: number;
  lqiEnd: number;
  lqiStateEnd: string;
  weeklyProgress: WeeklyIndexProgressItem;
}

/**
 * Returns baseline and fun efficiency (0-100) for a LQI state from config.
 */
export function getRecoveryEfficiencyForState(
  config: BudgetSimulationModuleConfig,
  state: LqiStateType,
): RecoveryEfficiencyResult {
  const rep = config.indexRules?.recoveryEfficiencyPct;
  const s = rep?.[state];
  return {
    baselinePct: s?.baseline ?? 100,
    funPct: s?.fun ?? 100,
  };
}

/**
 * Computes weekly index resolution: HI/LQI end values and weekly progress payload.
 * Does not persist; caller is responsible for writing.
 */
export function resolveWeek(input: WeeklyIndexInput): WeeklyIndexResult {
  const {
    config,
    hiStart,
    lqiStart,
    weeklySpend,
    weeklyJobDrain,
    eventHealthDeltaTotal,
    eventLqiDeltaTotal,
    forcedRestRecovery,
    forcedRestIncomeLoss = 0,
  } = input;

  const lqiStateStart = resolveLqiState(lqiStart, config) as LqiStateType;
  const { baselinePct, funPct } = getRecoveryEfficiencyForState(
    config,
    lqiStateStart,
  );

  const weeklyBaselineRecovery = Math.round(
    (config.indexRules.baselineHiRecovery ?? 10) / NUMBER_OF_WEEKS_PER_MONTH,
  );

  let funBonusRaw = 0;
  if (weeklySpend.fun >= FUN_SPEND_THRESHOLD_FULL) funBonusRaw = FUN_BONUS_FULL;
  else if (weeklySpend.fun >= FUN_SPEND_THRESHOLD_HALF)
    funBonusRaw = FUN_BONUS_HALF;
  const weeklyFunRecoveryBonus = Math.round(
    funBonusRaw * (funPct / RECOVERY_EFFICIENCY_DIVISOR),
  );
  const stressEffect = 0;

  const hiNetChange =
    weeklyBaselineRecovery +
    weeklyFunRecoveryBonus -
    weeklyJobDrain +
    eventHealthDeltaTotal -
    stressEffect +
    forcedRestRecovery;
  const lqiNetChange = eventLqiDeltaTotal;

  const hiEnd = clampHi(hiStart + hiNetChange, config);
  const lqiEnd = clampLqi(lqiStart + lqiNetChange, config);
  const lqiStateEnd = resolveLqiState(lqiEnd, config);

  const weeklyProgress: WeeklyIndexProgressItem = {
    hiStart,
    hiEnd,
    hiNetChange,
    lqiStart,
    lqiEnd,
    lqiNetChange,
    lqiStateStart,
    lqiStateEnd,
    baselineRecovery: weeklyBaselineRecovery,
    funRecoveryBonus: weeklyFunRecoveryBonus,
    jobDrain: weeklyJobDrain,
    eventHiEffectTotal: eventHealthDeltaTotal,
    eventLqiEffectTotal: eventLqiDeltaTotal,
    stressEffect,
    baselineRecoveryEfficiencyPct: baselinePct,
    funRecoveryEfficiencyPct: funPct,
    forcedRestTriggered: forcedRestRecovery > 0,
    incomeLossFromForcedRest: forcedRestIncomeLoss,
    hiRecoveryFromForcedRest: forcedRestRecovery,
  };

  return { hiEnd, lqiEnd, lqiStateEnd, weeklyProgress };
}
