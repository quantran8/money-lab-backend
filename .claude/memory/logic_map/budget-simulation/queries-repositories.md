---
name: Budget Simulation Queries & Repositories
description: All read-only queries (run, month, commitment, module) and write-only repositories (run, month)
type: reference
---

# Logic Map — Queries & Repositories

## Queries (Read-Only)

### BudgetRunQuery (`queries/run.query.ts`)
- `findJobsMany()` → all jobs
- `findJobWithLevel1(jobId)` → job + level 1
- `findActiveRunWithDetails(userId)` → run + latest month + jars + resolutions + commitments
- `findRunWithJobState(runId)` → run + job state (job + levels)
- `findRunWithLatestMonthAndCommitments(runId)` → full run state
- `findLatestUserJobState(userId, jobId)`
- `findCommitmentsForRunWithTemplates(runId)`
- `findActiveCommitmentsForMonth(runId, monthIndex)` → effective range filter

### BudgetMonthQuery (`queries/month.query.ts`)
- `findPreviousMonth(runId)` → prev month + resolutions
- `findMonthWithRun(monthId)` → month + run
- `findMonthWithRunAndJobLevel(monthId)` → + job levels
- `findMonthWithRunAndJobLevelAndJars(monthId)` → full resolveWeek load
- `findMonthWithJars(monthId)` → month + jars + resolutions
- `findJarsForMonth(monthId, jarCodes?)` → jar rows
- `findPendingEvent(monthId, week)` → unchosen event
- `findPendingLifeEventWithTemplate(monthId, week)` → life lane
- `findPendingOvertimeEventWithTemplate(monthId, week)` → OT lane
- `countPendingEventsForWeek(monthId, week)`
- `findChosenEventsForWeekWithTemplates(monthId, week)`
- `getChosenEventsHealthAndLqiTotalsForWeek(monthId, week)` → SQL aggregate
- `findUsedLifeEventTemplateIds(runId, fromMonth, toMonth)` → dedup lookback
- `findLifeEventTemplatesForModuleByCategory(moduleId, category, excludeIds?)`
- `findEventPoolWeights(moduleId, lqiState)` → category weights
- `findOvertimeEventTemplate(moduleId)` → single OT template

### CommitmentQuery (`queries/commitment.query.ts`)
- `findTemplatesByIds(ids)` → `{id, category}[]`
- `findCommitmentTemplates(moduleId, layers)` → by layer
- `findBillTemplates(moduleId)` → bills layer
- `findBillTemplatesByLayer(moduleId, layer)` → by specific layer
- `findHousingModifiersByCommitmentIds(ids)` → utility multipliers
- `findHousingModifiersAll()` → all modifiers
- `findActiveBillReserveOptions()` → from constant
- `findBillReserveOptionByCode(code)` → from constant
- `findActiveSpendModeOptions()` → from constant
- `findSpendModeOptionByCode(code)` → from constant

### ModuleQuery (`queries/module.query.ts`)
- `findModuleById(moduleId)`
- `getModuleConfig(moduleId)` → merged config with defaults

---

## Repositories (Write-Only)

### BudgetRunRepository (`repositories/run.repository.ts`)
- `createRun(data, tx?)`
- `createUserJobState(data, tx?)`
- `updateUserJobState(id, data, tx?)`
- `incrementUserJobStateXpBounded(id, delta, tx?)` → raw SQL, clamps >= 0
- `createRunCommitments(data[], tx?)`
- `setCommitmentsEffectiveTo(runId, templateIds, month, tx?)`
- `deleteRunCommitment(runId, templateId, tx?)`
- `updateRunCommitmentEffectiveAndAmount(runId, templateId, amount, effectiveFrom, tx?)`
- `updateRunCommitmentAmounts(runId, updates[], tx?)`
- `completeRun(runId, data, tx?)` → finishedAt, passed, finalFutureYouSavings

### BudgetMonthRepository (`repositories/month.repository.ts`)
- `createMonth(data, tx?)`
- `updateMonth(monthId, data, tx?)`
- `incrementOvertimeAcceptOnMonth(monthId, incomeDelta, tx?)`
- `createBillResolution(data, tx?)` / `updateBillResolution(monthId, data, tx?)`
- `createIndexResolution(data, tx?)` / `updateIndexResolution(monthId, data, tx?)`
- `upsertJar(monthId, jarCode, amount, tx?)` / `ensureJarExists(monthId, jarCode, tx?)`
- `incrementJarSpend(monthId, jarCode, spent, overflowIn, overflowOut, tx?)`
- `createEventWithTemplate(monthId, templateId, week, tx?)` → event + template + options
- `updateEventChosen(eventId, optionId, paymentBreakdown, tx?)`
- `updateWeeklyIndexProgress(monthId, week, payload, tx?)` → JSONB merge
