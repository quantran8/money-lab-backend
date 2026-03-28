import { Injectable, Logger } from '@nestjs/common';
import { TransactionRunner } from '#app/prisma/transaction.runner.js';
import { wrapAsync } from '#common/utils/async.utils.js';
import { InvestMarketQuery } from '../queries/market.query.js';
import { InvestMarketRepository } from '../repositories/market.repository.js';
import { InvestSpotlightService } from './spotlight.service.js';
import { InvestArcService } from './arc.service.js';
import { InvestPolicyService } from './policy.service.js';
import { InvestNewsService } from './news.service.js';
import { InvestPricingService } from './pricing.service.js';
import { BehaviorWindowService } from './behavior-window.service.js';
import { InvestBehaviorEvaluationService } from './behavior-evaluation.service.js';
import type { StateTransitionEvent } from '../domain/index.js';

@Injectable()
export class InvestTickService {
  private readonly logger = new Logger(InvestTickService.name);

  constructor(
    private readonly transactionRunner: TransactionRunner,
    private readonly marketQuery: InvestMarketQuery,
    private readonly marketRepo: InvestMarketRepository,
    private readonly spotlightService: InvestSpotlightService,
    private readonly arcService: InvestArcService,
    private readonly policyService: InvestPolicyService,
    private readonly newsService: InvestNewsService,
    private readonly pricingService: InvestPricingService,
    private readonly behaviorWindowService: BehaviorWindowService,
    private readonly behaviorEvalService: InvestBehaviorEvaluationService,
  ) {}

  /**
   * Advance the simulation by one tick.
   * Orchestration order:
   *   1. Create new market tick
   *   2. Advance state machines (spotlights, arcs, policies)
   *   3. Generate news from state transitions
   *   4. Generate prices from combined impacts
   *   5. Open behavior windows from transitions
   *   6. Close expired behavior windows + evaluate
   *   7. Create world state snapshot
   *
   * All writes in a single transaction.
   */
  async runTick() {
    return wrapAsync(this.logger, 'runTick', async () => {
      // 1. Determine next tick index
      const currentTick = await this.marketQuery.findCurrentTick();
      const nextTickIndex = (currentTick?.tickIndex ?? 0n) + 1n;

      // Simple sim calendar: 1 tick = 1 day, 30 days/month, 12 months/year
      const totalDays = Number(nextTickIndex);
      const simYear = Math.floor(totalDays / 360) + 1;
      const dayOfYear = totalDays % 360;
      const simMonth = Math.floor(dayOfYear / 30) + 1;
      const simDay = (dayOfYear % 30) + 1;

      // 2. Execute all writes in a single transaction
      const result = await this.transactionRunner.run(async (tx) => {
        // 2a. Create tick record
        const tick = await this.marketRepo.createTick(
          { tickIndex: nextTickIndex, simDay, simMonth, simYear },
          tx,
        );

        // 2b. Advance state machines
        const spotlightResult = await this.spotlightService.advanceAll(nextTickIndex, tx);
        const arcResult = await this.arcService.advanceAll(nextTickIndex, tx);
        const policyResult = await this.policyService.advanceAll(nextTickIndex, tx);

        // 2c. Collect transition events for news generation
        const allEvents: StateTransitionEvent[] = [
          ...spotlightResult.events,
          ...arcResult.events,
        ];

        // 2d. Generate news from transitions → returns sector impacts
        const sectorImpacts = await this.newsService.generateNewsForTick(
          tick.id,
          nextTickIndex,
          simDay,
          simMonth,
          simYear,
          allEvents,
          tx,
        );

        // 2e. Generate prices from all combined impacts (including policy)
        await this.pricingService.generatePricesForTick(
          tick.id,
          nextTickIndex,
          spotlightResult.assetImpacts,
          arcResult.globalImpact,
          policyResult.globalPolicyImpact,
          sectorImpacts,
          tx,
        );

        // 2f. Open behavior windows from transitions
        await this.behaviorWindowService.openWindowsForTick(
          nextTickIndex,
          spotlightResult.events.length,
          arcResult.events.length,
          policyResult.events.length,
          tx,
        );

        // 2g. Close expired windows + evaluate user behavior
        const closedWindowIds = await this.behaviorWindowService.closeExpiredWindows(
          nextTickIndex,
          tx,
        );
        const snapshotsCreated = await this.behaviorEvalService.evaluateClosedWindows(
          closedWindowIds,
          tx,
        );

        // 2h. Create world state snapshot
        await this.marketRepo.createWorldState(
          {
            tickId: tick.id,
            stateData: {
              tickIndex: Number(nextTickIndex),
              simDay,
              simMonth,
              simYear,
              activeSpotlightCount: spotlightResult.events.length,
              activeArcCount: arcResult.events.length,
              activePolicyCount: policyResult.events.length,
              newsGenerated: allEvents.length,
              behaviorWindowsClosed: closedWindowIds.length,
              behaviorSnapshotsCreated: snapshotsCreated,
            },
          },
          tx,
        );

        return {
          tickIndex: Number(nextTickIndex),
          simDay,
          simMonth,
          simYear,
          spotlightTransitions: spotlightResult.events.length,
          arcTransitions: arcResult.events.length,
          policyTransitions: policyResult.events.length,
          newsGenerated: allEvents.length,
          windowsClosed: closedWindowIds.length,
          snapshotsCreated,
        };
      });

      this.logger.log(
        `Tick ${result.tickIndex}: ` +
        `${result.spotlightTransitions} spotlight, ` +
        `${result.arcTransitions} arc, ` +
        `${result.policyTransitions} policy, ` +
        `${result.newsGenerated} news, ` +
        `${result.windowsClosed} windows closed, ` +
        `${result.snapshotsCreated} snapshots`,
      );

      return result;
    });
  }
}
