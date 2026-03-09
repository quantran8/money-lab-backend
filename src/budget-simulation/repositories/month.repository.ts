import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { TxClient } from './run.repository';

/**
 * Write operations for budget months, allocations, spend-by-jar, and events.
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

  async upsertAllocation(
    monthId: bigint,
    jarCode: string,
    amount: number,
    tx?: TxClient,
  ) {
    return this.client(tx).budgetMonthAllocation.upsert({
      where: {
        budgetMonthId_jarCode: { budgetMonthId: monthId, jarCode },
      },
      update: { amount },
      create: { budgetMonthId: monthId, jarCode, amount },
    });
  }

  async ensureAllocationExists(monthId: bigint, jarCode: string, tx?: TxClient) {
    return this.client(tx).budgetMonthAllocation.upsert({
      where: {
        budgetMonthId_jarCode: { budgetMonthId: monthId, jarCode },
      },
      update: {},
      create: { budgetMonthId: monthId, jarCode, amount: 0 },
    });
  }

  async upsertSpendByJar(
    monthId: bigint,
    jarCode: string,
    spent: number,
    overflowIn: number,
    overflowOut: number,
    tx?: TxClient,
  ) {
    return this.client(tx).budgetMonthSpendByJar.upsert({
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
        spentAmount: spent,
        overflowInAmount: overflowIn,
        overflowOutAmount: overflowOut,
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
}
