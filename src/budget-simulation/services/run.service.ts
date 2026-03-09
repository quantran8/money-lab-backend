import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { wrapAsync } from '../../common/utils/async.utils';
import { BudgetRunQuery } from '../queries/run.query';
import { BudgetRunRepository } from '../repositories/run.repository';
import { BudgetMonthQuery } from '../queries/month.query';
import { BudgetMonthRepository } from '../repositories/month.repository';
import { CommitmentQuery } from '../queries/commitment.query';
import { BillReserveOptionCode, CommitmentLayer, JarCode } from '../budget-simulation.enum';
import { PrismaService } from '../../prisma/prisma.service';
import type { TxClient } from '../repositories/run.repository';

/**
 * Run lifecycle: active run, start run, start month, prepare next month.
 * Uses Query for reads, Repository for writes; transactions at service layer.
 */
@Injectable()
export class BudgetSimulationRunService {
  private readonly logger = new Logger(BudgetSimulationRunService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly runQuery: BudgetRunQuery,
    private readonly runRepository: BudgetRunRepository,
    private readonly monthQuery: BudgetMonthQuery,
    private readonly monthRepository: BudgetMonthRepository,
    private readonly commitmentQuery: CommitmentQuery,
  ) {}

  private async getBillReserveCoveragePct(code: string): Promise<number> {
    const option =
      await this.commitmentQuery.findBillReserveOptionByCode(code);
    if (!option)
      throw new BadRequestException(
        `Invalid bill_reserve_option_code: ${code}`,
      );
    return option.coveragePct;
  }

  private async upsertMonthAllocations(
    monthId: bigint,
    allocations: Record<string, number>,
    tx?: TxClient,
  ) {
    const coreJars = ['fun', 'learning', 'give', 'future_you'];
    for (const [jarCode, amount] of Object.entries(allocations)) {
      if (jarCode === 'free_cash') continue;
      await this.monthRepository.upsertAllocation(monthId, jarCode, amount, tx);
    }
    for (const jarCode of coreJars) {
      await this.monthRepository.ensureAllocationExists(monthId, jarCode, tx);
    }
  }

  async getActiveBudgetRun(userId: string) {
    return wrapAsync(this.logger, 'getActiveBudgetRun', async () => {
      const run = await this.runQuery.findActiveRunWithDetails(userId);
      if (!run) return null;

      const billTemplates = await this.commitmentQuery.findBillTemplates(3);
      const housingId = run.commitments.find(
        (c) => c.template.category === 'housing',
      )?.template.id;
      const housingUtilityModifiers = housingId
        ? await this.commitmentQuery.findHousingModifiersByCommitmentIds([
            housingId,
          ])
        : [];

      const billEstimatedTemplates = billTemplates.map((t) => {
        const modifiers = housingUtilityModifiers.find(
          (m) => m.utilityName === t.name,
        );
        const modifierAmount =
          Number(modifiers?.multiplier ?? 1) * t.baseMonthlyAmount;
        return {
          templateId: t.id.toString(),
          name: t.name,
          layer: t.layer,
          amount: modifierAmount,
        };
      });

      const latestMonth = run.months[0];
      const jarsAllocationArr =
        latestMonth?.allocations.filter((a) => a.jarCode !== 'free_cash') ?? [];
      const spendByJarArr = latestMonth?.spendByJar ?? [];

      const freeCashAlloc = latestMonth?.freeCash ?? 0;
      const freeCashSpend = spendByJarArr.find(
        (s) => s.jarCode === 'free_cash',
      );
      const freeCashBalance =
        freeCashAlloc -
        (freeCashSpend?.spentAmount ?? 0) +
        (freeCashSpend?.overflowInAmount ?? 0) -
        (freeCashSpend?.overflowOutAmount ?? 0);

      const necessitiesTotal =
        (latestMonth?.lockedCommitmentsTotal ?? 0) +
        (latestMonth?.billsEstimated ?? 0) +
        (latestMonth?.billReserveTarget ?? 0);

      return {
        id: run.id.toString(),
        moduleId: run.moduleId,
        userId: run.userId,
        jobId: run.jobState.jobId.toString(),
        currentMonthIndex: latestMonth?.monthIndex ?? 1,
        isMonthResolved: latestMonth ? latestMonth.billsActual !== null : false,
        freeCash: freeCashBalance,
        income: latestMonth?.income ?? 0,
        necessitiesTotal,
        spendMode: latestMonth?.spendModeCode,
        billReserveOption: latestMonth?.billReserveOptionCode,
        commitments: [
          ...run.commitments.map((c) => ({
            templateId: c.commitmentTemplateId.toString(),
            name: c.template.name,
            layer: c.template.layer,
            amount: c.selectedAmount,
          })),
          ...billEstimatedTemplates,
        ],
        jars: jarsAllocationArr.reduce((acc, curr) => {
          const spent = spendByJarArr.find((s) => s.jarCode === curr.jarCode);
          const spentAmount = spent?.spentAmount ?? 0;
          const overflowIn = spent?.overflowInAmount ?? 0;
          const overflowOut = spent?.overflowOutAmount ?? 0;
          acc[curr.jarCode] = {
            allocation: curr.amount,
            balance: curr.amount - spentAmount + overflowIn - overflowOut,
          };
          return acc;
        }, {} as Record<string, { allocation: number; balance: number }>),
      };
    });
  }

