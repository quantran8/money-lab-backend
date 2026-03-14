import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { wrapAsync } from '@common/utils/async.utils';
import {
  BudgetMonthQuery,
  WeeklyIndexProgressItem,
  WeeklySpendSummary,
} from '../queries/month.query';
import { BudgetMonthRepository } from '@budget-simulation/repositories/month.repository';
import { BudgetRunRepository } from '@budget-simulation/repositories/run.repository';
import { CommitmentQuery } from '@budget-simulation/queries/commitment.query';
import { PrismaService } from '@prisma/prisma.service';
import {
  clampHi,
  clampLqi,
  computeBillsFinal,
  deterministicRandom,
  genAutoSpendLabel,
  resolveLqiState,
} from '@app/budget-simulation/budget-simulation.helpers';
import { JarCode, LqiState, SpendModeCode } from '../budget-simulation.enum';
import { BudgetSimulationConfigService } from './config.service';
import {
  END_OF_MONTH_WEEK,
  NUMBER_OF_WEEKS_PER_MONTH,
  TxClient,
} from '../budget-simulation.constant';

/**
 * Month/week resolution: resolve week, apply event choice, spend jars, finalize bills.
 * Uses Query for reads, Repository for writes; transactions at service layer.
 */
@Injectable()
export class BudgetSimulationMonthService {
  private readonly logger = new Logger(BudgetSimulationMonthService.name);

  private static readonly VALID_JAR_CODES = new Set([
    'free_cash',
    'fun',
    'learning',
    'give',
    'future_you',
  ]);

  constructor(
    private readonly prisma: PrismaService,
    private readonly monthQuery: BudgetMonthQuery,
    private readonly monthRepository: BudgetMonthRepository,
    private readonly runRepository: BudgetRunRepository,
    private readonly commitmentQuery: CommitmentQuery,
    private readonly configService: BudgetSimulationConfigService,
  ) {}

  private async getSpendModeRate(code: string): Promise<number> {
    const option = await this.commitmentQuery.findSpendModeOptionByCode(code);
    if (!option)
      throw new BadRequestException(`Invalid spend_mode_code: ${code}`);
    return Number(option.rate);
  }

  private async getJarAvailable(
    monthId: bigint,
    jarCode: string,
    tx?: TxClient,
  ): Promise<number> {
    if (jarCode === 'free_cash') {
      const month = await this.monthQuery.findMonthById(monthId, tx);
      return Math.max(0, Number(month?.freeCash ?? 0));
    }
    const jar = await this.monthQuery.findJarByMonthAndJar(
      monthId,
      jarCode,
      tx,
    );
    if (!jar) return 0;
    return Math.max(
      0,
      Number(jar.allocatedAmount) -
        Number(jar.spentAmount) +
        Number(jar.overflowInAmount) -
        Number(jar.overflowOutAmount),
    );
  }

  private async deductFromJar(
    monthId: bigint,
    jarCode: string,
    amount: number,
    tx?: TxClient,
  ) {
    const available = await this.getJarAvailable(monthId, jarCode, tx);
    const spent = Math.min(Math.max(0, available), amount);
    const jarBalance = available - spent;
    return { spent, jarBalance };
  }

  private async addSpendLog(
    monthId: bigint,
    jarCode: string,
    spent: number,
    overflowIn: number,
    overflowOut: number,
    tx?: TxClient,
  ) {
    await this.monthRepository.incrementJarSpend(
      monthId,
      jarCode,
      spent,
      overflowIn,
      overflowOut,
      tx,
    );
  }

