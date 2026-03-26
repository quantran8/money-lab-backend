import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BudgetMonthQuery } from '@budget-simulation/queries/month.query';
import { BudgetMonthRepository } from '@budget-simulation/repositories/month.repository';
import { CommitmentQuery } from '@budget-simulation/queries/commitment.query';
import { JarCode, SpendModeCode } from '@budget-simulation/budget-simulation.enum';
import type { WeeklySpendSummary, WeeklySpendResult } from '@budget-simulation/domain';
import { buildJarAvailableMap, computeWeeklySpend, jarAvailable } from '@budget-simulation/domain';
import type { BudgetSimulationModuleConfig } from '@budget-simulation/budget-simulation.constant';
import { TxClient } from '@app/prisma/transaction.runner';

/**
 * Handles jar spending only: compute weekly spend, apply spend log, jar availability.
 */
@Injectable()
export class MonthSpendService {
  constructor(
    private readonly monthQuery: BudgetMonthQuery,
    private readonly monthRepository: BudgetMonthRepository,
    private readonly commitmentQuery: CommitmentQuery,
  ) {}

  async getSpendModeRate(code: string): Promise<number> {
    const option = await this.commitmentQuery.findSpendModeOptionByCode(code);
    if (!option)
      throw new BadRequestException(`Invalid spend_mode_code: ${code}`);
    return Number(option.rate);
  }

  async getJarAvailable(
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
    return jarAvailable(
      Number(jar.allocatedAmount),
      Number(jar.spentAmount),
      Number(jar.overflowInAmount),
      Number(jar.overflowOutAmount),
    );
  }

  async addSpendLog(
    monthId: bigint,
    jarCode: string,
    spent: number,
    overflowIn: number,
    overflowOut: number,
    tx?: TxClient,
  ): Promise<void> {
    await this.monthRepository.incrementJarSpend(
      monthId,
      jarCode,
      spent,
      overflowIn,
      overflowOut,
      tx,
    );
  }

  /**
   * Compute weekly jar spend in memory from preloaded month and jars. Returns entries for response and spend ops for writes.
   */
  computeWeeklySpend(
    month: {
      id: bigint;
      budgetRunId: bigint;
      monthIndex: number;
      spendModeCode?: string | null;
    },
    jars: {
      jarCode: string;
      allocatedAmount: unknown;
      spentAmount: unknown;
      overflowInAmount: unknown;
      overflowOutAmount: unknown;
    }[],
    spendModeRate: number,
    nextWeek: number,
    playerHI: number,
    currentJobLevel: number,
    config: BudgetSimulationModuleConfig,
  ): WeeklySpendResult {
    const spendModeCode = month.spendModeCode ?? SpendModeCode.normal;
    const jarStates = jars.map((j) => ({
      jarCode: j.jarCode,
      allocated: Number(j.allocatedAmount),
      spent: Number(j.spentAmount),
      overflowIn: Number(j.overflowInAmount),
      overflowOut: Number(j.overflowOutAmount),
    }));
    return computeWeeklySpend({
      jars: jarStates,
      spendModeRate,
      spendModeCode,
      monthIndex: month.monthIndex,
      nextWeek,
      budgetRunId: String(month.budgetRunId),
      monthId: String(month.id),
      playerHI,
      currentJobLevel,
      config,
    });
  }

  /**
   * Load month + jars, compute weekly spend, persist via addSpendLog. Returns entries, weeklySpend, and learningXpDelta for response.
   */
  async applyWeeklySpend(
    monthId: bigint,
    nextWeek: number,
    playerHI: number,
    currentJobLevel: number,
    config: BudgetSimulationModuleConfig,
    tx?: TxClient,
  ): Promise<{
    entries: { type: string; jar: string; amount: number; jarBalance: number; label: string }[];
    weeklySpend: WeeklySpendSummary;
    learningXpDelta: number;
  }> {
    const [month, jars] = await Promise.all([
      this.monthQuery.findMonthById(monthId, tx),
      this.monthQuery.findJarsForMonth(
        monthId,
        [JarCode.fun, JarCode.learning, JarCode.give],
        tx,
      ),
    ]);
    if (!month) throw new NotFoundException('Month not found');
    const spendModeCode = month.spendModeCode ?? SpendModeCode.normal;
    const rate = await this.getSpendModeRate(spendModeCode);
    const result = this.computeWeeklySpend(
      { ...month, budgetRunId: month.budgetRunId!, id: month.id },
      jars,
      rate,
      nextWeek,
      playerHI,
      currentJobLevel,
      config,
    );
    for (const op of result.spendOps) {
      await this.addSpendLog(monthId, op.jarCode, op.amount, 0, 0, tx);
    }
    return { entries: result.entries, weeklySpend: result.weeklySpend, learningXpDelta: result.learningXpDelta };
  }

  /**
   * Get available amount for a jar from pre-loaded month with jars (no DB).
   */
  jarAvailableFromLoaded(
    month: { freeCash: unknown },
    jars: {
      jarCode: string;
      allocatedAmount: unknown;
      spentAmount: unknown;
      overflowInAmount: unknown;
      overflowOutAmount: unknown;
    }[],
    jarCode: string,
  ): number {
    const jarStates = jars.map((j) => ({
      jarCode: j.jarCode,
      allocated: Number(j.allocatedAmount),
      spent: Number(j.spentAmount),
      overflowIn: Number(j.overflowInAmount),
      overflowOut: Number(j.overflowOutAmount),
    }));
    const map = buildJarAvailableMap(Number(month.freeCash ?? 0), jarStates);
    return map.get(jarCode) ?? 0;
  }
}
