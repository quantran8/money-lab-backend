---
name: invest-simulation-logic-map
description: Logic map for invest-simulation Phase 1-4 — API endpoints, tick engine, behavior/scoring, reflections/missions, file map
type: project
---

# Invest Simulation — Logic Map (Phase 1-4)

## Architecture
```
InvestController → InvestSimulationService (facade)
  → InvestMarketStateService
  → InvestAssetService
  → InvestTradeService
  → InvestPortfolioService
  → InvestNewsService
  → InvestStabilityScoreService
  → InvestReflectionService
  → InvestMissionService
  → InvestReportService
  → InvestTickService
      → InvestSpotlightService (FSM)
      → InvestArcService (FSM)
      → InvestPolicyService (FSM)
      → InvestNewsService (generation)
      → InvestPricingService (generation)
      → InvestBehaviorWindowService (open/close)
      → InvestBehaviorEvaluationService (snapshot)

InvestTickScheduler (cron: every 6h) → InvestTickService.runTick()
```

## API Endpoints

| Method | Route | Service Method | Description |
|--------|-------|---------------|-------------|
| GET | market/state | marketState.getCurrentMarketState | Current tick + world state |
| GET | market/prices | marketState.getLatestPrices | Latest prices all assets |
| GET | assets | asset.getAssetList | All assets with latest price |
| GET | assets/:id | asset.getAssetDetail | Asset detail + price history |
| GET | portfolio | portfolio.getPortfolio | User overview + positions + P&L |
| GET | portfolio/positions | portfolio.getPositions | User positions list |
| GET | portfolio/transactions | portfolio.getTransactions | Transaction history |
| POST | orders/buy | trade.executeBuy | Buy asset |
| POST | orders/sell | trade.executeSell | Sell asset |
| GET | news | news.getNewsFeed | News feed (recent) |
| GET | news/:id | news.getNewsById | News detail |
| POST | internal/run-tick | tick.runTick | Advance one tick (admin/cron) |
| GET | score | stabilityScore.getUserScore | Wealth points + tier |
| GET | stability | stabilityScore.getUserStability | Stability metric breakdown |
| POST | internal/evaluate-users | stabilityScore.evaluateAllUsers | Recalculate all user scores |
| GET | reflections | reflection.getUserReflections | User reflections list |
| GET | missions | mission.getUserMissions | User missions list |
| GET | reports/latest | report.getLatestReport | Latest simulation report |

## Trade Flow (executeBuy)

1. **LOAD** (parallel): asset, tick → credit, pricePoint, position
2. **COMPUTE** (pure domain): `computeBuyFill({ availableCredits, pricePerUnit, quantity })`
3. **VALIDATE**: fill.valid check → BadRequestException if invalid
4. **COMPUTE**: `computeNewAvgPrice({ currentQty, currentAvgPrice, addQty, addPrice })`
5. **WRITE** (single tx):
   - `ensureUserCredit` (if first time)
   - `deductCredits` (raw SQL with WHERE balance >= amount)
   - `upsertPosition` (increment qty, set new avg price)
   - `createTransaction` (audit record)

## Trade Flow (executeSell)

1. **LOAD** (parallel): tick, position → pricePoint
2. **COMPUTE** (pure domain): `computeSellFill({ heldQuantity, pricePerUnit, quantity })`
3. **VALIDATE**: fill.valid check
4. **WRITE** (single tx):
   - `addCredits`
   - `decreasePosition`
   - `deletePositionIfEmpty`
   - `createTransaction`

## Portfolio Flow (getPortfolio)

1. **LOAD** (parallel): credit, positions (with asset+sector), tick
2. **LOAD**: latest prices for tick
3. **COMPUTE** (pure domain):
   - `calculatePortfolioSummary`
   - `calculateExposure` (by sector, by type)
   - `calculateUnrealizedPnL`
4. **RETURN**: merged summary

## File Map

