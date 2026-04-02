export const INVEST_SIMULATION_MODULE_ID = 4;

export const DEFAULT_STARTING_CREDITS = 100_000;

/** Price can never drop below this floor (in integer cents). */
export const PRICE_FLOOR = 1;

/** Maximum single-tick price drop as a fraction (0.20 = 20%). */
export const MAX_TICK_DROP_PCT = 0.2;

/** Maximum single-tick price rise as a fraction (0.30 = 30%). */
export const MAX_TICK_RISE_PCT = 0.3;

/** Default number of price-history ticks returned for asset detail. */
export const DEFAULT_PRICE_HISTORY_LIMIT = 50;

// ── Spawn engine constants ──────────────────────────────────────

/** Maximum number of world arcs allowed to run concurrently. */
export const MAX_ACTIVE_ARCS = 3;

/** Maximum number of policy threads allowed to run concurrently. */
export const MAX_ACTIVE_POLICIES = 2;

/** Ticks to wait before re-spawning the same arc type after it completes. */
export const ARC_COOLDOWN_TICKS = 20n;

/** Ticks to wait before re-spawning the same policy template after resolution. */
export const POLICY_COOLDOWN_TICKS = 15n;

/** Max spotlights spawned per arc transition into expansion/integration. */
export const MAX_SPOTLIGHTS_PER_ARC_TRANSITION = 10;
