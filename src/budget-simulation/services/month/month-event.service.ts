import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { clampHi, clampLqi } from '@app/budget-simulation/budget-simulation.helpers';
import { BudgetMonthQuery } from '@budget-simulation/queries/month.query';
import { BudgetMonthRepository } from '@budget-simulation/repositories/month.repository';
import { BudgetRunRepository } from '@budget-simulation/repositories/run.repository';
import { BudgetSimulationConfigService } from '../config.service';
import { JarCode, LqiState } from '@budget-simulation/budget-simulation.enum';
import {
  BUDGET_SIMULATION_MODULE_ID,
  END_OF_MONTH_WEEK,
  EVENT_SOURCE_LIFE,
  EVENT_SOURCE_WORK,
  EVENT_SUBTYPE_OVERTIME,
  FREE_CASH_CODE,
} from '@budget-simulation/budget-simulation.constant';
import {
  chooseCategory,
  chooseTemplate,
  jarAvailable,
  resolveOvertimeEffectsFromJobLevel,
  shouldSpawn,
  shouldSpawnLane,
} from '@budget-simulation/domain';
import type { ChosenEventsTotalsResult } from '@budget-simulation/types';
import { MonthSpendService } from './month-spend.service';
import { MonthIndexService } from './month-index.service';
import { MonthBillService } from './month-bill.service';
import type {
  MonthWithRunAndJobLevelAndJars,
  MonthWithRunAndJars,
  LifeEventTemplateRow,
  SpawnEventTemplatePayload,
  PendingEventWithTemplateRow,
} from '@budget-simulation/types';
import { TransactionRunner, TxClient } from '@app/prisma/transaction.runner';

const VALID_JAR_CODES = new Set([
  FREE_CASH_CODE,
  'fun',
  'learning',
  'give',
  'future_you',
]);

/**
 * Handles life + work (OT) events: spawn, apply choice (payment + index + bills).
 */
@Injectable()
export class MonthEventService {
  constructor(
    private readonly transactionRunner: TransactionRunner,
    private readonly monthQuery: BudgetMonthQuery,
    private readonly monthRepository: BudgetMonthRepository,
    private readonly runRepository: BudgetRunRepository,
    private readonly configService: BudgetSimulationConfigService,
    private readonly spendService: MonthSpendService,
    private readonly indexService: MonthIndexService,
    private readonly billService: MonthBillService,
  ) {}

  /**
   * Maps a pending month event row to API payload. OT: money_delta 0; HI preview on accept; deferred payout hint.
   */
  buildSpawnPayload(
    month: MonthWithRunAndJobLevelAndJars,
    row: PendingEventWithTemplateRow,
  ): SpawnEventTemplatePayload {
    const job = month.budgetRun.jobState?.job;
    const level =
      job?.levels.find((l) => l.level === month.budgetRun.jobState?.level) ??
      null;
    const isOt =
      row.eventSource === EVENT_SOURCE_WORK &&
      row.eventSubtype === EVENT_SUBTYPE_OVERTIME;
    const otEffects =
      job && isOt
        ? resolveOvertimeEffectsFromJobLevel(job, level)
        : { incomePerUnit: 0, healthPenalty: 0 };
    const sorted = [...row.template.options].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    const acceptOptionId = sorted[0]?.id;

    return {
      eventId: row.id.toString(),
      eventSource: row.eventSource,
      eventSubtype: row.eventSubtype,
      templateId: row.template.id.toString(),
      title: row.template.title,
      description: row.template.description ?? '',
      options: row.template.options.map((o) => {
        if (isOt && acceptOptionId != null && o.id === acceptOptionId) {
          return {
            optionId: o.id.toString(),
            optionLabel: o.optionLabel,
            description: o.description ?? '',
            defaultJarCode: o.moneyJarCode,
            moneyDelta: 0,
            healthDelta: otEffects.healthPenalty,
            lqiDelta: Number(o.lqiDelta ?? 0),
            learningXpDelta: o.learningXpDelta ?? 0,
            deferredOvertimePayoutNextMonth: otEffects.incomePerUnit,
          };
        }
        if (isOt) {
          return {
            optionId: o.id.toString(),
            optionLabel: o.optionLabel,
            description: o.description ?? '',
            defaultJarCode: o.moneyJarCode,
            moneyDelta: Number(o.moneyDelta ?? 0),
            healthDelta: Number(o.healthDelta ?? 0),
            lqiDelta: Number(o.lqiDelta ?? 0),
            learningXpDelta: o.learningXpDelta ?? 0,
          };
        }
        return {
          optionId: o.id.toString(),
          optionLabel: o.optionLabel,
          description: o.description ?? '',
          defaultJarCode: o.moneyJarCode,
          moneyDelta: o.moneyDelta,
          healthDelta: o.healthDelta,
          lqiDelta: o.lqiDelta,
          learningXpDelta: o.learningXpDelta,
        };
      }),
    };
  }

