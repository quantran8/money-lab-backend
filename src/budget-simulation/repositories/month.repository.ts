import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '@prisma/prisma.service';
import type { TxClient } from '../budget-simulation.constant';

/**
 * Write operations for budget months, bill/index resolution, jars, and events.
 * Pass tx when running inside a transaction.
 */
@Injectable()
export class BudgetMonthRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: TxClient) {
    return tx ?? this.prisma;
  }

  async createMonth(
    data: Prisma.BudgetRunMonthUncheckedCreateInput,
    tx?: TxClient,
  ) {
    return this.client(tx).budgetRunMonth.create({ data });
  }

  async updateMonth(
    monthId: bigint,
    data: Prisma.BudgetRunMonthUpdateInput,
    tx?: TxClient,
  ) {
    return this.client(tx).budgetRunMonth.update({
      where: { id: monthId },
      data,
    });
  }

  async createBillResolution(
    data: Prisma.BudgetMonthBillResolutionUncheckedCreateInput,
    tx?: TxClient,
  ) {
    return this.client(tx).budgetMonthBillResolution.create({ data });
  }

  async updateBillResolution(
    budgetMonthId: bigint,
    data: Prisma.BudgetMonthBillResolutionUpdateInput,
    tx?: TxClient,
  ) {
    return this.client(tx).budgetMonthBillResolution.update({
      where: { budgetMonthId },
      data,
    });
  }

  async createIndexResolution(
    data: Prisma.BudgetMonthIndexResolutionUncheckedCreateInput,
    tx?: TxClient,
  ) {
    return this.client(tx).budgetMonthIndexResolution.create({ data });
  }

  async updateIndexResolution(
    budgetMonthId: bigint,
    data: Prisma.BudgetMonthIndexResolutionUpdateInput,
    tx?: TxClient,
  ) {
    return this.client(tx).budgetMonthIndexResolution.update({
      where: { budgetMonthId },
      data,
    });
  }

  async upsertJar(
    monthId: bigint,
    jarCode: string,
    allocatedAmount: number,
    tx?: TxClient,
  ) {
    return this.client(tx).budgetMonthJar.upsert({
      where: {
        budgetMonthId_jarCode: { budgetMonthId: monthId, jarCode },
      },
      update: { allocatedAmount },
      create: {
        budgetMonthId: monthId,
        jarCode,
        allocatedAmount,
        spentAmount: 0,
        overflowInAmount: 0,
        overflowOutAmount: 0,
        remainingBalanceEnd: 0,
      },
    });
  }

  async ensureJarExists(monthId: bigint, jarCode: string, tx?: TxClient) {
    return this.client(tx).budgetMonthJar.upsert({
      where: {
        budgetMonthId_jarCode: { budgetMonthId: monthId, jarCode },
      },
      update: {},
      create: {
        budgetMonthId: monthId,
        jarCode,
        allocatedAmount: 0,
        spentAmount: 0,
        overflowInAmount: 0,
        overflowOutAmount: 0,
        remainingBalanceEnd: 0,
      },
    });
  }

  async incrementJarSpend(
    monthId: bigint,
    jarCode: string,
    spent: number,
    overflowIn: number,
    overflowOut: number,
    tx?: TxClient,
  ) {
    return this.client(tx).budgetMonthJar.upsert({
      where: {
        budgetMonthId_jarCode: { budgetMonthId: monthId, jarCode },
      },
      update: {
        spentAmount: { increment: spent },
        overflowInAmount: { increment: overflowIn },
        overflowOutAmount: { increment: overflowOut },
      },
      create: {
        budgetMonthId: monthId,
        jarCode,
        allocatedAmount: 0,
        spentAmount: spent,
        overflowInAmount: overflowIn,
        overflowOutAmount: overflowOut,
        remainingBalanceEnd: 0,
      },
    });
  }

  async createEventWithTemplate(
    monthId: bigint,
    eventTemplateId: bigint,
    week: number,
    tx?: TxClient,
  ) {
    return this.client(tx).budgetMonthEvent.create({
      data: {
        budgetMonthId: monthId,
        eventTemplateId,
        week,
      },
      include: {
        template: {
          include: { options: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
  }

  async updateEventChosen(
    eventId: bigint,
    chosenOptionId: bigint,
    paymentBreakdown: Prisma.InputJsonValue,
    tx?: TxClient,
  ) {
    return this.client(tx).budgetMonthEvent.update({
      where: { id: eventId },
      data: { chosenOptionId, paymentBreakdown },
    });
  }

  async updateWeeklyIndexProgress(
    budgetMonthId: bigint,
    week: number,
    payload: Record<string, unknown>,
    tx?: TxClient,
  ) {
    const client = tx ?? this.prisma;

    return client.$executeRawUnsafe(
      `
    UPDATE budget_month_index_resolution
    SET weekly_index_progress =
      COALESCE(weekly_index_progress, '{}'::jsonb) || jsonb_build_object($2, $3::jsonb)
    WHERE budget_month_id = $1
    `,
      budgetMonthId,
      `week${week}`,
      JSON.stringify(payload),
    );
  }
}
