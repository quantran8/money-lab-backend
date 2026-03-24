---
name: Budget Simulation Logic Overview
description: Architecture diagram, API endpoints, orchestration flows, file map, constants, enums, and transaction boundaries
type: reference
---

# Logic Map — Overview

## Architecture

```
Controller (1)
  └─ Facade Service (1)
       ├─ SetupService
       ├─ RunService (aggregate root)
       │    ├─ RunStateService
       │    └─ RunCommitmentService
       └─ MonthService (router)
            ├─ MonthWeekService (orchestrator)
            ├─ MonthEventService
            ├─ MonthSpendService
            ├─ MonthIndexService
            ├─ MonthBillService
            └─ NextMonthPreviewService

Config: BudgetSimulationConfigService (cached at init)
Domain: Pure functions (no NestJS, no DB, no I/O)
Queries: Read-only Prisma access
Repositories: Write-only Prisma access (accept tx?: TxClient)
```

---

## API Endpoints

All under `/api/v1/budget-simulation`, guarded by `@UseGuards(AuthGuard)`.

| Method | Path | DTO | Delegates To |
|--------|------|-----|-------------|
| GET | `/get-setup-options` | — | SetupService |
| POST | `/start-run` | StartRunDto | RunService.startBudgetRun |
| POST | `/start-month` | StartMonthDto | RunService.startMonth |
| POST | `/resolve-week` | ResolveWeekDto | MonthService.resolveWeek |
| POST | `/apply-event-choice` | ApplyEventChoiceDto | MonthService.applyEventChoice |
| GET | `/active-run` | — | RunStateService.getActiveBudgetRun |
| POST | `/run/:runId/commitments` | UpdateRunCommitmentsDto | RunCommitmentService |

---

## Orchestration Flows

### Full Run Lifecycle
```
startBudgetRun → [startMonth → [resolveWeek → [applyEventChoice]*]* (4 weeks)] (6 months) → completeRun
```

### Month Lifecycle
```
startMonth
  → resolveWeek(week 1) → [applyEventChoice if events]
  → resolveWeek(week 2) → [applyEventChoice if events]
  → resolveWeek(week 3) → [applyEventChoice if events]
  → resolveWeek(week 4) → [applyEventChoice if events] → reconcileBills → incrementFutureYou
  → month complete (currentWeek=5)
  → prepareNextMonth OR completeRun
```

### Week Resolution
```
resolveWeek:
  1. Advance currentWeek
  2. Auto-spend from jars
  3. Spawn events (deterministic)
  4. If pending events → return (wait for applyChoice)
  5. If no events → resolve index immediately
  6. If week 4 → reconcile bills + cumulative future

applyChoice (for each pending event):
  1. Process payment
  2. Apply effects (OT/income/spend/XP)
  3. Check remaining pending
  4. If last event → resolve index (aggregate all event deltas)
  5. If week 4 → reconcile bills
```

---

## Transaction Boundaries

| Operation | TX Scope |
|-----------|----------|
| startBudgetRun | Create jobState + run + commitments |
| startMonth | Create month + bill/index resolutions + jars |
| resolveWeek | Advance week + spend + events + index + bills |
| applyChoice | Spend/income logs + event choice + XP + index + bills |
| updateRunCommitments | Close/create/delete commitments |
| reconcileBills | Bill resolution + jar overflows + month update |

All via `TransactionRunner.run((tx) => ...)`, passing `tx` to repositories.

---

## Constants & Enums

```typescript
BUDGET_SIMULATION_MODULE_ID = 3
NUMBER_OF_WEEKS_PER_MONTH = 4
WEEK_INDEX_COMPLETE_MONTH = 5    // sentinel: month done
END_OF_MONTH_WEEK = 4            // last active week
RUN_MONTH_INDEX_COMPLETE = 6     // sentinel: run done
MAX_EVENTS_PER_WEEK = 1          // total lane
FREE_CASH_CODE = 'free_cash'

JarCode: fun, learning, give, future_you
CommitmentLayer: locked, bills, food_reserve
BillReserveOptionCode: none, half, high, full
SpendModeCode: enjoy, normal, save
LqiState: stable, compressed, strained
```

---

## File Map

```
budget-simulation/
├── budget-simulation.controller.ts    # 7 endpoints
├── budget-simulation.service.ts       # Facade (routes to sub-services)
├── budget-simulation.module.ts        # @Global, all providers
├── budget-simulation.enum.ts          # JarCode, CommitmentLayer, etc.
├── budget-simulation.constant.ts      # Module config, bill reserve/spend mode options
├── budget-simulation.helpers.ts       # LQI state, clamp, PRNG, bill variance, labels
├── domain/
│   ├── spending/spending-calculator.ts  # jarAvailable, computeWeeklySpend
│   ├── index/index-calculator.ts        # resolveWeek (HI/LQI)
│   ├── bills/bill-reconcile-calculator.ts # computeBills, reconcile
│   ├── events/event-spawn-engine.ts     # shouldSpawn, chooseCategory/Template
│   ├── events/overtime-effects.ts       # resolveOvertimeEffects, isAcceptOption
│   ├── income/month-income.ts           # resolveBaseJobIncome, calculateMonthIncome
│   └── index.ts                         # barrel exports
├── dto/
│   ├── start-run.dto.ts
│   ├── start-month.dto.ts
│   ├── resolve-week.dto.ts
│   ├── apply-event-choice.dto.ts
│   ├── update-run-commitments.dto.ts
│   └── validators.ts
├── queries/
│   ├── run.query.ts          # Jobs, runs, job state, commitments
│   ├── month.query.ts        # Months, jars, events, templates, pool weights
│   ├── commitment.query.ts   # Templates, modifiers, bill reserve/spend options
│   └── module.query.ts       # Module config
├── repositories/
│   ├── run.repository.ts     # Runs, job state, commitments
│   └── month.repository.ts   # Months, resolutions, jars, events
├── services/
│   ├── config.service.ts     # Cached config (onModuleInit)
│   ├── setup.service.ts      # getSetupOptions (aggregates reference data)
│   ├── run/
│   │   ├── run.service.ts            # startBudgetRun, startMonth (aggregate root)
│   │   ├── run-state.service.ts      # getActiveBudgetRun, prepareNextMonth
│   │   └── run-commitment.service.ts # updateRunCommitments
│   └── month/
│       ├── month.service.ts              # Router
│       ├── month-week.service.ts         # resolveWeek (orchestrator)
│       ├── month-event.service.ts        # spawn + applyChoice
│       ├── month-spend.service.ts        # auto-spend, jar availability
│       ├── month-index.service.ts        # weekly HI/LQI resolution + persistence
│       ├── month-bill.service.ts         # bill compute + reconciliation
│       └── next-month-preview.service.ts # next month projections
└── types/
    ├── run.types.ts               # Run/Job/Commitment row types
    ├── month.types.ts             # Month/Jar/Event/Index row types
    ├── event.types.ts             # Template/Option/Spawn payload types
    ├── bill.types.ts              # BillsComputeResult
    └── run-commitment.types.ts    # Update input/result types
```