  /**
   * Resolves life-lane template id (LQI-weighted for module 3). Returns null if no spawn.
   */
  async resolveLifeSpawnTemplateId(
    monthId: bigint,
    month: MonthWithRunAndJobLevelAndJars,
    week: number,
  ): Promise<bigint | null> {
    const config = this.configService.getConfig();
    const moduleId = month.budgetRun.moduleId;

    if (month.stressModeActive) {
      const maxEvents =
        config.indexRules.stressMode?.maxEventCountPerMonth ?? 1;
      const eventCount = await this.monthQuery.countEventsForMonth(monthId);
      if (eventCount >= maxEvents) return null;
    }

    const seedBase = `${month.budgetRunId}:${month.monthIndex}:${week}`;
    if (!shouldSpawn(`${seedBase}:spawn`)) return null;

    const lqiState =
      month.indexResolution?.lqiStateEnd ??
      month.indexResolution?.lqiStateStart ??
      LqiState.stable;
    const fromMonth = Math.max(1, month.monthIndex - 5);
    const usedIds =
      moduleId === BUDGET_SIMULATION_MODULE_ID
        ? await this.monthQuery.findUsedLifeEventTemplateIds(
            month.budgetRunId,
            fromMonth,
            month.monthIndex,
          )
        : await this.monthQuery.findUsedEventTemplateIds(
            month.budgetRunId,
            fromMonth,
            month.monthIndex,
          );

    const weightsRows = await this.monthQuery.findEventPoolWeights(
      moduleId,
      lqiState,
    );
    const weights = weightsRows.map((w) => ({
      eventCategory: w.eventCategory,
      weight: Number(w.weight),
    }));

    let templates: LifeEventTemplateRow[];
    if (weights.length > 0) {
      const chosenCategory = chooseCategory(`${seedBase}:category`, weights);
      templates =
        await this.monthQuery.findLifeEventTemplatesForModuleByCategory(
          moduleId,
          chosenCategory,
          usedIds,
        );
    } else {
      templates = await this.monthQuery.findLifeEventTemplatesForModule(
        moduleId,
        usedIds,
      );
    }
    if (templates.length === 0) return null;

    const templateRefs = templates.map((t) => ({ id: t.id, rarity: t.rarity }));
    return chooseTemplate(`${seedBase}:template`, templateRefs);
  }

