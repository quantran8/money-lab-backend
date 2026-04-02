import { genAutoSpendLabel } from '../../budget-simulation.helpers';
import { JarCode } from '../../budget-simulation.enum';
import {
  type BudgetSimulationModuleConfig,
  NUMBER_OF_WEEKS_PER_MONTH,
  HI_EFFICIENCY_HIGH_THRESHOLD,
  HI_EFFICIENCY_MID_THRESHOLD,
} from '../../budget-simulation.constant';

export type JarState = {
  jarCode: string;
  allocated: number;
  spent: number;
  overflowIn: number;
  overflowOut: number;
};

export type WeeklySpendEntry = {
  type: string;
  jar: string;
  amount: number;
  jarBalance: number;
  label: string;
};

export type WeeklySpendSummary = {
  fun: number;
  learning: number;
  give: number;
};

export type SpendOp = { jarCode: string; amount: number };

export interface LearningXpInput {
  learningSpend: number;
  playerHI: number;
  currentJobLevel: number;
  config: BudgetSimulationModuleConfig;
}

export interface LearningXpResult {
  xpGained: number;
  /** XP earned from learning spend within the soft cap (full rate). */
  xpByCap: number;
  /** XP earned from learning spend exceeding the soft cap (reduced rate). */
  xpByOverflowCap: number;
  learningCap: number;
  hiEfficiency: number;
}

/**
 * Resolves HI efficiency multiplier from player's current HI.
 * HI >= 70 → high; 40 ≤ HI < 70 → mid; HI < 40 → low.
 * Pure: no I/O.
 */
export function getHiEfficiency(
  playerHI: number,
  config: BudgetSimulationModuleConfig,
): number {
  const eff = config.progressionSystem.learningXp.hiEfficiency;
  if (playerHI >= HI_EFFICIENCY_HIGH_THRESHOLD) return eff.high;
  if (playerHI >= HI_EFFICIENCY_MID_THRESHOLD) return eff.mid;
  return eff.low;
}

/**
 * Computes learning XP gained from weekly learning jar spend.
 * Applies soft cap: spend up to learningCap earns full xpRate,
 * spend beyond cap earns reducedXpRate.
 * Pure: no I/O.
 */
export function computeLearningXp(input: LearningXpInput): LearningXpResult {
  const { learningSpend, playerHI, currentJobLevel, config } = input;
  const { learningXp, jobLevels } = config.progressionSystem;

  const levelRow = jobLevels.levels.find((l) => l.level === currentJobLevel);
  const jobModifier = levelRow?.learningCapModifier ?? 1;
  const hiEfficiency = getHiEfficiency(playerHI, config);

  const learningCap = learningXp.baseCap * jobModifier * hiEfficiency;

  const cappedSpend = Math.min(learningSpend, learningCap);
  const overflowSpend = Math.max(0, learningSpend - learningCap);

  const xpByCap = Math.round(cappedSpend * learningXp.xpRate);
  const xpByOverflowCap = Math.round(overflowSpend * learningXp.reducedXpRate);
  const xpGained = xpByCap + xpByOverflowCap;

  return { xpGained, xpByCap, xpByOverflowCap, learningCap, hiEfficiency };
}

export interface WeeklySpendInput {
  jars: JarState[];
  spendModeRate: number;
  spendModeCode: string;
  monthIndex: number;
  nextWeek: number;
  runId: string;
  monthId: string;
  /** Required for learning XP calculation. */
  playerHI: number;
  currentJobLevel: number;
  config: BudgetSimulationModuleConfig;
}

export interface WeeklySpendResult {
  entries: WeeklySpendEntry[];
  weeklySpend: WeeklySpendSummary;
  spendOps: SpendOp[];
  learningXpDelta: number;
  /** XP breakdown: earned within the learning soft cap. */
  learningXpByCap: number;
  /** XP breakdown: earned beyond the learning soft cap. */
  learningXpByOverflowCap: number;
}

/**
 * Available amount for a jar from allocated, spent, overflow (pure).
 */
export function jarAvailable(
  allocated: number,
  spent: number,
  overflowIn: number,
  overflowOut: number,
): number {
  return Math.max(0, allocated - spent + overflowIn - overflowOut);
}

/**
 * Builds jarCode -> available amount from month freeCash and jar states (pure).
 */
export function buildJarAvailableMap(
  freeCash: number,
  jars: {
    jarCode: string;
    allocated: number;
    spent: number;
    overflowIn: number;
    overflowOut: number;
  }[],
): Map<string, number> {
  const map = new Map<string, number>();
  map.set('free_cash', Math.max(0, freeCash));
  for (const j of jars) {
    map.set(
      j.jarCode,
      jarAvailable(j.allocated, j.spent, j.overflowIn, j.overflowOut),
    );
  }
  return map;
}

