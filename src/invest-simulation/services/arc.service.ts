import { Injectable, Logger } from '@nestjs/common';
import { TxClient } from '#app/prisma/transaction.runner.js';
import { InvestArcQuery } from '../queries/arc.query.js';
import { InvestArcRepository } from '../repositories/arc.repository.js';
import {
  transitionArc,
  computeArcAssetImpacts,
  isArcCompleted,
  type ArcState,
  type ArcTransitionEvent,
  type ArcSectorWeight,
} from '../domain/index.js';
import type { ArcInstanceWithTypeRow } from '../types/index.js';

export interface ArcAdvanceResult {
  events: ArcTransitionEvent[];
  /** Per-asset arc impact: assetKey → impact value. */
  assetImpacts: Record<string, number>;
  /** Number of arcs still active after this tick's advancement. */
  remainingActiveCount: number;
  /** Active instances loaded this tick (with type + sector impacts). */
  activeInstances: ArcInstanceWithTypeRow[];
}

@Injectable()
export class InvestArcService {
  private readonly logger = new Logger(InvestArcService.name);

  constructor(
    private readonly arcQuery: InvestArcQuery,
    private readonly arcRepo: InvestArcRepository,
  ) {}

  /**
   * Advance all active arc instances by one tick.
   * Returns transition events and per-asset arc impacts.
   *
   * @param tickIndex  Current tick index.
   * @param assets     All active assets (needed to map sector weights → per-asset impacts).
   * @param tx         Transaction client.
   */
  async advanceAll(
    tickIndex: bigint,
    assets: Array<{ key: string; sectorId: number; category: string | null }>,
    tx: TxClient,
  ): Promise<ArcAdvanceResult> {
    const instances = await this.arcQuery.findActiveInstances();
    const events: ArcTransitionEvent[] = [];
    const assetImpacts: Record<string, number> = {};
    let completedCount = 0;

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
        completedCount++;
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

      // Compute per-asset impacts from this arc's sector weights
      const sectorWeights: ArcSectorWeight[] = inst.arcType.sectorImpacts.map(
        (si) => ({
          sectorId: si.sectorId,
          category: si.category,
          weight: Number(si.weight),
        }),
      );

      const impacts = computeArcAssetImpacts(
        result.nextState,
        sectorWeights,
        assets,
      );

      // Accumulate: multiple arcs may affect the same asset
      for (const [key, impact] of Object.entries(impacts)) {
        assetImpacts[key] = (assetImpacts[key] ?? 0) + impact;
      }
    }

    return {
      events,
      assetImpacts,
      remainingActiveCount: instances.length - completedCount,
      activeInstances: instances,
    };
  }
}
