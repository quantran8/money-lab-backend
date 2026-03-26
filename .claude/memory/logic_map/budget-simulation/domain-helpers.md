---
name: Budget Simulation Domain & Helpers
description: All pure domain functions (spending, index, bills, events, income, overtime) and helper utilities (PRNG, clamp, LQI state)
type: reference
---

# Logic Map — Domain Layer & Helpers

## Spending Calculator
**File:** `domain/spending/spending-calculator.ts`

- `jarAvailable(allocated, spent, overflowIn, overflowOut)` → `max(0, allocated - spent + overflowIn - overflowOut)`
- `buildJarAvailableMap(freeCash, jars[])` → `Map<jarCode, available>`
- `getHiEfficiency(playerHI, config)` → HI efficiency multiplier (>=70→high, >=40→mid, <40→low)
- `computeLearningXp({learningSpend, playerHI, currentJobLevel, config})` → `{xpGained, learningCap, hiEfficiency}`
  - Soft cap: spend ≤ cap → full xpRate; excess → reducedXpRate
  - Cap = baseCap * jobModifier * hiEfficiency
- `computeWeeklySpend(input)` → `{entries[], weeklySpend{fun,learning,give}, spendOps[], learningXpDelta}`
  - Input now includes: `playerHI`, `currentJobLevel`, `config`
  - Per jar: `weeklyAmount = floor(round(allocated * spendModeRate) / 4)`
  - Actual: `min(available, weeklyAmount)`
  - After spend loop: calls `computeLearningXp()` with learning spend amount

## Index Calculator
**File:** `domain/index/index-calculator.ts`

- `resolveWeek(input)` → `{hiEnd, lqiEnd, lqiStateEnd, weeklyProgress}`
  - HI: `baseline + funBonus - jobDrain + eventHI + forcedRest`
  - LQI: `eventLQI` only
  - Recovery efficiency applied per LQI state
  - Fun bonus thresholds: <25→0, 25-74→0.5, >=75→1.0
- `getRecoveryEfficiencyForState(config, state)` → `{baselinePct, funPct}`

## Bill Reconciliation
**File:** `domain/bills/bill-reconcile-calculator.ts`

- `computeBills(runId, monthIndex, estimated)` → `{estimated, actual, delta, reason}`
  - Seasonal months (1-2, 5-6): always positive delta with reason string
- `reconcile(input)` → `{breakdown, jarChanges[], freeCashChange, structuralOvercommitment, reason}`
  - JAR_ORDER: `['fun', 'give', 'learning', 'free_cash', 'future_you']`
  - Surplus → free cash; Shortfall → reserve → jars in order
  - When delta > 0 and reason exists: breakdown includes `reason` field

## Event Spawn Engine
**File:** `domain/events/event-spawn-engine.ts`

- `shouldSpawn(seed)` → `deterministicRandom(seed) < 0.5`
- `shouldSpawnLane(seed, probability)` → `deterministicRandom(seed) < probability`
- `chooseCategory(seed, weights[])` → weighted random category
- `chooseTemplate(seed, templates[])` → weighted by `(11 - rarity)`
- `chooseTemplateIfSpawn(spawnSeed, templateSeed, templates[])` → templateId | null
- `filterAffordableTemplates(templates[], totalAvailableFunds)` → templates where cheapest option cost ≤ funds; falls back to zero-cost templates

## Income Calculator
**File:** `domain/income/month-income.ts`

- `resolveBaseJobIncome(job, level)` → `round(base * multiplier)`
- `calculateMonthIncome(params)` → `base + max(0, prevOT)`
- `resolveOvertimeChoicePersistence(input)` → `{acceptedDelta, incomeEarnedDelta}`

## Overtime Effects
**File:** `domain/events/overtime-effects.ts`

- `resolveOvertimeEffectsFromJobLevel(job, level)` → `{incomePerUnit, healthPenalty}`
  - Level fields override job base (fallback chain)
- `isOvertimeAcceptOption(sortedIds, chosenId)` → first sorted option = accept

---

## Helpers
**File:** `budget-simulation.helpers.ts`

- `resolveLqiState(lqi, config)` → `'stable' | 'compressed' | 'strained'`
  - Uses `config.indexRules.lqiThresholds` (stableMin=60, compressedMin=40)
- `clampHi(rawHi, config)` → `[hiFloor, hiCap]` (default [40, 100])
- `clampLqi(rawLqi, config)` → `[lqiFloor, 100]` (default [0, 100])
- `deterministicRandom(seed)` → MD5-based float [0,1)
- `seedInt(seed)` → MD5-based 32-bit int
- `genAutoSpendLabel(seed, jar, amount, mode, weekGlobal)` → deterministic label
  - Selects from prefix/verb/style/tail arrays using seeded indices
- `computeBillsFinal(runId, monthIndex, estimated)` → ±5% variance
  - `factor = (deterministicRandom(seed) - 0.5) * 0.1`
  - `actual = round(estimated * (1 + factor))`
