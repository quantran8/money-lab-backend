/**
 * Pure run analysis domain.
 * No I/O, no DB, no NestJS — all inputs passed in, all outputs returned.
 */

// ── Input types ──────────────────────────────────────────────────

export interface AnalyzeMonthJar {
  jarCode: string;
  allocatedAmount: number;
  spentAmount: number;
  overflowInAmount: number;
  overflowOutAmount: number;
}

export interface AnalyzeMonthIndex {
  hiStart: number;
  hiEnd: number | null;
  lqiStart: number;
  lqiEnd: number | null;
  lqiStateEnd: string | null;
}

export interface AnalyzeMonthBill {
  shortfallTotal: number;
  surplusToFreeCash: number;
  billReserveEnd: number;
}

export interface AnalyzeMonthEvent {
  eventSource: string;
  eventSubtype: string | null;
  chosenOptionId: bigint | null;
  option: { healthDelta: number; lqiDelta: number } | null;
}

export interface AnalyzeMonthInput {
  monthIndex: number;
  income: number;
  lockedCommitmentsTotal: number;
  billsEstimated: number;
  billsActual: number | null;
  freeCash: number;
  cumulativeFutureYou: number;
  stressModeActive: boolean;
  structuralOvercommitmentOccurred: boolean;
  overtimeIncomeEarned: number;
  jars: AnalyzeMonthJar[];
  indexResolution: AnalyzeMonthIndex | null;
  billResolution: AnalyzeMonthBill | null;
  events: AnalyzeMonthEvent[];
}

export interface AnalyzeRunInput {
  runId: number;
  moduleId: number;
  jobName: string | null;
  months: AnalyzeMonthInput[];
  totalMonths: number;
  finalFutureYouSavings: number;
}

// ── Output types ─────────────────────────────────────────────────

export interface RunOverview {
  monthsCompleted: number;
  job: string | null;
  averageIncome: number;
  stressEventCount: number;
  structuralLoadAvg: number;
  lqiState: string;
  module3Unlocked: boolean;
  summary: string;
}

export interface IndicesSection {
  months: string[];
  lqiSeries: number[];
  hiSeries: number[];
  finalLqi: number;
  finalHi: number;
  lqiTrend: 'stable' | 'rising' | 'falling';
  hiTrend: 'stable' | 'rising' | 'falling';
  lqiInsight: string;
  hiInsight: string;
}

export interface FutureYouSection {
  series: number[];
  total: number;
  insight: string;
}

export interface StructuralLoadSection {
  average: number;
  insight: string;
}

export interface AllocationSection {
  categories: string[];
  values: number[];
  insight: string;
}

export interface FinancialsSection {
  futureYou: FutureYouSection;
  structuralLoad: StructuralLoadSection;
  allocation: AllocationSection;
}

export interface AbsorptionDistribution {
  billReserve: number;
  fun: number;
  learning: number;
  freeCash: number;
}

export interface VolatilitySection {
  overcommitmentCount: number;
  varianceMonths: number;
  absorptionDistribution: AbsorptionDistribution;
  insight: string;
}

export interface KeyMoment {
  type: string;
  month: number;
  value?: number;
  description: string;
}

export interface FinalState {
  finalSavings: number;
  finalFreeCash: number;
  stability: 'stable' | 'moderate' | 'unstable';
  summary: string;
}

export interface RunAnalysisResult {
  overview: RunOverview;
  indices: IndicesSection;
  financials: FinancialsSection;
  volatility: VolatilitySection;
  keyMoments: KeyMoment[];
  finalState: FinalState;
}

// ── Constants ────────────────────────────────────────────────────

const JAR_FUN = 'fun';
const JAR_LEARNING = 'learning';
const JAR_GIVING = 'give';
const JAR_FUTURE = 'future_you';

const BUDGET_SIMULATION_MODULE_ID = 3;
const TREND_SLOPE_THRESHOLD = 1.5; // pts/month to call rising/falling

// ── Helpers ──────────────────────────────────────────────────────

function jarAllocated(jars: AnalyzeMonthJar[], code: string): number {
  return jars.find((j) => j.jarCode === code)?.allocatedAmount ?? 0;
}

function jarSpent(jars: AnalyzeMonthJar[], code: string): number {
  return jars.find((j) => j.jarCode === code)?.spentAmount ?? 0;
}

/**
 * Linear regression slope (pts per step) over a value series.
 * Returns 0 for series shorter than 2.
 */
function slope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (values[i] - meanY);
    den += (i - meanX) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

function trendLabel(values: number[]): 'stable' | 'rising' | 'falling' {
  const s = slope(values);
  if (s > TREND_SLOPE_THRESHOLD) return 'rising';
  if (s < -TREND_SLOPE_THRESHOLD) return 'falling';
  return 'stable';
}

