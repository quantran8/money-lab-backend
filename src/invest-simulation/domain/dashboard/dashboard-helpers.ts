// ──────────────────────────────────────────────────────────────────
// Pure domain: dashboard label mappers and small helpers
// No I/O, no NestJS, no DB
// ──────────────────────────────────────────────────────────────────

const ARC_STATE_LABELS: Record<string, string> = {
  background: 'Background',
  spark: 'Spark',
  expansion: 'Expansion',
  integration: 'Integration',
  absorbed: 'Absorbed',
};

const POLICY_STATE_LABELS: Record<string, string> = {
  undeclared: 'Undeclared',
  declared_path: 'Declared',
  action_1: 'Action I',
  action_2: 'Action II',
  action_3: 'Action III',
  resolution: 'Resolution',
};

/** Map an arc FSM state to a human-readable label. */
export function mapArcStateLabel(state: string): string {
  return ARC_STATE_LABELS[state] ?? state;
}

/** Map an arc progress fraction (0–1) to a stage label. */
export function mapArcProgressLabel(progress: number): string {
  if (progress >= 1) return 'Complete';
  if (progress >= 0.66) return 'Late-stage';
  if (progress >= 0.33) return 'Mid-stage';
  return 'Early-stage';
}

/** Map a policy FSM state to a human-readable label. */
export function mapPolicyStateLabel(state: string): string {
  return POLICY_STATE_LABELS[state] ?? state;
}

/** Map a stability factor (0.5–2.0) to a human label. */
export function mapStabilityLabel(factor: number): string {
  if (factor < 0.8) return 'Volatile';
  if (factor < 1.0) return 'Developing';
  if (factor < 1.2) return 'Stable';
  if (factor < 1.5) return 'Resilient';
  return 'Fortress';
}

/**
 * Extract the description for the current state from a policy template's
 * `stateDescriptions` JSON column. Returns null if no matching entry exists.
 */
export function extractPolicyStateDescription(
  stateDescriptions: unknown,
  state: string,
): string | null {
  if (
    stateDescriptions == null ||
    typeof stateDescriptions !== 'object' ||
    Array.isArray(stateDescriptions)
  ) {
    return null;
  }
  const value = (stateDescriptions as Record<string, unknown>)[state];
  return typeof value === 'string' ? value : null;
}
