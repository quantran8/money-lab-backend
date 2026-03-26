# Memory Index

## Domain Maps — Budget Simulation
- [overview.md](domain/budget-simulation/overview.md) — Game concept, core loop, entity hierarchy, DB models, constants, enums, safety invariants
- [index-system.md](domain/budget-simulation/index-system.md) — HI/LQI formulas, weekly resolution, recovery efficiency, thresholds, default config
- [income-system.md](domain/budget-simulation/income-system.md) — Base job income, deferred OT, forced rest income loss, job leveling/XP
- [spending-system.md](domain/budget-simulation/spending-system.md) — Jar types, refill logic, auto-spend formula, spend modes, jar availability
- [bill-system.md](domain/budget-simulation/bill-system.md) — Bill estimation, variance, reserve, reconciliation waterfall, stress mode
- [event-system.md](domain/budget-simulation/event-system.md) — Life events (LQI-weighted), OT events (job-based), spawn logic, multi-jar payment
- [commitment-system.md](domain/budget-simulation/commitment-system.md) — Commitment layers, effective ranges, category rules, guardrail, run completion
- [analyze-system.md](domain/budget-simulation/analyze-system.md) — Post-run analysis: formulas, thresholds, stability rules, trend slope, insight generation

## Logic Maps — Budget Simulation
- [overview.md](logic_map/budget-simulation/overview.md) — Architecture, API endpoints, orchestration flows, transaction boundaries, file map
- [run-services.md](logic_map/budget-simulation/run-services.md) — RunService (startBudgetRun, startMonth), RunStateService, RunCommitmentService
- [month-week-service.md](logic_map/budget-simulation/month-week-service.md) — resolveWeek orchestrator: context loading, forced rest, spawn, index, bills
- [month-event-service.md](logic_map/budget-simulation/month-event-service.md) — Event spawn logic (life + OT), applyChoice, multi-jar payment, OT deferral
- [month-support-services.md](logic_map/budget-simulation/month-support-services.md) — MonthSpendService, MonthIndexService, MonthBillService, NextMonthPreview, ConfigService, SetupService
- [queries-repositories.md](logic_map/budget-simulation/queries-repositories.md) — All queries (run, month, commitment, module) and repositories (run, month)
- [domain-helpers.md](logic_map/budget-simulation/domain-helpers.md) — Pure domain functions (spending, index, bills, events, income, OT) and helper utilities

## Domain Maps — Invest Simulation
- [overview.md](domain/invest-simulation/overview.md) — Module 4 concept, entities, trading rules, price model, phases

## Logic Maps — Invest Simulation
- [overview.md](logic_map/invest-simulation/overview.md) — Phase 1 API endpoints, trade/portfolio flows, file map