function structuralLoadAvg(months: AnalyzeMonthInput[]): number {
  const values = months
    .filter((m) => m.income > 0)
    .map((m) => (m.lockedCommitmentsTotal + m.billsEstimated) / m.income);
  if (values.length === 0) return 0;
  return parseFloat(
    (values.reduce((s, v) => s + v, 0) / values.length).toFixed(4),
  );
}

// ── Main analyzer ────────────────────────────────────────────────

export function analyzeRun(input: AnalyzeRunInput): RunAnalysisResult {
  const { months, jobName, finalFutureYouSavings, moduleId } = input;

  // ── Shared pre-computations ──────────────────────────────────
  const avgMonthlyIncome =
    months.length > 0
      ? Math.round(months.reduce((s, m) => s + m.income, 0) / months.length)
      : 0;

  const stressEventCount = months.filter((m) => m.stressModeActive).length;
  const loadAvg = structuralLoadAvg(months);

  const lastMonth = months[months.length - 1] ?? null;
  const finalLqiState =
    lastMonth?.indexResolution?.lqiStateEnd ??
    lastMonth?.indexResolution?.lqiStart?.toString() ??
    'stable';

  const lqiValues = months.map(
    (m) => m.indexResolution?.lqiEnd ?? m.indexResolution?.lqiStart ?? 50,
  );
  const hiValues = months.map(
    (m) => m.indexResolution?.hiEnd ?? m.indexResolution?.hiStart ?? 50,
  );

  const lqiTrend = trendLabel(lqiValues);
  const hiTrend = trendLabel(hiValues);

  const finalLqi = lqiValues[lqiValues.length - 1] ?? 50;
  const finalHi = hiValues[hiValues.length - 1] ?? 50;

  const overcommitmentCount = months.filter(
    (m) => m.structuralOvercommitmentOccurred,
  ).length;
  const varianceMonths = months.filter(
    (m) => m.billResolution != null && m.billResolution.shortfallTotal > 0,
  ).length;

  // ── 1. Overview ──────────────────────────────────────────────
  const overviewSummary = buildOverviewSummary(
    stressEventCount,
    loadAvg,
    lqiTrend,
    months.length,
  );

  const overview: RunOverview = {
    monthsCompleted: months.length,
    job: jobName,
    averageIncome: avgMonthlyIncome,
    stressEventCount,
    structuralLoadAvg: loadAvg,
    lqiState: finalLqiState,
    module3Unlocked: moduleId === BUDGET_SIMULATION_MODULE_ID,
    summary: overviewSummary,
  };

  // ── 2. Indices ───────────────────────────────────────────────
  const indices: IndicesSection = {
    months: months.map((m) => `M${m.monthIndex}`),
    lqiSeries: lqiValues,
    hiSeries: hiValues,
    finalLqi,
    finalHi,
    lqiTrend,
    hiTrend,
    lqiInsight: buildLqiInsight(lqiTrend, lqiValues),
    hiInsight: buildHiInsight(hiTrend, hiValues),
  };

  // ── 3. Financials ────────────────────────────────────────────
  const futureSeries = months.map((m) => m.cumulativeFutureYou);

  const allocPcts = months
    .filter((m) => m.income > 0)
    .map((m) => ({
      fun: jarAllocated(m.jars, JAR_FUN) / m.income,
      learning: jarAllocated(m.jars, JAR_LEARNING) / m.income,
      giving: jarAllocated(m.jars, JAR_GIVING) / m.income,
      future: jarAllocated(m.jars, JAR_FUTURE) / m.income,
    }));

  const avgAlloc =
    allocPcts.length > 0
      ? {
          fun: parseFloat(
            (
              allocPcts.reduce((s, v) => s + v.fun, 0) / allocPcts.length
            ).toFixed(4),
          ),
          learning: parseFloat(
            (
              allocPcts.reduce((s, v) => s + v.learning, 0) / allocPcts.length
            ).toFixed(4),
          ),
          giving: parseFloat(
            (
              allocPcts.reduce((s, v) => s + v.giving, 0) / allocPcts.length
            ).toFixed(4),
          ),
          future: parseFloat(
            (
              allocPcts.reduce((s, v) => s + v.future, 0) / allocPcts.length
            ).toFixed(4),
          ),
        }
      : { fun: 0, learning: 0, giving: 0, future: 0 };

  const financials: FinancialsSection = {
    futureYou: {
      series: futureSeries,
      total: finalFutureYouSavings,
      insight: buildFutureYouInsight(
        finalFutureYouSavings,
        avgMonthlyIncome,
        months.length,
      ),
    },
    structuralLoad: {
      average: loadAvg,
      insight: buildStructuralLoadInsight(loadAvg),
    },
    allocation: {
      categories: ['fun', 'learning', 'giving', 'future'],
      values: [
        avgAlloc.fun,
        avgAlloc.learning,
        avgAlloc.giving,
        avgAlloc.future,
      ],
      insight: buildAllocationInsight(avgAlloc),
    },
  };

  // ── 4. Volatility ────────────────────────────────────────────
  const absorptionDist = computeAbsorptionDistribution(months);

  const volatility: VolatilitySection = {
    overcommitmentCount,
    varianceMonths,
    absorptionDistribution: absorptionDist,
    insight: buildVolatilityInsight(overcommitmentCount, varianceMonths),
  };

  // ── 5. Key moments ───────────────────────────────────────────
  const keyMoments: KeyMoment[] = [];

  if (lqiValues.length > 0) {
    const maxIdx = lqiValues.indexOf(Math.max(...lqiValues));
    keyMoments.push({
      type: 'highest_lqi',
      month: months[maxIdx].monthIndex,
      value: lqiValues[maxIdx],
      description: 'Peak lifestyle balance achieved.',
    });
  }

  if (hiValues.length > 0) {
    const minIdx = hiValues.indexOf(Math.min(...hiValues));
    keyMoments.push({
      type: 'lowest_hi',
      month: months[minIdx].monthIndex,
      value: hiValues[minIdx],
      description: 'Lowest sustainability due to financial pressure.',
    });
  }

  for (const m of months.filter((m) => m.stressModeActive)) {
    keyMoments.push({
      type: 'stress_event',
      month: m.monthIndex,
      description: 'Stress triggered due to imbalance.',
    });
  }

  if (lastMonth) {
    keyMoments.push({
      type: 'highest_savings',
      month: lastMonth.monthIndex,
      value: finalFutureYouSavings,
      description: 'Maximum accumulation reached.',
    });
  }

  // ── 6. Final state ───────────────────────────────────────────
  const finalFreeCash = lastMonth
    ? lastMonth.income -
      lastMonth.lockedCommitmentsTotal -
      (lastMonth.billsActual ?? lastMonth.billsEstimated) -
      [JAR_FUN, JAR_LEARNING, JAR_GIVING, JAR_FUTURE].reduce(
        (s, code) => s + jarSpent(lastMonth.jars, code),
        0,
      )
    : 0;

  const hasDeficit = lastMonth?.structuralOvercommitmentOccurred ?? false;

  let stability: 'stable' | 'moderate' | 'unstable';
  if (finalHi > 80 && !hasDeficit) {
    stability = 'stable';
  } else if (finalHi >= 60) {
    stability = 'moderate';
  } else {
    stability = 'unstable';
  }

  const finalState: FinalState = {
    finalSavings: finalFutureYouSavings,
    finalFreeCash: Math.round(finalFreeCash),
    stability,
    summary: buildFinalStateSummary(stability, finalFutureYouSavings, finalHi),
  };

  return {
    overview,
    indices,
    financials,
    volatility,
    keyMoments,
    finalState,
  };
}