### Root
- `invest-simulation.module.ts` — @Global() module registration
- `invest-simulation.controller.ts` — routes + AuthGuard
- `invest-simulation.service.ts` — facade (delegates)
- `invest-simulation.constant.ts` — MODULE_ID, defaults, guardrails
- `invest-simulation.enum.ts` — OrderSide, AssetType, RiskTier
- `invest-simulation.helpers.ts` — re-exports deterministicRandom, seedInt

### Domain (pure, no I/O)
- `domain/trading/trade-executor.ts` — computeBuyFill, computeSellFill, computeNewAvgPrice
- `domain/portfolio/portfolio-calculator.ts` — calculatePortfolioSummary, calculateExposure, calculateUnrealizedPnL
- `domain/pricing/price-helpers.ts` — clampPrice, roundPrice, calculateChangePct

### Types
- `types/asset.types.ts` — AssetRow, AssetWithSectorRow, SectorRow
- `types/market.types.ts` — MarketTickRow, TickWithWorldStateRow, PricePointRow, WorldStateRow
- `types/portfolio.types.ts` — PositionRow, PositionWithAssetRow, TransactionRow, TransactionWithAssetRow
- `types/credit.types.ts` — UserCreditRow

### Queries (read-only)
- `queries/asset.query.ts` — InvestAssetQuery
- `queries/market.query.ts` — InvestMarketQuery
- `queries/portfolio.query.ts` — InvestPortfolioQuery

### Repositories (write)
- `repositories/portfolio.repository.ts` — InvestPortfolioRepository
- `repositories/market.repository.ts` — InvestMarketRepository

### Services
- `services/config.service.ts` — InvestConfigService
- `services/market-state.service.ts` — InvestMarketStateService
- `services/asset.service.ts` — InvestAssetService
- `services/trade.service.ts` — InvestTradeService
- `services/portfolio.service.ts` — InvestPortfolioService
- `services/spotlight.service.ts` — InvestSpotlightService (FSM advancement)
- `services/arc.service.ts` — InvestArcService (FSM advancement)
- `services/pricing.service.ts` — InvestPricingService (price generation)
- `services/news.service.ts` — InvestNewsService (news CRUD + generation)
- `services/tick.service.ts` — InvestTickService (master tick orchestrator)
- `services/tick-scheduler.service.ts` — InvestTickScheduler (cron: every 6h auto-tick)
- `services/spawn.service.ts` — InvestSpawnService (auto-spawn spotlights, arcs, policies)

## Tick Flow (runTick)

1. **LOAD**: current tick → determine nextTickIndex, sim calendar
2. **WRITE** (single tx):
   a. Create market tick record
   b. Advance spotlights → transition events + asset impacts
   c. Advance arcs → transition events + per-asset impacts (magnitude × sector/category weight) + remainingActiveCount
   d. Advance policies → transition events + per-asset impacts (magnitude × sector/category weight) + remainingActiveCount
   e. Auto-spawn: arc-driven spotlights, arc respawn, policy respawn → spawn events + impacts
   f. Merge advance + spawn events
   g. Generate news from all transitions → sector impacts
   h. Generate prices from combined impacts (sector + spotlight + arc per-asset + policy per-asset + noise)
   i. Open behavior windows from transitions
   j. Close expired windows + evaluate user behavior → snapshots
   k. Create world state snapshot

### Phase 2 Domain (pure, no I/O)
- `domain/pricing/price-generator.ts` — generatePrice, generateTickPrices, combineImpacts
- `domain/news/news-generator.ts` — generateNewsFromTransitions
- `domain/state-machines/asset-spotlight.ts` — transitionSpotlight, spotlightPriceMultiplier (6-state FSM)
- `domain/state-machines/world-arc.ts` — transitionArc, arcImpactMultiplier (5-state FSM)
- `domain/state-machines/spawn-engine.ts` — selectSpotlightAssets, selectSpotlightTemplate, selectArcType, selectPolicyTemplate, filterArcCandidatesByCooldown