  private async spendJarsForWeek(monthId: bigint, tx?: TxClient) {
    const month = await this.monthQuery.findMonthById(monthId, tx);
    if (!month) throw new NotFoundException('Month not found');
    const spendModeCode = month.spendModeCode ?? SpendModeCode.normal;
    const rate = await this.getSpendModeRate(spendModeCode);
    const coreJars = [JarCode.fun, JarCode.learning, JarCode.give];
    const jars = await this.monthQuery.findJarsForMonth(monthId, coreJars, tx);
    const entries: {
      type: string;
      jar: string;
      amount: number;
      jarBalance: number;
      label: string;
    }[] = [];

    const weeklySpend: WeeklySpendSummary = {
      fun: 0,
      learning: 0,
      give: 0,
    };

    for (const jarEntry of jars) {
      const jar = jarEntry.jarCode;
      const maxMonthAvailable = Math.round(
        Number(jarEntry.allocatedAmount) * rate,
      );
      const weeklyAmount = Math.floor(maxMonthAvailable / 4.0);
      if (weeklyAmount <= 0) continue;

      const { spent, jarBalance } = await this.deductFromJar(
        monthId,
        jar,
        weeklyAmount,
        tx,
      );
      if (spent > 0) {
        await this.addSpendLog(monthId, jar, spent, 0, 0, tx);
        const weekGlobal = (month.monthIndex - 1) * 4 + month.currentWeek;
        const label = genAutoSpendLabel(
          `${month.budgetRunId}:${monthId}:${jar}`,
          jar,
          spent,
          spendModeCode,
          weekGlobal,
        );
        entries.push({
          type: 'auto_spend',
          jar,
          amount: spent,
          jarBalance,
          label,
        });

        if (jar === JarCode.fun) weeklySpend.fun += spent;
        if (jar === JarCode.learning) weeklySpend.learning += spent;
        if (jar === JarCode.give) weeklySpend.give += spent;
      }
    }

    return { entries, weeklySpend };
  }

