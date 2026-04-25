// ──────────────────────────────────────────────────────────────────
// Pure domain: sector sentiment ("pulse") index calculation
// Combines arc + policy + spotlight + price-momentum signals into a
// 0–100 index per sector, akin to the Crypto Fear & Greed Index.
// No I/O, no NestJS, no DB
// ──────────────────────────────────────────────────────────────────

import type { ArcState } from '../state-machines/world-arc.js';
import type { PolicyState } from '../state-machines/policy-thread.js';

/** Base magnitude per arc state (matches ARC_IMPACT_MAGNITUDE in world-arc.ts). */
const ARC_MAGNITUDE: Record<string, number> = {
  background: 0,
  spark: 0.01,
  expansion: 0.03,
  integration: 0.02,
  absorbed: 0,
};

/** Base magnitude per policy state (matches POLICY_IMPACT_MAGNITUDE in policy-thread.ts). */
const POLICY_MAGNITUDE: Record<string, number> = {
  undeclared: 0,
  declared_path: 0.01,
  action_1: 0.015,
  action_2: 0.02,
  action_3: 0.015,
  resolution: 0,
};

/** Spotlight per-state sentiment direction (positive = greed, negative = fear). */
const SPOTLIGHT_SENTIMENT: Record<string, number> = {
  dormant: 0,
  emerging: 0.005,
  hype: 0.02,
  peak: 0.03,
  decline: -0.015,
  recovery: 0.005,
};

/** Final scaling factor that maps the raw signal into 0–100 space. */
const PULSE_SCALING_FACTOR = 250;

/** Pulse label thresholds. */
const NEUTRAL_BAND = 50;

export interface SectorRef {
  id: number;
  code: string;
  name: string;
}

export interface SectorPulseArcInput {
  state: string;
  sectorImpacts: Array<{ sectorId: number; weight: number }>;
}

export interface SectorPulsePolicyInput {
  state: string;
  sectorImpacts: Array<{ sectorId: number; weight: number }>;
}

export interface SectorPulseSpotlightInput {
  state: string;
  sectorId: number;
}

export interface SectorPulseInput {
  sectors: SectorRef[];
  activeArcs: SectorPulseArcInput[];
  activePolicies: SectorPulsePolicyInput[];
  activeSpotlights: SectorPulseSpotlightInput[];
  /** sectorId → list of changePct values (decimal, e.g. 0.025 = +2.5%). */
  priceChangeBySector: Record<number, number[]>;
}

export interface SectorPulseEntry {
  sectorId: number;
  sectorCode: string;
  sectorName: string;
  index: number;
  label: string;
}

/** Map a 0–100 index to a sentiment label. */
export function mapSectorPulseLabel(index: number): string {
  if (index < 20) return 'Extreme Fear';
  if (index < 40) return 'Fear';
  if (index < 60) return 'Neutral';
  if (index < 80) return 'Greed';
  return 'Extreme Greed';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Compute sector sentiment indices for all sectors.
 *
 * Per sector:
 *   arc      = Σ ARC_MAGNITUDE(state)    × weight   for active arcs touching the sector
 *   policy   = Σ POLICY_MAGNITUDE(state) × weight   for active policies touching the sector
 *   spotlight= Σ SPOTLIGHT_SENTIMENT(state)         for spotlights anchored to the sector
 *   momentum = avg(changePct) of the sector's assets at the current tick
 *
 *   raw   = arc + policy + spotlight + momentum
 *   index = clamp(50 + raw × PULSE_SCALING_FACTOR, 0, 100)
 */
export function computeSectorPulse(
  input: SectorPulseInput,
): SectorPulseEntry[] {
  const {
    sectors,
    activeArcs,
    activePolicies,
    activeSpotlights,
    priceChangeBySector,
  } = input;

  return sectors.map((sector) => {
    let arcContribution = 0;
    for (const arc of activeArcs) {
      const magnitude = ARC_MAGNITUDE[arc.state as ArcState] ?? 0;
      if (magnitude === 0) continue;
      for (const si of arc.sectorImpacts) {
        if (si.sectorId === sector.id) {
          arcContribution += magnitude * si.weight;
        }
      }
    }

    let policyContribution = 0;
    for (const policy of activePolicies) {
      const magnitude = POLICY_MAGNITUDE[policy.state as PolicyState] ?? 0;
      if (magnitude === 0) continue;
      for (const si of policy.sectorImpacts) {
        if (si.sectorId === sector.id) {
          policyContribution += magnitude * si.weight;
        }
      }
    }

    let spotlightContribution = 0;
    for (const spot of activeSpotlights) {
      if (spot.sectorId === sector.id) {
        spotlightContribution += SPOTLIGHT_SENTIMENT[spot.state] ?? 0;
      }
    }

    const momentumContribution = average(priceChangeBySector[sector.id] ?? []);

    const rawSignal =
      arcContribution +
      policyContribution +
      spotlightContribution +
      momentumContribution;

    const index = Math.round(
      clamp(NEUTRAL_BAND + rawSignal * PULSE_SCALING_FACTOR, 0, 100),
    );

    return {
      sectorId: sector.id,
      sectorCode: sector.code,
      sectorName: sector.name,
      index,
      label: mapSectorPulseLabel(index),
    };
  });
}