  async startBudgetRun(
    userId: string,
    moduleId: number,
    jobId: number,
    commitmentAmounts: Record<number, number>,
  ) {
    return wrapAsync(this.logger, 'startBudgetRun', async () => {
      const job = await this.runQuery.findJobWithLevel1(BigInt(jobId));
      if (!job) throw new NotFoundException('Job not found');

      const income = job.levels[0]?.incomeBaseOverride ?? job.baseMonthlyIncome;

      const jobState = await this.runQuery.findLatestUserJobState(
        userId,
        BigInt(jobId),
      );

      return this.prisma.$transaction(async (tx) => {
        let state = jobState;
        if (!state) {
          state = await this.runRepository.createUserJobState(
            {
              userId,
              jobId: BigInt(jobId),
              level: 1,
              xp: 0,
              currentMonthlyIncome: income,
              isActive: true,
            },
            tx,
          );
        } else {
          state = await this.runRepository.updateUserJobState(
            state.id,
            {
              isActive: true,
              currentMonthlyIncome: state.currentMonthlyIncome ?? income,
              updatedAt: new Date(),
            },
            tx,
          );
        }

        const run = await this.runRepository.createRun(
          {
            userId,
            moduleId,
            jobStateId: state.id,
            totalMonths: 0,
            finalFutureYouSavings: 0,
            passed: false,
          },
          tx,
        );

        const commitments = Object.entries(commitmentAmounts).map(
          ([templateId, amount]) => ({
            budgetRunId: run.id,
            commitmentTemplateId: BigInt(templateId),
            selectedAmount: amount,
            effectiveFrom: 1,
          }),
        );

        await this.runRepository.createRunCommitments(commitments, tx);

        return {
          runId: run.id.toString(),
          jobStateId: state.id.toString(),
        };
      });
    });
  }

