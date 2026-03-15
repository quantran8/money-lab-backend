import { buildJarAvailableMap } from '../spending/spending-calculator';
import { computeBillsFinal } from '../../budget-simulation.helpers';

export interface BillReconcileJarState {
  jarCode: string;
  allocated: number;
  spent: number;
  overflowIn: number;
  overflowOut: number;
}

export interface BillsInput {
  runId: number;
  monthIndex: number;
  billsEstimated: number;
  billReserveEnd: number;
  freeCash: number;
  jars: BillReconcileJarState[];
  actual: number;
}

export interface BillsResult {
  breakdown: Record<string, number>;
  jarChanges: { jarCode: string; amount: number }[];
  /** Surplus to add to free cash (when delta <= 0). */
  freeCashChange: number;
  /** Amount to deduct from free cash (when delta > 0 and we took from free_cash). */
  freeCashDecrement: number;
  structuralOvercommitment: boolean;
  /** Actual amount (from computeBillsFinal or passed). */
  actual: number;
  /** Delta (actual - estimated). */
  delta: number;
}

const JAR_ORDER = ['fun', 'give', 'learning', 'free_cash', 'future_you'];

/**
 * Computes final bills amount from estimated (deterministic variance). Pure.
 */
export function computeBills(
  runId: number,
  monthIndex: number,
  estimated: number,
): { estimated: number; actual: number; delta: number } {
  return computeBillsFinal(runId, monthIndex, estimated);
}

/**
 * Reconciles bills: computes breakdown, jar deductions, free cash change, structural overcommitment.
 * Does not persist; service applies jarChanges and updates month/billResolution.
 */
export function reconcile(input: BillsInput): BillsResult {
  const {
    billsEstimated,
    billReserveEnd,
    freeCash,
    jars,
    actual,
  } = input;

  const delta = actual - billsEstimated;
  const breakdown: Record<string, number> = {};
  const jarChanges: { jarCode: string; amount: number }[] = [];

  if (delta <= 0) {
    const surplus = Math.abs(delta);
    breakdown['billsDelta'] = delta;
    breakdown['surplusToFreeCash'] = surplus;
    return {
      breakdown,
      jarChanges: [],
      freeCashChange: surplus,
      freeCashDecrement: 0,
      structuralOvercommitment: false,
      actual,
      delta,
    };
  }

  let rem = delta;
  const takenReserve = Math.min(billReserveEnd, rem);
  rem -= takenReserve;
  breakdown['billReserve'] = takenReserve;

  const availableMap = buildJarAvailableMap(
    freeCash,
    jars.map((j) => ({
      jarCode: j.jarCode,
      allocated: j.allocated,
      spent: j.spent,
      overflowIn: j.overflowIn,
      overflowOut: j.overflowOut,
    })),
  );

  let freeCashDeficit = 0;
  for (const jar of JAR_ORDER) {
    if (rem <= 0) break;
    const available = availableMap.get(jar) ?? 0;
    const spent = Math.min(available, rem);
    if (spent > 0) {
      if (jar === 'free_cash') {
        freeCashDeficit = spent;
      } else {
        jarChanges.push({ jarCode: jar, amount: spent });
      }
      availableMap.set(jar, available - spent);
      rem -= spent;
      breakdown[jar] = spent;
    }
  }

  breakdown['billsDelta'] = delta;
  if (rem > 0) breakdown['uncovered'] = rem;

  return {
    breakdown,
    jarChanges,
    freeCashChange: 0,
    freeCashDecrement: freeCashDeficit,
    structuralOvercommitment: rem > 0,
    actual,
    delta,
  };
}
