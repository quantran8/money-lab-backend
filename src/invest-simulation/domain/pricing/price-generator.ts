// ──────────────────────────────────────────────────────────────────
// Pure domain: deterministic price generation from combined impacts
// No I/O, no NestJS, no DB
// ──────────────────────────────────────────────────────────────────

import { deterministicRandom } from '../../invest-simulation.helpers.js';
import { clampPrice, calculateChangePct } from './price-helpers.js';

export interface PriceImpacts {
  /** Sector-level impact from news/events. */
  sectorImpact: number;
  /** Impact from asset spotlight state. */
  spotlightImpact: number;
  /** Broad market impact from world arc. */
  arcImpact: number;
  /** Policy thread impact (0 until Phase 3). */
  policyImpact: number;
}

export interface GeneratePriceInput {
  assetId: bigint;
  prevPrice: number;
  tickIndex: number;
  impacts: PriceImpacts;
  /** Volatility profile of the asset: 'low' | 'medium' | 'high' | 'extreme'. */
  volatilityProfile: string;
}

export interface GeneratePriceResult {
  price: number;
  changeFromPrev: number;
  changePct: number;
}

/** Noise amplitude by volatility profile. */
const NOISE_AMPLITUDE: Record<string, number> = {
  low: 0.01,
  medium: 0.02,
  high: 0.04,
  extreme: 0.06,
};

/**
 * Generate a new price for a single asset at a given tick.
 * Deterministic: same inputs → same output (seeded by tickIndex:assetId).
 */
export function generatePrice(input: GeneratePriceInput): GeneratePriceResult {
  const { assetId, prevPrice, tickIndex, impacts, volatilityProfile } = input;

  const seed = `${tickIndex}:${assetId}`;
  const noiseAmp = NOISE_AMPLITUDE[volatilityProfile] ?? NOISE_AMPLITUDE['medium'];

  // Seeded noise in [-noiseAmp, +noiseAmp]
  const noiseRaw = deterministicRandom(seed);
  const noise = (noiseRaw * 2 - 1) * noiseAmp;

  const combinedImpact =
    impacts.sectorImpact +
    impacts.spotlightImpact +
    impacts.arcImpact +
    impacts.policyImpact +
    noise;

  const rawPrice = prevPrice * (1 + combinedImpact);
  const price = clampPrice(rawPrice, prevPrice);

  return {
    price,
    changeFromPrev: price - prevPrice,
    changePct: calculateChangePct(prevPrice, price),
  };
}

/** Combine all impacts into a single value (for diagnostics / logging). */
export function combineImpacts(impacts: PriceImpacts): number {
  return (
    impacts.sectorImpact +
    impacts.spotlightImpact +
    impacts.arcImpact +
    impacts.policyImpact
  );
}

/**
 * Generate prices for all assets at a given tick.
 * Returns a map of assetId → GeneratePriceResult.
 */
export function generateTickPrices(
  assets: Array<{ id: bigint; volatilityProfile: string }>,
  prevPrices: Record<string, number>,
  tickIndex: number,
  impactsPerAsset: Record<string, PriceImpacts>,
): Record<string, GeneratePriceResult> {
  const results: Record<string, GeneratePriceResult> = {};

  for (const asset of assets) {
    const key = asset.id.toString();
    const prevPrice = prevPrices[key] ?? 100;
    const impacts = impactsPerAsset[key] ?? {
      sectorImpact: 0,
      spotlightImpact: 0,
      arcImpact: 0,
      policyImpact: 0,
    };

    results[key] = generatePrice({
      assetId: asset.id,
      prevPrice,
      tickIndex,
      impacts,
      volatilityProfile: asset.volatilityProfile,
    });
  }

  return results;
}
