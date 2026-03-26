// ──────────────────────────────────────────────────────────────────
// Pure domain: reflection generation from behavior snapshots
// Selects matching template and fills text from user data
// No I/O, no NestJS, no DB
// ──────────────────────────────────────────────────────────────────

export interface ReflectionTemplate {
  id: bigint;
  code: string;
  title: string;
  bodyTemplate: string;
  condition: ReflectionCondition;
}

export interface ReflectionCondition {
  /** Trigger if turnover score exceeds this threshold. */
  minTurnover?: number;
  /** Trigger if volatility chasing exceeds this threshold. */
  minVolatilityChasing?: number;
  /** Trigger if concentration change exceeds this threshold (positive = more concentrated). */
  minConcentrationChange?: number;
  /** Trigger if reaction time is below this (fast reaction = chasing). */
  maxReactionTime?: number;
  /** Trigger if turnover is below this (calm behavior). */
  maxTurnover?: number;
  /** Window type to match (e.g. 'spotlight_event'). */
  windowType?: string;
}

export interface BehaviorSnapshot {
  turnoverScore: number;
  reactionTimeScore: number;
  concentrationChange: number;
  volatilityChasingScore: number;
  windowType?: string;
}

export interface GeneratedReflection {
  templateId: bigint;
  reflectionText: string;
}

/** Check if a snapshot matches a template condition. */
function matchesCondition(snapshot: BehaviorSnapshot, cond: ReflectionCondition): boolean {
  if (cond.minTurnover != null && snapshot.turnoverScore < cond.minTurnover) return false;
  if (cond.maxTurnover != null && snapshot.turnoverScore > cond.maxTurnover) return false;
  if (cond.minVolatilityChasing != null && snapshot.volatilityChasingScore < cond.minVolatilityChasing) return false;
  if (cond.minConcentrationChange != null && snapshot.concentrationChange < cond.minConcentrationChange) return false;
  if (cond.maxReactionTime != null && snapshot.reactionTimeScore > cond.maxReactionTime) return false;
  if (cond.windowType != null && snapshot.windowType !== cond.windowType) return false;
  return true;
}

/** Fill template placeholders with snapshot values. */
function fillTemplate(template: string, snapshot: BehaviorSnapshot): string {
  return template
    .replace('{turnover}', snapshot.turnoverScore.toFixed(2))
    .replace('{reactionTime}', snapshot.reactionTimeScore.toFixed(1))
    .replace('{concentrationChange}', snapshot.concentrationChange.toFixed(3))
    .replace('{volatilityChasing}', snapshot.volatilityChasingScore.toFixed(2));
}

/**
 * Generate reflections for a user based on their behavior snapshot.
 * Returns all matching reflections (may be 0 or multiple).
 */
export function generateReflections(
  templates: ReflectionTemplate[],
  snapshot: BehaviorSnapshot,
): GeneratedReflection[] {
  const results: GeneratedReflection[] = [];

  for (const tmpl of templates) {
    const cond = tmpl.condition as ReflectionCondition;
    if (matchesCondition(snapshot, cond)) {
      results.push({
        templateId: tmpl.id,
        reflectionText: fillTemplate(tmpl.bodyTemplate, snapshot),
      });
    }
  }

  return results;
}
