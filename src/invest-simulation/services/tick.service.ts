import { Injectable, Logger } from '@nestjs/common';
import { TransactionRunner } from '#app/prisma/transaction.runner.js';
import { wrapAsync } from '#common/utils/async.utils.js';
import { AssetQuery } from '../queries/asset.query.js';
import { InvestMarketQuery } from '../queries/market.query.js';
import { InvestMarketRepository } from '../repositories/market.repository.js';
import { InvestSpotlightService } from './spotlight.service.js';
import { InvestArcService } from './arc.service.js';
import { InvestPolicyService } from './policy.service.js';
import { InvestNewsService } from './news.service.js';
import { InvestPricingService } from './pricing.service.js';
import { BehaviorWindowService } from './behavior-window.service.js';
import { InvestBehaviorEvaluationService } from './behavior-evaluation.service.js';
import { InvestSpawnService } from './spawn.service.js';
import type { StateTransitionEvent } from '../domain/index.js';

@Injectable()
export class InvestTickService {
  private readonly logger = new Logger(InvestTickService.name);

  constructor(
    private readonly transactionRunner: TransactionRunner,
    private readonly assetQuery: AssetQuery,
    private readonly marketQuery: InvestMarketQuery,
    private readonly marketRepo: InvestMarketRepository,
    private readonly spotlightService: InvestSpotlightService,
    private readonly arcService: InvestArcService,
    private readonly policyService: InvestPolicyService,
    private readonly newsService: InvestNewsService,
    private readonly pricingService: InvestPricingService,
    private readonly behaviorWindowService: BehaviorWindowService,
    private readonly behaviorEvalService: InvestBehaviorEvaluationService,
    private readonly spawnService: InvestSpawnService,
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

      // 2. Load assets for arc impact calculation
      const assets = await this.assetQuery.findAllWithSector();
      const arcAssetInputs = assets.map((a) => ({
        key: a.id.toString(),
        sectorId: a.sectorId,
        category: a.category,
      }));

      // 3. Execute all writes in a single transaction
      const result = await this.transactionRunner.run(
        async (tx) => {
          // 3a. Create tick record (upsert guards against sequence/duplicate conflicts)
          const tick = await this.marketRepo.upsertTickByIndex(
            nextTickIndex,
            { simDay, simMonth, simYear },
            tx,
          );

          // 3b. Advance state machines
          const spotlightResult = await this.spotlightService.advanceAll(
            nextTickIndex,
            tx,
          );
          const arcResult = await this.arcService.advanceAll(
            nextTickIndex,
            arcAssetInputs,
            tx,
          );
          const policyResult = await this.policyService.advanceAll(
            nextTickIndex,
            arcAssetInputs,
            tx,
          );

          // 3b-spawn. Auto-spawn new instances if needed
          const spawnResult = await this.spawnService.spawnForTick(
            nextTickIndex,
            arcResult.events,
            arcResult.activeInstances,
            arcResult.remainingActiveCount,
            policyResult.remainingActiveCount,
            tx,
          );

          // 3c. Collect ALL transition events (advance + spawn) for news
          const allEvents: StateTransitionEvent[] = [
            ...spotlightResult.events,
            ...arcResult.events,
            ...policyResult.events,
            ...spawnResult.spawnedSpotlightEvents,
            ...spawnResult.spawnedArcEvents,
            ...spawnResult.spawnedPolicyEvents,
          ];

          // Merge spawned spotlight impacts
          const mergedSpotlightImpacts = { ...spotlightResult.assetImpacts };
          for (const [key, impact] of Object.entries(
            spawnResult.spawnedSpotlightImpacts,
          )) {
            mergedSpotlightImpacts[key] =
              (mergedSpotlightImpacts[key] ?? 0) + impact;
          }

          // Total event counts (advance + spawn)
          const totalSpotlightEvents =
            spotlightResult.events.length +
            spawnResult.spawnedSpotlightEvents.length;
          const totalArcEvents =
            arcResult.events.length + spawnResult.spawnedArcEvents.length;
          const totalPolicyEvents =
            policyResult.events.length + spawnResult.spawnedPolicyEvents.length;

          // 3d. Generate news from transitions → returns sector impacts
          const sectorImpacts = await this.newsService.generateNewsForTick(
            tick.id,
            nextTickIndex,
            simDay,
            simMonth,
            simYear,
            allEvents,
            tx,
          );

          // 3e. Generate prices from all combined impacts (including policy)
          await this.pricingService.generatePricesForTick(
            tick.id,
            nextTickIndex,
            mergedSpotlightImpacts,
            arcResult.assetImpacts,
            policyResult.assetImpacts,
            sectorImpacts,
            tx,
          );

          // 3f. Open behavior windows from transitions
          await this.behaviorWindowService.openWindowsForTick(
            nextTickIndex,
            totalSpotlightEvents,
            totalArcEvents,
            totalPolicyEvents,
            tx,
          );

          // 3g. Close expired windows + evaluate user behavior
          const closedWindowIds =
            await this.behaviorWindowService.closeExpiredWindows(
              nextTickIndex,
              tx,
            );
          const snapshotsCreated =
            await this.behaviorEvalService.evaluateClosedWindows(
              closedWindowIds,
              tx,
            );

          // 3h. Create world state snapshot
          await this.marketRepo.createWorldState(
            {
              tickId: tick.id,
              stateData: {
                tickIndex: Number(nextTickIndex),
                simDay,
                simMonth,
                simYear,
                activeSpotlightCount: totalSpotlightEvents,
                activeArcCount: totalArcEvents,
                activePolicyCount: totalPolicyEvents,
                newsGenerated: allEvents.length,
                behaviorWindowsClosed: closedWindowIds.length,
                behaviorSnapshotsCreated: snapshotsCreated,
                spawnedSpotlights: spawnResult.spawnedSpotlightEvents.length,
                spawnedArcs: spawnResult.spawnedArcEvents.length,
                spawnedPolicies: spawnResult.spawnedPolicyEvents.length,
              },
            },
            tx,
          );

          return {
            tickIndex: Number(nextTickIndex),
            simDay,
            simMonth,
            simYear,
            spotlightTransitions: totalSpotlightEvents,
            arcTransitions: totalArcEvents,
            policyTransitions: totalPolicyEvents,
            newsGenerated: allEvents.length,
            windowsClosed: closedWindowIds.length,
            snapshotsCreated,
            spawnedSpotlights: spawnResult.spawnedSpotlightEvents.length,
            spawnedArcs: spawnResult.spawnedArcEvents.length,
            spawnedPolicies: spawnResult.spawnedPolicyEvents.length,
          };
        },
        { timeout: 60_000 },
      );

      this.logger.log(
        `Tick ${result.tickIndex}: ` +
          `${result.spotlightTransitions} spotlight, ` +
          `${result.arcTransitions} arc, ` +
          `${result.policyTransitions} policy, ` +
          `${result.newsGenerated} news, ` +
          `${result.windowsClosed} windows closed, ` +
          `${result.snapshotsCreated} snapshots, ` +
          `spawned: ${result.spawnedSpotlights}s/${result.spawnedArcs}a/${result.spawnedPolicies}p`,
      );

      return result;
    });
  }
}
