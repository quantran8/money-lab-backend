export {
  computeBuyFill,
  computeSellFill,
  computeNewAvgPrice,
  allowsFractionalQuantity,
} from './trading/trade-executor.js';

export type {
  BuyFillInput,
  BuyFillResult,
  SellFillInput,
  SellFillResult,
  AvgPriceInput,
} from './trading/trade-executor.js';

export {
  calculatePortfolioSummary,
  calculateExposure,
  calculateUnrealizedPnL,
} from './portfolio/portfolio-calculator.js';

export type {
  PositionInput,
  PriceMap,
  PortfolioSummary,
  ExposureEntry,
  PnLEntry,
  PnLSummary,
} from './portfolio/portfolio-calculator.js';

export {
  clampPrice,
  roundPrice,
  calculateChangePct,
} from './pricing/price-helpers.js';

// Phase 2: Price generation
export {
  generatePrice,
  combineImpacts,
  generateTickPrices,
} from './pricing/price-generator.js';

export type {
  PriceImpacts,
  GeneratePriceInput,
  GeneratePriceResult,
} from './pricing/price-generator.js';

// Phase 2: State machines
export {
  transitionSpotlight,
  spotlightPriceMultiplier,
  isSpotlightActive,
  isSpotlightCompleted,
} from './state-machines/asset-spotlight.js';

export type {
  SpotlightState,
  SpotlightTransitionInput,
  SpotlightTransitionResult,
} from './state-machines/asset-spotlight.js';

export {
  transitionArc,
  computeArcAssetImpacts,
  isArcActive,
  isArcCompleted,
} from './state-machines/world-arc.js';

export type {
  ArcState,
  ArcTransitionInput,
  ArcTransitionResult,
  ArcSectorWeight,
} from './state-machines/world-arc.js';

// Phase 2: News generation
export { generateNewsFromTransitions } from './news/news-generator.js';

export type {
  SpotlightTransitionEvent,
  ArcTransitionEvent,
  PolicyNewsEvent,
  StateTransitionEvent,
  GeneratedNewsItem,
} from './news/news-generator.js';

// Phase 3: Policy thread state machine
export {
  transitionPolicy,
  policyPriceMultiplier,
  computePolicyAssetImpacts,
  isPolicyActive,
  isPolicyCompleted,
} from './state-machines/policy-thread.js';

export type {
  PolicyState,
  PolicyTransitionInput,
  PolicyTransitionResult,
  PolicySectorWeight,
} from './state-machines/policy-thread.js';

// Phase 3: Behavior metrics
export {
  computeBehaviorMetrics,
  computeTurnover,
  computeReactionTime,
  computeConcentrationChange,
  computeVolatilityChasing,
} from './behavior/behavior-metrics.js';

export type {
  BehaviorInput,
  BehaviorMetrics,
} from './behavior/behavior-metrics.js';

// Phase 3: Stability
export { computeStabilityFactor } from './behavior/stability-calculator.js';

export type {
  StabilityInput,
  StabilityResult,
} from './behavior/stability-calculator.js';

// Phase 3: Score
export { computeScore } from './behavior/score-calculator.js';

export type { ScoreInput, ScoreResult } from './behavior/score-calculator.js';

// Phase 4: Reflections
export { generateReflections } from './reflection/reflection-generator.js';

export type {
  ReflectionTemplate,
  ReflectionCondition,
  BehaviorSnapshot,
  GeneratedReflection,
} from './reflection/reflection-generator.js';

// Phase 4: Missions
export { matchMissions } from './mission/mission-matcher.js';

export type {
  MissionDefinition,
  MissionCondition,
  UserState,
  MatchedMission,
} from './mission/mission-matcher.js';

// Phase 5: Spawn engine
export {
  shouldSpawnSpotlightFromArc,
  selectSpotlightAssets,
  selectSpotlightTemplate,
  filterArcCandidatesByCooldown,
  selectArcType,
  selectPolicyTemplate,
} from './state-machines/spawn-engine.js';

export type {
  ArcSpawnCandidate,
  SpotlightAssetCandidate,
  SpotlightTemplateCandidate,
  PolicySpawnCandidate,
} from './state-machines/spawn-engine.js';

// Phase 4: Reports
export { buildReport } from './report/report-builder.js';

export type { ReportInput, ReportData } from './report/report-builder.js';
