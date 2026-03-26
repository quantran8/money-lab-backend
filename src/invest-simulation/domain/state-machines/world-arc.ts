// ──────────────────────────────────────────────────────────────────
// Pure domain: World Arc 5-state FSM
// States: background → spark → expansion → integration → absorbed
// No I/O, no NestJS, no DB
// ──────────────────────────────────────────────────────────────────

import { deterministicRandom } from '../../invest-simulation.helpers.js';

export type ArcState =
  | 'background'
  | 'spark'
  | 'expansion'
  | 'integration'
  | 'absorbed';

export interface ArcTransitionInput {
  currentState: ArcState;
  ticksInCurrentState: number;
  seed: string;
}

export interface ArcTransitionResult {
  nextState: ArcState;
  transitioned: boolean;
  /** Progress fraction 0–1, increases each tick in non-terminal states. */
  progress: number;
}

const MIN_DWELL: Record<ArcState, number> = {
  background: 0,
  spark: 2,
  expansion: 4,
  integration: 3,
  absorbed: 0,
};

const TRANSITION_PROB: Record<ArcState, number> = {
  background: 0, // spawned externally
  spark: 0.20,
  expansion: 0.15,
  integration: 0.25,
  absorbed: 0, // terminal
};

const NEXT_STATE: Record<ArcState, ArcState> = {
  background: 'spark',
  spark: 'expansion',
  expansion: 'integration',
  integration: 'absorbed',
  absorbed: 'absorbed',
};

/** Rough progress fraction for each state. */
const STATE_PROGRESS_BASE: Record<ArcState, number> = {
  background: 0,
  spark: 0.1,
  expansion: 0.35,
  integration: 0.7,
  absorbed: 1.0,
};

export function transitionArc(input: ArcTransitionInput): ArcTransitionResult {
  const { currentState, ticksInCurrentState, seed } = input;

  if (currentState === 'background' || currentState === 'absorbed') {
    return {
      nextState: currentState,
      transitioned: false,
      progress: STATE_PROGRESS_BASE[currentState],
    };
  }

  // Calculate intra-state progress
  const dwell = MIN_DWELL[currentState];
  const progressInState = dwell > 0 ? Math.min(1, ticksInCurrentState / (dwell * 2)) : 0;
  const base = STATE_PROGRESS_BASE[currentState];
  const nextBase = STATE_PROGRESS_BASE[NEXT_STATE[currentState]];
  const progress = Math.min(1, base + (nextBase - base) * progressInState);

  if (ticksInCurrentState < dwell) {
    return { nextState: currentState, transitioned: false, progress };
  }

  const roll = deterministicRandom(seed);
  if (roll < TRANSITION_PROB[currentState]) {
    return {
      nextState: NEXT_STATE[currentState],
      transitioned: true,
      progress: STATE_PROGRESS_BASE[NEXT_STATE[currentState]],
    };
  }

  return { nextState: currentState, transitioned: false, progress };
}

/** Broad market impact multiplier per arc state. */
export function arcImpactMultiplier(state: ArcState): number {
  switch (state) {
    case 'background': return 0;
    case 'spark': return 0.01;
    case 'expansion': return 0.03;
    case 'integration': return 0.02;
    case 'absorbed': return 0;
  }
}

export function isArcActive(state: ArcState): boolean {
  return state !== 'background' && state !== 'absorbed';
}

export function isArcCompleted(state: ArcState): boolean {
  return state === 'absorbed';
}
