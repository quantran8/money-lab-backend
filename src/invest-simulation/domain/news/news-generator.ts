// ──────────────────────────────────────────────────────────────────
// Pure domain: news generation from state transitions
// News is descriptive, never advisory (no "buy"/"sell" language)
// No I/O, no NestJS, no DB
// ──────────────────────────────────────────────────────────────────

import { deterministicRandom, seedInt } from '../../invest-simulation.helpers.js';
import type { SpotlightState } from '../state-machines/asset-spotlight.js';
import type { ArcState } from '../state-machines/world-arc.js';

export interface SpotlightTransitionEvent {
  type: 'spotlight';
  assetId: bigint;
  assetName: string;
  sectorCode: string;
  fromState: SpotlightState;
  toState: SpotlightState;
}

export interface ArcTransitionEvent {
  type: 'arc';
  arcTypeName: string;
  fromState: ArcState;
  toState: ArcState;
}

export type StateTransitionEvent = SpotlightTransitionEvent | ArcTransitionEvent;

export interface GeneratedNewsItem {
  title: string;
  body: string;
  tone: string;
  intensity: number;
  narrativeTag: string;
  /** Asset impacts as { assetId → impactPct }. */
  assetImpacts: Record<string, number>;
  /** Sector impacts as { sectorCode → impactPct }. */
  sectorImpacts: Record<string, number>;
}

// ── Headline templates ─────────────────────────────────────────

const SPOTLIGHT_HEADLINES: Record<string, string[]> = {
  'emerging': [
    'Whispers surround {asset} as sector attention grows',
    'Analysts notice unusual patterns in {asset}',
    'Market observers keep an eye on {asset}',
  ],
  'hype': [
    '{asset} attracts heightened market attention',
    'Discussion intensifies around {asset} prospects',
    'Traders debate {asset} valuation amid rising interest',
  ],
  'peak': [
    '{asset} reaches center stage in market discourse',
    'Peak attention: {asset} dominates financial discussion',
    'Market focus narrows on {asset} as interest peaks',
  ],
  'decline': [
    'Interest in {asset} begins to cool',
    '{asset} fades from the spotlight as attention wanes',
    'Market attention shifts away from {asset}',
  ],
  'recovery': [
    '{asset} enters stabilization phase after turbulent period',
    'Calm returns to {asset} as volatility subsides',
    '{asset} shows signs of normalization',
  ],
};

const ARC_HEADLINES: Record<string, string[]> = {
  'spark': [
    'Early signals of {arc} emerge in global markets',
    'A new narrative takes shape: {arc}',
  ],
  'expansion': [
    '{arc} gains momentum across multiple sectors',
    'Broad impact felt as {arc} continues to unfold',
  ],
  'integration': [
    'Markets begin to absorb implications of {arc}',
    '{arc} enters integration phase, reshaping expectations',
  ],
  'absorbed': [
    '{arc} fully absorbed into market baseline',
    'The era of {arc} concludes as markets find new equilibrium',
  ],
};

const TONE_MAP: Record<string, string> = {
  emerging: 'speculative',
  hype: 'excited',
  peak: 'intense',
  decline: 'cautious',
  recovery: 'neutral',
  spark: 'curious',
  expansion: 'optimistic',
  integration: 'measured',
  absorbed: 'neutral',
};

const INTENSITY_MAP: Record<string, number> = {
  emerging: 0.3,
  hype: 0.6,
  peak: 0.9,
  decline: 0.5,
  recovery: 0.2,
  spark: 0.2,
  expansion: 0.5,
  integration: 0.4,
  absorbed: 0.1,
};

function pickTemplate(templates: string[], seed: string): string {
  const idx = Math.abs(seedInt(seed)) % templates.length;
  return templates[idx];
}

export function generateNewsFromTransitions(
  events: StateTransitionEvent[],
  tickIndex: number,
): GeneratedNewsItem[] {
  const items: GeneratedNewsItem[] = [];

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const seed = `news:${tickIndex}:${i}`;

    if (event.type === 'spotlight') {
      const templates = SPOTLIGHT_HEADLINES[event.toState];
      if (!templates) continue;

      const title = pickTemplate(templates, seed).replace('{asset}', event.assetName);
      const impact = spotlightNewsImpact(event.toState);

      items.push({
        title,
        body: `Sector: ${event.sectorCode}. The spotlight on ${event.assetName} moves to ${event.toState} phase.`,
        tone: TONE_MAP[event.toState] ?? 'neutral',
        intensity: INTENSITY_MAP[event.toState] ?? 0.3,
        narrativeTag: `spotlight:${event.toState}`,
        assetImpacts: { [event.assetId.toString()]: impact },
        sectorImpacts: { [event.sectorCode]: impact * 0.3 },
      });
    }

    if (event.type === 'arc') {
      const templates = ARC_HEADLINES[event.toState];
      if (!templates) continue;

      const title = pickTemplate(templates, seed).replace('{arc}', event.arcTypeName);
      const impact = arcNewsImpact(event.toState);

      items.push({
        title,
        body: `The ${event.arcTypeName} narrative transitions to ${event.toState} phase.`,
        tone: TONE_MAP[event.toState] ?? 'neutral',
        intensity: INTENSITY_MAP[event.toState] ?? 0.3,
        narrativeTag: `arc:${event.toState}`,
        assetImpacts: {},
        sectorImpacts: {},
      });
    }
  }

  return items;
}

function spotlightNewsImpact(state: SpotlightState): number {
  switch (state) {
    case 'emerging': return 0.02;
    case 'hype': return 0.04;
    case 'peak': return 0.06;
    case 'decline': return -0.03;
    case 'recovery': return -0.01;
    default: return 0;
  }
}

function arcNewsImpact(state: ArcState): number {
  switch (state) {
    case 'spark': return 0.01;
    case 'expansion': return 0.02;
    case 'integration': return 0.01;
    case 'absorbed': return 0;
    default: return 0;
  }
}
