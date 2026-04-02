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
  declared_path: 0.3,
  action_1: 0.25,
  action_2: 0.25,
  action_3: 0.3,
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

export function transitionPolicy(
  input: PolicyTransitionInput,
): PolicyTransitionResult {
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

/**
 * @deprecated Use computePolicyAssetImpacts() for per-sector impacts instead.
 * Kept temporarily for backward compatibility.
 */
export function policyPriceMultiplier(state: PolicyState): number {
  switch (state) {
    case 'undeclared':
      return 0;
    case 'declared_path':
      return 0.01;
    case 'action_1':
      return -0.01;
    case 'action_2':
      return -0.02;
    case 'action_3':
      return 0.01;
    case 'resolution':
      return 0;
  }
}

// ── Per-Sector Policy Impact ────────────────────────────────────

/** Base magnitude per policy state (unsigned — weight sign determines direction). */
const POLICY_IMPACT_MAGNITUDE: Record<PolicyState, number> = {
  undeclared: 0,
  declared_path: 0.01,
  action_1: 0.015,
  action_2: 0.02,
  action_3: 0.015,
  resolution: 0,
};

/** Sector weight for a policy template. */
export interface PolicySectorWeight {
  sectorId: number;
  category: string | null;
  weight: number;
}

/**
 * Compute per-asset policy impact for a single policy instance.
 * Returns a map of assetKey → impact value.
 *
 * @param state          Current policy state.
 * @param sectorWeights  Weights per sector/category from PolicySectorImpact.
 * @param assets         All active assets with their sectorId and category.
 * @returns              Record<assetKey, impact> for assets that have a matching weight.
 */
export function computePolicyAssetImpacts(
  state: PolicyState,
  sectorWeights: PolicySectorWeight[],
  assets: Array<{ key: string; sectorId: number; category: string | null }>,
): Record<string, number> {
  const magnitude = POLICY_IMPACT_MAGNITUDE[state];
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

export function isPolicyActive(state: PolicyState): boolean {
  return state !== 'undeclared' && state !== 'resolution';
}

export function isPolicyCompleted(state: PolicyState): boolean {
  return state === 'resolution';
}
