import { genAutoSpendLabel } from '../../budget-simulation.helpers';
import { JarCode } from '../../budget-simulation.enum';

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

export interface WeeklySpendInput {
  jars: JarState[];
  spendModeRate: number;
  spendModeCode: string;
  monthIndex: number;
  nextWeek: number;
  budgetRunId: string;
  monthId: string;
}

export interface WeeklySpendResult {
  entries: WeeklySpendEntry[];
  weeklySpend: WeeklySpendSummary;
  spendOps: SpendOp[];
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
  jars: { jarCode: string; allocated: number; spent: number; overflowIn: number; overflowOut: number }[],
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

const CORE_JAR_CODES = [JarCode.fun, JarCode.learning, JarCode.give] as string[];
const WEEKS_PER_MONTH = 4;

/**
 * Computes weekly jar spend in memory. Returns entries for response and spend ops for writes.
 * Pure: no DB, no I/O.
 */
export function computeWeeklySpend(input: WeeklySpendInput): WeeklySpendResult {
  const { jars, spendModeRate, spendModeCode, monthIndex, nextWeek, budgetRunId, monthId } = input;
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
        `${budgetRunId}:${monthId}:${jar}`,
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

  return { entries, weeklySpend, spendOps };
}
