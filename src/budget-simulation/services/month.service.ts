import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { wrapAsync } from '../../common/utils/async.utils';
import { BudgetMonthQuery } from '../queries/month.query';
import { BudgetMonthRepository } from '../repositories/month.repository';
import type { TxClient } from '../repositories/run.repository';
import { CommitmentQuery } from '../queries/commitment.query';
import { PrismaService } from '../../prisma/prisma.service';
import { computeBillsFinal, deterministicRandom, genAutoSpendLabel } from '../budget-simuation.helpers';
import { JarCode, SpendModeCode } from '../budget-simulation.enum';

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
    private readonly commitmentQuery: CommitmentQuery,
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
  ): Promise<number> {
    let allocationAmount = 0;
    if (jarCode === 'free_cash') {
      const month = await this.monthQuery.findMonthById(monthId);
      allocationAmount = Number(month?.freeCash ?? 0);
    } else {
      const allocation =
        await this.monthQuery.findAllocationByMonthAndJar(monthId, jarCode);
      allocationAmount = allocation ? Number(allocation.amount) : 0;
    }
    const spendByJar =
      await this.monthQuery.findSpendByJarByMonthAndJar(monthId, jarCode);
    const spent = spendByJar ? Number(spendByJar.spentAmount) : 0;
    const overflowIn = spendByJar ? Number(spendByJar.overflowInAmount) : 0;
    const overflowOut = spendByJar ? Number(spendByJar.overflowOutAmount) : 0;
    return Math.max(0, allocationAmount - spent + overflowIn - overflowOut);
  }

  private async deductFromJar(
    monthId: bigint,
    jarCode: string,
    amount: number,
  ) {
    let allocationAmount = 0;
    if (jarCode === 'free_cash') {
      const month = await this.monthQuery.findMonthById(monthId);
      allocationAmount = Number(month?.freeCash ?? 0);
    } else {
      const allocation =
        await this.monthQuery.findAllocationByMonthAndJar(monthId, jarCode);
      allocationAmount = allocation ? Number(allocation.amount) : 0;
    }
    const spendByJar =
      await this.monthQuery.findSpendByJarByMonthAndJar(monthId, jarCode);
    const spentSoFar = spendByJar ? Number(spendByJar.spentAmount) : 0;
    const overflowIn = spendByJar ? Number(spendByJar.overflowInAmount) : 0;
    const overflowOut = spendByJar ? Number(spendByJar.overflowOutAmount) : 0;
    const available = allocationAmount - spentSoFar + overflowIn - overflowOut;
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
    await this.monthRepository.upsertSpendByJar(
      monthId,
      jarCode,
      spent,
      overflowIn,
      overflowOut,
      tx,
    );
  }

  private async spendJarsForWeek(monthId: bigint, tx?: TxClient) {
    const month = await this.monthQuery.findMonthById(monthId);
    if (!month) throw new NotFoundException('Month not found');
    const spendModeCode = month.spendModeCode ?? SpendModeCode.normal;
    const rate = await this.getSpendModeRate(spendModeCode);
    const coreJars = [JarCode.fun, JarCode.learning, JarCode.give];
    const allocations = await this.monthQuery.findAllocationsForMonth(
      monthId,
      coreJars,
    );
    const entries: { type: string; jar: string; amount: number; jarBalance: number; label: string }[] = [];

    for (const jarEntry of allocations) {
      const jar = jarEntry.jarCode;
      const maxMonthAvailable = Math.round(Number(jarEntry.amount) * rate);
      const weeklyAmount = Math.floor(maxMonthAvailable / 4.0);
      if (weeklyAmount <= 0) continue;

      const { spent, jarBalance } = await this.deductFromJar(
        monthId,
        jar,
        weeklyAmount,
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
      }
    }
    return { entries };
  }

  private async spawnEventForWeek(monthId: bigint, week: number, tx?: TxClient) {
    const month = await this.monthQuery.findMonthWithRunAndModule(monthId);
    if (!month) return null;

    const existing = await this.monthQuery.findPendingEventWithTemplate(
      monthId,
      week,
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

    const seed = `${month.budgetRunId}:${month.monthIndex}:${week}:spawn`;
    if (deterministicRandom(seed) >= 0.5) return null;

    const fromMonth = Math.max(1, month.monthIndex - 5);
    const usedIds = await this.monthQuery.findUsedEventTemplateIds(
      month.budgetRunId,
      fromMonth,
      month.monthIndex,
    );
    const templates =
      await this.monthQuery.findLifeEventTemplatesForModule(
        month.budgetRun.moduleId,
        usedIds,
      );
    if (templates.length === 0) return null;

    const totalWeight = templates.reduce((sum, t) => sum + (11 - t.rarity), 0);
    const roll =
      deterministicRandom(
        `${month.budgetRunId}:${month.monthIndex}:${week}:template`,
      ) * totalWeight;
    let runningWeight = 0;
    let selectedTemplate = templates[0];
    for (const t of templates) {
      runningWeight += 11 - t.rarity;
      if (runningWeight >= roll) {
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
    const month = await this.monthQuery.findMonthWithRun(monthIdBig);

    if (!month || month.budgetRun.userId !== userId)
      throw new ForbiddenException('Forbidden');
    if (month.currentWeek < 4)
      throw new BadRequestException('Cannot finalize bills before week 4');

    const delta = actual - month.billsEstimated;
    const breakdown: Record<string, number> = {};

    if (delta <= 0) {
      const surplus = Math.abs(delta);
      breakdown['billsDelta'] = delta;
      breakdown['surplusToFreeCash'] = surplus;
      await this.monthRepository.updateMonth(
        monthIdBig,
        {
          billsActual: actual,
          billReconcileBreakdown: breakdown,
          freeCash: { increment: surplus },
        },
        tx,
      );
    } else {
      let rem = delta;
      const takenReserve = Math.min(month.billReserveEnd, rem);
      rem -= takenReserve;
      breakdown['billReserve'] = takenReserve;
      await this.monthRepository.updateMonth(
        monthIdBig,
        { billReserveEnd: month.billReserveEnd - takenReserve },
        tx,
      );

      const jarOrder = ['fun', 'give', 'learning', 'free_cash', 'future_you'];
      let freeCashDeficit = 0;
      for (const jar of jarOrder) {
        if (rem <= 0) break;
        const { spent } = await this.deductFromJar(monthIdBig, jar, rem);
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
          billReconcileBreakdown: {
            ...breakdown,
            billsDelta: delta,
            uncovered: rem,
          },
          structuralOvercommitmentOccurred: rem > 0,
          freeCash: { decrement: freeCashDeficit },
        },
        tx,
      );
    }
    return breakdown;
  }

  async resolveWeek(userId: string, monthId: number) {
    return wrapAsync(this.logger, 'resolveWeek', async () => {
      const monthIdBig = BigInt(monthId);
      const month = await this.monthQuery.findMonthWithRun(monthIdBig);

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
      let futureRemainInMonth = 0;

      type ResolveTxResult = readonly [
        { type: string; jar: string; amount: number; jarBalance: number; label: string }[],
        unknown,
        { actual: number } | null,
      ];
      const [entries, eventPending, billsFromTx] = await this.prisma.$transaction(
        async (tx) => {
          await this.monthRepository.updateMonth(
            monthIdBig,
            { currentWeek: nextWeek },
            tx,
          );

          const spendResult = await this.spendJarsForWeek(monthIdBig, tx);
          const event = await this.spawnEventForWeek(monthIdBig, nextWeek, tx);

          if (nextWeek === 4 && !event) {
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

            const futureYouAllocation =
              await this.monthQuery.findAllocationByMonthAndJar(
                monthIdBig,
                JarCode.futureYou,
              );
            const futureYouSpending =
              await this.monthQuery.findSpendByJarByMonthAndJar(
                monthIdBig,
                JarCode.futureYou,
              );

            let remain = 0;
            if (futureYouAllocation) {
              remain =
                Number(futureYouAllocation.amount) -
                (futureYouSpending?.spentAmount
                  ? Number(futureYouSpending.spentAmount)
                  : 0);
            }

            await this.monthRepository.updateMonth(
              monthIdBig,
              {
                currentWeek: 5,
                healthIndexEnd: month.healthIndexEnd,
                lqiEnd: month.lqiEnd,
                cumulativeFutureYou: { increment: remain },
              },
              tx,
            );

            return [spendResult.entries, event, billResult] as ResolveTxResult;
          }

          return [spendResult.entries, event, null] as ResolveTxResult;
        },
      );

      if (nextWeek === 4 && !eventPending) {
        monthComplete = true;
        bills = billsFromTx ?? null;
        const updatedMonth = await this.monthQuery.findMonthWithSpendByJar(
          monthIdBig,
        );
        futureTotal = updatedMonth?.cumulativeFutureYou ?? futureTotal;
        freeCashBalance = updatedMonth?.freeCash ?? freeCashBalance;
        if (updatedMonth) {
          for (const s of updatedMonth.spendByJar) {
            spendingSummary[s.jarCode] = Number(s.spentAmount);
          }
        }
      }

      return {
        week: nextWeek,
        entries,
        hiAfter: month.healthIndexEnd,
        lqiAfter: month.lqiEnd,
        systemNotice: null,
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

      let hi = month.healthIndexEnd ?? 0;
      let lqi = month.lqiEnd ?? 0;
      hi = Math.max(0, Math.min(100, hi + (option.healthDelta ?? 0)));
      lqi = Math.max(0, Math.min(100, lqi + (option.lqiDelta ?? 0)));

      const moneyDelta = option.moneyDelta ?? 0;
      const cost = moneyDelta < 0 ? Math.abs(moneyDelta) : 0;
      const paymentRecord: { jar: string; amount: number }[] = [];

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
      const futureYouAllocation =
        await this.monthQuery.findAllocationByMonthAndJar(
          monthIdBig,
          JarCode.futureYou,
        );
      const futureYouSpending =
        await this.monthQuery.findSpendByJarByMonthAndJar(
          monthIdBig,
          JarCode.futureYou,
        );
      if (futureYouAllocation) {
        futureRemainInMonth =
          Number(futureYouAllocation.amount) -
          (futureYouSpending?.spentAmount
            ? Number(futureYouSpending.spentAmount)
            : 0);
      }

      let bills: { actual: number } | null = null;
      let monthComplete = false;
      let futureTotal = 0;
      const spendSummary: Record<string, number> = {};

      await this.prisma.$transaction(async (tx) => {
        await this.monthRepository.updateMonth(
          monthIdBig,
          { healthIndexEnd: hi, lqiEnd: lqi },
          tx,
        );

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

        if (week === 4) {
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

      if (week === 4) {
        const updatedMonth = await this.monthQuery.findMonthWithSpendByJar(
          monthIdBig,
        );
        futureTotal = updatedMonth?.cumulativeFutureYou ?? 0;
        if (updatedMonth) {
          for (const s of updatedMonth.spendByJar) {
            spendSummary[s.jarCode] = Number(s.spentAmount);
          }
        }
      }

      return {
        optionId: optionId,
        optionLabel: option.optionLabel,
        healthDelta: option.healthDelta,
        lqiDelta: option.lqiDelta,
        moneyDelta: option.moneyDelta,
        defaultJarCode: option.moneyJarCode ?? undefined,
        paymentRecord: paymentRecord,
        hiAfter: hi,
        lqiAfter: lqi,
        monthComplete: monthComplete,
        bills,
        futureYouTotal: futureTotal,
        futureRemainInMonth,
        spendingSummary: spendSummary,
      };
    });
  }
}
