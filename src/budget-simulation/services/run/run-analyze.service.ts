import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { wrapAsync } from '@common/utils/async.utils';
import { BudgetRunQuery } from '@budget-simulation/queries/run.query';
import {
  analyzeRun,
  type AnalyzeMonthInput,
  type RunAnalysisResult,
} from '@budget-simulation/domain';
import type { RunWithAllMonthsRow } from '@budget-simulation/types/run.types';

type MonthRow = RunWithAllMonthsRow['months'][number];

/**
 * Builds a RunAnalysisResult from a completed run's full month history.
 * Called when runComplete = true in resolveWeek.
 */
@Injectable()
export class RunAnalyzeService {
  private readonly logger = new Logger(RunAnalyzeService.name);

  constructor(private readonly runQuery: BudgetRunQuery) {}

  async analyzeRun(runId: number): Promise<RunAnalysisResult> {
    return wrapAsync(this.logger, 'analyzeRun', async () => {
      const run = await this.runQuery.findRunWithAllMonths(BigInt(runId));
      if (!run) throw new NotFoundException('Run not found');

      const months: AnalyzeMonthInput[] = run.months.map(
        (m: MonthRow) => ({
          monthIndex: m.monthIndex,
          income: m.income,
          lockedCommitmentsTotal: m.lockedCommitmentsTotal,
          billsEstimated: m.billsEstimated,
          billsActual: m.billsActual ?? null,
          freeCash: Number(m.freeCash),
          cumulativeFutureYou: m.cumulativeFutureYou,
          stressModeActive: m.stressModeActive,
          structuralOvercommitmentOccurred: m.structuralOvercommitmentOccurred,
          overtimeIncomeEarned: m.overtimeIncomeEarned,
          jars: m.jars.map((j) => ({
            jarCode: j.jarCode,
            allocatedAmount: j.allocatedAmount,
            spentAmount: j.spentAmount,
            overflowInAmount: j.overflowInAmount,
            overflowOutAmount: j.overflowOutAmount,
          })),
          indexResolution: m.indexResolution
            ? {
                hiStart: m.indexResolution.hiStart,
                hiEnd: m.indexResolution.hiEnd ?? null,
                lqiStart: m.indexResolution.lqiStart,
                lqiEnd: m.indexResolution.lqiEnd ?? null,
                lqiStateEnd: m.indexResolution.lqiStateEnd ?? null,
              }
            : null,
          billResolution: m.billResolution
            ? {
                shortfallTotal: m.billResolution.shortfallTotal,
                surplusToFreeCash: m.billResolution.surplusToFreeCash,
                billReserveEnd: m.billResolution.billReserveEnd,
              }
            : null,
          events: m.events.map((e) => ({
            eventSource: e.eventSource,
            eventSubtype: e.eventSubtype,
            chosenOptionId: e.chosenOptionId,
            option: e.option
              ? {
                  healthDelta: e.option.healthDelta,
                  lqiDelta: e.option.lqiDelta,
                }
              : null,
          })),
        }),
      );

      return analyzeRun({
        runId,
        moduleId: run.moduleId,
        jobName: run.jobState?.job?.name ?? null,
        months,
        totalMonths: run.totalMonths,
        finalFutureYouSavings: Number(run.finalFutureYouSavings),
      });
    });
  }
}