  /**
   * Resolves OT template id for module 3 (job-level weight, cap, min HI). No LQI.
   */
  async resolveOvertimeSpawnTemplateId(
    monthId: bigint,
    month: MonthWithRunAndJobLevelAndJars,
    week: number,
  ): Promise<bigint | null> {
    if (month.budgetRun.moduleId !== BUDGET_SIMULATION_MODULE_ID) {
      return null;
    }
    const config = this.configService.getConfig();
    if (month.stressModeActive) {
      const maxEvents =
        config.indexRules.stressMode?.maxEventCountPerMonth ?? 1;
      const eventCount = await this.monthQuery.countEventsForMonth(monthId);
      if (eventCount >= maxEvents) return null;
    }

    const tpl = await this.monthQuery.findOvertimeEventTemplate(
      BUDGET_SIMULATION_MODULE_ID,
    );
    if (!tpl) return null;

    if (await this.monthQuery.hasOvertimeEventForWeek(monthId, week)) {
      return null;
    }

    const jobState = month.budgetRun.jobState;
    const level =
      jobState?.job?.levels.find((l) => l.level === jobState.level) ?? null;
    const cap = level?.overtimeMonthlyCap;
    if (cap != null && cap <= 0) {
      return null;
    }
    if (cap != null) {
      const accepted = Number(month.acceptedOvertimeCount ?? 0);
      if (accepted >= cap) return null;
    }

    const minHi = level?.minHiForOvertime;
    if (minHi != null) {
      const idx = month.indexResolution;
      const hi = Number(idx?.hiEnd ?? idx?.hiStart ?? 50);
      if (hi < minHi) return null;
    }

    const p = Number(level?.overtimeSpawnWeight ?? 0);
    const seedBase = `${month.budgetRunId}:${month.monthIndex}:${week}:ot`;
    if (!shouldSpawnLane(seedBase, p)) return null;

    return tpl.id;
  }

  /**
   * Weekly HI/LQI from chosen options plus dynamic OT HI penalty (options.health_delta stays 0 for OT).
   */
  private async weekChosenEventTotalsForIndex(
    monthIdBig: bigint,
    week: number,
    month: MonthWithRunAndJars,
    tx: TxClient,
  ): Promise<ChosenEventsTotalsResult> {
    const rows = await this.monthQuery.findChosenEventsForWeekWithTemplates(
      monthIdBig,
      week,
      tx,
    );
    const job = month.budgetRun.jobState?.job;
    const level =
      job?.levels.find((l) => l.level === month.budgetRun.jobState?.level) ??
      null;
    let healthDeltaTotal = 0;
    let lqiDeltaTotal = 0;
    for (const e of rows) {
      const isOt =
        e.eventSource === EVENT_SOURCE_WORK &&
        e.eventSubtype === EVENT_SUBTYPE_OVERTIME;
      if (isOt && job) {
        const opts = [...e.template.options].sort(
          (a, b) => a.sortOrder - b.sortOrder,
        );
        const acceptId = opts[0]?.id;
        if (acceptId != null && e.chosenOptionId === acceptId) {
          healthDeltaTotal += resolveOvertimeEffectsFromJobLevel(
            job,
            level,
          ).healthPenalty;
        }
        if (e.option) {
          lqiDeltaTotal += Number(e.option.lqiDelta ?? 0);
        }
      } else if (e.option) {
        healthDeltaTotal += Number(e.option.healthDelta ?? 0);
        lqiDeltaTotal += Number(e.option.lqiDelta ?? 0);
      }
    }
    return { healthDeltaTotal, lqiDeltaTotal };
  }

  /**
   * Spawn event for week (legacy single fetch). Module 3 may return life or OT only if one exists.
   */
  async spawnEvent(
    monthId: bigint,
    week: number,
    tx?: TxClient,
  ): Promise<SpawnEventTemplatePayload | null> {
    const [month, existingLife, existingOt] = await Promise.all([
      this.monthQuery.findMonthWithRunAndModule(monthId, tx),
      this.monthQuery.findPendingLifeEventWithTemplate(monthId, week, tx),
      this.monthQuery.findPendingOvertimeEventWithTemplate(monthId, week, tx),
    ]);
    if (!month) return null;

    const fullMonth =
      await this.monthQuery.findMonthWithRunAndJobLevelAndJars(monthId);
    if (!fullMonth) return null;

    const pending =
      existingLife ??
      existingOt ??
      (await this.monthQuery.findPendingEventWithTemplate(monthId, week, tx));
    if (pending) {
      return this.buildSpawnPayload(fullMonth, pending);
    }

    const config = this.configService.getConfig();
    if (month.stressModeActive) {
      const maxEvents =
        config.indexRules.stressMode?.maxEventCountPerMonth ?? 1;
      const eventCount = await this.monthQuery.countEventsForMonth(monthId, tx);
      if (eventCount >= maxEvents) return null;
    }

    const lifeId = await this.resolveLifeSpawnTemplateId(
      monthId,
      fullMonth,
      week,
    );
    if (!lifeId) return null;

    const event = await this.monthRepository.createEventWithTemplate(
      monthId,
      lifeId,
      week,
      tx,
    );
    const templateRow = await this.monthQuery.findPendingEventWithTemplateById(
      event.id,
      tx,
    );
    if (!templateRow) return null;
    return this.buildSpawnPayload(fullMonth, templateRow);
  }

