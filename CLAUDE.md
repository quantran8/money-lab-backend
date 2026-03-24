# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

Money Lab Backend — a NestJS API for a financial education simulation game. The project has three main modules:

1. **Learn** (`learn/`) — Educational content and learning paths
2. **Budget Simulation** (`budget-simulation/`) — Users run budget simulations across months/weeks, encountering life events, managing jar-based spending, and tracking quality-of-life indices
3. **Invest Simulation** (`invest-simulation/`) — Investment simulation module

**Stack:** NestJS 11 + Fastify, TypeScript, Prisma ORM, PostgreSQL (Supabase-hosted), Supabase Auth (JWT/Passport)

---

## Commands

```bash
yarn install
yarn start:dev
yarn build
yarn start:prod
yarn test
yarn test:watch
yarn test:e2e
yarn test:cov
yarn lint
yarn format
npx prisma migrate dev
npx prisma generate
```

Run a single test file:

```bash
yarn test -- --testPathPattern=<pattern>
```

---

## Architecture

Strict layered architecture — dependencies flow downward only:

```
Controller → Service → Domain → Query / Repository → Prisma → DB
```

### Layer Responsibilities

| Layer      | Responsibility                         | Rules                        |
| ---------- | -------------------------------------- | ---------------------------- |
| Controller | HTTP routes, DTO validation            | No business logic, no Prisma |
| Service    | Orchestration, workflows, transactions | No direct Prisma             |
| Domain     | Pure business logic                    | No I/O, no NestJS, no DB     |
| Query      | Read-only DB operations                | Encapsulate Prisma reads     |
| Repository | Write-only DB operations               | Accept tx for transactions   |

### Forbidden Dependencies

* Controller → Prisma
* Service → Prisma
* Domain → DB
* Query ↔ Service
* Repository ↔ Service

---

## Module Structure — Budget Simulation

```
budget-simulation/
├── domain/
│   ├── events/
│   ├── spending/
│   ├── bills/
│   ├── index/
│   ├── income/
├── queries/
├── repositories/
├── services/
```

### Service Breakdown

* `month-week.service.ts` → main orchestrator (resolveWeek)
* `month-event.service.ts` → event spawn & application
* `month-spend.service.ts` → spending logic
* `month-bill.service.ts` → bill reconciliation
* `month-index.service.ts` → HI/LQI calculation

---

## Key Conventions

* No `any`
* Explicit return types
* Max ~400 lines per service
* Max ~80 lines per method
* Max 6 DB queries per endpoint

### Performance Pattern

```
Load → Compute → Single Transaction Write
```

### Deterministic System

* All randomness must be seeded
* Same input → same output
* Use deterministic PRNG only

---

## Memory System (MANDATORY)

Memory is required context. Never skip it.

### Memory Locations

* Domain: `.claude/memory/domain/<module>/`
* Logic Map: `.claude/memory/logic_map/<module>/`
* Dev Context: `.claude/memory/dev/`

---

## Reasoning Protocol (CRITICAL)

Before ANY implementation or modification:

1. Identify module:

   * budget-simulation
   * invest-simulation
   * learn

2. Load logic_map:
   `.claude/memory/logic_map/<module>/`

3. Identify business flow step

4. Map code → business logic

5. Validate against domain rules:
   `.claude/memory/domain/<module>/`

6. Then implement

❗ Do NOT write code without this process

---

## Logic Map = Source of Truth

* Defines system flow
* Defines orchestration order
* All services must follow it

If mismatch:

* update logic_map OR
* refactor code

❗ No orphan logic allowed

---

## Weekly Resolution Flow (Budget Simulation)

Strict execution order:

1. Load context (run, month, commitments, config)
2. Forced rest check
3. Event spawn (life + OT)
4. Apply event effects
5. Bill computation & reconciliation
6. Spending calculation (jar system)
7. Index update (HI/LQI)
8. Persist (single transaction)

❗ Never reorder or skip steps

---

