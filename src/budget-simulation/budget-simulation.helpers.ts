import { createHash } from 'crypto';
import {
  type BudgetSimulationModuleConfig,
  LEARNING_TIER_MICRO_MAX,
  LEARNING_TIER_BASIC_MAX,
  LEARNING_TIER_COURSE_MAX,
  BILL_VARIANCE_CENTER,
  BILL_VARIANCE_RANGE,
} from './budget-simulation.constant';

export type LqiState = 'stable' | 'compressed' | 'strained';
type JarType = 'fun' | 'learning' | 'give';


/**
 * Resolves numeric LQI to player-facing state using module index_rules thresholds.
 * stable: LQI >= stable_min; compressed: between compressed_min and compressed_max; else strained.
 */
export function resolveLqiState(
  lqi: number,
  config: BudgetSimulationModuleConfig,
): LqiState {
  const t = config.indexRules?.lqiThresholds;
  if (!t) return 'stable';
  if (lqi >= t.stableMin) return 'stable';
  if (lqi >= t.compressedMin && lqi <= t.compressedMax) return 'compressed';
  return 'strained';
}

/**
 * Clamps HI to index_rules bounds (hi_floor, hi_cap).
 */
export function clampHi(
  rawHi: number,
  config: BudgetSimulationModuleConfig,
): number {
  const r = config.indexRules;
  if (!r) return Math.max(0, Math.min(100, rawHi));
  return Math.min(
    r.hiCap,
    Math.max(r.hiFloor, Math.round(rawHi)),
  );
}

/**
 * Clamps LQI to index_rules lqi_floor and 100.
 */
export function clampLqi(
  rawLqi: number,
  config: BudgetSimulationModuleConfig,
): number {
  const r = config.indexRules;
  const floor = r?.lqiFloor ?? 0;
  return Math.max(floor, Math.min(100, Math.round(rawLqi)));
}

/**
 * Returns a deterministic float in [0, 1) from seed string.
 */
export function deterministicRandom(seed: string): number {
    const hash = createHash('md5').update(seed).digest('hex');
    const first16 = hash.substring(0, 16);
    const i64 = BigInt(`0x${first16}`);
    const two64 = BigInt('18446744073709551616');
    return Number(i64) / Number(two64);
}

/**
 * Returns a deterministic 32-bit integer from seed string.
 */
export function seedInt(seed: string): number {
    const hash = createHash('md5').update(seed).digest('hex');
    return parseInt(hash.substring(0, 8), 16) | 0;
}

/**
 * Generates a deterministic autospend label for a jar spend entry.
 * Inputs: seed, jar code, amount, spendMode code, global week index.
 */

function getLearningTier(
  amount: number,
): 'micro' | 'basic' | 'course' | 'intensive' {
  if (amount < LEARNING_TIER_MICRO_MAX) return 'micro';
  if (amount < LEARNING_TIER_BASIC_MAX) return 'basic';
  if (amount < LEARNING_TIER_COURSE_MAX) return 'course';
  return 'intensive';
}

