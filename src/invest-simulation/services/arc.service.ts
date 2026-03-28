import { Injectable, Logger } from '@nestjs/common';
import { TxClient } from '#app/prisma/transaction.runner.js';
import { InvestArcQuery } from '../queries/arc.query.js';
import { InvestArcRepository } from '../repositories/arc.repository.js';
import {
  transitionArc,
  arcImpactMultiplier,
  isArcCompleted,
  type ArcState,
  type ArcTransitionEvent,
} from '../domain/index.js';

@Injectable()
export class InvestArcService {
  private readonly logger = new Logger(InvestArcService.name);

  constructor(
    private readonly arcQuery: InvestArcQuery,
    private readonly arcRepo: InvestArcRepository,
  ) {}

  /**
   * Advance all active arc instances by one tick.
   * Returns transition events and a global market impact value.
   */
  async advanceAll(tickIndex: bigint, tx: TxClient): Promise<{
    events: ArcTransitionEvent[];
    globalImpact: number;
  }> {
    const instances = await this.arcQuery.findActiveInstances();
    const events: ArcTransitionEvent[] = [];
    let globalImpact = 0;

    for (const inst of instances) {
      const seed = `arc:${inst.id}:${tickIndex}`;
      const result = transitionArc({
        currentState: inst.state as ArcState,
        ticksInCurrentState: inst.ticksInCurrentState,
        seed,
      });

      if (result.transitioned) {
        events.push({
          type: 'arc',
          arcTypeName: inst.arcType.name,
          fromState: inst.state as ArcState,
          toState: result.nextState,
        });
      }

      if (result.transitioned && isArcCompleted(result.nextState)) {
        await this.arcRepo.deactivateInstance(inst.id, tickIndex, tx);
      } else {
        const newTicks = result.transitioned ? 0 : inst.ticksInCurrentState + 1;
        await this.arcRepo.updateInstanceState(
          inst.id,
          result.nextState,
          newTicks,
          result.progress,
          tx,
        );
      }

      globalImpact += arcImpactMultiplier(result.nextState);
    }

    return { events, globalImpact };
  }
}
