/** Module id for budget-simulation (used to load module.config at init). */
export const BUDGET_SIMULATION_MODULE_ID = 3;

/** Budget month event lane: life (LQI-weighted pool). */
export const EVENT_SOURCE_LIFE = 'life';

/** Budget month event lane: work (OT — no LQI). */
export const EVENT_SOURCE_WORK = 'work';

export const EVENT_SUBTYPE_OVERTIME = 'overtime';

/** Number of weeks in a month. */
export const NUMBER_OF_WEEKS_PER_MONTH = 4;

export const WEEK_INDEX_COMPLETE_MONTH = 5;

/** Maximum number of total events per week. */
export const MAX_EVENTS_PER_WEEK = 1;

export const RUN_MONTH_INDEX_COMPLETE = 6;

/** Week number for the end of the month. */
export const END_OF_MONTH_WEEK = NUMBER_OF_WEEKS_PER_MONTH;

export const BILL_RESERVE_OPTIONS = [
  { code: 'none', coveragePct: 0, label: 'None' },
  { code: 'half', coveragePct: 50, label: 'Half' },
  { code: 'high', coveragePct: 75, label: 'High' },
  { code: 'full', coveragePct: 100, label: 'Full' },
] as const;

/** Returns bill reserve coverage percentage for a given option code. */
export function getBillReserveCoveragePct(code: string): number {
  const option = BILL_RESERVE_OPTIONS.find((x) => x.code === code);
  if (!option) throw new Error(`Invalid bill_reserve_option_code: ${code}`);
  return option.coveragePct;
}

export const SPEND_MODE_OPTIONS = [
  { code: 'enjoy', rate: 1.0, label: 'Enjoy' },
  { code: 'normal', rate: 0.85, label: 'Normal' },
  { code: 'save', rate: 0.7, label: 'Save' },
] as const;

export const FREE_CASH_CODE = 'free_cash';

// --- Game Defaults ---

/** Default HI/LQI value when no prior index data exists. */
export const DEFAULT_HI_START = 60;
export const DEFAULT_LQI_START = 60;

/** Fallback HI/LQI value when index resolution exists but fields are null. */
export const DEFAULT_HI_FALLBACK = 50;

/** Default job level for new job states. */
export const DEFAULT_JOB_LEVEL = 1;

/** Default XP for new job states. */
export const DEFAULT_JOB_XP = 0;

/** First month index when starting a new run. */
export const FIRST_MONTH_INDEX = 1;

// --- Forced Rest ---

/** HI recovery amount when forced rest is triggered. */
export const FORCED_REST_HI_RECOVERY = 5;

// --- Index Calculator ---

/** Fun spend threshold for full recovery bonus (>= this → full bonus). */
export const FUN_SPEND_THRESHOLD_FULL = 75;

/** Fun spend threshold for half recovery bonus (>= this → half bonus). */
export const FUN_SPEND_THRESHOLD_HALF = 25;

/** Full fun recovery bonus multiplier. */
export const FUN_BONUS_FULL = 1;

/** Half fun recovery bonus multiplier. */
export const FUN_BONUS_HALF = 0.5;

/** Percentage divisor for recovery efficiency. */
export const RECOVERY_EFFICIENCY_DIVISOR = 100;

// --- HI Efficiency Thresholds (Learning XP) ---

/** HI threshold for high efficiency (>= this → high). */
export const HI_EFFICIENCY_HIGH_THRESHOLD = 70;

/** HI threshold for mid efficiency (>= this → mid). */
export const HI_EFFICIENCY_MID_THRESHOLD = 40;

// --- Event Spawn ---

/** Default spawn probability for shouldSpawn(). */
export const DEFAULT_SPAWN_PROBABILITY = 0.5;

/** Max spawn probability clamp. */
export const MAX_SPAWN_PROBABILITY = 1;

/** Base rarity weight for event template selection (weight = this - rarity). */
export const RARITY_WEIGHT_BASE = 11;

/** Number of months to look back for event deduplication. */
export const EVENT_DEDUP_LOOKBACK_MONTHS = 5;

// --- Bill Variance ---

/** Normal month bill variance center offset. */
export const BILL_VARIANCE_CENTER = 0.5;

/** Normal month bill variance range. */
export const BILL_VARIANCE_RANGE = 0.1;

// --- Learning Tier Thresholds (for auto-spend labels) ---

export const LEARNING_TIER_MICRO_MAX = 30;
export const LEARNING_TIER_BASIC_MAX = 100;
export const LEARNING_TIER_COURSE_MAX = 200;

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
  progressionSystem: {
    jobLevels: {
      levels: Array<{
        level: number;
        learningCapModifier: number;
      }>;
    };
    learningXp: {
      xpRate: number;
      baseCap: number;
      hiEfficiency: {
        low: number;
        mid: number;
        high: number;
      };
      reducedXpRate: number;
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
    progressionSystem: {
      jobLevels: {
        levels: [
          { level: 1, learningCapModifier: 1 },
          { level: 2, learningCapModifier: 1.05 },
          { level: 3, learningCapModifier: 1.1 },
        ],
      },
      learningXp: {
        xpRate: 0.8,
        baseCap: 100,
        hiEfficiency: { low: 0.75, mid: 0.9, high: 1 },
        reducedXpRate: 0.3,
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
    progressionSystem: {
      ...DEFAULT_BUDGET_SIMULATION_MODULE_CONFIG.progressionSystem,
      ...mapped.progressionSystem,
      jobLevels: {
        ...DEFAULT_BUDGET_SIMULATION_MODULE_CONFIG.progressionSystem?.jobLevels,
        ...mapped.progressionSystem?.jobLevels,
        levels:
          mapped.progressionSystem?.jobLevels?.levels ??
          DEFAULT_BUDGET_SIMULATION_MODULE_CONFIG.progressionSystem.jobLevels
            .levels,
      },
      learningXp: {
        ...DEFAULT_BUDGET_SIMULATION_MODULE_CONFIG.progressionSystem
          ?.learningXp,
        ...mapped.progressionSystem?.learningXp,
        hiEfficiency: {
          ...DEFAULT_BUDGET_SIMULATION_MODULE_CONFIG.progressionSystem
            ?.learningXp?.hiEfficiency,
          ...mapped.progressionSystem?.learningXp?.hiEfficiency,
        },
      },
    },
  };
}