## Domain Boundaries (STRICT)

Each domain folder = ONE business concept:

* events → event lifecycle
* spending → jar logic
* bills → financial obligations
* index → HI/LQI system
* income → earnings & OT

Rules:

* Do NOT mix responsibilities
* Domain must remain pure
* No DB / I/O / NestJS in domain
* All calculations belong in domain

---

## Code ↔ Business Logic Mapping

Every function MUST map to a logic_map step.

If not:

* update logic_map OR
* refactor code

❗ No untracked logic allowed

---

## Memory Priority

When conflicts occur:

1. logic_map (flow)
2. domain memory (rules)
3. CLAUDE.md (structure)

---

## Anti-Pattern Guard

Reject any implementation that:

* Uses Prisma in Service
* Adds side effects in Domain
* Uses non-deterministic randomness
* Breaks transaction boundaries
* Duplicates logic across layers
* Violates architecture rules

---

<!-- ## Context Loading (REQUIRED)

Before solving any task:

* Load `current_task.md`
* Load domain files
* Load logic_map

❗ Do not answer from assumptions

--- -->

## Code + Business Logic Synchronization (CRITICAL)

Any change that affects business logic MUST update:

1. Code (services/domain)
2. logic_map (flow definition)
3. domain memory (business rules)

This includes:

* new features
* logic changes
* flow changes
* bug fixes that affect behavior

---

### Required Behavior

When modifying logic:

1. Identify impacted logic_map step
2. Update code accordingly
3. Update corresponding logic_map file
4. Update domain memory if rules/formulas changed

All three must stay synchronized.

---

### Strict Rule

* Code must NEVER diverge from logic_map
* logic_map must NEVER be outdated
* domain memory must reflect current behavior

If only code is updated → the task is incomplete

---

### Example

If you change:

* spending calculation

You MUST update:

* `domain/spending/*` (code)
* `memory/domain/.../spending.md`
* `memory/logic_map/.../spending.md`


## Final Principle

Code is NOT the source of truth.

System behavior is defined by:

* logic_map (flow)
* domain (business rules)

Always reason:

System → Flow → Logic → Code

## Completion Checklist (MANDATORY BEFORE RESPONDING)

Before finishing any task, Claude MUST verify the following:

---

### 1. Context Alignment

* [ ] Module identified correctly (budget / invest / learn)
* [ ] Relevant logic_map files loaded
* [ ] Relevant domain memory loaded
* [ ] current_task.md considered

---

### 2. Business Logic Mapping

* [ ] The change maps to a defined step in logic_map
* [ ] No orphan or undefined logic introduced
* [ ] Flow order is preserved

---

### 3. Architecture Compliance

* [ ] No Prisma usage in Service
* [ ] No business logic in Controller
* [ ] Domain remains pure (no I/O, no DB)
* [ ] Query = read only, Repository = write only

---

### 4. Domain Integrity

* [ ] Logic placed in correct domain folder (events, spending, bills, index, income)
* [ ] No cross-domain responsibility mixing
* [ ] Deterministic rules preserved (no unseeded randomness)

---

### 5. Performance Constraints

* [ ] DB queries ≤ 6 (or justified)
* [ ] Load → compute → single transaction pattern followed
* [ ] No unnecessary round trips

---

### 6. Code + Memory Synchronization

If logic was changed:

* [ ] Code updated
* [ ] logic_map updated
* [ ] domain memory updated

If any of the above is missing → task is NOT complete

---

### 7. Anti-Pattern Check

* [ ] No layer violations
* [ ] No duplicated logic
* [ ] No hidden side effects
* [ ] No breaking of transaction boundaries

---

### 8. Clarity & Maintainability

* [ ] Code is readable and structured
* [ ] Naming reflects business meaning
* [ ] No unnecessary complexity introduced

---

## Final Rule

Do NOT provide final answer until all checklist items are satisfied.

If any item fails:

* Fix it before responding
* Or explicitly state what is missing

