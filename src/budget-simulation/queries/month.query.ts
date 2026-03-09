import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Read-only data access for budget months, allocations, spend-by-jar, and life events.
 * Write operations are in BudgetMonthRepository.
 */
@Injectable()
export class BudgetMonthQuery {
  constructor(private readonly prisma: PrismaService) {}

  /** Previous month for a run (by monthIndex desc). */
  async findPreviousMonth(runId: bigint) {
    return this.prisma.budgetRunMonth.findFirst({
      where: { budgetRunId: runId },
      orderBy: { monthIndex: 'desc' },
    });
  }

  /** Month by id with budgetRun (for auth and runId). */
  async findMonthWithRun(monthId: bigint) {
    return this.prisma.budgetRunMonth.findUnique({
      where: { id: monthId },
      include: { budgetRun: true },
    });
  }

  /** Month by id with spendByJar. */
  async findMonthWithSpendByJar(monthId: bigint) {
    return this.prisma.budgetRunMonth.findUnique({
      where: { id: monthId },
      include: { spendByJar: true },
    });
  }

  /** Month by id with budgetRun and module (for spawnEvent). */
  async findMonthWithRunAndModule(monthId: bigint) {
    return this.prisma.budgetRunMonth.findUnique({
      where: { id: monthId },
      include: { budgetRun: { include: { module: true } } },
    });
  }

  /** Month by id (minimal). */
  async findMonthById(monthId: bigint) {
    return this.prisma.budgetRunMonth.findUnique({
      where: { id: monthId },
    });
  }

  /** Allocations for a month, optionally filtered by jar codes. */
  async findAllocationsForMonth(
    monthId: bigint,
    jarCodes?: string[],
  ) {
    return this.prisma.budgetMonthAllocation.findMany({
      where: {
        budgetMonthId: monthId,
        ...(jarCodes?.length ? { jarCode: { in: jarCodes } } : {}),
      },
    });
  }

  /** Spend-by-jar rows for a month, optionally filtered by jar codes. */
  async findSpendByJarForMonth(
    monthId: bigint,
    jarCodes?: string[],
  ) {
    return this.prisma.budgetMonthSpendByJar.findMany({
      where: {
        budgetMonthId: monthId,
        ...(jarCodes?.length ? { jarCode: { in: jarCodes } } : {}),
      },
    });
  }

  /** Single allocation by month and jar. */
  async findAllocationByMonthAndJar(monthId: bigint, jarCode: string) {
    return this.prisma.budgetMonthAllocation.findUnique({
      where: {
        budgetMonthId_jarCode: { budgetMonthId: monthId, jarCode },
      },
    });
  }

  /** Single spend-by-jar by month and jar. */
  async findSpendByJarByMonthAndJar(monthId: bigint, jarCode: string) {
    return this.prisma.budgetMonthSpendByJar.findUnique({
      where: {
        budgetMonthId_jarCode: { budgetMonthId: monthId, jarCode },
      },
    });
  }

  /** Pending event (unchosen) for week. */
  async findPendingEvent(monthId: bigint, week: number) {
    return this.prisma.budgetMonthEvent.findFirst({
      where: {
        budgetMonthId: monthId,
        week,
        chosenOptionId: null,
      },
    });
  }

  /** Pending event with template and options. */
  async findPendingEventWithTemplate(monthId: bigint, week: number) {
    return this.prisma.budgetMonthEvent.findFirst({
      where: {
        budgetMonthId: monthId,
        week,
        chosenOptionId: null,
      },
      include: {
        template: {
          include: { options: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
  }

  /** Event template ids used in a run in a month range. */
  async findUsedEventTemplateIds(
    runId: bigint,
    fromMonthIndex: number,
    toMonthIndex: number,
  ) {
    const events = await this.prisma.budgetMonthEvent.findMany({
      where: {
        month: {
          budgetRunId: runId,
          monthIndex: {
            gte: fromMonthIndex,
            lte: toMonthIndex,
          },
        },
      },
      select: { eventTemplateId: true },
    });
    return events.map((e) => e.eventTemplateId);
  }

  /** Life event templates for module, excluding given ids. */
  async findLifeEventTemplatesForModule(
    moduleId: number,
    excludeTemplateIds: bigint[],
  ) {
    return this.prisma.lifeEventTemplate.findMany({
      where: {
        moduleId,
        id: excludeTemplateIds.length ? { notIn: excludeTemplateIds } : undefined,
      },
    });
  }

  async findLifeEventOptionById(optionId: bigint) {
    return this.prisma.lifeEventOption.findUnique({
      where: { id: optionId },
    });
  }
}