### Phase 2 Types
- `types/news.types.ts` — NewsItemRow, NewsWithImpactsRow
- `types/spotlight.types.ts` — SpotlightInstanceRow, SpotlightInstanceFullRow
- `types/arc.types.ts` — ArcInstanceRow, ArcInstanceWithTypeRow, ArcSpotlightTemplateRow, ArcAssetAffinityRow

### Phase 2 Queries
- `queries/news.query.ts` — InvestNewsQuery
- `queries/spotlight.query.ts` — InvestSpotlightQuery
- `queries/arc.query.ts` — InvestArcQuery

### Phase 2 Repositories
- `repositories/news.repository.ts` — InvestNewsRepository
- `repositories/spotlight.repository.ts` — InvestSpotlightRepository
- `repositories/arc.repository.ts` — InvestArcRepository

### Phase 3 Domain (pure, no I/O)
- `domain/state-machines/policy-thread.ts` — transitionPolicy, computePolicyAssetImpacts, policyPriceMultiplier (deprecated) (6-state FSM)
- `domain/behavior/behavior-metrics.ts` — computeBehaviorMetrics (turnover, reaction, concentration, chasing)
- `domain/behavior/stability-calculator.ts` — computeStabilityFactor (diversification + patience - penalties)
- `domain/behavior/score-calculator.ts` — computeScore (wealthPoints = value × stability, tier)

### Phase 3 Types
- `types/policy.types.ts` — PolicyInstanceRow, PolicyInstanceWithTemplateRow, PolicySectorImpactRow, PolicyInstanceWithTemplateAndImpactsRow
- `types/behavior.types.ts` — BehaviorWindowRow, BehaviorSnapshotRow, StabilityMetricRow
- `types/score.types.ts` — UserScoreRow

### Phase 3 Queries
- `queries/policy.query.ts` — InvestPolicyQuery
- `queries/behavior.query.ts` — InvestBehaviorQuery
- `queries/score.query.ts` — InvestScoreQuery

### Phase 3 Repositories
- `repositories/policy.repository.ts` — InvestPolicyRepository
- `repositories/behavior.repository.ts` — InvestBehaviorRepository
- `repositories/score.repository.ts` — InvestScoreRepository

### Phase 3 Services
- `services/policy.service.ts` — InvestPolicyService (FSM advancement, per-asset impacts via PolicySectorImpact, integrated into tick)
- `services/behavior-window.service.ts` — InvestBehaviorWindowService (open/close windows)
- `services/behavior-evaluation.service.ts` — InvestBehaviorEvaluationService (evaluate users per window)
- `services/stability-score.service.ts` — InvestStabilityScoreService (recalculate stability + score, read APIs)

### Phase 4 Domain (pure, no I/O)
- `domain/reflection/reflection-generator.ts` — generateReflections (template condition matching + placeholder fill)
- `domain/mission/mission-matcher.ts` — matchMissions (condition matching, deduplication)
- `domain/report/report-builder.ts` — buildReport (aggregate exposure, volatility, reflections)

### Phase 4 Types
- `types/reflection.types.ts` — ReflectionTemplateRow, UserReflectionWithTemplateRow
- `types/mission.types.ts` — MissionRow, UserMissionWithMissionRow
- `types/report.types.ts` — SimReportRow

### Phase 4 Queries
- `queries/reflection.query.ts` — InvestReflectionQuery
- `queries/mission.query.ts` — InvestMissionQuery
- `queries/report.query.ts` — InvestReportQuery

### Phase 4 Repositories
- `repositories/reflection.repository.ts` — InvestReflectionRepository
- `repositories/mission.repository.ts` — InvestMissionRepository
- `repositories/report.repository.ts` — InvestReportRepository

### Phase 4 Services
- `services/reflection.service.ts` — InvestReflectionService (generate + read)
- `services/mission.service.ts` — InvestMissionService (assign + read)
- `services/report.service.ts` — InvestReportService (generate + read)
