---
name: Budget Simulation Month Support Services
description: MonthSpendService, MonthIndexService, MonthBillService, NextMonthPreviewService, ConfigService, SetupService
type: reference
---

# Logic Map — Month Support Services

## MonthSpendService
**File:** `services/month/month-spend.service.ts`

- `getSpendModeRate(code)` → enjoy=1.0, normal=0.85, save=0.7
- `getJarAvailable(monthId, jarCode, tx?)` → jar balance from DB (0 if not found)
- `addSpendLog(monthId, jarCode, spent, overflowIn, overflowOut, tx?)` → increment jar fields
- `computeWeeklySpend(month, jars, spendModeRate, nextWeek)` → **pure** (delegates to domain)
  - Returns: `{entries[], weeklySpend{fun,learning,give}, spendOps[]}`
- `applyWeeklySpend(monthId, nextWeek, tx?)` → loads month+jars, computes, persists all spend ops
- `jarAvailableFromLoaded(month, jars, jarCode)` → **pure** (from preloaded state)

---

## MonthIndexService
**File:** `services/month/month-index.service.ts`

### resolveWeeklyIndex(monthId, week, weeklySpend, forcedRestNotice?, tx?, preloaded?)
- Loads month + job level (or uses preloaded)
- Aggregates event HI/LQI totals for the week
- Delegates to domain `indexResolveWeek()` for computation
- Persists: updates indexResolution (hiEnd, lqiEnd, lqiStateEnd, hiNetChange)
- Updates `weeklyIndexProgress` JSONB via raw SQL merge
- Returns `{hiEnd, lqiEnd}`

---

## MonthBillService
**File:** `services/month/month-bill.service.ts`

### computeBills(runId, monthIndex, estimated)
- Delegates to domain `computeBills()` — deterministic variance (±5% normal; seasonal months 1-2/5-6 always positive +5-15%)
- Returns `{estimated, actual, delta, reason}`

### reconcileBillsWithContext(userId, monthId, actual, context, tx, effectiveWeek?, reason?)
- Validates ownership, week >= 4
- Calls domain `reconcile()` with bill reserve, jar states, free cash, reason
- **If surplus (delta <= 0):** increment free cash
- **If shortfall (delta > 0):** deduct from reserve → jars in order → free cash; breakdown includes `reason` if provided
- Persists: update bill resolution (breakdown with reason), jar overflow changes, month fields
- Returns breakdown record

### reconcileBills(userId, monthId, actual, tx?)
- Loads month+jars from DB, then calls `reconcileBillsWithContext()`

---

## NextMonthPreviewService
**File:** `services/month/next-month-preview.service.ts`

### computePreview(month) → NextMonthPreview
1. Load next month's active commitments
2. **Income:** base job income + carried OT - forced rest deduction
3. **Necessities:** locked + food + estimated bills (with housing modifiers) + bill reserve refill
4. **Jar refills:** target - remaining (refill jars), full amount (future_you)
5. **Free cash projection:** current + next month flexible - allocations
6. Returns: income breakdown, commitments, bills, reserve, jar refill details, free cash

---

## ConfigService
**File:** `services/config.service.ts`

Loads at `onModuleInit()` and caches in memory:
- Module config (merged from DB + defaults via `getBudgetSimulationModuleConfig()`)
- Bill templates (indexed by layer)
- Housing utility modifiers (indexed by commitmentId-utility)

Methods:
- `getConfig()` → BudgetSimulationModuleConfig (throws if not loaded)
- `getConfigOrNull()` → Config | null
- `getBillTemplates()` → CachedBillTemplate[]
- `getHousingModifiers()` → HousingModifierRow[]
- `getHousingModifiersByCommitmentIds(ids)` → filtered modifiers

---

## SetupService
**File:** `services/setup.service.ts`

### getSetupOptions()
Returns (parallel queries):
- Jobs (with transformed IDs: string)
- Commitment templates (by layer: bills, locked, foodReserve)
- Housing utility modifiers
- Bill reserve options (coverage % codes)
- Spend mode options (rates)
