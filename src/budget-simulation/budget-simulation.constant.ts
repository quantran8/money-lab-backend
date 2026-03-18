/** Module id for budget-simulation (used to load module.config at init). */
export const BUDGET_SIMULATION_MODULE_ID = 3;

/** Budget month event lane: life (LQI-weighted pool). */
export const EVENT_SOURCE_LIFE = 'life';

/** Budget month event lane: work (OT — no LQI). */
export const EVENT_SOURCE_WORK = 'work';

export const EVENT_SUBTYPE_OVERTIME = 'overtime';

/** Number of weeks in a month. */
export const NUMBER_OF_WEEKS_PER_MONTH = 4;

/** Week number for the end of the month. */
export const END_OF_MONTH_WEEK = NUMBER_OF_WEEKS_PER_MONTH;

export const BILL_RESERVE_OPTIONS = [
  { code: 'none', coveragePct: 0, label: '0%' },
  { code: 'half', coveragePct: 50, label: '50%' },
  { code: 'high', coveragePct: 75, label: '75%' },
  { code: 'full', coveragePct: 100, label: '100%' },
] as const;

export const SPEND_MODE_OPTIONS = [
  { code: 'enjoy', rate: 1.0, label: 'Enjoy' },
  { code: 'normal', rate: 0.85, label: 'Normal' },
  { code: 'save', rate: 0.7, label: 'Save' },
] as const;

export const FREE_CASH_CODE = 'free_cash';

/** Shape of module.config for budget-simulation (camelCase). */
export interface BudgetSimulationModuleConfig {
  indexRules: {
    hiCap: number;
    hiFloor: number;
    lqiFloor: number;
    lqiCap: number;
    stressMode: {
      maxEventCountPerMonth?: number;
      maxForcedRestPerMonth?: number;
    };
    lqiThresholds: {
      stableMin: number;
      strainedMax: number;
      compressedMax: number;
      compressedMin: number;
    };
    baselineHiRecovery: number;
    recoveryEfficiencyPct: {
      stable: { fun: number; baseline: number };
      strained: { fun: number; baseline: number };
      compressed: { fun: number; baseline: number };
    };
  };
}

/** Default budget-simulation module config in camelCase (for fallback). */
export const DEFAULT_BUDGET_SIMULATION_MODULE_CONFIG: BudgetSimulationModuleConfig =
  {
    indexRules: {
      hiCap: 100,
      hiFloor: 40,
      lqiFloor: 0,
      lqiCap: 100,
      stressMode: {
        maxEventCountPerMonth: 1,
        maxForcedRestPerMonth: 4,
      },
      lqiThresholds: {
        stableMin: 60,
        strainedMax: 39,
        compressedMax: 59,
        compressedMin: 40,
      },
      baselineHiRecovery: 10,
      recoveryEfficiencyPct: {
        stable: { fun: 100, baseline: 100 },
        strained: { fun: 70, baseline: 80 },
        compressed: { fun: 85, baseline: 90 },
      },
    },
  };

/**
 * Parses raw module.config (snake_case from DB) into camelCase config.
 * Merges with defaults so all optional fields have values.
 */
export function getBudgetSimulationModuleConfig(
  raw: unknown,
): BudgetSimulationModuleConfig {
  const mapped = raw as BudgetSimulationModuleConfig;
  return {
    indexRules: {
      ...DEFAULT_BUDGET_SIMULATION_MODULE_CONFIG.indexRules,
      ...mapped.indexRules,
      stressMode: {
        ...DEFAULT_BUDGET_SIMULATION_MODULE_CONFIG.indexRules?.stressMode,
        ...mapped.indexRules?.stressMode,
      },
      lqiThresholds: {
        ...DEFAULT_BUDGET_SIMULATION_MODULE_CONFIG.indexRules?.lqiThresholds,
        ...mapped.indexRules?.lqiThresholds,
      },
      recoveryEfficiencyPct: {
        ...DEFAULT_BUDGET_SIMULATION_MODULE_CONFIG.indexRules
          ?.recoveryEfficiencyPct,
        ...mapped.indexRules?.recoveryEfficiencyPct,
        stable: {
          ...DEFAULT_BUDGET_SIMULATION_MODULE_CONFIG.indexRules
            ?.recoveryEfficiencyPct?.stable,
          ...mapped.indexRules?.recoveryEfficiencyPct?.stable,
        },
        strained: {
          ...DEFAULT_BUDGET_SIMULATION_MODULE_CONFIG.indexRules
            ?.recoveryEfficiencyPct?.strained,
          ...mapped.indexRules?.recoveryEfficiencyPct?.strained,
        },
        compressed: {
          ...DEFAULT_BUDGET_SIMULATION_MODULE_CONFIG.indexRules
            ?.recoveryEfficiencyPct?.compressed,
          ...mapped.indexRules?.recoveryEfficiencyPct?.compressed,
        },
      },
    },
  };
}
