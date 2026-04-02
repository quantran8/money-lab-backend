import { Injectable } from '@nestjs/common';
import { BudgetMonthQuery } from '#budget-simulation/queries/month.query.js';
import { BudgetMonthRepository } from '#budget-simulation/repositories/month.repository.js';
import { BudgetSimulationConfigService } from '../config.service';
import type {
  WeeklyIndexProgressItem,
  WeeklySpendSummary,
} from '#budget-simulation/domain/index.js';
import type {
  MonthWithRunAndJobLevel,
  ChosenEventsTotalsResult,
  ForcedRestNotice,
  IndexWeeklyResolutionResult,
} from '#budget-simulation/types/index.js';
import { indexResolveWeek } from '#budget-simulation/domain/index.js';
import {
  DEFAULT_HI_START,
  DEFAULT_LQI_START,
} from '#budget-simulation/budget-simulation.constant.js';
import { TxClient } from '#app/prisma/transaction.runner.js';

/**
 * Handles HI/LQI index: weekly resolution compute + persist.
 */
@Injectable()
export class MonthIndexService {
  constructor(
    private readonly monthQuery: BudgetMonthQuery,
    private readonly monthRepository: BudgetMonthRepository,
    private readonly configService: BudgetSimulationConfigService,
  ) {}

  /**
   * Persists weekly index resolution. Pass preloaded month and eventTotals to avoid DB reads.
   * Returns computed hiEnd, lqiEnd so callers can build response.
   */
  async resolveWeeklyIndex(
    monthIdBig: bigint,
    week: number,
    weeklySpend: WeeklySpendSummary,
    forcedRestNotice: ForcedRestNotice | null,
    tx?: TxClient,
    preloaded?: {
      month: MonthWithRunAndJobLevel;
      eventTotals?: ChosenEventsTotalsResult;
    },
  ): Promise<IndexWeeklyResolutionResult | undefined> {
    const month =
      preloaded?.month ??
      (await this.monthQuery.findMonthWithRunAndJobLevel(monthIdBig, tx));
    if (!month?.indexResolution) return undefined;

    const config = this.configService.getConfig();
    const ir = month.indexResolution;

    const hiStart = Number(ir.hiEnd ?? ir.hiStart ?? DEFAULT_HI_START);
    const lqiStart = Number(ir.lqiEnd ?? ir.lqiStart ?? DEFAULT_LQI_START);

    const jobLevel = month.run?.jobState?.job?.levels.find(
      (l) => l.level === month.run?.jobState?.level,
    );
    const weeklyJobDrain = Math.round(jobLevel?.baseEnergyLoadOverride ?? 0);

    const { healthDeltaTotal, lqiDeltaTotal } =
      preloaded?.eventTotals ??
      (await this.monthQuery.getChosenEventsHealthAndLqiTotalsForWeek(
        monthIdBig,
        week,
        tx,
      ));

    const indexResult = indexResolveWeek({
      config,
      hiStart,
      lqiStart,
      weeklySpend,
      weeklyJobDrain,
      eventHealthDeltaTotal: healthDeltaTotal,
      eventLqiDeltaTotal: lqiDeltaTotal,
      forcedRestRecovery: forcedRestNotice?.hiRecovery ?? 0,
      forcedRestIncomeLoss: forcedRestNotice?.incomeLoss ?? 0,
    });

    const {
      hiEnd,
      lqiEnd,
      lqiStateEnd,
      weeklyProgress: weeklyPayload,
    } = indexResult;

    const currentProgress =
      (ir.weeklyIndexProgress as Record<
        string,
        WeeklyIndexProgressItem
      > | null) ?? {};

    const nextProgress = {
      ...currentProgress,
      [`week${week}`]: weeklyPayload,
    };

    await this.monthRepository.updateIndexResolution(
      monthIdBig,
      {
        hiEnd,
        lqiEnd,
        lqiStateEnd,
        baselineRecovery: weeklyPayload.baselineRecovery,
        funRecoveryBonus: weeklyPayload.funRecoveryBonus,
        jobDrain: weeklyPayload.jobDrain,
        eventHiEffectTotal: Object.values(nextProgress).reduce(
          (sum, x) => sum + Number(x.eventHiEffectTotal ?? 0),
          0,
        ),
        stressEffect: weeklyPayload.stressEffect,
        hiNetChange: hiEnd - Number(ir.hiStart),
        baselineRecoveryEfficiencyPct:
          weeklyPayload.baselineRecoveryEfficiencyPct,
        funRecoveryEfficiencyPct: weeklyPayload.funRecoveryEfficiencyPct,
        eventPoolBiasState: lqiStateEnd,
        weeklyIndexProgress: nextProgress,
      },
      tx,
    );
    return { hiEnd, lqiEnd };
  }
}
