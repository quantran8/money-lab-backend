---
name: Budget Simulation Overview
description: Game concept, core loop, entity hierarchy, DB models, constants, enums, and safety invariants
type: reference
---

# Budget Simulation — Overview

## Game Concept

A **structural financial practice simulator** (6 fictional months, 4 weeks each). Players experiment with income allocation, fixed costs, and lifestyle trade-offs. No debt, no negative balances, no crisis spirals. Confidence through understanding.

**Core loop:** Select job → Set commitments → Each month: allocate jars → Resolve 4 weeks (auto-spend + events + index) → Bills reconcile → Month summary → Next month preview → Repeat 6 months.

---

## Key Entities & DB Models

### Run Hierarchy
```
BudgetRun (1 per user active)
  └─ BudgetRunMonth (6 per run)
       ├─ BudgetMonthBillResolution (1:1)
       ├─ BudgetMonthIndexResolution (1:1, weeklyIndexProgress JSONB)
       ├─ BudgetMonthJar[] (fun, learning, give, future_you)
       └─ BudgetMonthEvent[] (0-1 per week per lane)
```

### Config (loaded once at init, cached by ConfigService)
- **Module** — config JSONB (indexRules, thresholds, recovery efficiency)
- **Job** → **JobLevel[]** — income, energy load, OT params per level
- **CommitmentTemplate** — locked/bills/food_reserve layers with housing modifiers
- **LifeEventTemplate** → **LifeEventOption[]** — events by category + rarity
- **ModuleEventPoolWeight** — LQI-state-weighted category probabilities
- **HousingUtilityModifier** — multipliers for bills based on housing choice

### User State
- **UserJobState** — level, XP, current income, isActive
- **UserRunCommitment** — selectedAmount, effectiveFrom/ToMonthIndex
- **UserModuleProgress** — status, score, unlock/complete dates

---

## Constants

```typescript
BUDGET_SIMULATION_MODULE_ID = 3
NUMBER_OF_WEEKS_PER_MONTH = 4
WEEK_INDEX_COMPLETE_MONTH = 5    // sentinel: month done
END_OF_MONTH_WEEK = 4            // last active week
RUN_MONTH_INDEX_COMPLETE = 6     // sentinel: run done
MAX_EVENTS_PER_WEEK = 1          // total lane
FREE_CASH_CODE = 'free_cash'
```

## Enums

```typescript
JarCode: fun, learning, give, future_you
CommitmentLayer: locked, bills, food_reserve
BillReserveOptionCode: none, half, high, full
SpendModeCode: enjoy, normal, save
LqiState: stable, compressed, strained
```

---

## Deterministic Randomness

All random decisions use MD5-seeded PRNG:
```typescript
deterministicRandom(seed: string): number  // [0, 1)
seedInt(seed: string): number              // 32-bit int
```

Seed patterns:
- Event spawn: `{runId}:{monthIndex}:{week}:spawn`
- Template selection: `{runId}:{monthIndex}:{week}:template`
- Bill variance: `{runId}:{monthIndex}:bills`
- Auto-spend labels: composite of run/month/week/jar

---

## Safety Invariants

- No negative balances anywhere
- No debt creation
- No carry-over deficits between months
- No hidden deductions
- All effects numerically displayed before confirmation
- Bill variance bounded to ±5%
- HI clamped [40, 100], LQI clamped [0, 100]
- Stress mode limited to 1 month
- Forced rest capped per month
