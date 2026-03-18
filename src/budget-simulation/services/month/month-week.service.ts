import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { wrapAsync } from '@common/utils/async.utils';
import { clampHi, clampLqi } from '@app/budget-simulation/budget-simulation.helpers';
import { BudgetMonthQuery } from '@budget-simulation/queries/month.query';
import { BudgetMonthRepository } from '@budget-simulation/repositories/month.repository';
import { JarCode, SpendModeCode } from '@budget-simulation/budget-simulation.enum';
import { END_OF_MONTH_WEEK } from '@budget-simulation/budget-simulation.constant';
import { jarAvailable } from '@budget-simulation/domain';
import { MonthSpendService } from './month-spend.service';
import { MonthEventService } from './month-event.service';
import { MonthIndexService } from './month-index.service';
import { MonthBillService } from './month-bill.service';
import { BudgetSimulationConfigService } from '../config.service';
import type {
  MonthWithRunAndJobLevelAndJars,
  PendingEventWithTemplateRow,
  SpawnEventTemplatePayload,
} from '@budget-simulation/types';
import { TransactionRunner, TxClient } from '@app/prisma/transaction.runner';

/**
 * Data loaded before advancing the month to the next week (two lanes: life + overtime).
 */
export interface ResolveWeekContext {
  month: MonthWithRunAndJobLevelAndJars;
  spendModeRate: number;
  /** Count of events on the current week index still awaiting player choice (blocks advance). */
  unresolvedChoiceCountOnCurrentWeek: number;
  nextWeek: number;
  /** Life-lane row for nextWeek if already spawned and unresolved. */
  lifeEventPendingForNextWeek: PendingEventWithTemplateRow | null;
  /** Work/overtime row for nextWeek if already spawned and unresolved. */
  overtimeEventPendingForNextWeek: PendingEventWithTemplateRow | null;
  /** When no life row exists for nextWeek yet and spawn roll hits: template id to insert. */
  lifeEventTemplateIdToCreate: bigint | null;
  /** When no OT row exists for nextWeek yet and spawn roll hits: template id to insert. */
  overtimeEventTemplateIdToCreate: bigint | null;
}

/**
 * Handles resolve-week workflow: load context, validate, apply spend/event/index/bills, build response.
 */
@Injectable()
export class MonthWeekService {
  private readonly logger = new Logger(MonthWeekService.name);

  constructor(
    private readonly transactionRunner: TransactionRunner,
    private readonly monthQuery: BudgetMonthQuery,
    private readonly monthRepository: BudgetMonthRepository,
    private readonly configService: BudgetSimulationConfigService,
    private readonly spendService: MonthSpendService,
    private readonly eventService: MonthEventService,
    private readonly indexService: MonthIndexService,
    private readonly billService: MonthBillService,
  ) {}

  async loadResolveWeekContext(
    monthId: bigint,
  ): Promise<ResolveWeekContext | null> {
    const month =
      await this.monthQuery.findMonthWithRunAndJobLevelAndJars(monthId);
    if (!month) return null;

    const nextWeek = month.currentWeek + 1;

    const unresolvedChoiceCountOnCurrentWeek =
      month.currentWeek >= 1
        ? await this.monthQuery.countPendingEventsForWeek(
            monthId,
            month.currentWeek,
          )
        : 0;

    const spendModeRatePromise = this.spendService.getSpendModeRate(
      month.spendModeCode ?? SpendModeCode.normal,
    );

    const [
      spendModeRate,
      lifeEventPendingForNextWeek,
      overtimeEventPendingForNextWeek,
      lifeEventTemplateIdToCreate,
      overtimeEventTemplateIdToCreate,
    ] = await Promise.all([
      spendModeRatePromise,
      this.monthQuery.findPendingLifeEventWithTemplate(monthId, nextWeek),
      this.monthQuery.findPendingOvertimeEventWithTemplate(monthId, nextWeek),
      !(await this.monthQuery.hasLifeLaneEventForWeek(monthId, nextWeek))
        ? this.eventService.resolveLifeSpawnTemplateId(monthId, month, nextWeek)
        : Promise.resolve(null),
      !(await this.monthQuery.hasOvertimeEventForWeek(monthId, nextWeek))
        ? this.eventService.resolveOvertimeSpawnTemplateId(
            monthId,
            month,
            nextWeek,
          )
        : Promise.resolve(null),
    ]);

    return {
      month,
      spendModeRate,
      unresolvedChoiceCountOnCurrentWeek,
      nextWeek,
      lifeEventPendingForNextWeek,
      overtimeEventPendingForNextWeek,
      lifeEventTemplateIdToCreate,
      overtimeEventTemplateIdToCreate,
    };
  }

