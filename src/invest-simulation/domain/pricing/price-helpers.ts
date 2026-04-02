// ──────────────────────────────────────────────────────────────────
// Pure domain: price clamping, rounding, change calculation
// No I/O, no NestJS, no DB
// ──────────────────────────────────────────────────────────────────

import {
  PRICE_FLOOR,
  MAX_TICK_DROP_PCT,
  MAX_TICK_RISE_PCT,
} from '../../invest-simulation.constant.js';

/** Clamp a new price within per-tick guardrails relative to previous price. */
export function clampPrice(newPrice: number, prevPrice: number): number {
  const minAllowed = Math.max(
    PRICE_FLOOR,
    Math.round(prevPrice * (1 - MAX_TICK_DROP_PCT)),
  );
  const maxAllowed = Math.round(prevPrice * (1 + MAX_TICK_RISE_PCT));
  return Math.max(minAllowed, Math.min(maxAllowed, Math.round(newPrice)));
}

/** Round price to nearest integer (cents). */
export function roundPrice(price: number): number {
  return Math.max(PRICE_FLOOR, Math.round(price));
}

/** Calculate percentage change between two prices (as a fraction, e.g. 0.05 = 5%). */
export function calculateChangePct(
  prevPrice: number,
  newPrice: number,
): number {
  if (prevPrice === 0) return 0;
  return (newPrice - prevPrice) / prevPrice;
}