  async startMonth(
    userId: string,
    runId: number,
    allocations: Record<string, number>,
    billReserveOptionCode: string,
    spendModeCode: string,
    carryOverByJar: Record<string, number> = {},
    convertToFreeCashByJar: Record<string, number> = {},
  ) {
    return wrapAsync(this.logger, 'startMonth', async () => {
      const run = await this.runQuery.findRunWithJobState(BigInt(runId));
      if (!run || run.userId !== userId)
        throw new ForbiddenException('Forbidden or Run not found');

      const covPct = await this.getBillReserveCoveragePct(
        billReserveOptionCode,
      );

      const prevMonth = await this.monthQuery.findPreviousMonth(BigInt(runId));
      const coreJars = Object.values(JarCode) as string[];

      let prevMonthFreeCashBalance = 0;
      let prevJarBalances: Record<string, number> = {};
      let totalConvertedToFreeCash = 0;
      const finalAllocations = { ...allocations };

      if (prevMonth) {
        prevMonthFreeCashBalance = Math.max(0, Number(prevMonth.freeCash ?? 0));

        const prevAllocs = await this.monthQuery.findAllocationsForMonth(
          prevMonth.id,
          coreJars,
        );
        const prevSpendByJar =
          await this.monthQuery.findSpendByJarForMonth(
            prevMonth.id,
            coreJars,
          );

        const allocByJar = Object.fromEntries(
          prevAllocs.map((a) => [a.jarCode, Number(a.amount)]),
        );
        const spendByJar = Object.fromEntries(
          prevSpendByJar.map((s) => [
            s.jarCode,
            {
              spent: Number(s.spentAmount),
              overflowIn: Number(s.overflowInAmount),
              overflowOut: Number(s.overflowOutAmount),
            },
          ]),
        );

        for (const jar of coreJars) {
          const amt = allocByJar[jar] ?? 0;
          const s = spendByJar[jar];
          const spent = s?.spent ?? 0;
          const overflowIn = s?.overflowIn ?? 0;
          const overflowOut = s?.overflowOut ?? 0;
          prevJarBalances[jar] = Math.max(
            0,
            amt - spent + overflowIn - overflowOut,
          );
        }

        for (const jar of coreJars) {
          const carryOver = carryOverByJar[jar] ?? 0;
          const convertToFreeCash = convertToFreeCashByJar[jar] ?? 0;
          const prevBalance = prevJarBalances[jar] ?? 0;
          if (carryOver < 0 || convertToFreeCash < 0)
            throw new BadRequestException(
              `Invalid carry over or convert for jar ${jar}: amounts must be >= 0`,
            );
          if (carryOver + convertToFreeCash > prevBalance)
            throw new BadRequestException(
              `Invalid jar ${jar}: carryOver + convertToFreeCash (${carryOver + convertToFreeCash}) must not exceed previous balance (${prevBalance})`,
            );
          totalConvertedToFreeCash += convertToFreeCash;
          finalAllocations[jar] = (finalAllocations[jar] ?? 0) + carryOver;
        }
      }

      const monthIndex = (prevMonth?.monthIndex ?? 0) + 1;
      const hiStart = prevMonth?.healthIndexEnd ?? 70;
      const lqiStart = prevMonth?.lqiEnd ?? 40;
      const stress = prevMonth?.structuralOvercommitmentOccurred ?? false;
      const billReserveStart = prevMonth?.billReserveEnd ?? 0;

      const commitments =
        await this.runQuery.findCommitmentsForRunWithTemplates(BigInt(runId));

      const lockedTotal = commitments
        .filter((c) => c.template.layer === CommitmentLayer.locked)
        .reduce((sum, c) => sum + c.selectedAmount, 0);

      const foodReserve = commitments
        .filter((c) => c.template.category === 'food')
        .reduce((sum, c) => sum + c.selectedAmount, 0);

      const housingIds = commitments
        .filter((c) => c.template.category === 'housing')
        .map((c) => c.commitmentTemplateId);
      const housingUtilityModifiers =
        await this.commitmentQuery.findHousingModifiersByCommitmentIds(
          housingIds,
        );

      const billTemplates =
        await this.commitmentQuery.findBillTemplatesByLayer(
          3,
          CommitmentLayer.bills,
        );

      const billsEstimated = billTemplates.reduce((sum, t) => {
        const modifier = housingUtilityModifiers.find(
          (m) => m.utilityName.toLowerCase() === t.name.toLowerCase(),
        );
        return sum + t.baseMonthlyAmount * (Number(modifier?.multiplier) ?? 1);
      }, 0);

      const income = Number(run.jobState.currentMonthlyIncome);

      const billReserveTarget = Math.round((covPct / 100) * billsEstimated);
      const topUpNeeded = Math.max(0, billReserveTarget - billReserveStart);
      const billReserveEnd = billReserveStart + topUpNeeded;

      const necTotal = lockedTotal + foodReserve + billsEstimated + topUpNeeded;
      const leftToAllocate = income - necTotal;

      if (leftToAllocate < 0)
        throw new BadRequestException('Guardrail failed: left_to_allocate < 0');

      const allocSum = Object.values(allocations).reduce(
        (sum, val) => sum + val,
        0,
      );
      if (allocSum > leftToAllocate)
        throw new BadRequestException(
          'Overspending: allocations > left_to_allocate',
        );

      const monthFreeCash = leftToAllocate - allocSum;

      const cumulativeFreeCash = Math.max(
        0,
        prevMonthFreeCashBalance + monthFreeCash + totalConvertedToFreeCash,
      );

      return this.prisma.$transaction(async (tx) => {
        const month = await this.monthRepository.createMonth(
          {
            budgetRunId: BigInt(runId),
            monthIndex,
            income,
            lockedCommitmentsTotal: lockedTotal,
            billsEstimated,
            billsActual: 0,
            billReserveOptionCode,
            billReserveTarget,
            billReserveStart,
            billReserveEnd,
            spendModeCode,
            healthIndexStart: hiStart,
            healthIndexEnd: hiStart,
            lqiStart: lqiStart,
            lqiEnd: lqiStart,
            cumulativeFutureYou: prevMonth?.cumulativeFutureYou ?? 0,
            freeCash: cumulativeFreeCash,
            currentWeek: 0,
            stressModeActive: stress,
            overtimeUnits: 0,
            overtimeIncome: 0,
            overtimeHealthCost: 0,
          },
          tx,
        );

        await this.upsertMonthAllocations(month.id, finalAllocations, tx);

        return {
          monthId: month.id.toString(),
          monthIndex: monthIndex,
          income,
          lockedTotal: lockedTotal,
          foodReserve: foodReserve,
          billsEstimated: billsEstimated,
          billReserve: {
            option: billReserveOptionCode,
            target: billReserveTarget,
            start: billReserveStart,
            topupNeeded: topUpNeeded,
            end: billReserveEnd,
          },
          necTotal: necTotal,
          leftToAllocate: leftToAllocate,
          allocatedTotal: allocSum,
          freeCash: cumulativeFreeCash,
          spendModeCode: spendModeCode,
          stressModeActive: stress,
          hiStart: hiStart,
          lqiStart: lqiStart,
        };
      });
    });
  }

