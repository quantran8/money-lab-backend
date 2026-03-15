import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';
import { clampHi, clampLqi } from '@app/budget-simulation/budget-simulation.helpers';
import { BudgetMonthQuery } from '@budget-simulation/queries/month.query';
import { BudgetMonthRepository } from '@budget-simulation/repositories/month.repository';
import { BudgetRunRepository } from '@budget-simulation/repositories/run.repository';
import { BudgetSimulationConfigService } from '../config.service';
import { JarCode, LqiState } from '@budget-simulation/budget-simulation.enum';
import { END_OF_MONTH_WEEK } from '@budget-simulation/budget-simulation.constant';
import type { TxClient } from '@budget-simulation/budget-simulation.constant';
import { chooseCategory, chooseTemplate, shouldSpawn, jarAvailable } from '@budget-simulation/domain';
import { MonthSpendService } from './month-spend.service';
import { MonthIndexService } from './month-index.service';
import { MonthBillService } from './month-bill.service';
import type {
  MonthWithRunAndJobLevelAndJars,
  LifeEventTemplateRow,
  SpawnEventTemplatePayload,
} from '@budget-simulation/types';

const VALID_JAR_CODES = new Set([
  'free_cash',
  'fun',
  'learning',
  'give',
  'future_you',
]);

/**
 * Handles life events: spawn event, apply event choice (payment + index + bills).
 */