// ── Insight builders ─────────────────────────────────────────────

function buildOverviewSummary(
  stressCount: number,
  loadAvg: number,
  lqiTrend: string,
  monthCount: number,
): string {
  if (stressCount === 0 && loadAvg < 0.6) {
    return `The run maintained a balanced structure with moderate fixed costs and controlled stress exposure.`;
  }
  if (stressCount > 0) {
    return `The run encountered stress in ${stressCount} of ${monthCount} months, indicating structural pressure from high fixed commitments.`;
  }
  if (loadAvg >= 0.7) {
    return `Fixed costs dominated the budget throughout the run, leaving limited discretionary flexibility.`;
  }
  return `The run progressed with a ${lqiTrend} lifestyle quality trend over ${monthCount} months.`;
}

function buildLqiInsight(trend: string, values: number[]): string {
  if (trend === 'stable') {
    return 'LQI remained relatively stable with minor fluctuations.';
  }
  if (trend === 'rising') {
    const gain = values[values.length - 1] - values[0];
    return `LQI improved by ${Math.round(gain)} points over the run, reflecting consistent lifestyle investment.`;
  }
  const loss = values[0] - values[values.length - 1];
  return `LQI declined by ${Math.round(loss)} points, suggesting lifestyle spending was insufficient to sustain quality.`;
}

function buildHiInsight(trend: string, values: number[]): string {
  if (trend === 'rising') {
    return 'HI improved steadily due to consistent financial behavior.';
  }
  if (trend === 'stable') {
    return 'HI remained consistent, reflecting stable financial habits throughout the run.';
  }
  const loss = values[0] - values[values.length - 1];
  return `HI declined by ${Math.round(loss)} points, indicating growing financial stress or under-investment in health.`;
}

