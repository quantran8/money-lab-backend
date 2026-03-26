---
name: invest-simulation-overview
description: Module 4 overview — fictional investment simulation with system-controlled market, user trading, behavior evaluation
type: project
---

# Invest Simulation (Module 4) — Domain Overview

## Core Concept
Financial education simulation where users trade fictional assets in a system-controlled shared market. All users see the same prices. User actions never affect market prices.

## Key Invariants
- Market state is system-owned; portfolio actions are user-owned
- All randomness must be deterministic (seeded PRNG)
- Prices generated from world events, not user activity
- Same tick → same prices for all users

## Entities

### Phase 1 — Market Layer
- **InvestSector** — lookup table (SmallInt PK), groups assets
- **InvestAsset** — fictional tradable asset with type, risk tier, volatility profile, attention sensitivity
- **InvestMarketTick** — global simulation clock (tickIndex unique)
- **InvestWorldStateAtTick** — JSON snapshot of world conditions per tick
- **InvestAssetPricePoint** — price per asset per tick (integer cents)
- **InvestMarketEventTemplate** — event definition templates
- **InvestMarketEventLog** — fired events per tick

### Phase 1 — User Layer
- **InvestUserCredit** — per-user balance (one row per user, unique userId)
- **InvestPortfolioPosition** — holdings per asset (unique userId+assetId)
- **InvestPortfolioTransaction** — buy/sell audit log

### Phase 2 — News & Events
- **InvestSimNewsItem** — generated news articles per tick (title, body, tone, intensity, narrativeTag)
- **InvestSimNewsAssetImpact** — news → asset impact mapping (impactPct)
- **InvestSimNewsSectorImpact** — news → sector impact mapping (impactPct)

### Phase 2 — State Machines
- **InvestAssetSpotlightTemplate** — spotlight event templates (code, title, rarity)
- **InvestAssetSpotlightInstance** — active spotlight FSM (6 states: dormant→emerging→hype→peak→decline→recovery)
- **InvestWorldArcType** — world arc type definitions (SmallInt PK)
- **InvestWorldArcInstance** — active arc FSM (5 states: background→spark→expansion→integration→absorbed)
- **InvestPolicyThreadTemplate** — policy thread definitions

### Phase 3 — Policy Threads
- **InvestPolicyThreadInstance** — active policy FSM (6 states: undeclared→declared_path→action_1→action_2→action_3→resolution)

### Phase 3 — Behavior & Scoring
- **InvestBehaviorWindow** — observation windows opened by tick events (windowType, startTick, endTick, triggerReason)
- **InvestUserBehaviorSnapshot** — per-user metrics per window (turnover, reaction time, concentration, volatility chasing)
- **InvestUserStabilityMetric** — per-user stability breakdown (diversification, volatility, concentration, holding duration → factor)
- **InvestUserScore** — composite score per user (wealthPoints = portfolioValue × stabilityFactor, tier)

### Phase 4 — Reflections, Missions, Reports
- **InvestReflectionTemplate** — template with condition (thresholds) and bodyTemplate (with placeholders)
- **InvestUserReflection** — generated reflection per user per tick
- **InvestMission** — mission definitions with condition matching
- **InvestUserMission** — assigned missions per user (active/completed, unique userId+missionId)
- **InvestSimReport** — periodic report with exposure, volatility, stability, reflection summary

## Module ID
`INVEST_SIMULATION_MODULE_ID = 4`

## Price Model
- Prices stored as integers (cents)
- Guardrails: max -20% / +30% per tick, floor = 1
- Formula: `newPrice = prevPrice × (1 + combinedImpact)` where combinedImpact = sector + spotlight + arc + policy + noise
- Noise amplitude by volatility profile: low=0.01, medium=0.02, high=0.04, extreme=0.06
- Change percentage tracked per price point

## State Machine Rules
- **Spotlight**: 6 states, each with min dwell ticks before transition. Dormant is terminal/spawn-only. Cooldown of 10 ticks after completion.
- **World Arc**: 5 states with progress tracking. Absorbed is terminal. Global market impact per state.
- **Policy Thread**: 6 states (undeclared→declared_path→action_1-3→resolution). Creates market uncertainty. Resolution is terminal.
- Transitions are deterministic (seeded by `type:instanceId:tickIndex`).

## Trading Rules
- Buy: validate credits ≥ totalCost, atomic deduct via raw SQL WHERE balance >= amount
- Sell: validate held quantity ≥ sell quantity, position removed when qty reaches 0
- Both use Load → Compute → Single Transaction Write pattern
- New avg buy price = weighted average on buy

## News Generation Rules
- News is descriptive, never advisory (no "buy"/"sell" language)
- Generated from state machine transitions (spotlight state changes, arc state changes)
- Each news item carries asset impacts and sector impacts (used for price generation)
- Headline templates selected deterministically by seed

## Behavior Evaluation Rules
- Behavior windows opened when state machines transition (spotlight, arc, policy events)
- Windows close after 10 ticks (DEFAULT_WINDOW_DURATION)
- On close: evaluate all users who traded during window
- Metrics: turnover, reaction time, concentration change, volatility chasing
- Stability factor = 1 + diversification + volatility_score + holding_duration - concentration_penalty (clamped 0.5–2.0)
- WealthPoints = totalPortfolioValue × stabilityFactor
- Tiers: beginner(<50k), developing(<100k), steady(<200k), advanced(<500k), elite(≥500k)

## Tick Orchestration Order
1. Create new market tick
2. Advance state machines (spotlights, arcs, policies)
3. Generate news from transitions → returns sector impacts
4. Generate prices from combined impacts (sector + spotlight + arc + policy + noise)
5. Open behavior windows from transitions
6. Close expired behavior windows + evaluate user behavior
7. Create world state snapshot

## Sim Calendar
1 tick = 1 day, 30 days/month, 12 months/year

## Reflection Rules
- Templates have conditions (min/max thresholds on behavior metrics)
- Generated from latest behavior snapshot → template matching → fill placeholders
- Multiple reflections may match per snapshot

## Mission Rules
- Missions are reflective labels, not tasks (match behavior patterns, not explicit goals)
- Conditions based on: snapshot count, avg turnover, stability factor, sector count, position count
- Deduplicated: already-assigned missions are skipped

## Report Contents
- Sector exposure (% allocation), asset type exposure
- Average volatility, stability score
- Reflection summary (last 3 reflections joined)

## Phases
1. **Phase 1** (done): Assets, prices, credits, trading, portfolio — 28 files, 10 Prisma models
2. **Phase 2** (done): Tick engine, price generation, news, state machines — 46 files total, 18 Prisma models
3. **Phase 3** (done): Policy threads, behavior windows, stability scoring — 63 files total, 23 Prisma models
4. **Phase 4** (done): Reflections, missions, reports — 78 files total, 28 Prisma models
