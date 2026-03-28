import { Injectable, Logger } from '@nestjs/common';
import { TxClient } from '#app/prisma/transaction.runner.js';
import { InvestPolicyQuery } from '../queries/policy.query.js';
import { InvestPolicyRepository } from '../repositories/policy.repository.js';
import {
  transitionPolicy,
  policyPriceMultiplier,
  isPolicyCompleted,
  type PolicyState,
} from '../domain/index.js';

export interface PolicyTransitionEvent {
  type: 'policy';
  templateTitle: string;
  fromState: PolicyState;
  toState: PolicyState;
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
   * Returns transition events and a global policy impact value.
   */
  async advanceAll(tickIndex: bigint, tx: TxClient): Promise<{
    events: PolicyTransitionEvent[];
    globalPolicyImpact: number;
  }> {
    const instances = await this.policyQuery.findActiveInstances();
    const events: PolicyTransitionEvent[] = [];
    let globalPolicyImpact = 0;

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
        events.push({
          type: 'policy',
          templateTitle: inst.template.title,
          fromState: inst.state as PolicyState,
          toState: result.nextState,
        });
      }

      if (result.transitioned && isPolicyCompleted(result.nextState)) {
        await this.policyRepo.deactivateInstance(inst.id, tickIndex, tx);
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

      globalPolicyImpact += policyPriceMultiplier(result.nextState);
    }

    return { events, globalPolicyImpact };
  }
}
