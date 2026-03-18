import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { wrapAsync } from '@common/utils/async.utils';
import { BudgetRunQuery } from '@budget-simulation/queries/run.query';
import { BudgetRunRepository } from '@budget-simulation/repositories/run.repository';
import { BudgetMonthQuery } from '@budget-simulation/queries/month.query';
import { BudgetMonthRepository } from '@budget-simulation/repositories/month.repository';
import { CommitmentQuery } from '@budget-simulation/queries/commitment.query';
import {
  BillReserveOptionCode,
  CommitmentLayer,
  JarCode,
} from '@budget-simulation/budget-simulation.enum';
import { BILL_RESERVE_OPTIONS, FREE_CASH_CODE } from '@budget-simulation/budget-simulation.constant';
import { resolveLqiState } from '@budget-simulation/budget-simulation.helpers';
import { BudgetSimulationConfigService } from '../config.service';
import type {
  OptionalCommitmentUpdateInput,
  UpdateRunCommitmentsResult,
} from '@budget-simulation/types/run-commitment.types';
import { BudgetSimulationRunCommitmentService } from './run-commitment.service';
import {
  calculateMonthIncome,
  resolveBaseJobIncome,
} from '@budget-simulation/domain';
import { TransactionRunner, TxClient } from '@app/prisma/transaction.runner';

/**
 * Aggregate run service. Sub-services live under services/run/ (e.g. run-commitment.service).
 */
@Injectable()
export class BudgetSimulationRunService {
  private readonly logger = new Logger(BudgetSimulationRunService.name);

  constructor(
    private readonly transactionRunner: TransactionRunner,
    private readonly runQuery: BudgetRunQuery,
    private readonly runRepository: BudgetRunRepository,
    private readonly monthQuery: BudgetMonthQuery,
    private readonly monthRepository: BudgetMonthRepository,
    private readonly commitmentQuery: CommitmentQuery,
    private readonly configService: BudgetSimulationConfigService,
    private readonly runCommitments: BudgetSimulationRunCommitmentService,
  ) {}

  async updateRunCommitments(
    userId: string,
    runId: number,
    commitmentAmounts: Record<number, number>,
    optionals?: OptionalCommitmentUpdateInput[],
  ): Promise<UpdateRunCommitmentsResult> {
    return this.runCommitments.updateRunCommitments(
      userId,
      runId,
      commitmentAmounts,
      optionals,
    );
  }

  /**
   * Returns bill reserve coverage percentage for a given option code.
   * Uses constant lookup (no DB). Throws if code is invalid.
   */
  private getBillReserveCoveragePctSync(code: string): number {
    const option = BILL_RESERVE_OPTIONS.find((x) => x.code === code);
    if (!option)
      throw new BadRequestException(
        `Invalid bill_reserve_option_code: ${code}`,
      );
    return option.coveragePct;
  }

  /**
   * Upserts jar allocations for a month, then ensures core jars exist.
   * Writes run in parallel (order not required).
   */
  private async upsertMonthAllocations(
    monthId: bigint,
    allocations: Record<string, number>,
    tx?: TxClient,
  ) {
    const coreJars = Object.values(JarCode);
    const upsertEntries = Object.entries(allocations).filter(
      ([code]) => code !== FREE_CASH_CODE,
    );
    await Promise.all([
      ...upsertEntries.map(([jarCode, amount]) =>
        this.monthRepository.upsertJar(monthId, jarCode, amount, tx),
      ),
      ...coreJars.map((jarCode) =>
        this.monthRepository.ensureJarExists(monthId, jarCode, tx),
      ),
    ]);
  }

