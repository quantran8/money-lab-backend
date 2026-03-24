---
name: Budget Simulation MonthEventService
description: Event spawn logic (life + OT), event choice application, multi-jar payment, OT income deferral
type: reference
---

# Logic Map — MonthEventService

**File:** `services/month/month-event.service.ts`

## buildSpawnPayload(month, eventRow)
- Maps pending event to API payload (SpawnEventTemplatePayload)
- **OT special handling:**
  - Accept option: money_delta=0 (deferred), health_delta=jobLevel penalty
  - Shows `deferredOvertimePayoutNextMonth` for accept option
- Sorts options by sortOrder

## resolveLifeSpawnTemplateId(monthId, month, week) → bigint | null
1. Check stress mode cap (`maxEventCountPerMonth`)
2. Deterministic spawn roll (seed: `{runId}:{monthIndex}:{week}:spawn`)
3. Get LQI state from index resolution
4. Query event pool weights by LQI state (ModuleEventPoolWeight)
5. Weighted category selection via `chooseCategory()`
6. Query templates with options for chosen category (excluding recently used — lookback 5 months)
7. Affordability filter: compute totalAvailableFunds (jar balances + cumulativeFutureYou + freeCash); keep templates where cheapest option cost ≤ totalAvailableFunds; fall back to zero-cost templates if none affordable
8. Weighted template pick via `chooseTemplate()` (weight = 11 - rarity)
9. Return template ID or null

## resolveOvertimeSpawnTemplateId(monthId, month, week) → bigint | null
1. Module 3 only
2. Check OT template exists for module
3. Check no existing OT event this week
4. Check stress mode cap
5. Check job-level cap: total OT events spawned this month (via `countOvertimeEventsForMonth`) < `overtimeMonthlyCap`
6. Check min HI: `hi >= minHiForOvertime`
7. Spawn roll based on `jobLevel.overtimeSpawnWeight` probability
8. Return template ID or null

## applyChoice(userId, monthId, week, optionId, paymentJar, coverJars[], eventId?)

### Load & Validate
- Load month with jars, option details, pending event
- Validate ownership, valid option, valid jar codes
- Payment jar ≠ cover jars
- Event lookup: if eventId → fetch specific; else try life first, then OT

### Payment Logic
- Cost = absolute value of negative moneyDelta
- Primary jar covers as much as possible
- If primary is `future_you` and jar balance < cost: tap `cumulativeFutureYou` (previous months' savings) before cover jars; decrements month record; recorded as `cumulative_future_you` in payment breakdown
- Overflow to cover jars in order: `deduct = min(balance, remaining)`
- Error if insufficient funds across all jars

### OT Special Logic
- Accept option (first sorted) → defer income to next month, apply OT health penalty
- Non-accept → regular moneyDelta

### TX Phase 1 (parallel writes)
- Jar spend logs (spending from jars)
- Jar income logs (income to jars)
- Free cash decrement/increment
- Event choice + payment breakdown record
- OT count increment (if accept)
- XP increment (if learningXpDelta)

### TX Phase 2
- Check remaining pending events for week
- If pending → defer weekly index resolution, return early with `deferredIndex: true`

### TX Phase 3
- Aggregate all chosen events' HI/LQI deltas for the week
- OT accept: use OT healthPenalty instead of option's healthDelta
- Call MonthIndexService.resolveWeeklyIndex()
- If week 4 (END_OF_MONTH_WEEK): reconcile bills via MonthBillService

### Post-Transaction
- Check month complete (week 5 + no pending)
- If complete + monthIndex >= 6 → completeRun()
- If complete + monthIndex < 6 → compute next month preview

### Response Shape
- optionChosen, healthDelta, lqiDelta, learningXpDelta
- paymentRecord[] (jar-by-jar breakdown)
- hiAfter, lqiAfter
- bills (if month complete)
- monthComplete, runComplete flags
- overtimeIncomeAccrued (if OT accept)
- spendingSummary
- deferredIndex flag

---

## Domain Functions Used
- `event-spawn-engine.ts` — shouldSpawn, shouldSpawnLane, chooseCategory, chooseTemplate, filterAffordableTemplates
- `overtime-effects.ts` — resolveOvertimeEffectsFromJobLevel, isOvertimeAcceptOption
- `month-income.ts` — resolveOvertimeChoicePersistence
