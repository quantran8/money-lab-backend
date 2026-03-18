import {
  resolveOvertimeEffectsFromJobLevel,
  isOvertimeAcceptOption,
} from './overtime-effects';

describe('resolveOvertimeEffectsFromJobLevel', () => {
  it('uses level overrides when set', () => {
    const r = resolveOvertimeEffectsFromJobLevel(
      { overtimeIncomePerUnit: 10, overtimeHealthPenalty: -1 },
      { overtimeIncomePerUnit: 200, overtimeHealthPenalty: -5 },
    );
    expect(r).toEqual({ incomePerUnit: 200, healthPenalty: -5 });
  });

  it('falls back to job when level fields null', () => {
    const r = resolveOvertimeEffectsFromJobLevel(
      { overtimeIncomePerUnit: 80, overtimeHealthPenalty: -3 },
      { overtimeIncomePerUnit: null, overtimeHealthPenalty: null },
    );
    expect(r).toEqual({ incomePerUnit: 80, healthPenalty: -3 });
  });
});

describe('isOvertimeAcceptOption', () => {
  it('first id in sorted list is accept', () => {
    const a = BigInt(1);
    const b = BigInt(2);
    expect(isOvertimeAcceptOption([a, b], a)).toBe(true);
    expect(isOvertimeAcceptOption([a, b], b)).toBe(false);
  });
});
