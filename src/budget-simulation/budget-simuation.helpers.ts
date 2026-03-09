import { createHash } from 'crypto';

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
export function genAutoSpendLabel(
    seed: string,
    jar: string,
    amount: number,
    spendMode: string,
    weekGlobal: number
): string {
    const prefixes = ['Quick moment:', 'Small win:', 'Tiny upgrade:', 'Just life:', 'A little move:', 'No big deal:', 'Slow and steady:', 'Real-world stuff:', 'One step:', 'Today:'];
    const funVerbs = ['treated yourself', 'caught a vibe', 'went for a little joy', 'did something fun', 'took a breather', 'added some spark', 'picked a small pleasure', 'unwound a bit', 'made the day nicer', 'kept it light'];
    const learnVerbs = ['put time into skills', 'learned something new', 'invested in growth', 'leveled up a bit', 'built a habit', 'studied a little', 'pushed progress', 'did a mini practice session', 'fed your curiosity', 'kept learning going'];
    const giveVerbs = ['paid it forward', 'showed some generosity', 'helped someone out', 'shared a bit', 'did a kind thing', 'supported a good cause', 'made a small impact', 'gave with intent', 'sent some kindness', 'did a quiet good deed'];
    const amountStyles = ['just a bit', 'a small one', 'a decent chunk', 'a quick spend', 'a modest hit', 'a solid slice', 'a tiny drop', 'a clean spend'];
    const tails = ['— and moved on.', '— no guilt.', '— kept it under control.', '— balanced.', '— nice and simple.', '— still on track.', '— that\'s budgeting.', '— felt right.'];

    const size = amount <= 15 ? 'tiny' : amount <= 40 ? 'small' : amount <= 80 ? 'medium' : 'big';

    const n1 = Math.abs(seedInt(`${seed}:p`));
    const n2 = Math.abs(seedInt(`${seed}:v:${jar}`));
    const n3 = Math.abs(seedInt(`${seed}:a`));
    const n4 = Math.abs(seedInt(`${seed}:t:${size}:${spendMode}`));

    const i1 = (n1 + weekGlobal) % prefixes.length;
    const i2 = (n2 + weekGlobal * 3) % 10;
    const i3 = (n3 + weekGlobal * 5) % amountStyles.length;
    const i4 = (n4 + weekGlobal * 7) % tails.length;

    const prefix = prefixes[i1];
    const style = amountStyles[i3];
    const tail = tails[i4];
    let verb = 'spent automatically';
    if (jar === 'fun') verb = funVerbs[i2];
    else if (jar === 'learning') verb = learnVerbs[i2];
    else if (jar === 'give') verb = giveVerbs[i2];

    return `${prefix} ${verb} — ${style} ${tail}`;
}

/**
 * Computes final bills amount from estimated using deterministic variance (+/- 5%).
 * Returns actual amount and delta from estimated.
 */
export function computeBillsFinal(
    runId: number,
    monthIndex: number,
    estimated: number
): { estimated: number; actual: number; delta: number } {
    const seed = `${runId}:${monthIndex}:bills`;
    const r = deterministicRandom(seed);
    const factor = (r - 0.5) * 0.1;
    const actual = Math.round(estimated * (1 + factor));
    const delta = actual - estimated;
    return { estimated, actual, delta };
}

