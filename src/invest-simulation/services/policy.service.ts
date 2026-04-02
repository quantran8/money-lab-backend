import { Injectable, Logger } from '@nestjs/common';
import { TxClient } from '#app/prisma/transaction.runner.js';
import { InvestPolicyQuery } from '../queries/policy.query.js';
import { InvestPolicyRepository } from '../repositories/policy.repository.js';
import {
  transitionPolicy,
  computePolicyAssetImpacts,
  isPolicyCompleted,
  type PolicyState,
  type PolicySectorWeight,
} from '../domain/index.js';

export interface PolicyTransitionEvent {
  type: 'policy';
  templateTitle: string;
  fromState: PolicyState;
  toState: PolicyState;
  /** Human-readable description of the target state (from template stateDescriptions). */
  stateDescription: string | null;
}

@Injectable()
export class InvestPolicyService {
  private readonly logger = new Logger(InvestPolicyService.name);

  constructor(
    private readonly policyQuery: InvestPolicyQuery,
    private readonly policyRepo: InvestPolicyRepository,
  ) {}

  /**
   * Advance all active policy thread instances by one tick.
   * Returns transition events and per-asset policy impacts.
   */
  async advanceAll(
    tickIndex: bigint,
    assets: Array<{ key: string; sectorId: number; category: string | null }>,
    tx: TxClient,
  ): Promise<{
    events: PolicyTransitionEvent[];
    assetImpacts: Record<string, number>;
    remainingActiveCount: number;
  }> {
    const instances = await this.policyQuery.findActiveInstances();
    const events: PolicyTransitionEvent[] = [];
    const assetImpacts: Record<string, number> = {};
    let completedCount = 0;

    for (const inst of instances) {
      const seed = `policy:${inst.id}:${tickIndex}`;
      const result = transitionPolicy({
        currentState: inst.state as PolicyState,
        ticksInCurrentState: inst.ticksInCurrentState,
        actionsTotal: inst.actionsTotal,
        actionsCompleted: inst.actionsCompleted,
        seed,
      });

      if (result.transitioned) {
        const descriptions = inst.template.stateDescriptions as Record<
          string,
          string
        > | null;
        events.push({
          type: 'policy',
          templateTitle: inst.template.title,
          fromState: inst.state as PolicyState,
          toState: result.nextState,
          stateDescription: descriptions?.[result.nextState] ?? null,
        });
      }

      if (result.transitioned && isPolicyCompleted(result.nextState)) {
        await this.policyRepo.deactivateInstance(inst.id, tickIndex, tx);
        completedCount++;
      } else {
        const newTicks = result.transitioned ? 0 : inst.ticksInCurrentState + 1;
        await this.policyRepo.updateInstanceState(
          inst.id,
          result.nextState,
          newTicks,
          result.actionsCompleted,
          tx,
        );
      }

      // Compute per-asset impacts from this policy's sector weights
      const sectorWeights: PolicySectorWeight[] =
        inst.template.sectorImpacts.map((si) => ({
          sectorId: si.sectorId,
          category: si.category,
          weight: Number(si.weight),
        }));

      const impacts = computePolicyAssetImpacts(
        result.nextState,
        sectorWeights,
        assets,
      );

      // Accumulate: multiple policies may affect the same asset
      for (const [key, impact] of Object.entries(impacts)) {
        assetImpacts[key] = (assetImpacts[key] ?? 0) + impact;
      }
    }

    return {
      events,
      assetImpacts,
      remainingActiveCount: instances.length - completedCount,
    };
  }
}
