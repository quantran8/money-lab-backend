// ──────────────────────────────────────────────────────────────────
// Pure domain: Asset Spotlight 6-state FSM
// States: dormant → emerging → hype → peak → decline → recovery → dormant
// No I/O, no NestJS, no DB
// ──────────────────────────────────────────────────────────────────

import { deterministicRandom } from '../../invest-simulation.helpers.js';

export type SpotlightState =
  | 'dormant'
  | 'emerging'
  | 'hype'
  | 'peak'
  | 'decline'
  | 'recovery';

export interface SpotlightTransitionInput {
  currentState: SpotlightState;
  ticksInCurrentState: number;
  seed: string;
}

export interface SpotlightTransitionResult {
  nextState: SpotlightState;
  transitioned: boolean;
}

/** Minimum ticks that must pass before a state transition is possible. */
const MIN_DWELL: Record<SpotlightState, number> = {
  dormant: 0,
  emerging: 3,
  hype: 2,
  peak: 1,
  decline: 2,
  recovery: 3,
};

/** Base probability of transitioning out of each state (per tick after dwell). */
const TRANSITION_PROB: Record<SpotlightState, number> = {
  dormant: 0, // dormant never self-transitions; spawned externally
  emerging: 0.25,
  hype: 0.30,
  peak: 0.50,
  decline: 0.30,
  recovery: 0.35,
};

const NEXT_STATE: Record<SpotlightState, SpotlightState> = {
  dormant: 'emerging',
  emerging: 'hype',
  hype: 'peak',
  peak: 'decline',
  decline: 'recovery',
  recovery: 'dormant',
};

export function transitionSpotlight(input: SpotlightTransitionInput): SpotlightTransitionResult {
  const { currentState, ticksInCurrentState, seed } = input;

  if (currentState === 'dormant') {
    return { nextState: 'dormant', transitioned: false };
  }

  if (ticksInCurrentState < MIN_DWELL[currentState]) {
    return { nextState: currentState, transitioned: false };
  }

  const roll = deterministicRandom(seed);
  if (roll < TRANSITION_PROB[currentState]) {
    return { nextState: NEXT_STATE[currentState], transitioned: true };
  }

  return { nextState: currentState, transitioned: false };
}

/** Price impact multiplier for each spotlight state. */
export function spotlightPriceMultiplier(state: SpotlightState): number {
  switch (state) {
    case 'dormant': return 0;
    case 'emerging': return 0.02;
    case 'hype': return 0.05;
    case 'peak': return 0.08;
    case 'decline': return -0.04;
    case 'recovery': return -0.01;
  }
}

/** Whether the spotlight is in an "active" narrative phase. */
export function isSpotlightActive(state: SpotlightState): boolean {
  return state !== 'dormant';
}

/** Whether the spotlight has completed its full lifecycle. */
export function isSpotlightCompleted(state: SpotlightState): boolean {
  return state === 'dormant';
}
