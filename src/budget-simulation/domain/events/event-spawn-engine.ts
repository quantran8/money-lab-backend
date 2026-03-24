import { deterministicRandom } from '../../budget-simulation.helpers';

export interface EventPoolWeight {
  eventCategory: string;
  weight: number;
}

export interface EventTemplateRef {
  id: bigint;
  rarity: number;
}

/**
 * Deterministic spawn roll: returns true if an event should spawn (e.g. roll < 0.5).
 */
export function shouldSpawn(seed: string): boolean {
  return deterministicRandom(seed) < 0.5;
}

/**
 * Lane spawn roll: true if roll &lt; probability. probability in (0, 1]; 0 or negative never spawns.
 */
export function shouldSpawnLane(seed: string, probability: number): boolean {
  if (probability <= 0) return false;
  const p = Math.min(1, probability);
  return deterministicRandom(seed) < p;
}

/**
 * Picks category by weight from seed. Weights must have length > 0.
 */
export function chooseCategory(
  seed: string,
  weights: EventPoolWeight[],
): string {
  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
  const roll = deterministicRandom(seed) * totalWeight;
  let running = 0;
  for (const w of weights) {
    running += w.weight;
    if (roll <= running) return w.eventCategory;
  }
  return weights[weights.length - 1].eventCategory;
}

/**
 * Picks template by rarity (11 - rarity as weight). Templates must have length > 0.
 */
export function chooseTemplate(
  seed: string,
  templates: EventTemplateRef[],
): bigint {
  const totalWeight = templates.reduce((sum, t) => sum + (11 - t.rarity), 0);
  const roll = deterministicRandom(seed) * totalWeight;
  let runningWeight = 0;
  for (const t of templates) {
    runningWeight += 11 - t.rarity;
    if (runningWeight >= roll) return t.id;
  }
  return templates[templates.length - 1].id;
}

export interface EventOptionCost {
  moneyDelta: number;
}

export interface TemplateWithOptions {
  id: bigint;
  rarity: number;
  options: EventOptionCost[];
}

/**
 * Returns the cheapest cost among all options of a template.
 * Cost = abs(moneyDelta) for negative deltas; 0 for non-negative.
 */
function cheapestOptionCost(options: EventOptionCost[]): number {
  if (options.length === 0) return 0;
  return Math.min(
    ...options.map((o) => (o.moneyDelta < 0 ? Math.abs(o.moneyDelta) : 0)),
  );
}

/**
 * Filters templates so the cheapest option cost <= totalAvailableFunds.
 * If none are affordable, falls back to templates that have a zero-cost option.
 */
export function filterAffordableTemplates<
  T extends TemplateWithOptions,
>(templates: T[], totalAvailableFunds: number): T[] {
  const affordable = templates.filter(
    (t) => cheapestOptionCost(t.options) <= totalAvailableFunds,
  );
  if (affordable.length > 0) return affordable;

  return templates.filter((t) => cheapestOptionCost(t.options) === 0);
}

/**
 * Full spawn flow: should spawn (roll), then pick template from list.
 * Use when templates are already loaded (e.g. no category weights).
 * Returns template id or null if no spawn or templates empty.
 */
export function chooseTemplateIfSpawn(
  spawnSeed: string,
  templateSeed: string,
  templates: EventTemplateRef[],
): bigint | null {
  if (!shouldSpawn(spawnSeed)) return null;
  if (templates.length === 0) return null;
  return chooseTemplate(templateSeed, templates);
}