  private async spawnEventForWeek(
    monthId: bigint,
    week: number,
    tx?: TxClient,
  ) {
    const month = await this.monthQuery.findMonthWithRunAndModule(monthId, tx);
    if (!month) return null;

    const existing = await this.monthQuery.findPendingEventWithTemplate(
      monthId,
      week,
      tx,
    );
    if (existing) {
      return {
        templateId: existing.template.id.toString(),
        title: existing.template.title,
        description: existing.template.description,
        options: existing.template.options.map((o) => ({
          optionId: o.id.toString(),
          optionLabel: o.optionLabel,
          description: o.description,
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

    const seed = `${month.budgetRunId}:${month.monthIndex}:${week}:spawn`;
    if (deterministicRandom(seed) >= 0.5) return null;

    const lqiState =
      month.indexResolution?.lqiStateEnd ??
      month.indexResolution?.lqiStateStart ??
      LqiState.stable;
    const moduleId = month.budgetRun.moduleId;
    const weights = await this.monthQuery.findEventPoolWeights(
      moduleId,
      lqiState,
    );

    const fromMonth = Math.max(1, month.monthIndex - 5);
    const usedIds = await this.monthQuery.findUsedEventTemplateIds(
      month.budgetRunId,
      fromMonth,
      month.monthIndex,
    );

    let templates: Awaited<
      ReturnType<typeof this.monthQuery.findLifeEventTemplatesForModule>
    >;
    if (weights.length > 0) {
      const totalWeight = weights.reduce((sum, w) => sum + Number(w.weight), 0);
      const roll =
        deterministicRandom(
          `${month.budgetRunId}:${month.monthIndex}:${week}:category`,
        ) * totalWeight;
      let running = 0;
      let chosenCategory = weights[0].eventCategory;
      for (const w of weights) {
        running += Number(w.weight);
        if (roll <= running) {
          chosenCategory = w.eventCategory;
          break;
        }
      }
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

    const totalWeight = templates.reduce((sum, t) => sum + (11 - t.rarity), 0);
    const rollTemplate =
      deterministicRandom(
        `${month.budgetRunId}:${month.monthIndex}:${week}:template`,
      ) * totalWeight;
    let runningWeight = 0;
    let selectedTemplate = templates[0];
    for (const t of templates) {
      runningWeight += 11 - t.rarity;
      if (runningWeight >= rollTemplate) {
        selectedTemplate = t;
        break;
      }
    }

    const event = await this.monthRepository.createEventWithTemplate(
      monthId,
      selectedTemplate.id,
      week,
      tx,
    );
    return {
      templateId: event.template.id.toString(),
      title: event.template.title,
      description: event.template.description,
      options: event.template.options.map((o) => ({
        optionId: o.id.toString(),
        optionLabel: o.optionLabel,
        description: o.description,
        defaultJarCode: o.moneyJarCode,
        moneyDelta: o.moneyDelta,
        healthDelta: o.healthDelta,
        lqiDelta: o.lqiDelta,
        learningXpDelta: o.learningXpDelta,
      })),
    };
  }

  /** Returns baseline and fun efficiency (0-100) for a LQI state. */
  private getRecoveryEfficiencyForState(
    state: 'stable' | 'compressed' | 'strained',
  ): { baselinePct: number; funPct: number } {
    const config = this.configService.getConfig();
    const rep = config.indexRules.recoveryEfficiencyPct;
    const s = rep?.[state];
    return {
      baselinePct: s?.baseline ?? 100,
      funPct: s?.fun ?? 100,
    };
  }

  /**
   * Computes and persists monthly index resolution (baseline recovery, HI net change, LQI state, etc.)
   * using module index_rules. Call when month completes (e.g. week 4 no event).
   */
  // private async computeAndPersistMonthlyIndexResolution(
  //   monthIdBig: bigint,
  //   month: {
  //     indexResolution: {
  //       hiStart: number;
  //       lqiStart: number;
  //       lqiStateStart: string | null;
  //     } | null;
  //   },
  //   tx?: TxClient,
  // ): Promise<void> {
  //   if (!month.indexResolution) return;
  //   const config = this.configService.getConfig();
  //   const ir = month.indexResolution;
  //   const hiStart = Number(ir.hiStart);
  //   const lqiStart = Number(ir.lqiStart);
  //   const lqiStateStart =
  //     (ir.lqiStateStart as 'stable' | 'compressed' | 'strained') ?? 'stable';

  //   const { healthDeltaTotal, lqiDeltaTotal } =
  //     await this.monthQuery.getChosenEventsHealthAndLqiTotals(monthIdBig);
  //   const { baselinePct, funPct } =
  //     this.getRecoveryEfficiencyForState(lqiStateStart);

  //   const baselineHiRecovery = config.indexRules.baselineHiRecovery ?? 10;
  //   const baselineRecovery = Math.round(
  //     baselineHiRecovery * (baselinePct / 100),
  //   );
  //   const funBonusRaw = 2;
  //   const funRecoveryBonus = Math.round(funBonusRaw * (funPct / 100));
  //   const jobDrain = 0;
  //   const stressEffect = 0;
  //   const hiNetChange =
  //     baselineRecovery +
  //     funRecoveryBonus -
  //     jobDrain +
  //     healthDeltaTotal -
  //     stressEffect;
  //   const rawHiEnd = hiStart + hiNetChange;
  //   const hiEnd = clampHi(rawHiEnd, config);
  //   const rawLqiEnd = lqiStart + lqiDeltaTotal;
  //   const lqiEnd = clampLqi(rawLqiEnd, config);
  //   const lqiStateEnd = resolveLqiState(lqiEnd, config);

  //   await this.monthRepository.updateIndexResolution(
  //     monthIdBig,
  //     {
  //       baselineRecovery,
  //       funRecoveryBonus,
  //       jobDrain,
  //       eventHiEffectTotal: healthDeltaTotal,
  //       stressEffect,
  //       hiNetChange,
  //       hiEnd,
  //       lqiEnd,
  //       lqiStateEnd,
  //       baselineRecoveryEfficiencyPct: baselinePct,
  //       funRecoveryEfficiencyPct: funPct,
  //       eventPoolBiasState: lqiStateEnd,
  //     },
  //     tx,
  //   );
  // }

  private async computeAndPersistWeeklyIndexResolution(
    monthIdBig: bigint,
    week: number,
    weeklySpend: WeeklySpendSummary,
    forcedRestNotice: { incomeLoss: number; hiRecovery: number } | null,
    tx?: TxClient,
  ): Promise<void> {
    const month = await this.monthQuery.findMonthWithRunAndJobLevel(
      monthIdBig,
      tx,
    );
    if (!month?.indexResolution) return;

    const config = this.configService.getConfig();
    const ir = month.indexResolution;

    const hiStart = Number(ir.hiEnd ?? ir.hiStart ?? 50);
    const lqiStart = Number(ir.lqiEnd ?? ir.lqiStart ?? 50);

    const lqiStateStart = resolveLqiState(lqiStart, config) as
      | 'stable'
      | 'compressed'
      | 'strained';

    const { baselinePct, funPct } =
      this.getRecoveryEfficiencyForState(lqiStateStart);

    // Weekly baseline recovery
    const weeklyBaselineRecovery = Math.round(
      (config.indexRules.baselineHiRecovery ?? 10) / NUMBER_OF_WEEKS_PER_MONTH,
    );

    // Weekly job drain:
    // simplest version = distribute monthly drain evenly
    // replace this with job-level based energy load lookup if available
    const monthlyJobDrain =
      Number(month.budgetRun?.jobState?.job?.baseEnergyLoad ?? 0) || 0;
    const weeklyJobDrain = Math.round(monthlyJobDrain / 4);

    // Weekly event totals
    const { healthDeltaTotal, lqiDeltaTotal } =
      await this.monthQuery.getChosenEventsHealthAndLqiTotalsForWeek(
        monthIdBig,
        week,
        tx,
      );

    // Weekly fun recovery bonus
    let funBonusRaw = 0;
    if (weeklySpend.fun >= 75) funBonusRaw = 1;
    else if (weeklySpend.fun >= 25) funBonusRaw = 0.5;

    const weeklyFunRecoveryBonus = Math.round(funBonusRaw * (funPct / 100));

    const stressEffect = 0;

    const forcedRestRecovery = forcedRestNotice?.hiRecovery ?? 0;

    const hiNetChange =
      weeklyBaselineRecovery +
      weeklyFunRecoveryBonus -
      weeklyJobDrain +
      healthDeltaTotal -
      stressEffect +
      forcedRestRecovery;

    const lqiNetChange = lqiDeltaTotal;

    const hiEnd = clampHi(hiStart + hiNetChange, config);
    const lqiEnd = clampLqi(lqiStart + lqiNetChange, config);
    const lqiStateEnd = resolveLqiState(lqiEnd, config);

    const weeklyPayload: WeeklyIndexProgressItem = {
      hiStart,
      hiEnd,
      hiNetChange,
      lqiStart,
      lqiEnd,
      lqiNetChange,
      lqiStateStart,
      lqiStateEnd,
      baselineRecovery: weeklyBaselineRecovery,
      funRecoveryBonus: weeklyFunRecoveryBonus,
      jobDrain: weeklyJobDrain,
      eventHiEffectTotal: healthDeltaTotal,
      eventLqiEffectTotal: lqiDeltaTotal,
      stressEffect,
      baselineRecoveryEfficiencyPct: baselinePct,
      funRecoveryEfficiencyPct: funPct,
      forcedRestTriggered: !!forcedRestNotice,
      incomeLossFromForcedRest: forcedRestNotice?.incomeLoss ?? 0,
      hiRecoveryFromForcedRest: forcedRestNotice?.hiRecovery ?? 0,
    };

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
        baselineRecovery: weeklyBaselineRecovery,
        funRecoveryBonus: weeklyFunRecoveryBonus,
        jobDrain: weeklyJobDrain,
        eventHiEffectTotal: Object.values(nextProgress).reduce(
          (sum, x) => sum + Number(x.eventHiEffectTotal ?? 0),
          0,
        ),
        stressEffect,
        hiNetChange: hiEnd - Number(ir.hiStart),
        baselineRecoveryEfficiencyPct: baselinePct,
        funRecoveryEfficiencyPct: funPct,
        eventPoolBiasState: lqiStateEnd,
        weeklyIndexProgress: nextProgress,
      },
      tx,
    );
  }

  private async finalizeBills(
    runId: number,
    monthIndex: number,
    estimated: number,
  ) {
    return computeBillsFinal(runId, monthIndex, estimated);
  }

  private async finalizeBillsForMonth(
    userId: string,
    monthId: number,
    actual: number,
    tx?: TxClient,
  ) {
    const monthIdBig = BigInt(monthId);
    const month = await this.monthQuery.findMonthWithRun(monthIdBig, tx);

    if (!month || month.budgetRun.userId !== userId)
      throw new ForbiddenException('Forbidden');
    if (month.currentWeek < END_OF_MONTH_WEEK)
      throw new BadRequestException('Cannot finalize bills before week 4');

    const delta = actual - month.billsEstimated;
    const breakdown: Record<string, number> = {};
    const billReserveEnd = month.billResolution?.billReserveEnd ?? 0;

    if (delta <= 0) {
      const surplus = Math.abs(delta);
      breakdown['billsDelta'] = delta;
      breakdown['surplusToFreeCash'] = surplus;
      await this.monthRepository.updateMonth(
        monthIdBig,
        { billsActual: actual, freeCash: { increment: surplus } },
        tx,
      );
      await this.monthRepository.updateBillResolution(
        monthIdBig,
        {
          billReconcileBreakdown: breakdown,
          surplusToFreeCash: surplus,
        },
        tx,
      );
    } else {
      let rem = delta;
      const takenReserve = Math.min(billReserveEnd, rem);
      rem -= takenReserve;
      breakdown['billReserve'] = takenReserve;
      const billReserveEndAfter = billReserveEnd - takenReserve;
      await this.monthRepository.updateBillResolution(
        monthIdBig,
        { billReserveEnd: billReserveEndAfter },
        tx,
      );

      const jarOrder = ['fun', 'give', 'learning', 'free_cash', 'future_you'];
      let freeCashDeficit = 0;
      for (const jar of jarOrder) {
        if (rem <= 0) break;
        const { spent } = await this.deductFromJar(monthIdBig, jar, rem, tx);
        if (spent > 0) {
          if (jar === 'free_cash') {
            freeCashDeficit = spent;
          } else {
            await this.addSpendLog(monthIdBig, jar, 0, 0, spent, tx);
          }
          rem -= spent;
          breakdown[jar] = spent;
        }
      }

      await this.monthRepository.updateMonth(
        monthIdBig,
        {
          billsActual: actual,
          structuralOvercommitmentOccurred: rem > 0,
          freeCash: { decrement: freeCashDeficit },
        },
        tx,
      );
      await this.monthRepository.updateBillResolution(
        monthIdBig,
        {
          billReconcileBreakdown: {
            ...breakdown,
            billsDelta: delta,
            uncovered: rem,
          },
          shortfallTotal: rem > 0 ? rem : 0,
        },
        tx,
      );
    }
    return breakdown;
  }

  async resolveWeek(userId: string, monthId: number) {
    return wrapAsync(this.logger, 'resolveWeek', async () => {
      const monthIdBig = BigInt(monthId);
      const month =
        await this.monthQuery.findMonthWithRunAndJobLevel(monthIdBig);

      if (!month || month.budgetRun.userId !== userId)
        throw new ForbiddenException('Forbidden or Month not found');
      if (month.currentWeek >= 5)
        throw new BadRequestException('Month already complete');

      if (month.currentWeek >= 1) {
        const pending = await this.monthQuery.findPendingEvent(
          monthIdBig,
          month.currentWeek,
        );
        if (pending)
          throw new BadRequestException('Previous week event unresolved');
      }

      const nextWeek = month.currentWeek + 1;
      let bills: { actual: number } | null = null;
      let monthComplete = false;
      let futureTotal = month.cumulativeFutureYou;
      let freeCashBalance = month.freeCash;
      const spendingSummary: Record<string, number> = {};

      type ForcedRestNotice = { incomeLoss: number; hiRecovery: number };
      type ResolveTxResult = readonly [
        {
          type: string;
          jar: string;
          amount: number;
          jarBalance: number;
          label: string;
        }[],
        unknown,
        { actual: number } | null,
        ForcedRestNotice | null,
      ];
      const config = this.configService.getConfig();
      const maxForcedRest =
        config.indexRules.stressMode?.maxForcedRestPerMonth ?? 1;
      const hiRecoveryFromForcedRest = 5;

      const [entries, eventPending, billsFromTx, forcedRestNotice] =
        await this.prisma.$transaction(async (tx) => {
          await this.monthRepository.updateMonth(
            monthIdBig,
            { currentWeek: nextWeek },
            tx,
          );

          let didForcedRest = false;
          let incomeLossFromForcedRest = 0;

          const idx = month.indexResolution;
          const currentHi = idx ? Number(idx.hiEnd ?? idx.hiStart ?? 50) : 50;
          if (
            idx &&
            idx.forcedRestWeek == null &&
            currentHi < config.indexRules.hiFloor &&
            maxForcedRest >= 1
          ) {
            const jobState = month.budgetRun.jobState;
            const levels = jobState?.job?.levels ?? [];
            const levelRow =
              levels.find((l) => l.level === jobState?.level) ?? levels[0];
            incomeLossFromForcedRest =
              levelRow?.absenceDeductionPerDay != null
                ? Number(levelRow.absenceDeductionPerDay)
                : 0;

            await this.monthRepository.updateIndexResolution(
              monthIdBig,
              {
                forcedRestWeek: nextWeek,
                incomeLossFromForcedRest,
                hiRecoveryFromForcedRest: hiRecoveryFromForcedRest,
              },
              tx,
            );
            didForcedRest = true;
          }

          const spendResult = await this.spendJarsForWeek(monthIdBig, tx);
          const event = didForcedRest
            ? null
            : await this.spawnEventForWeek(monthIdBig, nextWeek, tx);

          const forcedRestPayload = didForcedRest
            ? {
                incomeLoss: incomeLossFromForcedRest,
                hiRecovery: hiRecoveryFromForcedRest,
              }
            : null;

          // Resolve weekly index immediately if no event is waiting for user choice
          if (!event) {
            await this.computeAndPersistWeeklyIndexResolution(
              monthIdBig,
              nextWeek,
              spendResult.weeklySpend,
              forcedRestPayload,
              tx,
            );
          }

          if (nextWeek === END_OF_MONTH_WEEK && !event) {
            const billResult = await this.finalizeBills(
              Number(month.budgetRunId),
              month.monthIndex,
              month.billsEstimated,
            );
            await this.finalizeBillsForMonth(
              userId,
              Number(monthId),
              billResult.actual,
              tx,
            );

            const futureYouJar = await this.monthQuery.findJarByMonthAndJar(
              monthIdBig,
              JarCode.futureYou,
              tx,
            );
            let remain = 0;
            if (futureYouJar) {
              remain =
                Number(futureYouJar.allocatedAmount) -
                Number(futureYouJar.spentAmount) +
                Number(futureYouJar.overflowInAmount) -
                Number(futureYouJar.overflowOutAmount);
            }

            await this.monthRepository.updateMonth(
              monthIdBig,
              {
                currentWeek: 5,
                cumulativeFutureYou: { increment: remain },
              },
              tx,
            );

            return [
              spendResult.entries,
              event,
              billResult,
              forcedRestPayload,
            ] as ResolveTxResult;
          }

          return [
            spendResult.entries,
            event,
            null,
            forcedRestPayload,
          ] as ResolveTxResult;
        });

      let hiAfter: number;
      let lqiAfter: number;

      const refreshedMonth =
        await this.monthQuery.findMonthWithJars(monthIdBig);

      if (nextWeek === END_OF_MONTH_WEEK && !eventPending) {
        monthComplete = true;
        bills = billsFromTx ?? null;
        futureTotal = refreshedMonth?.cumulativeFutureYou ?? futureTotal;
        freeCashBalance = refreshedMonth?.freeCash ?? freeCashBalance;
      }

      if (refreshedMonth) {
        for (const j of refreshedMonth.jars) {
          spendingSummary[j.jarCode] = Number(j.spentAmount);
        }
      }

      hiAfter = clampHi(
        Number(
          refreshedMonth?.indexResolution?.hiEnd ??
            refreshedMonth?.indexResolution?.hiStart ??
            50,
        ),
        config,
      );

      lqiAfter = clampLqi(
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
        eventPending: eventPending,
        monthComplete,
        bills,
        futureYouTotal: futureTotal,
        freeCashBalance,
        spendingSummary,
      };
    });
  }

  async applyEventChoice(
    userId: string,
    monthId: number,
    week: number,
    optionId: number,
    paymentJarCode: string,
    coverJarCodes: string[] = [],
  ) {
    return wrapAsync(this.logger, 'applyEventChoice', async () => {
      const monthIdBig = BigInt(monthId);
      const month = await this.monthQuery.findMonthWithRun(monthIdBig);

      if (!month || month.budgetRun.userId !== userId) {
        throw new ForbiddenException('Forbidden or Month not found');
      }

      const event = await this.monthQuery.findPendingEvent(monthIdBig, week);
      if (!event)
        throw new BadRequestException('No pending event for this week');

      const option = await this.monthQuery.findLifeEventOptionById(
        BigInt(optionId),
      );
      if (!option || option.eventTemplateId !== event.eventTemplateId) {
        throw new BadRequestException('Invalid option');
      }

      if (!BudgetSimulationMonthService.VALID_JAR_CODES.has(paymentJarCode)) {
        throw new BadRequestException(`Invalid payment jar: ${paymentJarCode}`);
      }
      for (const code of coverJarCodes) {
        if (!BudgetSimulationMonthService.VALID_JAR_CODES.has(code)) {
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

      if (cost > 0) {
        const primaryAvailable = await this.getJarAvailable(
          monthIdBig,
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
            const coverAvailable = await this.getJarAvailable(
              monthIdBig,
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

      let futureRemainInMonth = 0;
      const futureYouJar = await this.monthQuery.findJarByMonthAndJar(
        monthIdBig,
        JarCode.futureYou,
      );
      if (futureYouJar) {
        futureRemainInMonth =
          Number(futureYouJar.allocatedAmount) -
          Number(futureYouJar.spentAmount) +
          Number(futureYouJar.overflowInAmount) -
          Number(futureYouJar.overflowOutAmount);
      }

      let bills: { actual: number } | null = null;
      let monthComplete = false;
      let futureTotal = 0;
      const spendSummary: Record<string, number> = {};

      await this.prisma.$transaction(async (tx) => {
        if (cost > 0) {
          for (const { jar, amount } of paymentRecord) {
            if (jar === 'free_cash') {
              await this.monthRepository.updateMonth(
                monthIdBig,
                { freeCash: { decrement: amount } },
                tx,
              );
            } else {
              await this.addSpendLog(monthIdBig, jar, amount, 0, 0, tx);
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
            await this.addSpendLog(monthIdBig, jar, 0, moneyDelta, 0, tx);
          }
        }

        const paymentBreakdown =
          paymentRecord.length > 0
            ? paymentRecord.map(({ jar, amount }) => ({
                jarCode: jar,
                amount,
              }))
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

        await this.computeAndPersistWeeklyIndexResolution(
          monthIdBig,
          week,
          { fun: 0, learning: 0, give: 0 },
          null,
          tx,
        );

        if (week === END_OF_MONTH_WEEK) {
          const billResult = await this.finalizeBills(
            Number(month.budgetRunId),
            month.monthIndex,
            month.billsEstimated,
          );
          await this.finalizeBillsForMonth(
            userId,
            Number(monthId),
            billResult.actual,
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
        }
      });

      const config = this.configService.getConfig();
      const refreshedMonth =
        await this.monthQuery.findMonthWithJars(monthIdBig);

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

      if (week === END_OF_MONTH_WEEK) {
        const updatedMonth =
          await this.monthQuery.findMonthWithJars(monthIdBig);
        futureTotal = updatedMonth?.cumulativeFutureYou ?? 0;
        if (updatedMonth) {
          for (const j of updatedMonth.jars) {
            spendSummary[j.jarCode] = Number(j.spentAmount);
          }
        }
      }

      return {
        optionId: optionId,
        optionLabel: option.optionLabel,
        healthDelta: option.healthDelta,
        lqiDelta: option.lqiDelta,
        learningXpDelta: option.learningXpDelta,
        moneyDelta: option.moneyDelta,
        defaultJarCode: option.moneyJarCode ?? undefined,
        paymentRecord: paymentRecord,
        hiAfter,
        lqiAfter,
        monthComplete: monthComplete,
        bills,
        futureYouTotal: futureTotal,
        futureRemainInMonth,
        spendingSummary: spendSummary,
      };
    });
  }
}
