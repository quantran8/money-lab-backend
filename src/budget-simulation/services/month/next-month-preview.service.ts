import { Injectable } from '@nestjs/common';
import { BudgetRunQuery } from '#budget-simulation/queries/run.query.js';
import {
  BillReserveOptionCode,
  CommitmentLayer,
  JarCode,
} from '#budget-simulation/budget-simulation.enum.js';
import { getBillReserveCoveragePct } from '#budget-simulation/budget-simulation.constant.js';
import { resolveBaseJobIncome } from '#budget-simulation/domain/index.js';
import { BudgetSimulationConfigService } from '../config.service';
import type { MonthWithRunAndJobLevelAndJars } from '#budget-simulation/types/month.types.js';
import type { NextMonthPreview } from '#budget-simulation/types/month.types.js';

@Injectable()
export class NextMonthPreviewService {
  constructor(
    private readonly runQuery: BudgetRunQuery,
    private readonly configService: BudgetSimulationConfigService,
  ) {}

  async computePreview(
    month: MonthWithRunAndJobLevelAndJars,
  ): Promise<NextMonthPreview> {
    const nextMonthIndex = month.monthIndex + 1;
    const runIdBig = month.budgetRunId;

    const nextMonthCommitments =
      await this.runQuery.findActiveCommitmentsForMonth(
        runIdBig,
        nextMonthIndex,
      );

    const jobState = month.budgetRun.jobState;
    const currentLevel =
      jobState.job.levels.find((l) => l.level === jobState.level) ||
      jobState.job.levels[0];
    const resolvedBase = resolveBaseJobIncome(jobState.job, currentLevel);
    const overtimeCarriedFromPriorMonth = Number(
      month.overtimeIncomeEarned ?? 0,
    );
    const absenceDeduction =
      month.indexResolution?.incomeLossFromForcedRest ?? 0;
    const grossNextMonthIncome =
      resolvedBase + overtimeCarriedFromPriorMonth;
    const finalIncome = grossNextMonthIncome - absenceDeduction;

    const lockedTotal = nextMonthCommitments
      .filter(
        (c) =>
          c.template.layer === CommitmentLayer.locked ||
          c.template.layer === CommitmentLayer.foodReserve,
      )
      .reduce((sum, c) => sum + Number(c.selectedAmount), 0);

    const billingCommitments = nextMonthCommitments.filter(
      (c) => c.template.category === 'housing',
    );
    const housingIds = billingCommitments.map((c) => c.commitmentTemplateId);

    // Use cached bill templates and housing modifiers (no DB hit)
    const billTemplates = this.configService.getBillTemplates();
    const housingUtilityModifiers =
      this.configService.getHousingModifiersByCommitmentIds(housingIds);

    const estimatedBills = billTemplates.reduce((sum, t) => {
      const modifier = housingUtilityModifiers.find(
        (m) => m.utilityName.toLowerCase() === t.name.toLowerCase(),
      );
      return sum + t.baseMonthlyAmount * (Number(modifier?.multiplier) ?? 1);
    }, 0);

    const optionCode =
      month.billReserveOptionCode || BillReserveOptionCode.high;
    const covPct = getBillReserveCoveragePct(optionCode);
    const reserveTarget = Math.round((covPct / 100) * estimatedBills);
    const reserveStart = month.billResolution?.billReserveEnd ?? 0;
    const reserveRefill = Math.max(0, reserveTarget - reserveStart);

    const jarOrder = [
      JarCode.fun,
      JarCode.learning,
      JarCode.give,
      JarCode.futureYou,
    ];

    const jarRefill: Array<{
      jarCode: string;
      target: number;
      remaining: number;
      refill: number;
    }> = [];
    let lastMonthJarsRemaining = 0;
    let lastMonthTotalAllocated = 0;
    for (const jarCode of jarOrder) {
      const jar = month.jars.find((j) => j.jarCode === jarCode);
      const target = jar ? Number(jar.allocatedAmount) : 0;
      const remaining = jar
        ? Math.max(
            0,
            target -
              Number(jar.spentAmount) +
              Number(jar.overflowInAmount) -
              Number(jar.overflowOutAmount),
          )
        : 0;
      let refill = Math.max(0, target - remaining);
      if (jarCode === JarCode.futureYou) {
        refill = target;
      } else {
        lastMonthJarsRemaining += remaining;
      }
      lastMonthTotalAllocated += target;
      jarRefill.push({ jarCode, target, remaining, refill });
    }

    const lastMonthFreeCash = month.freeCash;
    const flexibleIncome =
      finalIncome - lockedTotal - estimatedBills - reserveRefill;
    const nextMonthFreeCash =
      flexibleIncome - lastMonthTotalAllocated + lastMonthJarsRemaining;
    const freeCashBalance = lastMonthFreeCash + nextMonthFreeCash;

    return {
      monthIndex: nextMonthIndex,
      income: {
        resolvedBaseJobIncome: resolvedBase,
        overtimeIncomeEarnedFromPriorMonth: overtimeCarriedFromPriorMonth,
        absenceDeduction,
        finalIncome,
      },
      commitments: { lockedTotal },
      bills: { estimated: estimatedBills },
      billReserve: {
        target: reserveTarget,
        start: reserveStart,
        refill: reserveRefill,
      },
      jarRefill,
      freeCash: {
        current: lastMonthFreeCash,
        nextMonth: nextMonthFreeCash,
        total: freeCashBalance,
      },
      structure: { flexibleIncome },
    };
  }
}