  /**
   * Apply event choice: optional eventId when multiple pending in same week (module 3).
   * Defers weekly index and end-of-month bills until all week events are resolved.
   */
  async applyChoice(
    userId: string,
    monthId: number,
    week: number,
    optionId: number,
    paymentJarCode: string,
    coverJarCodes: string[] = [],
    eventId?: number,
  ) {
    const monthIdBig = BigInt(monthId);
    const optionIdBig = BigInt(optionId);

    const [month, option] = await Promise.all([
      this.monthQuery.findMonthWithRunAndJars(monthIdBig),
      this.monthQuery.findLifeEventOptionById(optionIdBig),
    ]);

    if (!month || month.budgetRun.userId !== userId) {
      throw new BadRequestException('Month not found');
    }
    if (!option) {
      throw new BadRequestException('Invalid option');
    }

    let event: PendingEventWithTemplateRow | null = null;
    if (eventId != null) {
      event = await this.monthQuery.findPendingEventWithTemplateById(
        BigInt(eventId),
      );
      if (!event || event.budgetMonthId !== monthIdBig || event.week !== week) {
        throw new BadRequestException('Invalid or resolved event');
      }
    } else {
      const life = await this.monthQuery.findPendingLifeEventWithTemplate(
        monthIdBig,
        week,
      );
      const ot = await this.monthQuery.findPendingOvertimeEventWithTemplate(
        monthIdBig,
        week,
      );
      event = life ?? ot;
      if (!event && month.budgetRun.moduleId !== BUDGET_SIMULATION_MODULE_ID) {
        event = await this.monthQuery.findPendingEventWithTemplate(
          monthIdBig,
          week,
        );
      }
    }

    if (!event) {
      throw new BadRequestException('No pending event for this week');
    }
    if (option.eventTemplateId !== event.eventTemplateId) {
      throw new BadRequestException('Invalid option');
    }

    if (!VALID_JAR_CODES.has(paymentJarCode)) {
      throw new BadRequestException(`Invalid payment jar: ${paymentJarCode}`);
    }
    for (const code of coverJarCodes) {
      if (!VALID_JAR_CODES.has(code)) {
        throw new BadRequestException(`Invalid cover jar: ${code}`);
      }
    }
    if (coverJarCodes.includes(paymentJarCode)) {
      throw new BadRequestException(
        'Cover jars must not duplicate the payment jar',
      );
    }

    const job = month.budgetRun.jobState?.job;
    const level =
      job?.levels.find((l) => l.level === month.budgetRun.jobState?.level) ??
      null;
    const sortedOpts = [...event.template.options].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    const isOt =
      event.eventSource === EVENT_SOURCE_WORK &&
      event.eventSubtype === EVENT_SUBTYPE_OVERTIME;
    const isOtAccept = isOt && sortedOpts[0]?.id === optionIdBig;
    let moneyDelta = Number(option.moneyDelta ?? 0);
    let healthDelta = Number(option.healthDelta ?? 0);
    let overtimeIncomeAccruedToNextMonth = 0;
    if (isOt && job) {
      const eff = resolveOvertimeEffectsFromJobLevel(job, level);
      if (isOtAccept) {
        moneyDelta = 0;
        healthDelta = eff.healthPenalty;
        overtimeIncomeAccruedToNextMonth = eff.incomePerUnit;
      }
    }

    const cost = moneyDelta < 0 ? Math.abs(moneyDelta) : 0;
    const paymentRecord: { jar: string; amount: number }[] = [];
    const learningXpDelta = option.learningXpDelta ?? 0;
    const jars = month.jars;

    if (cost > 0) {
      const primaryAvailable = this.spendService.jarAvailableFromLoaded(
        month,
        jars,
        paymentJarCode,
      );
      if (primaryAvailable >= cost) {
        paymentRecord.push({ jar: paymentJarCode, amount: cost });
      } else {
        const firstDeduct = primaryAvailable;
        let remaining = cost - firstDeduct;
        paymentRecord.push({ jar: paymentJarCode, amount: firstDeduct });
        for (const coverJar of coverJarCodes) {
          if (remaining <= 0) break;
          const coverAvailable = this.spendService.jarAvailableFromLoaded(
            month,
            jars,
            coverJar,
          );
          const deduct = Math.min(coverAvailable, remaining);
          if (deduct > 0) {
            paymentRecord.push({ jar: coverJar, amount: deduct });
            remaining -= deduct;
          }
        }
        if (remaining > 0) {
          throw new BadRequestException(
            'Not enough funds to cover this option.',
          );
        }
      }
    }

    const futureYouJar = jars.find((j) => j.jarCode === JarCode.futureYou);
    const futureRemainInMonth = futureYouJar
      ? jarAvailable(
          Number(futureYouJar.allocatedAmount),
          Number(futureYouJar.spentAmount),
          Number(futureYouJar.overflowInAmount),
          Number(futureYouJar.overflowOutAmount),
        )
      : 0;

    const config = this.configService.getConfig();

    let monthAfterPayment: typeof month | null = null;
    let jarsAfterPayment: typeof month.jars | null = null;
    if (week === END_OF_MONTH_WEEK) {
      const freeCashSpent = paymentRecord
        .filter((r) => r.jar === FREE_CASH_CODE)
        .reduce((s, r) => s + r.amount, 0);
      const incomeToFreeCash =
        moneyDelta > 0 &&
        (option.moneyJarCode ?? FREE_CASH_CODE) === FREE_CASH_CODE
          ? moneyDelta
          : 0;
      const freeCashAfter =
        Number(month.freeCash ?? 0) - freeCashSpent + incomeToFreeCash;
      monthAfterPayment = { ...month, freeCash: freeCashAfter };
      jarsAfterPayment = month.jars.map((j) => {
        const paid = paymentRecord.find((r) => r.jar === j.jarCode);
        const incomeToJar =
          moneyDelta > 0 &&
          (option.moneyJarCode ?? FREE_CASH_CODE) === j.jarCode
            ? moneyDelta
            : 0;
        return {
          ...j,
          spentAmount: Number(j.spentAmount) + (paid?.amount ?? 0),
          overflowInAmount: Number(j.overflowInAmount) + incomeToJar,
        };
      });
    }

    const txResult = await this.transactionRunner.run(async (tx: TxClient) => {
      if (cost > 0) {
        for (const { jar, amount } of paymentRecord) {
          if (jar === FREE_CASH_CODE) {
            await this.monthRepository.updateMonth(
              monthIdBig,
              { freeCash: { decrement: amount } },
              tx,
            );
          } else {
            await this.spendService.addSpendLog(
              monthIdBig,
              jar,
              amount,
              0,
              0,
              tx,
            );
          }
        }
      } else if (moneyDelta > 0) {
        const jar = option.moneyJarCode ?? FREE_CASH_CODE;
        if (jar === FREE_CASH_CODE) {
          await this.monthRepository.updateMonth(
            monthIdBig,
            { freeCash: { increment: moneyDelta } },
            tx,
          );
        } else {
          await this.spendService.addSpendLog(
            monthIdBig,
            jar,
            0,
            moneyDelta,
            0,
            tx,
          );
        }
      }

      const paymentBreakdown =
        paymentRecord.length > 0
          ? paymentRecord.map(({ jar, amount }) => ({ jarCode: jar, amount }))
          : {};
      await this.monthRepository.updateEventChosen(
        event.id,
        optionIdBig,
        paymentBreakdown,
        tx,
      );

      if (isOtAccept) {
        await this.monthRepository.incrementOvertimeAcceptOnMonth(
          monthIdBig,
          overtimeIncomeAccruedToNextMonth,
          tx,
        );
      }

      if (learningXpDelta !== 0 && month.budgetRun.jobStateId != null) {
        await this.runRepository.incrementUserJobStateXpBounded(
          month.budgetRun.jobStateId,
          learningXpDelta,
          tx,
        );
      }

      const stillPending = await this.monthQuery.countPendingEventsForWeek(
        monthIdBig,
        week,
        tx,
      );

      if (stillPending > 0) {
        return {
          deferredWeekCompletion: true,
          indexResult: undefined as
            | Awaited<ReturnType<MonthIndexService['resolveWeeklyIndex']>>
            | undefined,
          bills: null as { actual: number } | null,
          monthComplete: false,
          futureYouTotal: 0,
          spendingSummary: {} as Record<string, number>,
        };
      }

      const aggregatedTotals = await this.weekChosenEventTotalsForIndex(
        monthIdBig,
        week,
        month,
        tx,
      );

      const indexResult = await this.indexService.resolveWeeklyIndex(
        monthIdBig,
        week,
        { fun: 0, learning: 0, give: 0 },
        null,
        tx,
        { month, eventTotals: aggregatedTotals },
      );

      let bills: { actual: number } | null = null;
      let monthComplete = false;
      let futureYouTotal = 0;
      const spendingSummary: Record<string, number> = {};

      if (week === END_OF_MONTH_WEEK && monthAfterPayment && jarsAfterPayment) {
        const billResult = await this.billService.computeBills(
          Number(month.budgetRunId),
          month.monthIndex,
          month.billsEstimated,
        );
        await this.billService.reconcileBillsWithContext(
          userId,
          monthId,
          billResult.actual,
          { month: monthAfterPayment, jars: jarsAfterPayment },
          tx,
        );
        await this.monthRepository.updateMonth(
          monthIdBig,
          {
            currentWeek: 5,
            cumulativeFutureYou: { increment: futureRemainInMonth },
          },
          tx,
        );
        monthComplete = true;
        bills = billResult;
        futureYouTotal =
          Number(month.cumulativeFutureYou ?? 0) + futureRemainInMonth;
        for (const j of jarsAfterPayment) {
          spendingSummary[j.jarCode] = Number(j.spentAmount);
        }
      }

      return {
        deferredWeekCompletion: false,
        indexResult,
        bills,
        monthComplete,
        futureYouTotal,
        spendingSummary,
      };
    });

    const hiAfter = txResult.indexResult
      ? clampHi(txResult.indexResult.hiEnd, config)
      : clampHi(
          Number(
            month.indexResolution?.hiEnd ??
              month.indexResolution?.hiStart ??
              50,
          ),
          config,
        );
    const lqiAfter = txResult.indexResult
      ? clampLqi(txResult.indexResult.lqiEnd, config)
      : clampLqi(
          Number(
            month.indexResolution?.lqiEnd ??
              month.indexResolution?.lqiStart ??
              50,
          ),
          config,
        );

    return {
      eventId: Number(event.id),
      optionId: optionId,
      optionLabel: option.optionLabel,
      healthDelta,
      lqiDelta: option.lqiDelta,
      learningXpDelta: option.learningXpDelta,
      moneyDelta,
      defaultJarCode: option.moneyJarCode ?? undefined,
      paymentRecord,
      hiAfter,
      lqiAfter,
      monthComplete: txResult.monthComplete,
      bills: txResult.bills,
      futureYouTotal: txResult.futureYouTotal,
      futureRemainInMonth,
      spendingSummary: txResult.spendingSummary,
      weekIndexDeferred: txResult.deferredWeekCompletion,
      overtimeIncomeAccruedToNextMonth: isOtAccept
        ? overtimeIncomeAccruedToNextMonth
        : undefined,
    };
  }
}
