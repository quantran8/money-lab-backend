---
name: Budget Simulation Run Services
description: RunService (startBudgetRun, startMonth), RunStateService (getActiveBudgetRun), RunCommitmentService (updateRunCommitments)
type: reference
---

# Logic Map — Run Services

## RunService (aggregate root)
**File:** `services/run/run.service.ts`

### startBudgetRun(userId, moduleId, jobId, commitmentAmounts)
1. Load job + level 1
2. Find or create UserJobState
3. **TX:** Create BudgetRun + initial UserRunCommitments (effectiveFromMonthIndex=1)
4. Return `{runId, jobStateId}`

### startMonth(userId, runId, allocations, billReserveCode, spendModeCode)
1. Load run with job state + previous month
2. Calculate income: `resolveBaseJobIncome(job, level) + prevMonth.overtimeIncomeEarned`
3. Resolve active commitments for next month index
4. Compute previous jar remaining balances
5. Calculate jar refills: `max(0, target - prevRemaining)` (refill jars) or full amount (future_you)
6. Compute bill reserve: `coveragePct * billsEstimated`
7. **Guardrail:** `lockedTotal + billsEstimated + foodReserve + billReserveTarget < income`
8. **TX:** Create BudgetRunMonth + BillResolution + IndexResolution + upsert jars
9. Return month summary

### Private: upsertMonthAllocations(monthId, allocations, tx?)
- Upserts all allocation entries (filter out free_cash)
- Ensures core jars exist
- Runs in parallel (independent writes)

### Private: getBillReserveCoveragePctSync(code)
- Synchronous lookup in BILL_RESERVE_OPTIONS constant

---

## RunStateService
**File:** `services/run/run-state.service.ts`

### getActiveBudgetRun(userId)
1. Load run + latest month + jars + commitments + job level
2. Enrich: merge commitments with bill templates + housing modifiers
3. If month resolved → compute next month preview
4. If month not resolved + currentWeek > 0 → load pending event
5. Return full snapshot (id, monthId, income, HI/LQI, jars, commitments, nextMonthPreview/pendingEvents)

### prepareNextMonth(userId, runId)
- Validates month fully resolved (billsActual !== null, currentWeek === 5)
- Delegates to NextMonthPreviewService.computePreview()

### Private: resolveCommitments(run, latestMonth)
- Filters commitments active for current month
- Merges user commitments with bill templates
- Applies housing utility modifiers

### Private: resolveEnrichments(latestMonth, monthResolved)
- If month resolved: computes next month preview
- Else if currentWeek > 0: loads pending event

---

## RunCommitmentService
**File:** `services/run/run-commitment.service.ts`

### updateRunCommitments(userId, runId, commitmentAmounts, optionals?)
1. Validate all template IDs exist
2. Per commitment: if same category active → close old at current month, create new from next month
3. Per optional: include=true → same as above; include=false → deactivate
4. Category rules: only ONE active per category per month
5. **TX:** All writes
6. Return `{updated: count}`

---

---

## RunAnalyzeService
**File:** `services/run/run-analyze.service.ts`

### analyzeRun(runId: number): Promise<RunAnalysisResult>
1. Load full run with all months (ordered asc) via `BudgetRunQuery.findRunWithAllMonths()`
   - Includes: jobState + job, months → jars, billResolution, indexResolution, events + option
2. Map each month to `AnalyzeMonthInput` (Prisma Decimal → number conversions)
3. Call pure domain function `analyzeRun()` from `domain/analyze/run-analyzer.ts`
4. Return `RunAnalysisResult`

**Called by:** `MonthWeekService.resolveWeek()` — only when `runComplete = true`
**Query:** `BudgetRunQuery.findRunWithAllMonths()` → type `RunWithAllMonthsRow`

---

## Queries Used
- `BudgetRunQuery.findJobWithLevel1()` — startBudgetRun
- `BudgetRunQuery.findRunWithJobState()` — startMonth
- `BudgetRunQuery.findRunWithLatestMonthAndCommitments()` — startMonth
- `BudgetRunQuery.findActiveRunWithDetails()` — getActiveBudgetRun
- `BudgetRunQuery.findActiveCommitmentsForMonth()` — commitment resolution
- `BudgetMonthQuery.findPreviousMonth()` — startMonth (jar balances, carried OT)
- `CommitmentQuery.findTemplatesByIds()` — updateRunCommitments

## Repository Methods Used
- `BudgetRunRepository.createRun()`, `createUserJobState()`, `createRunCommitments()`
- `BudgetRunRepository.setCommitmentsEffectiveTo()`, `deleteRunCommitment()`
- `BudgetRunRepository.completeRun()`
- `BudgetMonthRepository.createMonth()`, `createBillResolution()`, `createIndexResolution()`, `upsertJar()`
