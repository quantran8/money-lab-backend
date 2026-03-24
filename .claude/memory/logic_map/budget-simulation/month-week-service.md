---
name: Budget Simulation MonthWeekService
description: resolveWeek orchestrator — context loading, forced rest, auto-spend, event spawn, index resolution, bill reconciliation
type: reference
---

# Logic Map — MonthWeekService

**File:** `services/month/month-week.service.ts`

## loadResolveWeekContext(monthId)
1. Load month with run + job level + jars (via MonthQuery.findMonthWithRunAndJobLevelAndJars)
2. Get spend mode rate from code
3. Count unresolved events on current week (blocks advance if > 0)
4. Compute nextWeek = currentWeek + 1
5. **Spawn logic (deterministic PRNG):**
   - Life event: check priority, max events/week cap, LQI-weighted pool selection
   - Overtime: only if module 3, after life, respects job-level cap + min HI
6. Return full ResolveWeekContext or null

## resolveWeek(userId, monthId)

### Validations
- Month not yet complete (monthIndex < 6)
- Week not yet complete (currentWeek < 5)
- No unresolved events from prior week

### Forced Rest Check
- If HI < hiFloor and not yet forced this month
- Deducts income (`jobLevel.absenceDeductionPerDay`), recovers HI +5
- Records on indexResolution: `forcedRestWeek`, `incomeLossFromForcedRest`, `hiRecoveryFromForcedRest`

### Transaction
a. Advance `currentWeek` → nextWeek
b. Apply weekly auto-spend via MonthSpendService (fun/learning/give jars)
c. Spawn/load pending life & OT events (unless forced rest blocks events)
   - If spawning: `MonthRepository.createEventWithTemplate()`
   - If already pending: load existing
d. If no pending events → resolve weekly index via MonthIndexService
e. If END_OF_MONTH_WEEK (week 4) + no pending:
   - Compute bills via MonthBillService.computeBills()
   - Reconcile bills via MonthBillService.reconcileBillsWithContext()
   - Increment cumulativeFutureYou on month

### Post-Transaction
- Clamp HI/LQI to config bounds
- Check if month complete (week 5 + no pending events)
- If month complete + monthIndex >= 6 → completeRun()
- If month complete + monthIndex < 6 → NextMonthPreviewService.computePreview()

### Response Shape
- weekAdvanced, currentWeek
- spendEntries[] (auto-spend log)
- hiAfter, lqiAfter
- systemNotice (forced rest details)
- pendingEvents[] (if events spawned)
- bills (if month completed)
- nextMonthPreview (if available)
- monthComplete, runComplete flags

---

## Dependencies
- MonthSpendService → auto-spend
- MonthEventService → spawn template resolution
- MonthIndexService → weekly index resolution
- MonthBillService → bill compute + reconciliation
- NextMonthPreviewService → next month projections
- BudgetRunRepository → completeRun()