  async getActiveBudgetRun(userId: string) {
    return wrapAsync(this.logger, 'getActiveBudgetRun', async () => {
      const run = await this.runQuery.findActiveRunWithDetails(userId);
      if (!run) return null;

      const activeMonthIndex = run.months[0]?.monthIndex ?? 1;
      const activeCommitments =
        await this.runQuery.findActiveCommitmentsForMonth(
          run.id,
          activeMonthIndex,
        );

      const housingId = activeCommitments.find(
        (c) => c.template.category === 'housing',
      )?.template.id;
      const [billTemplates, housingUtilityModifiers] = await Promise.all([
        this.commitmentQuery.findBillTemplates(run.moduleId),
        housingId
          ? this.commitmentQuery.findHousingModifiersByCommitmentIds([
              housingId,
            ])
          : Promise.resolve([]),
      ]);

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
      const jarsArr =
        latestMonth?.jars.filter((j) => j.jarCode !== FREE_CASH_CODE) ?? [];

      const freeCashAlloc = latestMonth?.freeCash ?? 0;
      const freeCashJar = latestMonth?.jars.find(
        (j) => j.jarCode === FREE_CASH_CODE,
      );
      const freeCashBalance = freeCashJar
        ? Number(freeCashJar.allocatedAmount) -
          Number(freeCashJar.spentAmount) +
          Number(freeCashJar.overflowInAmount) -
          Number(freeCashJar.overflowOutAmount)
        : freeCashAlloc;

      const necessitiesTotal =
        (latestMonth?.lockedCommitmentsTotal ?? 0) +
        (latestMonth?.billsEstimated ?? 0) +
        (latestMonth?.billResolution?.billReserveTarget ?? 0);

      const result = {
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
          ...activeCommitments.map((c) => ({
            templateId: c.commitmentTemplateId.toString(),
            name: c.template.name,
            layer: c.template.layer,
            amount: c.selectedAmount,
          })),
          ...billEstimatedTemplates,
        ],
        jars: jarsArr.reduce(
          (acc, curr) => {
            const balance =
              Number(curr.allocatedAmount) -
              Number(curr.spentAmount) +
              Number(curr.overflowInAmount) -
              Number(curr.overflowOutAmount);
            acc[curr.jarCode] = {
              allocation: Number(curr.allocatedAmount),
              balance,
            };
            return acc;
          },
          {} as Record<string, { allocation: number; balance: number }>,
        ),
      };
      return result;
    });
  }

  async startBudgetRun(
    userId: string,
    moduleId: number,
    jobId: number,
    commitmentAmounts: Record<number, number>,
  ) {
    return wrapAsync(this.logger, 'startBudgetRun', async () => {
      const jobIdBig = BigInt(jobId);
      const [job, jobState] = await Promise.all([
        this.runQuery.findJobWithLevel1(jobIdBig),
        this.runQuery.findLatestUserJobState(userId, jobIdBig),
      ]);
      if (!job) throw new NotFoundException('Job not found');

      const level1 = job.levels[0] ?? null;
      const income = resolveBaseJobIncome(job, level1);

      const result = await this.transactionRunner.run(async (tx) => {
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
            jobStateId: state?.id ?? 0,
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
            effectiveFromMonthIndex: 1,
            effectiveToMonthIndex: null,
          }),
        );

        await this.runRepository.createRunCommitments(commitments, tx);

        return {
          runId: run.id.toString(),
          jobStateId: state?.id.toString() ?? '0',
        };
      });
      return result;
    });
  }

  /**
   * Starts a new month: creates month record and sets jar allocations.
   * If previous month exists, next month allocation per jar = allocation target - prev balance
   * (prev balance = jar allocation - jar spending for that month).
   */
  async startMonth(
    userId: string,
    runId: number,
    allocations: Record<string, number>,
    billReserveOptionCode: string,
    spendModeCode: string,
  ) {
    return wrapAsync(this.logger, 'startMonth', async () => {
      const runIdBig = BigInt(runId);
      const run = await this.runQuery.findRunWithJobState(runIdBig);
      if (!run || run.userId !== userId)
        throw new ForbiddenException('Forbidden or Run not found');

      const covPct = this.getBillReserveCoveragePctSync(billReserveOptionCode);

      const prevMonth = await this.monthQuery.findPreviousMonth(runIdBig);
      const monthIndex = (prevMonth?.monthIndex ?? 0) + 1;
      const commitments = await this.runQuery.findActiveCommitmentsForMonth(
        runIdBig,
        monthIndex,
      );

      const coreJars = Object.values(JarCode) as string[];
      let prevMonthFreeCashBalance = 0;
      let prevJarBalances: Record<string, number> = {};
      const jarsRefillNeeded = { ...allocations };

      if (prevMonth) {
        prevMonthFreeCashBalance = Math.max(0, Number(prevMonth.freeCash ?? 0));

        const prevJars = await this.monthQuery.findJarsForMonth(
          prevMonth.id,
          coreJars,
        );
        const allocByJar = Object.fromEntries(
          prevJars.map((j) => [j.jarCode, Number(j.allocatedAmount)]),
        );
        const spendByJar = Object.fromEntries(
          prevJars.map((j) => [
            j.jarCode,
            {
              spent: Number(j.spentAmount),
              overflowIn: Number(j.overflowInAmount),
              overflowOut: Number(j.overflowOutAmount),
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
          const target = allocations[jar] ?? 0;
          const remain = prevJarBalances[jar] ?? 0;
          jarsRefillNeeded[jar] = Math.max(0, target - remain);
          if (jar === JarCode.futureYou) {
            jarsRefillNeeded[jar] = target;
          }
        }
      }

      const hiStart =
        prevMonth?.indexResolution?.hiEnd ??
        prevMonth?.indexResolution?.hiStart ??
        70;
      const lqiStart =
        prevMonth?.indexResolution?.lqiEnd ??
        prevMonth?.indexResolution?.lqiStart ??
        70;
      const stress = prevMonth?.structuralOvercommitmentOccurred ?? false;
      const billReserveStart = prevMonth?.billResolution?.billReserveEnd ?? 0;

      const lockedTotal = commitments
        .filter((c) => c.template.layer === CommitmentLayer.locked)
        .reduce((sum, c) => sum + c.selectedAmount, 0);

      const foodReserve = commitments
        .filter((c) => c.template.category === 'food')
        .reduce((sum, c) => sum + c.selectedAmount, 0);

      const housingIds = commitments
        .filter((c) => c.template.category === 'housing')
        .map((c) => c.commitmentTemplateId);

      const [housingUtilityModifiers, billTemplates] = await Promise.all([
        this.commitmentQuery.findHousingModifiersByCommitmentIds(housingIds),
        this.commitmentQuery.findBillTemplatesByLayer(3, CommitmentLayer.bills),
      ]);

      const billsEstimated = billTemplates.reduce((sum, t) => {
        const modifier = housingUtilityModifiers.find(
          (m) => m.utilityName.toLowerCase() === t.name.toLowerCase(),
        );
        return sum + t.baseMonthlyAmount * (Number(modifier?.multiplier) ?? 1);
      }, 0);

      const job = run.jobState.job;
      const level =
        job.levels.find((l) => l.level === run.jobState.level) ?? job.levels[0];
      const prevOt = prevMonth
        ? Number(prevMonth.overtimeIncomeEarned ?? 0)
        : 0;
      const income = calculateMonthIncome({
        job,
        jobLevel: level,
        previousMonthOvertimeIncomeEarned: prevOt,
      });

      const billReserveTarget = Math.round((covPct / 100) * billsEstimated);
      const topUpNeeded = Math.max(0, billReserveTarget - billReserveStart);
      const billReserveEnd = billReserveStart + topUpNeeded;

      const necTotal = lockedTotal + foodReserve + billsEstimated + topUpNeeded;
      const leftToAllocate = income - necTotal;

      if (leftToAllocate < 0)
        throw new BadRequestException('Guardrail failed: left_to_allocate < 0');

      const allocSum = Object.values(jarsRefillNeeded).reduce(
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
        prevMonthFreeCashBalance + monthFreeCash,
      );

      const result = await this.transactionRunner.run(async (tx) => {
        const month = await this.monthRepository.createMonth(
          {
            budgetRunId: BigInt(runId),
            monthIndex,
            income,
            lockedCommitmentsTotal: lockedTotal,
            billsEstimated,
            billsActual: null,
            billReserveOptionCode,
            spendModeCode,
            cumulativeFutureYou: prevMonth?.cumulativeFutureYou ?? 0,
            freeCash: cumulativeFreeCash,
            currentWeek: 0,
            stressModeActive: stress,
          },
          tx,
        );

        await this.monthRepository.createBillResolution(
          {
            budgetMonthId: month.id,
            billReserveTarget,
            billReserveStart,
            billReserveEnd,
          },
          tx,
        );
        const config = this.configService.getConfig();
        const lqiStateStart = resolveLqiState(lqiStart, config);
        await this.monthRepository.createIndexResolution(
          {
            budgetMonthId: month.id,
            hiStart,
            hiEnd: hiStart,
            lqiStart,
            lqiEnd: lqiStart,
            lqiStateStart,
            lqiStateEnd: lqiStateStart,
          },
          tx,
        );

        await this.upsertMonthAllocations(month.id, allocations, tx);

        await this.runRepository.updateUserJobState(
          run.jobState.id,
          { currentMonthlyIncome: income, updatedAt: new Date() },
          tx,
        );

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
      return result;
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

      const nextMonthIndex = latestMonth.monthIndex + 1;
      const nextMonthCommitments =
        await this.runQuery.findActiveCommitmentsForMonth(
          runIdBig,
          nextMonthIndex,
        );

      const jobState = run.jobState;
      const currentLevel =
        jobState.job.levels.find((l) => l.level === jobState.level) ||
        jobState.job.levels[0];
      const resolvedBase = resolveBaseJobIncome(jobState.job, currentLevel);
      const overtimeCarriedFromPriorMonth = Number(
        latestMonth.overtimeIncomeEarned ?? 0,
      );
      const absenceDeduction =
        latestMonth.indexResolution?.incomeLossFromForcedRest ?? 0;
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

      const [housingUtilityModifiers, billTemplates] = await Promise.all([
        housingIds.length > 0
          ? this.commitmentQuery.findHousingModifiersByCommitmentIds(housingIds)
          : Promise.resolve([]),
        this.commitmentQuery.findBillTemplatesByLayer(
          run.moduleId,
          CommitmentLayer.bills,
        ),
      ]);

      const estimatedBills = billTemplates.reduce((sum, t) => {
        const modifier = housingUtilityModifiers.find(
          (m) => m.utilityName.toLowerCase() === t.name.toLowerCase(),
        );
        return sum + t.baseMonthlyAmount * (Number(modifier?.multiplier) ?? 1);
      }, 0);

      const optionCode =
        latestMonth.billReserveOptionCode || BillReserveOptionCode.high;
      const covPct = this.getBillReserveCoveragePctSync(optionCode);
      const reserveTarget = Math.round((covPct / 100) * estimatedBills);
      const reserveStart = latestMonth.billResolution?.billReserveEnd ?? 0;
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
        const jar = latestMonth.jars.find((j) => j.jarCode === jarCode);
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

      const lastMonthFreeCash = latestMonth.freeCash;

      const flexibleIncome =
        finalIncome - lockedTotal - estimatedBills - reserveRefill;

      const nextMonthFreeCash =
        flexibleIncome - lastMonthTotalAllocated + lastMonthJarsRemaining;

      const freeCashBalance = Math.max(
        0,
        lastMonthFreeCash + nextMonthFreeCash,
      );

      const result = {
        monthIndex: latestMonth.monthIndex + 1,
        income: {
          resolvedBaseJobIncome: resolvedBase,
          overtimeIncomeEarnedFromPriorMonth: overtimeCarriedFromPriorMonth,
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
        jarRefill,
        freeCash: {
          current: lastMonthFreeCash,
          nextMonth: nextMonthFreeCash,
          total: freeCashBalance,
        },
        structure: {
          flexibleIncome,
        },
      };
      return result;
    });
  }
}
