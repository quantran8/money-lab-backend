import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { BudgetMonthQuery } from '@budget-simulation/queries/month.query';
import { BudgetMonthRepository } from '@budget-simulation/repositories/month.repository';
import { END_OF_MONTH_WEEK } from '@budget-simulation/budget-simulation.constant';
import { computeBills as domainComputeBills, billsReconcile } from '@budget-simulation/domain';
import { MonthSpendService } from './month-spend.service';
import type {
  BillsComputeResult,
  ReconcileBillsContext,
} from '@budget-simulation/types';
import { JarCode } from '@app/budget-simulation/budget-simulation.enum';
import { TxClient } from '@app/prisma/transaction.runner';

/**
 * Handles bill reconciliation: finalize bills, reconcile with jars, persist.
 */
@Injectable()
export class MonthBillService {
  constructor(
    private readonly monthQuery: BudgetMonthQuery,
    private readonly monthRepository: BudgetMonthRepository,
    private readonly spendService: MonthSpendService,
  ) {}

  async computeBills(
    runId: number,
    monthIndex: number,
    estimated: number,
  ): Promise<BillsComputeResult> {
    return domainComputeBills(runId, monthIndex, estimated);
  }

  /**
   * Finalize bills using preloaded month and jars; computes breakdown via domain, then persists.
   */
  async reconcileBillsWithContext(
    userId: string,
    monthId: number,
    actual: number,
    context: ReconcileBillsContext,
    tx: TxClient,
    effectiveCurrentWeek?: number,
    reason?: string | null,
  ): Promise<Record<string, number | string | null>> {
    const monthIdBig = BigInt(monthId);
    const { jars, month } = context;
    if (month.budgetRun.userId !== userId)
      throw new ForbiddenException('Forbidden');
    const weekToCheck = effectiveCurrentWeek ?? month.currentWeek;
    if (weekToCheck < END_OF_MONTH_WEEK)
      throw new BadRequestException('Cannot finalize bills before week 4');

    const billReserveEnd = Number(month.billResolution?.billReserveEnd ?? 0);
    const jarStates = jars.map((j) => ({
      jarCode: j.jarCode,
      allocated: Number(j.allocatedAmount),
      spent: Number(j.spentAmount),
      overflowIn: Number(j.overflowInAmount),
      overflowOut: Number(j.overflowOutAmount),
    }));
    const result = billsReconcile({
      runId: Number(month.budgetRunId),
      monthIndex: month.monthIndex,
      billsEstimated: Number(month.billsEstimated),
      billReserveEnd,
      freeCash: Number(month.freeCash ?? 0),
      jars: jarStates,
      actual,
      reason: reason ?? null,
    });

    if (result.delta <= 0) {
      await this.monthRepository.updateMonth(
        monthIdBig,
        {
          billsActual: result.actual,
          freeCash: { increment: result.freeCashChange },
        },
        tx,
      );
      await this.monthRepository.updateBillResolution(
        monthIdBig,
        {
          billReconcileBreakdown: result.breakdown,
          surplusToFreeCash: result.freeCashChange,
        },
        tx,
      );
      return result.breakdown;
    }

    const reserveTaken = Number(result.breakdown['billReserve'] ?? 0);
    await this.monthRepository.updateBillResolution(
      monthIdBig,
      { billReserveEnd: billReserveEnd - reserveTaken },
      tx,
    );
    await Promise.all(
      result.jarChanges.map(({ jarCode, amount }) =>
        this.spendService.addSpendLog(monthIdBig, jarCode, 0, 0, amount, tx),
      ),
    );
    await this.monthRepository.updateMonth(
      monthIdBig,
      {
        billsActual: result.actual,
        structuralOvercommitmentOccurred: result.structuralOvercommitment,
        ...(result.freeCashDecrement > 0 && {
          freeCash: { decrement: result.freeCashDecrement },
        }),
      },
      tx,
    );
    await this.monthRepository.updateBillResolution(
      monthIdBig,
      {
        billReconcileBreakdown: result.breakdown,
        shortfallTotal: result.structuralOvercommitment
          ? Number(result.breakdown['uncovered'] ?? 0)
          : 0,
      },
      tx,
    );
    return result.breakdown;
  }

  async reconcileBills(
    userId: string,
    monthId: number,
    actual: number,
    tx?: TxClient,
  ): Promise<Record<string, number | string | null>> {
    const monthIdBig = BigInt(monthId);
    const month = await this.monthQuery.findMonthWithRun(monthIdBig, tx);
    if (!month || month.budgetRun.userId !== userId)
      throw new ForbiddenException('Forbidden');
    const jars = await this.monthQuery.findJarsForMonth(
      monthIdBig,
      Object.values(JarCode),
      tx,
    );
    return this.reconcileBillsWithContext(
      userId,
      monthId,
      actual,
      { month, jars },
      tx!,
    );
  }
}
