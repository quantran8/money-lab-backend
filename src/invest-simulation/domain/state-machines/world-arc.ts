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
  spark: 0.2,
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
  const progressInState =
    dwell > 0 ? Math.min(1, ticksInCurrentState / (dwell * 2)) : 0;
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

/** Base magnitude per arc state (unsigned). */
const ARC_IMPACT_MAGNITUDE: Record<ArcState, number> = {
  background: 0,
  spark: 0.01,
  expansion: 0.03,
  integration: 0.02,
  absorbed: 0,
};

/** Sector weight for an arc type. */
export interface ArcSectorWeight {
  sectorId: number;
  category: string | null;
  weight: number;
}

/**
 * Compute per-asset arc impact for a single arc instance.
 * Returns a map of assetKey → impact value.
 *
 * @param state          Current arc state.
 * @param sectorWeights  Weights per sector/category from WorldArcSectorImpact.
 * @param assets         All active assets with their sectorId and category.
 * @returns              Record<assetKey, impact> for assets that have a matching weight.
 */
export function computeArcAssetImpacts(
  state: ArcState,
  sectorWeights: ArcSectorWeight[],
  assets: Array<{ key: string; sectorId: number; category: string | null }>,
): Record<string, number> {
  const magnitude = ARC_IMPACT_MAGNITUDE[state];
  if (magnitude === 0) return {};

  // Build lookup: sectorId → category-specific weight, sectorId → sector-wide weight
  const categoryMap = new Map<string, number>(); // "sectorId:category" → weight
  const sectorMap = new Map<number, number>(); // sectorId → weight (category=null)

  for (const sw of sectorWeights) {
    if (sw.category != null) {
      categoryMap.set(`${sw.sectorId}:${sw.category}`, sw.weight);
    } else {
      sectorMap.set(sw.sectorId, sw.weight);
    }
  }

  const impacts: Record<string, number> = {};

  for (const asset of assets) {
    // Category-specific weight takes precedence over sector-wide weight
    const catKey =
      asset.category != null ? `${asset.sectorId}:${asset.category}` : null;
    const weight =
      (catKey != null ? categoryMap.get(catKey) : undefined) ??
      sectorMap.get(asset.sectorId) ??
      0;

    if (weight !== 0) {
      impacts[asset.key] = magnitude * weight;
    }
  }

  return impacts;
}

export function isArcActive(state: ArcState): boolean {
  return state !== 'background' && state !== 'absorbed';
}

export function isArcCompleted(state: ArcState): boolean {
  return state === 'absorbed';
}
