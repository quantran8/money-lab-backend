import {
  calculateMonthIncome,
  resolveBaseJobIncome,
  resolveOvertimeChoicePersistence,
} from './month-income';

describe('resolveBaseJobIncome', () => {
  it('multiplies base by level multiplier', () => {
    expect(
      resolveBaseJobIncome({ baseMonthlyIncome: 3000 }, {
        incomeMultiplier: 1.1,
      } as { incomeMultiplier: unknown }),
    ).toBe(3300);
  });

  it('defaults multiplier to 1 when level null', () => {
    expect(resolveBaseJobIncome({ baseMonthlyIncome: 2000 }, null)).toBe(2000);
  });
});

describe('calculateMonthIncome', () => {
  it('adds prior OT earned to resolved base', () => {
    expect(
      calculateMonthIncome({
        job: { baseMonthlyIncome: 4000 },
        jobLevel: { incomeMultiplier: 1 } as { incomeMultiplier: unknown },
        previousMonthOvertimeIncomeEarned: 500,
      }),
    ).toBe(4500);
  });
});

describe('resolveOvertimeChoicePersistence', () => {
  it('accept increments', () => {
    expect(
      resolveOvertimeChoicePersistence({
        isAccept: true,
        resolvedOvertimeIncomePerUnit: 120,
      }),
    ).toEqual({ acceptedDelta: 1, overtimeIncomeEarnedDelta: 120 });
  });

  it('skip does nothing', () => {
    expect(
      resolveOvertimeChoicePersistence({
        isAccept: false,
        resolvedOvertimeIncomePerUnit: 120,
      }),
    ).toEqual({ acceptedDelta: 0, overtimeIncomeEarnedDelta: 0 });
  });
});
