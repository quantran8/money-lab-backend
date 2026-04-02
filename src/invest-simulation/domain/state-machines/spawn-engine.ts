// ──────────────────────────────────────────────────────────────────
// Pure domain: spawn decision engine
// Determines WHAT to spawn based on current state.
// No I/O, no NestJS, no DB.
// ──────────────────────────────────────────────────────────────────

import { deterministicRandom } from '../../invest-simulation.helpers.js';
import type { ArcState } from './world-arc.js';

// ── Interfaces ──────────────────────────────────────────────────

export interface ArcSpawnCandidate {
  arcTypeId: number;
  code: string;
  /** Tick when the last instance of this type ended (null if never ran). */
  lastEndedAtTick: bigint | null;
}

export interface SpotlightAssetCandidate {
  assetId: bigint;
  affinity: number;
}

export interface SpotlightTemplateCandidate {
  templateId: bigint;
  weight: number;
}

export interface PolicySpawnCandidate {
  templateId: bigint;
  code: string;
  rarity: number;
  affectedSectors: number[];
}

// ── Arc-driven Spotlight Spawn ──────────────────────────────────

/** Whether an arc transition should trigger spotlight spawning. */
export function shouldSpawnSpotlightFromArc(toState: ArcState): boolean {
  return toState === 'expansion' || toState === 'integration';
}

/**
 * Select assets for spotlight, weighted by affinity.
 * Higher affinity = higher chance of being picked.
 * Returns up to `maxCount` asset IDs, deterministic.
 */
export function selectSpotlightAssets(
  candidates: SpotlightAssetCandidate[],
  maxCount: number,
  seed: string,
): bigint[] {
  if (candidates.length === 0 || maxCount === 0) return [];

  const totalWeight = candidates.reduce((sum, c) => sum + c.affinity, 0);
  if (totalWeight === 0) return [];

  const selected: bigint[] = [];
  const remaining = [...candidates];

  for (let i = 0; i < maxCount && remaining.length > 0; i++) {
    const pickSeed = `${seed}:asset:${i}`;
    const roll = deterministicRandom(pickSeed);
    const currentTotal = remaining.reduce((sum, c) => sum + c.affinity, 0);

    let cumulative = 0;
    let picked = remaining[0];
    for (const candidate of remaining) {
      cumulative += candidate.affinity / currentTotal;
      if (roll < cumulative) {
        picked = candidate;
        break;
      }
    }

    selected.push(picked.assetId);
    const idx = remaining.indexOf(picked);
    remaining.splice(idx, 1);
  }

  return selected;
}

/**
 * Select a spotlight template, weighted by mapping weight.
 * Higher weight = higher chance.
 */
export function selectSpotlightTemplate(
  candidates: SpotlightTemplateCandidate[],
  seed: string,
): bigint | null {
  if (candidates.length === 0) return null;

  const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
  if (totalWeight === 0) return null;

  const roll = deterministicRandom(seed);
  let cumulative = 0;

  for (const candidate of candidates) {
    cumulative += candidate.weight / totalWeight;
    if (roll < cumulative) {
      return candidate.templateId;
    }
  }

  return candidates[candidates.length - 1].templateId;
}

// ── Arc Respawn ─────────────────────────────────────────────────

/**
 * Filter arc candidates that are past cooldown.
 * Returns candidates eligible for spawning.
 */
export function filterArcCandidatesByCooldown(
  candidates: ArcSpawnCandidate[],
  currentTick: bigint,
  cooldownTicks: bigint,
): ArcSpawnCandidate[] {
  return candidates.filter((c) => {
    if (c.lastEndedAtTick == null) return true;
    return currentTick - c.lastEndedAtTick >= cooldownTicks;
  });
}

/** Deterministically select one arc type from candidates. */
export function selectArcType(
  candidates: ArcSpawnCandidate[],
  seed: string,
): ArcSpawnCandidate | null {
  if (candidates.length === 0) return null;

  const roll = deterministicRandom(seed);
  const idx = Math.floor(roll * candidates.length);
  return candidates[Math.min(idx, candidates.length - 1)];
}

// ── Policy Respawn ──────────────────────────────────────────────

/**
 * Select a policy template, preferring those aligned with active arc sectors.
 * Alignment bonus: templates whose affectedSectors overlap with active arc sectors
 * get their rarity weight doubled.
 */
export function selectPolicyTemplate(
  candidates: PolicySpawnCandidate[],
  activeArcSectorIds: number[],
  seed: string,
): PolicySpawnCandidate | null {
  if (candidates.length === 0) return null;

  const arcSectorSet = new Set(activeArcSectorIds);

  // Compute weights: base = 1/rarity (lower rarity = rarer = higher weight)
  // Aligned with active arcs → 2x bonus
  const weighted = candidates.map((c) => {
    const baseWeight = 1 / c.rarity;
    const isAligned = c.affectedSectors.some((s) => arcSectorSet.has(s));
    return { candidate: c, weight: isAligned ? baseWeight * 2 : baseWeight };
  });

  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
  if (totalWeight === 0) return null;

  const roll = deterministicRandom(seed);
  let cumulative = 0;

  for (const w of weighted) {
    cumulative += w.weight / totalWeight;
    if (roll < cumulative) {
      return w.candidate;
    }
  }

  return weighted[weighted.length - 1].candidate;
}
