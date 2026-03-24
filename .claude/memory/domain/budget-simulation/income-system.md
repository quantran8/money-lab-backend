---
name: Budget Simulation Income System
description: Base job income, monthly income with deferred OT, forced rest income loss, and job leveling/XP
type: reference
---

# Income System

## Base Job Income
```
resolvedBaseJobIncome = round(job.baseMonthlyIncome * jobLevel.incomeMultiplier)
```
Default multiplier = 1 if no job level.

## Monthly Income (start of month)
```
monthIncome = resolvedBaseJobIncome + max(0, previousMonth.overtimeIncomeEarned)
```
OT income is **deferred** — earned in month M, paid in month M+1.

## Forced Rest Income Loss
If HI < hiFloor during a week:
- Income deducted: `jobLevel.absenceDeductionPerDay` (1 day pay)
- HI recovered: +5
- Max forced rests per month configurable via `stressMode.maxForcedRestPerMonth`

---

## Job Leveling & XP

- Learning allocation/events generate `learningXpDelta`
- XP accumulated on `UserJobState.xp`
- Level thresholds defined per `JobLevel.xpRequiredTotal`
- Level-up effects (next month): income multiplier increase, energy load increase
- `incrementUserJobStateXpBounded()` — raw SQL, clamps >= 0

---

## Code Location

- Domain: `domain/income/month-income.ts` — `resolveBaseJobIncome()`, `calculateMonthIncome()`, `resolveOvertimeChoicePersistence()`
- Service: `services/run/run.service.ts` — income calculation in `startMonth()`
- Repository: `repositories/run.repository.ts` — `incrementUserJobStateXpBounded()`
