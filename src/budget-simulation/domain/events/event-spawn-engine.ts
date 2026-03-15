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