  async resolveWeek(userId: string, monthId: number) {
    return wrapAsync(this.logger, 'resolveWeek', async () => {
      const monthIdBig = BigInt(monthId);
      const ctx = await this.loadResolveWeekContext(monthIdBig);
      if (!ctx) throw new ForbiddenException('Forbidden or Month not found');
      const {
        month,
        spendModeRate,
        unresolvedChoiceCountOnCurrentWeek,
        nextWeek,
        lifeEventPendingForNextWeek,
        overtimeEventPendingForNextWeek,
        lifeEventTemplateIdToCreate,
        overtimeEventTemplateIdToCreate,
      } = ctx;

      if (month.budgetRun.userId !== userId)
        throw new BadRequestException('Month not found');
      if (month.currentWeek >= 5)
        throw new BadRequestException('Month already complete');
      if (unresolvedChoiceCountOnCurrentWeek > 0)
        throw new BadRequestException('Previous week event unresolved');

      const config = this.configService.getConfig();
      const maxForcedRest =
        config.indexRules.stressMode?.maxForcedRestPerMonth ?? 1;
      const hiRecoveryFromForcedRest = 5;

      const idx = month.indexResolution;
      const currentHi = idx ? Number(idx.hiEnd ?? idx.hiStart ?? 50) : 50;
      const didForcedRest = !!(
        idx &&
        idx.forcedRestWeek == null &&
        currentHi < config.indexRules.hiFloor &&
        maxForcedRest >= 1
      );
      let incomeLossFromForcedRest = 0;
      if (didForcedRest) {
        const jobState = month.budgetRun.jobState;
        const levels = jobState?.job?.levels ?? [];
        const levelRow =
          levels.find((l) => l.level === jobState?.level) ?? levels[0];
        incomeLossFromForcedRest =
          levelRow?.absenceDeductionPerDay != null
            ? Number(levelRow.absenceDeductionPerDay)
            : 0;
      }

      const spendResult = this.spendService.computeWeeklySpend(
        month,
        month.jars,
        spendModeRate,
        nextWeek,
      );

      const forcedRestPayload = didForcedRest
        ? {
            incomeLoss: incomeLossFromForcedRest,
            hiRecovery: hiRecoveryFromForcedRest,
          }
        : null;

      const futureYouJar = month.jars.find(
        (j) => j.jarCode === JarCode.futureYou,
      );
      const futureRemainInMonth = futureYouJar
        ? jarAvailable(
            Number(futureYouJar.allocatedAmount),
            Number(futureYouJar.spentAmount),
            Number(futureYouJar.overflowInAmount),
            Number(futureYouJar.overflowOutAmount),
          )
        : 0;

      const buildPayload = (row: PendingEventWithTemplateRow) =>
        this.eventService.buildSpawnPayload(month, row);

      const [entries, pendingEvents, billsFromTx, forcedRestNotice] =
        await this.transactionRunner.run(async (tx: TxClient) => {
          await this.monthRepository.updateMonth(
            monthIdBig,
            { currentWeek: nextWeek },
            tx,
          );

          if (didForcedRest) {
            await this.monthRepository.updateIndexResolution(
              monthIdBig,
              {
                forcedRestWeek: nextWeek,
                incomeLossFromForcedRest,
                hiRecoveryFromForcedRest: hiRecoveryFromForcedRest,
              },
              tx,
            );
          }

          for (const op of spendResult.spendOps) {
            await this.spendService.addSpendLog(
              monthIdBig,
              op.jarCode,
              op.amount,
              0,
              0,
              tx,
            );
          }

          const payloads: SpawnEventTemplatePayload[] = [];

          if (!didForcedRest) {
            if (lifeEventPendingForNextWeek) {
              payloads.push(buildPayload(lifeEventPendingForNextWeek));
            } else if (lifeEventTemplateIdToCreate != null) {
              const created =
                await this.monthRepository.createEventWithTemplate(
                  monthIdBig,
                  lifeEventTemplateIdToCreate,
                  nextWeek,
                  tx,
                );
              const row =
                await this.monthQuery.findPendingEventWithTemplateById(
                  created.id,
                  tx,
                );
              if (row) payloads.push(buildPayload(row));
            }
            if (overtimeEventPendingForNextWeek) {
              payloads.push(buildPayload(overtimeEventPendingForNextWeek));
            } else if (overtimeEventTemplateIdToCreate != null) {
              const created =
                await this.monthRepository.createEventWithTemplate(
                  monthIdBig,
                  overtimeEventTemplateIdToCreate,
                  nextWeek,
                  tx,
                );
              const row =
                await this.monthQuery.findPendingEventWithTemplateById(
                  created.id,
                  tx,
                );
              if (row) payloads.push(buildPayload(row));
            }
          }

          const hasPendingEvents = payloads.length > 0;

          if (!hasPendingEvents) {
            await this.indexService.resolveWeeklyIndex(
              monthIdBig,
              nextWeek,
              spendResult.weeklySpend,
              forcedRestPayload,
              tx,
              {
                month,
                eventTotals: { healthDeltaTotal: 0, lqiDeltaTotal: 0 },
              },
            );
          }

          let billsFromTxInner: { actual: number } | null = null;
          if (nextWeek === END_OF_MONTH_WEEK && !hasPendingEvents) {
            const billResult = await this.billService.computeBills(
              Number(month.budgetRunId),
              month.monthIndex,
              month.billsEstimated,
            );
            const jarsAfterSpend = month.jars.map((j) => {
              const op = spendResult.spendOps.find(
                (o) => o.jarCode === j.jarCode,
              );
              const add = op ? op.amount : 0;
              return {
                ...j,
                spentAmount: Number(j.spentAmount) + add,
              };
            });
            await this.billService.reconcileBillsWithContext(
              userId,
              Number(monthId),
              billResult.actual,
              { month, jars: jarsAfterSpend },
              tx,
              nextWeek,
            );
            await this.monthRepository.updateMonth(
              monthIdBig,
              {
                currentWeek: 5,
                cumulativeFutureYou: { increment: futureRemainInMonth },
              },
              tx,
            );
            billsFromTxInner = billResult;
          }

          return [
            spendResult.entries,
            payloads,
            billsFromTxInner,
            forcedRestPayload,
          ] as const;
        });

      const refreshedMonth =
        await this.monthQuery.findMonthWithJars(monthIdBig);
      const monthComplete =
        nextWeek === END_OF_MONTH_WEEK && pendingEvents.length === 0;
      const bills = monthComplete ? (billsFromTx ?? null) : null;
      const futureTotal =
        refreshedMonth?.cumulativeFutureYou ?? month.cumulativeFutureYou;
      const freeCashBalance = refreshedMonth?.freeCash ?? month.freeCash;
      const spendingSummary: Record<string, number> = {};
      if (refreshedMonth) {
        for (const j of refreshedMonth.jars) {
          spendingSummary[j.jarCode] = Number(j.spentAmount);
        }
      }

      const hiAfter = clampHi(
        Number(
          refreshedMonth?.indexResolution?.hiEnd ??
            refreshedMonth?.indexResolution?.hiStart ??
            50,
        ),
        config,
      );
      const lqiAfter = clampLqi(
        Number(
          refreshedMonth?.indexResolution?.lqiEnd ??
            refreshedMonth?.indexResolution?.lqiStart ??
            50,
        ),
        config,
      );

      const systemNotice =
        forcedRestNotice != null
          ? {
              type: 'forced_rest' as const,
              title: 'Forced Rest',
              message:
                'HI quá thấp. Bạn phải nghỉ 1 ngày, một ca làm bị hủy (không lương).',
              week: nextWeek,
              effects: {
                incomeLoss: forcedRestNotice.incomeLoss,
                hiRecovery: forcedRestNotice.hiRecovery,
              },
            }
          : null;

      return {
        week: nextWeek,
        entries,
        hiAfter,
        lqiAfter,
        systemNotice,
        pendingEvents: pendingEvents.length > 0 ? pendingEvents : undefined,
        monthComplete,
        bills,
        futureYouTotal: futureTotal,
        freeCashBalance,
        spendingSummary,
      };
    });
  }
}
