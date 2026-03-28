import { Injectable, Logger } from '@nestjs/common';
import { wrapAsync } from '#common/utils/async.utils.js';
import { TxClient } from '#app/prisma/transaction.runner.js';
import { InvestSpotlightQuery } from '../queries/spotlight.query.js';
import { InvestSpotlightRepository } from '../repositories/spotlight.repository.js';
import {
  transitionSpotlight,
  isSpotlightCompleted,
  spotlightPriceMultiplier,
  type SpotlightState,
  type SpotlightTransitionEvent,
} from '../domain/index.js';

const SPOTLIGHT_COOLDOWN_TICKS = 10n;

@Injectable()
export class InvestSpotlightService {
  private readonly logger = new Logger(InvestSpotlightService.name);

  constructor(
    private readonly spotlightQuery: InvestSpotlightQuery,
    private readonly spotlightRepo: InvestSpotlightRepository,
  ) {}

  /**
   * Advance all active spotlight instances by one tick.
   * Returns transition events for news generation and a per-asset impact map.
   */
  async advanceAll(tickIndex: bigint, tx: TxClient): Promise<{
    events: SpotlightTransitionEvent[];
    assetImpacts: Record<string, number>;
  }> {
    const instances = await this.spotlightQuery.findActiveInstances();
    const events: SpotlightTransitionEvent[] = [];
    const assetImpacts: Record<string, number> = {};

    for (const inst of instances) {
      const seed = `spotlight:${inst.id}:${tickIndex}`;
      const result = transitionSpotlight({
        currentState: inst.state as SpotlightState,
        ticksInCurrentState: inst.ticksInCurrentState,
        seed,
      });

      if (result.transitioned) {
        events.push({
          type: 'spotlight',
          assetId: inst.assetId,
          assetName: inst.asset.name,
          sectorCode: inst.asset.sector.code,
          fromState: inst.state as SpotlightState,
          toState: result.nextState,
        });
      }

      // Check if completed (returned to dormant)
      if (result.transitioned && isSpotlightCompleted(result.nextState)) {
        await this.spotlightRepo.deactivateInstance(
          inst.id,
          tickIndex,
          tickIndex + SPOTLIGHT_COOLDOWN_TICKS,
          tx,
        );
      } else {
        const newTicks = result.transitioned ? 0 : inst.ticksInCurrentState + 1;
        await this.spotlightRepo.updateInstanceState(
          inst.id,
          result.nextState,
          newTicks,
          tx,
        );
      }

      // Accumulate price impact for this asset
      const impact = spotlightPriceMultiplier(result.nextState);
      const key = inst.assetId.toString();
      assetImpacts[key] = (assetImpacts[key] ?? 0) + impact;
    }

    return { events, assetImpacts };
  }
}
