import { Module, Global } from '@nestjs/common';
import { TransactionRunner } from '#app/prisma/transaction.runner.js';

// Controller
import { InvestController } from './invest-simulation.controller.js';

// Queries
import { AssetQuery } from './queries/asset.query.js';
import { InvestMarketQuery } from './queries/market.query.js';
import { InvestPortfolioQuery } from './queries/portfolio.query.js';
import { InvestNewsQuery } from './queries/news.query.js';
import { InvestSpotlightQuery } from './queries/spotlight.query.js';
import { InvestArcQuery } from './queries/arc.query.js';
import { InvestPolicyQuery } from './queries/policy.query.js';
import { InvestBehaviorQuery } from './queries/behavior.query.js';
import { InvestScoreQuery } from './queries/score.query.js';
import { InvestReflectionQuery } from './queries/reflection.query.js';
import { MissionQuery } from './queries/mission.query.js';
import { InvestReportQuery } from './queries/report.query.js';

// Repositories
import { InvestPortfolioRepository } from './repositories/portfolio.repository.js';
import { InvestMarketRepository } from './repositories/market.repository.js';
import { InvestNewsRepository } from './repositories/news.repository.js';
import { InvestSpotlightRepository } from './repositories/spotlight.repository.js';
import { InvestArcRepository } from './repositories/arc.repository.js';
import { InvestPolicyRepository } from './repositories/policy.repository.js';
import { InvestBehaviorRepository } from './repositories/behavior.repository.js';
import { InvestScoreRepository } from './repositories/score.repository.js';
import { InvestReflectionRepository } from './repositories/reflection.repository.js';
import { MissionRepository } from './repositories/mission.repository.js';
import { InvestReportRepository } from './repositories/report.repository.js';

// Services
import { InvestConfigService } from './services/config.service.js';
import { InvestMarketStateService } from './services/market-state.service.js';
import { AssetService } from './services/asset.service.js';
import { InvestTradeService } from './services/trade.service.js';
import { InvestPortfolioService } from './services/portfolio.service.js';
import { InvestSpotlightService } from './services/spotlight.service.js';
import { InvestArcService } from './services/arc.service.js';
import { InvestPricingService } from './services/pricing.service.js';
import { InvestNewsService } from './services/news.service.js';
import { InvestTickService } from './services/tick.service.js';
import { InvestPolicyService } from './services/policy.service.js';
import { BehaviorWindowService } from './services/behavior-window.service.js';
import { InvestBehaviorEvaluationService } from './services/behavior-evaluation.service.js';
import { InvestStabilityScoreService } from './services/stability-score.service.js';
import { InvestReflectionService } from './services/reflection.service.js';
import { MissionService } from './services/mission.service.js';
import { InvestReportService } from './services/report.service.js';

// Facade
import { InvestSimulationService } from './invest-simulation.service.js';

@Global()
@Module({
  controllers: [InvestController],
  providers: [
    // Infrastructure
    TransactionRunner,
    // Queries
    AssetQuery,
    InvestMarketQuery,
    InvestPortfolioQuery,
    InvestNewsQuery,
    InvestSpotlightQuery,
    InvestArcQuery,
    InvestPolicyQuery,
    InvestBehaviorQuery,
    InvestScoreQuery,
    InvestReflectionQuery,
    MissionQuery,
    InvestReportQuery,
    // Repositories
    InvestPortfolioRepository,
    InvestMarketRepository,
    InvestNewsRepository,
    InvestSpotlightRepository,
    InvestArcRepository,
    InvestPolicyRepository,
    InvestBehaviorRepository,
    InvestScoreRepository,
    InvestReflectionRepository,
    MissionRepository,
    InvestReportRepository,
    // Services
    InvestConfigService,
    InvestMarketStateService,
    AssetService,
    InvestTradeService,
    InvestPortfolioService,
    InvestSpotlightService,
    InvestArcService,
    InvestPricingService,
    InvestNewsService,
    InvestTickService,
    InvestPolicyService,
    BehaviorWindowService,
    InvestBehaviorEvaluationService,
    InvestStabilityScoreService,
    InvestReflectionService,
    MissionService,
    InvestReportService,
    // Facade
    InvestSimulationService,
  ],
  exports: [InvestConfigService],
})
export class InvestModule {}