const CORE_JAR_CODES = [
  JarCode.fun,
  JarCode.learning,
  JarCode.give,
] as string[];
const WEEKS_PER_MONTH = NUMBER_OF_WEEKS_PER_MONTH;

/**
 * Computes weekly jar spend in memory. Returns entries for response and spend ops for writes.
 * Pure: no DB, no I/O.
 */
export function computeWeeklySpend(input: WeeklySpendInput): WeeklySpendResult {
  const {
    jars,
    spendModeRate,
    spendModeCode,
    monthIndex,
    nextWeek,
    runId,
    monthId,
    playerHI,
    currentJobLevel,
    config,
  } = input;
  const coreJars = jars.filter((j) => CORE_JAR_CODES.includes(j.jarCode));

  const state = new Map<string, JarState>();
  for (const j of coreJars) {
    state.set(j.jarCode, { ...j });
  }

  const entries: WeeklySpendEntry[] = [];
  const weeklySpend: WeeklySpendSummary = { fun: 0, learning: 0, give: 0 };
  const spendOps: SpendOp[] = [];

  for (const jarEntry of coreJars) {
    const jar = jarEntry.jarCode;
    const maxMonthAvailable = Math.round(jarEntry.allocated * spendModeRate);
    const weeklyAmount = Math.floor(maxMonthAvailable / WEEKS_PER_MONTH);
    if (weeklyAmount <= 0) continue;

    const s = state.get(jar)!;
    const available = jarAvailable(
      s.allocated,
      s.spent,
      s.overflowIn,
      s.overflowOut,
    );
    const spentAmount = Math.min(available, weeklyAmount);
    const jarBalance = available - spentAmount;

    if (spentAmount > 0) {
      s.spent += spentAmount;
      spendOps.push({ jarCode: jar, amount: spentAmount });
      const weekGlobal = (monthIndex - 1) * WEEKS_PER_MONTH + nextWeek;
      const label = genAutoSpendLabel(
        `${runId}:${monthId}:${jar}`,
        jar,
        spentAmount,
        spendModeCode,
        weekGlobal,
      );
      entries.push({
        type: 'auto_spend',
        jar,
        amount: spentAmount,
        jarBalance,
        label,
      });
      if (jar === JarCode.fun) weeklySpend.fun += spentAmount;
      if (jar === JarCode.learning) weeklySpend.learning += spentAmount;
      if (jar === JarCode.give) weeklySpend.give += spentAmount;
    }
  }

  const { xpGained, xpByCap, xpByOverflowCap } = computeLearningXp({
    learningSpend: weeklySpend.learning,
    playerHI,
    currentJobLevel,
    config,
  });

  return {
    entries,
    weeklySpend,
    spendOps,
    learningXpDelta: xpGained,
    learningXpByCap: xpByCap,
    learningXpByOverflowCap: xpByOverflowCap,
  };
}

// --- Job Progress ---

export interface JobProgressInput {
  /** XP before this week's gain. */
  currentXp: number;
  /** Total XP gained this week (auto-spend + event). */
  xpDelta: number;
  /** XP from learning spend within the soft cap (full rate). */
  xpByCap: number;
  /** XP from learning spend exceeding the soft cap (reduced rate). */
  xpByOverflowCap: number;
  currentLevel: number;
  /** All job levels sorted by level ascending, each with xpRequiredTotal. */
  levels: Array<{ level: number; xpRequiredTotal: number }>;
}

export interface JobProgressResult {
  /** XP earned within the learning soft cap (full rate). */
  xpByCap: number;
  /** XP earned beyond the learning soft cap (reduced rate). */
  xpByOverflowCap: number;
  /** Total XP after applying this week's gain. */
  xpAfter: number;
  /** Current job level. */
  currentLevel: number;
  /** XP required to reach the next level (null if already at max level). */
  xpRequiredForNextLevel: number | null;
}

/**
 * Computes job progress breakdown after XP gain.
 * Pure: no I/O.
 */
export function computeJobProgress(input: JobProgressInput): JobProgressResult {
  const { currentXp, xpDelta, xpByCap, xpByOverflowCap, currentLevel, levels } =
    input;
  const xpAfter = Math.max(0, currentXp + xpDelta);

  const sorted = [...levels].sort((a, b) => a.level - b.level);
  const nextLevelRow = sorted.find((l) => l.level > currentLevel);
  const xpRequiredForNextLevel = nextLevelRow?.xpRequiredTotal ?? null;

  return {
    xpByCap,
    xpByOverflowCap,
    xpAfter,
    currentLevel,
    xpRequiredForNextLevel,
  };
}
