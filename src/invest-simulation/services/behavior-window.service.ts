import { Injectable, Logger } from '@nestjs/common';
import { TxClient } from '#app/prisma/transaction.runner.js';
import { InvestBehaviorQuery } from '../queries/behavior.query.js';
import { InvestBehaviorRepository } from '../repositories/behavior.repository.js';

/** Default window duration in ticks. */
const DEFAULT_WINDOW_DURATION = 10n;

@Injectable()
export class BehaviorWindowService {
  private readonly logger = new Logger(BehaviorWindowService.name);

  constructor(
    private readonly behaviorQuery: InvestBehaviorQuery,
    private readonly behaviorRepo: InvestBehaviorRepository,
  ) {}

  /**
   * Open behavior windows based on tick events.
   * Called by tick service after state machine transitions.
   */
  async openWindowsForTick(
    tickIndex: bigint,
    spotlightTransitions: number,
    arcTransitions: number,
    policyTransitions: number,
    tx: TxClient,
  ): Promise<bigint[]> {
    const windowIds: bigint[] = [];

    if (spotlightTransitions > 0) {
      const w = await this.behaviorRepo.createWindow(
        {
          windowType: 'spotlight_event',
          startTickIndex: tickIndex,
          triggerReason: `${spotlightTransitions} spotlight transition(s)`,
        },
        tx,
      );
      windowIds.push(w.id);
    }

    if (policyTransitions > 0) {
      const w = await this.behaviorRepo.createWindow(
        {
          windowType: 'policy_action',
          startTickIndex: tickIndex,
          triggerReason: `${policyTransitions} policy transition(s)`,
        },
        tx,
      );
      windowIds.push(w.id);
    }

    if (arcTransitions > 0) {
      const w = await this.behaviorRepo.createWindow(
        {
          windowType: 'arc_shift',
          startTickIndex: tickIndex,
          triggerReason: `${arcTransitions} arc transition(s)`,
        },
        tx,
      );
      windowIds.push(w.id);
    }

    return windowIds;
  }

  /**
   * Close windows that have exceeded their duration.
   * Returns IDs of closed windows for evaluation.
   */
  async closeExpiredWindows(tickIndex: bigint, tx: TxClient): Promise<bigint[]> {
    const openWindows = await this.behaviorQuery.findOpenWindows();
    const closedIds: bigint[] = [];

    for (const w of openWindows) {
      if (tickIndex - w.startTickIndex >= DEFAULT_WINDOW_DURATION) {
        await this.behaviorRepo.closeWindow(w.id, tickIndex, tx);
        closedIds.push(w.id);
      }
    }

    return closedIds;
  }
}
