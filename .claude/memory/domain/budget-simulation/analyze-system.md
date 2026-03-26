---
name: Budget Simulation Analyze System
description: Post-run analysis domain — formulas, thresholds, and output structure for RunAnalyzeService
type: reference
---

# Domain — Analyze System

**Domain file:** `domain/analyze/run-analyzer.ts`
**Service:** `services/run/run-analyze.service.ts`
**Type:** `RunWithAllMonthsRow` in `types/run.types.ts`

---

## Trigger

Called once per run, after `BudgetRunRepository.completeRun()`, inside `MonthWeekService.resolveWeek()` when `runComplete = true`.

---

## Input

`AnalyzeRunInput`:
- `runId`, `jobName`, `months[]`, `totalMonths`, `finalFutureYouSavings`

Per month (`AnalyzeMonthInput`):
- `monthIndex`, `income`, `lockedCommitmentsTotal`, `billsEstimated`, `billsActual`
- `freeCash`, `cumulativeFutureYou`
- `stressModeActive`, `structuralOvercommitmentOccurred`, `overtimeIncomeEarned`
- `jars[]`, `indexResolution`, `billResolution`, `events[]`

---

## Input additions (vs initial version)
- `AnalyzeRunInput.moduleId`: number — used to compute `module3Unlocked`
- `AnalyzeMonthIndex.lqiStateEnd`: string | null — used for `overview.lqiState`

## Output Sections

### overview
- `monthsCompleted`: months.length
- `job`: jobState.job.name (null if no job)
- `averageIncome`: sum(income) / months.length, rounded
- `stressEventCount`: count of months where stressModeActive = true
- `structuralLoadAvg`: avg((lockedCommitmentsTotal + billsEstimated) / income), 4 decimals
- `lqiState`: lastMonth.indexResolution.lqiStateEnd ?? 'stable'
- `module3Unlocked`: moduleId === 3
- `summary`: generated text based on stressCount + loadAvg + lqiTrend

### indices
- `months`: `['M1', 'M2', ...]` labels
- `lqiSeries`, `hiSeries`: flat number arrays (lqiEnd ?? lqiStart ?? 50)
- `finalLqi`, `finalHi`: last values in series
- `lqiTrend`, `hiTrend`: `'stable' | 'rising' | 'falling'` via linear regression slope (threshold ±1.5 pts/month)
- `lqiInsight`, `hiInsight`: generated text based on trend + delta

### financials
- `futureYou.series`: cumulativeFutureYou per month
- `futureYou.total`: finalFutureYouSavings
- `futureYou.insight`: generated (strong/moderate/none based on total vs avgIncome * 0.5 * months)
- `structuralLoad.average`: same as overview.structuralLoadAvg
- `structuralLoad.insight`: generated based on avg (<0.5 / <0.7 / ≥0.7)
- `allocation.categories`: `['fun', 'learning', 'giving', 'future']`
- `allocation.values`: avg allocated % of income per jar — 4 decimals
- `allocation.insight`: generated based on dominant jar

### volatility
- `overcommitmentCount`: count months where structuralOvercommitmentOccurred = true
- `varianceMonths`: count months where billResolution.shortfallTotal > 0
- `absorptionDistribution`: `{ billReserve, fun, learning, freeCash }` — proportions summing to ~1.0
  - Estimated from billReserveEnd vs shortfall; remainder split fun → learning → freeCash
  - No shortfall → `{ billReserve: 1.0, fun: 0, learning: 0, freeCash: 0 }`
- `insight`: generated based on overcommitCount + varianceMonths

### keyMoments (array)
- `{ type: 'highest_lqi', month, value, description }`
- `{ type: 'lowest_hi', month, value, description }`
- `{ type: 'stress_event', month, description }` — one entry per stress month
- `{ type: 'highest_savings', month, value, description }` — last month / finalFutureYouSavings

### finalState
- `finalSavings`: finalFutureYouSavings
- `finalFreeCash`: income - lockedCommitmentsTotal - (billsActual ?? billsEstimated) - sum(jarSpent for fun/learning/give/future_you) of last month
- `stability`: `'stable'` | `'moderate'` | `'unstable'` (lowercase)
  - stable: finalHi > 80 AND !overcommit on last month
  - moderate: finalHi >= 60
  - unstable: finalHi < 60
- `summary`: generated text based on stability + savings + finalHi

---

## Jar Codes (constants in analyzer)
| Code        | Meaning        |
|-------------|----------------|
| `fun`       | Fun jar        |
| `learning`  | Learning jar   |
| `give`      | Giving jar     |
| `future_you`| Future You jar |

---

## Trend Slope Algorithm
Linear regression slope over value series:
- meanX = (n-1)/2
- slope = Σ((i - meanX)(v_i - meanV)) / Σ((i - meanX)²)
- Returns 0 for series < 2 points