function buildFutureYouInsight(
  total: number,
  avgIncome: number,
  monthCount: number,
): string {
  if (total > avgIncome * 0.5 * monthCount) {
    return 'Savings grew consistently through recurring contributions, showing strong long-term discipline.';
  }
  if (total > 0) {
    return `Moderate savings accumulated — ${total.toLocaleString()} saved with room to increase the future_you allocation.`;
  }
  return 'No future savings accumulated — consider increasing the future_you jar allocation each month.';
}

function buildStructuralLoadInsight(avg: number): string {
  if (avg < 0.5) {
    return 'Fixed costs were well-controlled, leaving substantial income available for discretionary use.';
  }
  if (avg < 0.7) {
    return 'Fixed costs consumed a moderate portion of income, leaving limited but stable flexibility.';
  }
  return 'High structural load — fixed commitments dominated income, significantly constraining discretionary spending.';
}

function buildAllocationInsight(alloc: {
  fun: number;
  learning: number;
  giving: number;
  future: number;
}): string {
  const dominant = Object.entries(alloc).sort((a, b) => b[1] - a[1])[0];
  if (!dominant) return 'Spending was distributed across all jars.';
  const pct = Math.round(dominant[1] * 100);
  if (dominant[0] === 'future') {
    return 'Spending distribution prioritized future growth while maintaining balanced lifestyle allocations.';
  }
  return `Allocation leaned toward ${dominant[0]} (avg ${pct}% of income) — consider rebalancing toward future savings.`;
}

function buildVolatilityInsight(
  overcommitCount: number,
  varianceMonths: number,
): string {
  if (overcommitCount > 0) {
    return `Overcommitment occurred in ${overcommitCount} month(s) — bills exceeded all available reserves and jar buffers.`;
  }
  if (varianceMonths > 0) {
    return 'Most financial shocks were absorbed by reserves before affecting lifestyle categories.';
  }
  return 'No bill variance or overcommitment — spending remained within expected bounds throughout the run.';
}

function buildFinalStateSummary(
  stability: string,
  savings: number,
  finalHi: number,
): string {
  if (stability === 'stable') {
    return `The simulation ended with strong savings and high sustainability.`;
  }
  if (stability === 'moderate') {
    return `The run concluded with moderate stability — savings of ${savings.toLocaleString()} and HI at ${finalHi}.`;
  }
  return `The simulation ended under financial strain — low HI (${finalHi}) signals structural imbalance.`;
}

function computeAbsorptionDistribution(
  months: AnalyzeMonthInput[],
): AbsorptionDistribution {
  const shortfallMonths = months.filter(
    (m) => m.billResolution != null && m.billResolution.shortfallTotal > 0,
  );

  if (shortfallMonths.length === 0) {
    return { billReserve: 1.0, fun: 0, learning: 0, freeCash: 0 };
  }

  // Estimate proportional absorption based on billReserveEnd remaining vs shortfall
  let totalShortfall = 0;
  let absorbedByReserve = 0;
  let absorbedByFun = 0;
  let absorbedByLearning = 0;
  let absorbedByFreeCash = 0;

  for (const m of shortfallMonths) {
    const shortfall = m.billResolution!.shortfallTotal;
    totalShortfall += shortfall;

    const reserveEnd = m.billResolution!.billReserveEnd;
    // Estimate how much the reserve absorbed before hitting jars
    const fromReserve = Math.min(shortfall, Math.max(0, reserveEnd));
    const remaining = shortfall - fromReserve;

    absorbedByReserve += fromReserve;

    // Remainder distributed: fun first, then learning, then free_cash
    const funAvail = jarSpent(m.jars, JAR_FUN);
    const fromFun = Math.min(remaining, funAvail * 0.5);
    const afterFun = remaining - fromFun;
    const learningAvail = jarSpent(m.jars, JAR_LEARNING);
    const fromLearning = Math.min(afterFun, learningAvail * 0.5);
    const fromFreeCash = afterFun - fromLearning;

    absorbedByFun += fromFun;
    absorbedByLearning += fromLearning;
    absorbedByFreeCash += fromFreeCash;
  }

  if (totalShortfall === 0) {
    return { billReserve: 1.0, fun: 0, learning: 0, freeCash: 0 };
  }

  return {
    billReserve: parseFloat((absorbedByReserve / totalShortfall).toFixed(2)),
    fun: parseFloat((absorbedByFun / totalShortfall).toFixed(2)),
    learning: parseFloat((absorbedByLearning / totalShortfall).toFixed(2)),
    freeCash: parseFloat((absorbedByFreeCash / totalShortfall).toFixed(2)),
  };
}
