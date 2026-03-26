import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { wrapAsync } from '#common/utils/async.utils.js';
import { clampHi, clampLqi } from '#app/budget-simulation/budget-simulation.helpers.js';
import { BudgetMonthQuery } from '#budget-simulation/queries/month.query.js';
import { BudgetMonthRepository } from '#budget-simulation/repositories/month.repository.js';
import { BudgetRunRepository } from '#budget-simulation/repositories/run.repository.js';
import { JarCode, SpendModeCode } from '#budget-simulation/budget-simulation.enum.js';
import {
  END_OF_MONTH_WEEK,
  MAX_EVENTS_PER_WEEK,
  RUN_MONTH_INDEX_COMPLETE,
  WEEK_INDEX_COMPLETE_MONTH,
  FORCED_REST_HI_RECOVERY,
  DEFAULT_HI_FALLBACK,
} from '#budget-simulation/budget-simulation.constant.js';
import { jarAvailable, computeJobProgress } from '#budget-simulation/domain/index.js';
import type { JobProgressResult } from '#budget-simulation/domain/index.js';
import { MonthSpendService } from './month-spend.service';
import { MonthEventService } from './month-event.service';
import { MonthIndexService } from './month-index.service';
import { MonthBillService } from './month-bill.service';
import { NextMonthPreviewService } from './next-month-preview.service';
import { BudgetSimulationConfigService } from '../config.service';
import { RunAnalyzeService } from '../run/run-analyze.service';
import type {
  MonthWithRunAndJobLevelAndJars,
  NextMonthPreview,
  PendingEventWithTemplateRow,
  SpawnEventTemplatePayload,
} from '#budget-simulation/types/index.js';
import type { RunAnalysisResult } from '#budget-simulation/domain/index.js';
import { TransactionRunner, TxClient } from '#app/prisma/transaction.runner.js';

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
    private readonly previewService: NextMonthPreviewService,
    private readonly runRepository: BudgetRunRepository,
    private readonly analyzeService: RunAnalyzeService,
  ) {}

  async loadResolveWeekContext(
    monthId: bigint,
  ): Promise<ResolveWeekContext | null> {
    const month =
      await this.monthQuery.findMonthWithRunAndJobLevelAndJars(monthId);
    if (!month) return null;

    const nextWeek = month.currentWeek + 1;

    const [
      unresolvedChoiceCountOnCurrentWeek,
      spendModeRate,
      lifeEventPendingForNextWeek,
      overtimeEventPendingForNextWeek,
      totalEventCount,
    ] = await Promise.all([
      month.currentWeek >= 1
        ? this.monthQuery.countPendingEventsForWeek(monthId, month.currentWeek)
        : Promise.resolve(0),
      this.spendService.getSpendModeRate(
        month.spendModeCode ?? SpendModeCode.normal,
      ),
      this.monthQuery.findPendingLifeEventWithTemplate(monthId, nextWeek),
      this.monthQuery.findPendingOvertimeEventWithTemplate(monthId, nextWeek),
      this.monthQuery.countEventsForWeek(monthId, nextWeek),
    ]);

    let lifeEventTemplateIdToCreate: bigint | null = null;
    let overtimeEventTemplateIdToCreate: bigint | null = null;

    if (totalEventCount < MAX_EVENTS_PER_WEEK) {
      // Life lane has priority; only try overtime if cap not yet reached
      lifeEventTemplateIdToCreate = !lifeEventPendingForNextWeek
        ? await this.eventService.resolveLifeSpawnTemplateId(
            monthId,
            month,
            nextWeek,
          )
        : null;

      const usedSlots =
        totalEventCount + (lifeEventTemplateIdToCreate != null ? 1 : 0);

      if (usedSlots < MAX_EVENTS_PER_WEEK) {
        overtimeEventTemplateIdToCreate = !overtimeEventPendingForNextWeek
          ? await this.eventService.resolveOvertimeSpawnTemplateId(
              monthId,
              month,
              nextWeek,
            )
          : null;
      }
    }

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
      if (!ctx) throw new BadRequestException('Month not found');
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
      if (
        month.monthIndex >= RUN_MONTH_INDEX_COMPLETE &&
        month.currentWeek > WEEK_INDEX_COMPLETE_MONTH
      )
        throw new BadRequestException('Run already complete');
      if (month.currentWeek >= WEEK_INDEX_COMPLETE_MONTH)
        throw new BadRequestException('Month already complete');
      if (unresolvedChoiceCountOnCurrentWeek > 0)
        throw new BadRequestException('Previous week event unresolved');

      const config = this.configService.getConfig();
      const maxForcedRest =
        config.indexRules.stressMode?.maxForcedRestPerMonth ?? 1;
      const hiRecoveryFromForcedRest = FORCED_REST_HI_RECOVERY;

      const idx = month.indexResolution;
      const currentHi = idx ? Number(idx.hiEnd ?? idx.hiStart ?? DEFAULT_HI_FALLBACK) : DEFAULT_HI_FALLBACK;
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

      const currentJobLevel = month.budgetRun.jobState?.level ?? 1;

      const spendResult = this.spendService.computeWeeklySpend(
        month,
        month.jars,
        spendModeRate,
        nextWeek,
        currentHi,
        currentJobLevel,
        config,
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

      const [
        entries,
        pendingEvents,
        billsFromTx,
        forcedRestNotice,
        updatedMonthFromTx,
      ] = await this.transactionRunner.run(async (tx: TxClient) => {
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

        const spendWriteOps: Promise<unknown>[] = spendResult.spendOps.map((op) =>
          this.spendService.addSpendLog(
            monthIdBig,
            op.jarCode,
            op.amount,
            0,
            0,
            tx,
          ),
        );

        if (
          spendResult.learningXpDelta > 0 &&
          month.budgetRun.jobStateId != null
        ) {
          spendWriteOps.push(
            this.runRepository.incrementUserJobStateXpBounded(
              month.budgetRun.jobStateId,
              spendResult.learningXpDelta,
              tx,
            ),
          );
        }

        await Promise.all(spendWriteOps);

        const payloads: SpawnEventTemplatePayload[] = [];

        if (!didForcedRest) {
          if (lifeEventPendingForNextWeek) {
            payloads.push(buildPayload(lifeEventPendingForNextWeek));
          } else if (lifeEventTemplateIdToCreate != null) {
            const created = await this.monthRepository.createEventWithTemplate(
              monthIdBig,
              lifeEventTemplateIdToCreate,
              nextWeek,
              tx,
            );
            payloads.push(buildPayload(created));
          }
          if (overtimeEventPendingForNextWeek) {
            payloads.push(buildPayload(overtimeEventPendingForNextWeek));
          } else if (overtimeEventTemplateIdToCreate != null) {
            const created = await this.monthRepository.createEventWithTemplate(
              monthIdBig,
              overtimeEventTemplateIdToCreate,
              nextWeek,
              tx,
            );
            payloads.push(buildPayload(created));
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

        let billsFromTxInner: { actual: number; reason: string | null } | null =
          null;
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
            billResult.reason,
          );
          await this.monthRepository.updateMonth(
            monthIdBig,
            {
              currentWeek: WEEK_INDEX_COMPLETE_MONTH,
              cumulativeFutureYou: { increment: futureRemainInMonth },
            },
            tx,
          );
          billsFromTxInner = billResult;
        }

        // Read updated month state inside the transaction to avoid an extra query
        const updatedMonth = await this.monthQuery.findMonthWithJars(
          monthIdBig,
          tx,
        );

        return [
          spendResult.entries,
          payloads,
          billsFromTxInner,
          forcedRestPayload,
          updatedMonth,
        ] as const;
      });

      const monthComplete =
        nextWeek === END_OF_MONTH_WEEK && pendingEvents.length === 0;
      const bills = monthComplete ? (billsFromTx ?? null) : null;
      const refreshedMonth = updatedMonthFromTx;
      const futureTotal =
        refreshedMonth?.cumulativeFutureYou ?? month.cumulativeFutureYou;
      const freeCashBalance = refreshedMonth?.freeCash ?? month.freeCash;
      const spendingSummary: Record<string, number> = {};
      if (refreshedMonth) {
        for (const j of refreshedMonth.jars) {
          spendingSummary[j.jarCode] = Number(j.spentAmount);
        }
      }

      let nextMonthPreview: NextMonthPreview | undefined;
      let runComplete = false;
      let runAnalysis: RunAnalysisResult | undefined;
      let jobProgress: JobProgressResult | undefined;

      if (monthComplete) {
        const jobState = month.budgetRun.jobState;
        if (jobState) {
          const levels = (jobState.job?.levels ?? []).map((l) => ({
            level: l.level,
            xpRequiredTotal: l.xpRequiredTotal,
          }));
          jobProgress = computeJobProgress({
            currentXp: jobState.xp,
            xpDelta: spendResult.learningXpDelta,
            xpByCap: spendResult.learningXpByCap,
            xpByOverflowCap: spendResult.learningXpByOverflowCap,
            currentLevel: jobState.level,
            levels,
          });
        }

        if (month.monthIndex >= RUN_MONTH_INDEX_COMPLETE) {
          await this.runRepository.completeRun(month.budgetRunId, {
            totalMonths: month.monthIndex,
            finalFutureYouSavings: futureTotal,
            passed: futureTotal > 0,
          });
          runComplete = true;
          runAnalysis = await this.analyzeService.analyzeRun(
            Number(month.budgetRunId),
          );
        } else {
          nextMonthPreview = await this.previewService.computePreview(month);
        }
      }

      const hiAfter = clampHi(
        Number(
          refreshedMonth?.indexResolution?.hiEnd ??
            refreshedMonth?.indexResolution?.hiStart ??
            DEFAULT_HI_FALLBACK,
        ),
        config,
      );
      const lqiAfter = clampLqi(
        Number(
          refreshedMonth?.indexResolution?.lqiEnd ??
            refreshedMonth?.indexResolution?.lqiStart ??
            DEFAULT_HI_FALLBACK,
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
        runComplete,
        runAnalysis,
        bills,
        futureYouTotal: futureTotal,
        freeCashBalance,
        spendingSummary,
        nextMonthPreview,
      };
    });
  }
}