export function genAutoSpendLabel(
  seed: string,
  jarType: String,
  amount: number,
  spendMode: string,
  weekIndex: number,
): string {
  const labelPrefixes = [
    'Quick moment:',
    'Low-key move:',
    'Tiny decision:',
    'Just life:',
    'Small shift:',
    'One step:',
    'Nothing major:',
    'Casual choice:',
    'Real life:',
    'Today:',
    'No big drama:',
    'Kept it simple:',
    'Small energy:',
    'Little upgrade:',
    'Soft move:',
    'Stayed consistent:',
    'Another step:',
    'Nothing fancy:',
    'Just doing your thing:',
    'Small play:',
  ];

  const funActions = [
    'treated yourself a little',
    'went for a quick mood boost',
    'did something just for you',
    'kept things light today',
    'picked a small joy',
    'gave yourself a break',
    'made the day a bit better',
    'took a breather',
    'added a little fun to the mix',
    'went for a comfort choice',
    'said yes to a small want',
    'took a soft reset moment',
    'kept the vibes decent',
    'made space for yourself',
    'chose a little enjoyment',
    'went easy on yourself',
    'kept things from feeling dry',
    'added some color to the day',
    'kept it from being all work',
    'balanced things out a bit',
    'gave yourself something nice',
    'made today less boring',
    'did a tiny vibe upgrade',
    'kept your energy up',
    'didn’t overthink it, just enjoyed',
    'took a small win',
    'kept things human',
    'let yourself enjoy something',
    'did something low-key fun',
    'kept the day from dragging',
  ];

  const learningActionsByTier = {
    micro: [
      'picked up a small resource',
      'did a quick skill upgrade',
      'added something small to learn from',
      'kept your learning going',
      'put a bit into growth',
      'stacked a tiny improvement',
      'kept the momentum alive',
      'made a small upgrade',
      'did a quick knowledge boost',
      'added a small piece to your skills',
    ],
    basic: [
      'grabbed a useful book or tool',
      'invested in a solid learning resource',
      'put money into improving your skills',
      'added something meaningful to your learning',
      'made a smart growth move',
      'picked up something worth learning',
      'put effort into getting better',
      'leveled up your knowledge a bit',
      'made a proper learning investment',
      'added a strong piece to your stack',
    ],
    course: [
      'started a course',
      'committed to learning something new',
      'put real effort into leveling up',
      'invested in a structured program',
      'took learning more seriously this time',
      'made a bigger move for your growth',
      'locked in on improving yourself',
      'went in on a proper learning step',
      'chose to upgrade your skills properly',
      'made a strong investment in yourself',
    ],
    intensive: [
      'committed to a serious program',
      'went all in on learning',
      'made a big move for your future',
      'invested heavily in your growth',
      'took a major step forward',
      'put real weight behind your learning',
      'fully committed to leveling up',
      'made a high-impact investment in yourself',
      'took your growth seriously',
      'went for a major upgrade',
    ],
  };

  const givingActions = [
    'helped someone out',
    'gave a little back',
    'shared something small',
    'did a kind thing',
    'supported someone',
    'made a small impact',
    'gave with intention',
    'put something good out there',
    'showed up for someone',
    'did your part',
    'sent a bit of kindness',
    'gave without overthinking',
    'helped where you could',
    'kept it generous',
    'did something thoughtful',
    'made things a bit better',
    'chose to give a little',
    'kept it human',
    'did something that matters',
    'showed some care',
  ];

  const amountDescriptions = [
    'just a bit',
    'a small one',
    'a decent chunk',
    'a quick spend',
    'a modest hit',
    'a solid slice',
    'a tiny drop',
    'a clean spend',
  ];

  const sentenceEndings = [
    '— and kept going.',
    '— nothing dramatic.',
    '— still in control.',
    '— that works.',
    '— clean and simple.',
    '— no overthinking.',
    '— stayed balanced.',
    '— just part of it.',
    '— all good.',
    '— makes sense.',
    '— no regrets there.',
    '— solid choice.',
    '— kept it moving.',
    '— that’s life.',
    '— small but counts.',
    '— still on track.',
    '— handled it.',
    '— easy decision.',
    '— nothing wasted.',
    '— adds up.',
  ];

  // deterministic seeds
  const prefixSeed = Math.abs(seedInt(`${seed}:prefix`));
  const actionSeed = Math.abs(seedInt(`${seed}:action:${jarType}`));
  const amountSeed = Math.abs(seedInt(`${seed}:amount`));
  const endingSeed = Math.abs(seedInt(`${seed}:ending:${spendMode}`));

  // index selection
  const prefixIndex = (prefixSeed + weekIndex) % labelPrefixes.length;
  const amountIndex = (amountSeed + weekIndex * 5) % amountDescriptions.length;
  const endingIndex = (endingSeed + weekIndex * 7) % sentenceEndings.length;

  const prefix = labelPrefixes[prefixIndex];
  const amountText = amountDescriptions[amountIndex];
  const ending = sentenceEndings[endingIndex];

  let actionText = 'spent automatically';

  if (jarType === 'fun') {
    const index = (actionSeed + weekIndex * 3) % funActions.length;
    actionText = funActions[index];
  } else if (jarType === 'learning') {
    const tier = getLearningTier(amount);
    const actions = learningActionsByTier[tier];
    const index = (actionSeed + weekIndex * 3) % actions.length;
    actionText = actions[index];
  } else if (jarType === 'give') {
    const index = (actionSeed + weekIndex * 3) % givingActions.length;
    actionText = givingActions[index];
  }

  return `${prefix} ${actionText} — ${amountText} ${ending}`;
}

/** Seasonal bill increase rules by month index. */
const SEASONAL_BILL_OVERRIDES: Record<
  number,
  { minPct: number; maxPct: number; reason: string }
> = {
  1: {
    minPct: 0.05,
    maxPct: 0.12,
    reason: 'Thời tiết lạnh — hệ thống sưởi hoạt động nhiều hơn, hóa đơn điện tăng.',
  },
  2: {
    minPct: 0.05,
    maxPct: 0.12,
    reason: 'Thời tiết lạnh — hệ thống sưởi hoạt động nhiều hơn, hóa đơn điện tăng.',
  },
  5: {
    minPct: 0.06,
    maxPct: 0.15,
    reason: 'Mùa hè nóng — dùng điều hòa và nước nhiều hơn, hóa đơn điện & nước tăng.',
  },
  6: {
    minPct: 0.06,
    maxPct: 0.15,
    reason: 'Mùa hè nóng — dùng điều hòa và nước nhiều hơn, hóa đơn điện & nước tăng.',
  },
};

/**
 * Computes final bills amount from estimated using deterministic variance.
 * Normal months: ±5%. Seasonal months (1-2 winter, 5-6 summer): always positive, stronger delta.
 * Returns actual amount, delta, and optional reason for the increase.
 */
export function computeBillsFinal(
    runId: number,
    monthIndex: number,
    estimated: number
): { estimated: number; actual: number; delta: number; reason: string | null } {
    const seed = `${runId}:${monthIndex}:bills`;
    const r = deterministicRandom(seed);

    const seasonal = SEASONAL_BILL_OVERRIDES[monthIndex];
    if (seasonal) {
      const factor = seasonal.minPct + r * (seasonal.maxPct - seasonal.minPct);
      const actual = Math.round(estimated * (1 + factor));
      const delta = actual - estimated;
      return { estimated, actual, delta, reason: seasonal.reason };
    }

    const factor = (r - BILL_VARIANCE_CENTER) * BILL_VARIANCE_RANGE;
    const actual = Math.round(estimated * (1 + factor));
    const delta = actual - estimated;
    return { estimated, actual, delta, reason: null };
}

