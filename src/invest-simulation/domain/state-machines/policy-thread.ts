// ──────────────────────────────────────────────────────────────────
// Pure domain: Policy Thread 6-state FSM
// States: undeclared → declared_path → action_1 → action_2 → action_3 → resolution
// No I/O, no NestJS, no DB
// ──────────────────────────────────────────────────────────────────

import { deterministicRandom } from '../../invest-simulation.helpers.js';

export type PolicyState =
  | 'undeclared'
  | 'declared_path'
  | 'action_1'
  | 'action_2'
  | 'action_3'
  | 'resolution';

export interface PolicyTransitionInput {
  currentState: PolicyState;
  ticksInCurrentState: number;
  actionsTotal: number;
  actionsCompleted: number;
  seed: string;
}

export interface PolicyTransitionResult {
  nextState: PolicyState;
  transitioned: boolean;
  actionsCompleted: number;
}

const MIN_DWELL: Record<PolicyState, number> = {
  undeclared: 0,
  declared_path: 2,
  action_1: 3,
  action_2: 3,
  action_3: 3,
  resolution: 0,
};

const TRANSITION_PROB: Record<PolicyState, number> = {
  undeclared: 0,
  declared_path: 0.30,
  action_1: 0.25,
  action_2: 0.25,
  action_3: 0.30,
  resolution: 0,
};

const NEXT_STATE: Record<PolicyState, PolicyState> = {
  undeclared: 'declared_path',
  declared_path: 'action_1',
  action_1: 'action_2',
  action_2: 'action_3',
  action_3: 'resolution',
  resolution: 'resolution',
};

export function transitionPolicy(input: PolicyTransitionInput): PolicyTransitionResult {
  const { currentState, ticksInCurrentState, actionsCompleted, seed } = input;

  if (currentState === 'undeclared' || currentState === 'resolution') {
    return { nextState: currentState, transitioned: false, actionsCompleted };
  }

  if (ticksInCurrentState < MIN_DWELL[currentState]) {
    return { nextState: currentState, transitioned: false, actionsCompleted };
  }

  const roll = deterministicRandom(seed);
  if (roll < TRANSITION_PROB[currentState]) {
    const nextState = NEXT_STATE[currentState];
    const isActionState = nextState.startsWith('action_');
    return {
      nextState,
      transitioned: true,
      actionsCompleted: isActionState ? actionsCompleted + 1 : actionsCompleted,
    };
  }

  return { nextState: currentState, transitioned: false, actionsCompleted };
}

/** Price impact multiplier per policy state — creates uncertainty. */
export function policyPriceMultiplier(state: PolicyState): number {
  switch (state) {
    case 'undeclared': return 0;
    case 'declared_path': return 0.01;
    case 'action_1': return -0.01;
    case 'action_2': return -0.02;
    case 'action_3': return 0.01;
    case 'resolution': return 0;
  }
}

export function isPolicyActive(state: PolicyState): boolean {
  return state !== 'undeclared' && state !== 'resolution';
}

export function isPolicyCompleted(state: PolicyState): boolean {
  return state === 'resolution';
}
