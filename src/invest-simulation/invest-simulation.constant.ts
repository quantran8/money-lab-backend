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
