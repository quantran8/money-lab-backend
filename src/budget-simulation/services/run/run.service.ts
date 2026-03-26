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
import {
  CommitmentLayer,
  JarCode,
} from '@budget-simulation/budget-simulation.enum';
import {
  BILL_RESERVE_OPTIONS,
  DEFAULT_HI_START,
  DEFAULT_JOB_LEVEL,
  DEFAULT_JOB_XP,
  DEFAULT_LQI_START,
  FIRST_MONTH_INDEX,
  FREE_CASH_CODE,
} from '@budget-simulation/budget-simulation.constant';
import { resolveLqiState } from '@budget-simulation/budget-simulation.helpers';
import { BudgetSimulationConfigService } from '../config.service';
import type {
  OptionalCommitmentUpdateInput,
  UpdateRunCommitmentsResult,
} from '@budget-simulation/types/run-commitment.types';
import { BudgetSimulationRunCommitmentService } from './run-commitment.service';
import { BudgetSimulationRunStateService } from './run-state.service';
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
    private readonly configService: BudgetSimulationConfigService,
    private readonly runCommitments: BudgetSimulationRunCommitmentService,
    private readonly runState: BudgetSimulationRunStateService,
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
    return this.runState.getActiveBudgetRun(userId);
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
              level: DEFAULT_JOB_LEVEL,
              xp: DEFAULT_JOB_XP,
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
            effectiveFromMonthIndex: FIRST_MONTH_INDEX,
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
      const [run, prevMonth] = await Promise.all([
        this.runQuery.findRunWithJobState(runIdBig),
        this.monthQuery.findPreviousMonth(runIdBig),
      ]);
      if (!run || run.userId !== userId)
        throw new ForbiddenException('Forbidden or Run not found');

      const covPct = this.getBillReserveCoveragePctSync(billReserveOptionCode);

      const monthIndex = (prevMonth?.monthIndex ?? 0) + 1;
      const coreJars = Object.values(JarCode) as string[];

      const [commitments, prevJars] = await Promise.all([
        this.runQuery.findActiveCommitmentsForMonth(runIdBig, monthIndex),
        prevMonth
          ? this.monthQuery.findJarsForMonth(prevMonth.id, coreJars)
          : Promise.resolve([]),
      ]);

      let prevMonthFreeCashBalance = 0;
      let prevJarBalances: Record<string, number> = {};
      const jarsRefillNeeded = { ...allocations };

      if (prevMonth) {
        prevMonthFreeCashBalance = Math.max(0, Number(prevMonth.freeCash ?? 0));

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
        DEFAULT_HI_START;
      const lqiStart =
        prevMonth?.indexResolution?.lqiEnd ??
        prevMonth?.indexResolution?.lqiStart ??
        DEFAULT_LQI_START;
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

      const housingUtilityModifiers =
        this.configService.getHousingModifiersByCommitmentIds(housingIds);
      const billTemplates = this.configService.getBillTemplates();

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

      const monthFreeCash = leftToAllocate - allocSum;

      const cumulativeFreeCash = prevMonthFreeCashBalance + monthFreeCash;
      const cumulativeFutureYou =
        prevMonth?.cumulativeFutureYou ?? allocations[JarCode.futureYou] ?? 0;

      if (allocSum > leftToAllocate && cumulativeFreeCash < 0)
        throw new BadRequestException(
          'Overspending: allocations > left_to_allocate',
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
            cumulativeFutureYou: cumulativeFutureYou,
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
          cumulativeFutureYou: cumulativeFutureYou,
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
    return this.runState.prepareNextMonth(userId, runId);
  }
}
