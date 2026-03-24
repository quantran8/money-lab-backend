---
name: Budget Simulation Commitment System
description: Commitment layers, effective ranges, category rules, start-of-month guardrail, and run completion
type: reference
---

# Commitment System

## Layers
- **Locked** — housing, transport, phone (auto-deducted, unchangeable mid-month)
- **Bills** — system-generated estimated bills
- **Food Reserve** — food allocation

## Effective Range
Each commitment has `effectiveFromMonthIndex` and `effectiveToMonthIndex`. Changing a commitment closes the old one at current month and creates new from next month.

## Category Rules
Only ONE active commitment per category per month. Switching within same category: close old → create new (effective next month).

## Start-of-Month Guardrail
```
lockedTotal + billsEstimated + foodReserve + billReserveTarget < income
```
Must leave flexible room > 0.

---

## Run Completion

**Condition:** monthIndex >= 6 AND all weeks resolved (currentWeek = 5).

**On completion:**
- `BudgetRun.finishedAt` set
- `BudgetRun.passed` = (cumulativeFutureYou > 0)
- `BudgetRun.finalFutureYouSavings` = last month's cumulative

**Module 3 unlock:** Future You > 0 at end of run.

---

## Code Location

- Service: `services/run/run-commitment.service.ts` — `updateRunCommitments()`
- Service: `services/run/run.service.ts` — guardrail in `startMonth()`, run creation in `startBudgetRun()`
- Repository: `repositories/run.repository.ts` — `createRunCommitments()`, `setCommitmentsEffectiveTo()`, `completeRun()`
- Query: `queries/run.query.ts` — `findActiveCommitmentsForMonth()`
