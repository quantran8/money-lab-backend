import { TxClient } from '#app/prisma/transaction.runner.js';
import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '#app/prisma/prisma.service.js';

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
    data: Prisma.RunMonthUncheckedCreateInput,
    tx?: TxClient,
  ) {
    return this.client(tx).runMonth.create({ data });
  }

  async updateMonth(
    monthId: bigint,
    data: Prisma.RunMonthUpdateInput,
    tx?: TxClient,
  ) {
    return this.client(tx).runMonth.update({
      where: { id: monthId },
      data,
    });
  }

  /**
   * After OT accept: increments accepted_overtime_count and overtime_income_earned for the month.
   */
  async incrementOvertimeAcceptOnMonth(
    monthId: bigint,
    overtimeIncomeDelta: number,
    tx?: TxClient,
  ) {
    return this.client(tx).runMonth.update({
      where: { id: monthId },
      data: {
        acceptedOvertimeCount: { increment: 1 },
        overtimeIncomeEarned: { increment: overtimeIncomeDelta },
      },
    });
  }

  async createBillResolution(
    data: Prisma.MonthBillResolutionUncheckedCreateInput,
    tx?: TxClient,
  ) {
    return this.client(tx).monthBillResolution.create({ data });
  }

  async updateBillResolution(
    monthId: bigint,
    data: Prisma.MonthBillResolutionUpdateInput,
    tx?: TxClient,
  ) {
    return this.client(tx).monthBillResolution.update({
      where: { monthId },
      data,
    });
  }

  async createIndexResolution(
    data: Prisma.MonthIndexResolutionUncheckedCreateInput,
    tx?: TxClient,
  ) {
    return this.client(tx).monthIndexResolution.create({ data });
  }

  async updateIndexResolution(
    monthId: bigint,
    data: Prisma.MonthIndexResolutionUpdateInput,
    tx?: TxClient,
  ) {
    return this.client(tx).monthIndexResolution.update({
      where: { monthId },
      data,
    });
  }

  async upsertJar(
    monthId: bigint,
    jarCode: string,
    allocatedAmount: number,
    tx?: TxClient,
  ) {
    return this.client(tx).monthJar.upsert({
      where: {
        monthId_jarCode: { monthId: monthId, jarCode },
      },
      update: { allocatedAmount },
      create: {
        monthId: monthId,
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
    return this.client(tx).monthJar.upsert({
      where: {
        monthId_jarCode: { monthId: monthId, jarCode },
      },
      update: {},
      create: {
        monthId: monthId,
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
    return this.client(tx).monthJar.upsert({
      where: {
        monthId_jarCode: { monthId: monthId, jarCode },
      },
      update: {
        spentAmount: { increment: spent },
        overflowInAmount: { increment: overflowIn },
        overflowOutAmount: { increment: overflowOut },
      },
      create: {
        monthId: monthId,
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
    const template = await this.client(tx).lifeEventTemplate.findUniqueOrThrow({
      where: { id: eventTemplateId },
      select: { eventSource: true, eventSubtype: true },
    });
    return this.client(tx).monthEvent.upsert({
      where: {
        monthId_week_eventSource: {
          monthId,
          week,
          eventSource: template.eventSource,
        },
      },
      update: {},
      create: {
        monthId,
        eventTemplateId,
        week,
        eventSource: template.eventSource,
        eventSubtype: template.eventSubtype,
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
    return this.client(tx).monthEvent.update({
      where: { id: eventId },
      data: { chosenOptionId, paymentBreakdown },
    });
  }

  async updateWeeklyIndexProgress(
    monthId: bigint,
    week: number,
    payload: Record<string, unknown>,
    tx?: TxClient,
  ) {
    const client = tx ?? this.prisma;

    return client.$executeRawUnsafe(
      `
    UPDATE budget.month_index_resolution
    SET weekly_index_progress =
      COALESCE(weekly_index_progress, '{}'::jsonb) || jsonb_build_object($2, $3::jsonb)
    WHERE month_id = $1
    `,
      monthId,
      `week${week}`,
      JSON.stringify(payload),
    );
  }
}