@Injectable()
export class MonthEventService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly monthQuery: BudgetMonthQuery,
    private readonly monthRepository: BudgetMonthRepository,
    private readonly runRepository: BudgetRunRepository,
    private readonly configService: BudgetSimulationConfigService,
    private readonly spendService: MonthSpendService,
    private readonly indexService: MonthIndexService,
    private readonly billService: MonthBillService,
  ) {}

  /**
   * Spawn event pool resolution (all reads). Returns template id to create in tx, or null.
   */
  async resolveSpawnTemplate(
    monthId: bigint,
    month: MonthWithRunAndJobLevelAndJars,
    week: number,
  ): Promise<bigint | null> {
    const config = this.configService.getConfig();
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
    const moduleId = month.budgetRun.moduleId;
    const fromMonth = Math.max(1, month.monthIndex - 5);
    const [weightsRows, usedIds] = await Promise.all([
      this.monthQuery.findEventPoolWeights(moduleId, lqiState),
      this.monthQuery.findUsedEventTemplateIds(
        month.budgetRunId,
        fromMonth,
        month.monthIndex,
      ),
    ]);

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
   * Spawn event for week: return existing or create new event, return template payload.
   */
  async spawnEvent(
    monthId: bigint,
    week: number,
    tx?: TxClient,
  ): Promise<SpawnEventTemplatePayload | null> {
    const [month, existing] = await Promise.all([
      this.monthQuery.findMonthWithRunAndModule(monthId, tx),
      this.monthQuery.findPendingEventWithTemplate(monthId, week, tx),
    ]);
    if (!month) return null;

    if (existing) {
      return {
        templateId: existing.template.id.toString(),
        title: existing.template.title,
        description: existing.template.description ?? '',
        options: existing.template.options.map((o) => ({
          optionId: o.id.toString(),
          optionLabel: o.optionLabel,
          description: o.description ?? '',
          defaultJarCode: o.moneyJarCode,
          moneyDelta: o.moneyDelta,
          healthDelta: o.healthDelta,
          lqiDelta: o.lqiDelta,
          learningXpDelta: o.learningXpDelta,
        })),
      };
    }

    const config = this.configService.getConfig();
    if (month.stressModeActive) {
      const maxEvents =
        config.indexRules.stressMode?.maxEventCountPerMonth ?? 1;
      const eventCount = await this.monthQuery.countEventsForMonth(monthId, tx);
      if (eventCount >= maxEvents) return null;
    }

    const seedBase = `${month.budgetRunId}:${month.monthIndex}:${week}`;
    if (!shouldSpawn(`${seedBase}:spawn`)) return null;

    const lqiState =
      month.indexResolution?.lqiStateEnd ??
      month.indexResolution?.lqiStateStart ??
      LqiState.stable;
    const moduleId = month.budgetRun.moduleId;
    const fromMonth = Math.max(1, month.monthIndex - 5);
    const [weightsRows, usedIds] = await Promise.all([
      this.monthQuery.findEventPoolWeights(moduleId, lqiState),
      this.monthQuery.findUsedEventTemplateIds(
        month.budgetRunId,
        fromMonth,
        month.monthIndex,
      ),
    ]);
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
    const selectedTemplateId = chooseTemplate(`${seedBase}:template`, templateRefs);

    const event = await this.monthRepository.createEventWithTemplate(
      monthId,
      selectedTemplateId,
      week,
      tx,
    );
    return {
      templateId: event.template.id.toString(),
      title: event.template.title,
      description: event.template.description ?? '',
      options: event.template.options.map((o) => ({
        optionId: o.id.toString(),
        optionLabel: o.optionLabel,
        description: o.description ?? '',
        defaultJarCode: o.moneyJarCode,
        moneyDelta: o.moneyDelta,
        healthDelta: o.healthDelta,
        lqiDelta: o.lqiDelta,
        learningXpDelta: o.learningXpDelta,
      })),
    };
  }

  /**
   * Apply event choice: validate, apply payment, persist index + bills if week 4.
   */
  async applyChoice(
    userId: string,
    monthId: number,
    week: number,
    optionId: number,
    paymentJarCode: string,
    coverJarCodes: string[] = [],
  ) {
    const monthIdBig = BigInt(monthId);
    const [month, event, option] = await Promise.all([
      this.monthQuery.findMonthWithRunAndJars(monthIdBig),
      this.monthQuery.findPendingEvent(monthIdBig, week),
      this.monthQuery.findLifeEventOptionById(BigInt(optionId)),
    ]);

    if (!month || month.budgetRun.userId !== userId) {
      throw new ForbiddenException('Forbidden or Month not found');
    }
    if (!event)
      throw new BadRequestException('No pending event for this week');
    if (!option || option.eventTemplateId !== event.eventTemplateId) {
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

    const moneyDelta = option.moneyDelta ?? 0;
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
    const eventTotals = {
      healthDeltaTotal: Number(option.healthDelta ?? 0),
      lqiDeltaTotal: Number(option.lqiDelta ?? 0),
    };

    let monthAfterPayment: typeof month | null = null;
    let jarsAfterPayment: typeof month.jars | null = null;
    if (week === END_OF_MONTH_WEEK) {
      const freeCashSpent = paymentRecord
        .filter((r) => r.jar === 'free_cash')
        .reduce((s, r) => s + r.amount, 0);
      const incomeToFreeCash =
        moneyDelta > 0 && (option.moneyJarCode ?? 'free_cash') === 'free_cash'
          ? moneyDelta
          : 0;
      const freeCashAfter =
        Number(month.freeCash ?? 0) - freeCashSpent + incomeToFreeCash;
      monthAfterPayment = { ...month, freeCash: freeCashAfter };
      jarsAfterPayment = month.jars.map((j) => {
        const paid = paymentRecord.find((r) => r.jar === j.jarCode);
        const incomeToJar =
          moneyDelta > 0 &&
          (option.moneyJarCode ?? 'free_cash') === j.jarCode
            ? moneyDelta
            : 0;
        return {
          ...j,
          spentAmount: Number(j.spentAmount) + (paid?.amount ?? 0),
          overflowInAmount: Number(j.overflowInAmount) + incomeToJar,
        };
      });
    }

    const txResult = await this.prisma.$transaction(async (tx: TxClient) => {
      if (cost > 0) {
        for (const { jar, amount } of paymentRecord) {
          if (jar === 'free_cash') {
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
        const jar = option.moneyJarCode ?? 'free_cash';
        if (jar === 'free_cash') {
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
        BigInt(optionId),
        paymentBreakdown,
        tx,
      );

      if (learningXpDelta !== 0 && month.budgetRun.jobStateId != null) {
        await this.runRepository.updateUserJobState(
          month.budgetRun.jobStateId,
          { xp: { increment: learningXpDelta } },
          tx,
        );
      }

      const indexResult = await this.indexService.resolveWeeklyIndex(
        monthIdBig,
        week,
        { fun: 0, learning: 0, give: 0 },
        null,
        tx,
        { month, eventTotals },
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
        indexResult,
        bills,
        monthComplete,
        futureYouTotal,
        spendingSummary,
      };
    });

    const hiAfter = txResult.indexResult
      ? clampHi(txResult.indexResult.hiEnd, config)
      : clampHi(50, config);
    const lqiAfter = txResult.indexResult
      ? clampLqi(txResult.indexResult.lqiEnd, config)
      : clampLqi(50, config);

    return {
      optionId: optionId,
      optionLabel: option.optionLabel,
      healthDelta: option.healthDelta,
      lqiDelta: option.lqiDelta,
      learningXpDelta: option.learningXpDelta,
      moneyDelta: option.moneyDelta,
      defaultJarCode: option.moneyJarCode ?? undefined,
      paymentRecord,
      hiAfter,
      lqiAfter,
      monthComplete: txResult.monthComplete,
      bills: txResult.bills,
      futureYouTotal: txResult.futureYouTotal,
      futureRemainInMonth,
      spendingSummary: txResult.spendingSummary,
    };
  }
}