  async prepareNextMonth(userId: string, runId: number) {
    return wrapAsync(this.logger, 'prepareNextMonth', async () => {
      const runIdBig = BigInt(runId);
      const run =
        await this.runQuery.findRunWithLatestMonthAndCommitments(runIdBig);

      if (!run || run.userId !== userId)
        throw new NotFoundException('Run not found or unauthorized');

      const latestMonth = run.months[0];
      if (
        !latestMonth ||
        latestMonth.billsActual === null ||
        latestMonth.currentWeek < 5
      ) {
        throw new BadRequestException('Current month not fully resolved');
      }

      const jobState = run.jobState;
      const baseIncome = Number(jobState.currentMonthlyIncome);

      const currentLevel =
        jobState.job.levels.find((l) => l.level === jobState.level) ||
        jobState.job.levels[0];
      const otPayPerUnit =
        currentLevel?.overtimeIncomePerUnit ??
        jobState.job.overtimeIncomePerUnit;

      const overtimePay = latestMonth.overtimeUnits * otPayPerUnit;
      const absenceDeduction = latestMonth.incomeLossFromForcedRest;
      const finalIncome = baseIncome + overtimePay - absenceDeduction;

      const lockedTotal = run.commitments
        .filter((c) => c.template.layer === CommitmentLayer.locked)
        .reduce((sum, c) => sum + Number(c.selectedAmount), 0);

      const billingCommitments = run.commitments.filter(
        (c) => c.template.category === 'housing',
      );
      const housingIds = billingCommitments.map((c) => c.commitmentTemplateId);
      const housingUtilityModifiers =
        housingIds.length > 0
          ? await this.commitmentQuery.findHousingModifiersByCommitmentIds(
              housingIds,
            )
          : [];

      const billTemplates =
        await this.commitmentQuery.findBillTemplatesByLayer(
          run.moduleId,
          CommitmentLayer.bills,
        );

      const estimatedBills = billTemplates.reduce((sum, t) => {
        const modifier = housingUtilityModifiers.find(
          (m) => m.utilityName.toLowerCase() === t.name.toLowerCase(),
        );
        return sum + t.baseMonthlyAmount * (Number(modifier?.multiplier) ?? 1);
      }, 0);

      const optionCode = latestMonth.billReserveOptionCode || BillReserveOptionCode.high;
      const covPct = await this.getBillReserveCoveragePct(optionCode);
      const reserveTarget = Math.round((covPct / 100) * estimatedBills);
      const reserveStart = latestMonth.billReserveEnd;
      const reserveRefill = Math.max(0, reserveTarget - reserveStart);

      const jarOrder = [
        JarCode.fun,
        JarCode.learning,
        JarCode.give,
        JarCode.futureYou,
      ];

      const jarsCarryOver: Record<string, number> = {};

      for (const jarCode of jarOrder) {
        const allocation =
          latestMonth.allocations.find((a) => a.jarCode === jarCode)?.amount ??
          0;
        const spend = latestMonth.spendByJar.find((s) => s.jarCode === jarCode);
        const balance =
          Number(allocation) -
          (spend?.spentAmount ? Number(spend.spentAmount) : 0) +
          (spend?.overflowInAmount ? Number(spend.overflowInAmount) : 0) -
          (spend?.overflowOutAmount ? Number(spend.overflowOutAmount) : 0);
        jarsCarryOver[jarCode] = Math.max(0, balance);
      }

      const freeCashSpend = latestMonth.spendByJar.find(
        (s) => s.jarCode === 'free_cash',
      );
      const freeCashBalance = Math.max(
        0,
        latestMonth.freeCash -
          (freeCashSpend?.spentAmount ?? 0) +
          (freeCashSpend?.overflowInAmount ?? 0) -
          (freeCashSpend?.overflowOutAmount ?? 0),
      );

      const flexibleIncome =
        finalIncome - lockedTotal - estimatedBills - reserveRefill;

      return {
        monthIndex: latestMonth.monthIndex + 1,
        income: {
          baseIncome,
          overtimePay,
          absenceDeduction,
          finalIncome,
        },
        commitments: {
          lockedTotal,
        },
        bills: {
          estimated: estimatedBills,
        },
        billReserve: {
          target: reserveTarget,
          start: reserveStart,
          refill: reserveRefill,
        },
        carryOver: {
          jars: jarsCarryOver,
          freeCash: freeCashBalance,
        },
        structure: {
          flexibleIncome,
        },
      };
    });
  }
}
