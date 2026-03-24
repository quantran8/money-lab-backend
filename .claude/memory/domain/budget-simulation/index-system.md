---
name: Budget Simulation Index System
description: HI (Health Index) and LQI (Life Quality Index) formulas, weekly resolution, recovery efficiency, thresholds, and default config
type: reference
---

# Index System (HI & LQI)

## Health Index (HI) — Sustainability meter

**Weekly resolution formula:**
```
hiNetChange = weeklyBaselineRecovery
            + weeklyFunRecoveryBonus
            - weeklyJobDrain
            + eventHealthDeltaTotal
            - stressEffect
            + forcedRestRecovery

hiEnd = clamp(hiStart + hiNetChange, hiFloor=40, hiCap=100)
```

**Baseline Recovery:** `round(config.baselineHiRecovery / 4)` per week (default baselineHiRecovery=10 → ~2-3/week)

**Fun Recovery Bonus (raw, before efficiency):**
- fun spend < 25 → 0
- 25 <= fun < 75 → 0.5
- fun >= 75 → 1.0

Applied: `round(funBonusRaw * (funEfficiencyPct / 100))`

**Job Drain:** `round(jobLevel.baseEnergyLoadOverride / 4)` per week

**Recovery Efficiency (LQI-dependent):**

| LQI State | Baseline Efficiency | Fun Efficiency |
|-----------|-------------------|----------------|
| Stable (>=60) | 100% | 100% |
| Compressed (40-59) | 90% | 85% |
| Strained (<40) | 80% | 70% |

---

## Life Quality Index (LQI) — Lifestyle quality

**Weekly resolution formula:**
```
lqiNetChange = eventLqiDeltaTotal
lqiEnd = clamp(lqiStart + lqiNetChange, lqiFloor=0, lqiCap=100)
```

LQI currently changes **only** from event choices (no direct jar-to-LQI auto-calculation yet).

**LQI State Thresholds (default):**
- Stable: LQI >= 60
- Compressed: 40 <= LQI <= 59
- Strained: LQI < 40

**LQI Effects:**
1. **Recovery Efficiency** — modifies HI baseline + fun recovery (see table above)
2. **Event Pool Bias** — shifts event category weights (more compromise/undesirable when strained)

---

## Default Config Values

```typescript
{
  hiCap: 100, hiFloor: 40,
  lqiFloor: 0, lqiCap: 100,
  baselineHiRecovery: 10,
  lqiThresholds: { stableMin: 60, compressedMin: 40, compressedMax: 59, strainedMax: 39 },
  stressMode: { maxEventCountPerMonth: 1, maxForcedRestPerMonth: 4 },
  recoveryEfficiencyPct: {
    stable:     { baseline: 100, fun: 100 },
    compressed: { baseline: 90,  fun: 85  },
    strained:   { baseline: 80,  fun: 70  }
  }
}
```

---

## Code Location

- Domain: `domain/index/index-calculator.ts` — `resolveWeek()`, `getRecoveryEfficiencyForState()`
- Helpers: `budget-simulation.helpers.ts` — `resolveLqiState()`, `clampHi()`, `clampLqi()`
- Service: `services/month/month-index.service.ts` — `resolveWeeklyIndex()` (persists to DB)
- Config: `budget-simulation.constant.ts` — `BudgetSimulationModuleConfig` interface, defaults
