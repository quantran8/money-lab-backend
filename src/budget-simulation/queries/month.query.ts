import { Injectable } from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  EVENT_SOURCE_LIFE,
  EVENT_SOURCE_WORK,
  EVENT_SUBTYPE_OVERTIME,
} from '../budget-simulation.constant';
import type {
  MonthPreviousRow,
  MonthWithRun,
  MonthWithRunAndJobLevel,
  MonthWithRunAndJobLevelAndJars,
  MonthWithJars,
  MonthWithRunAndJars,
  MonthWithRunAndModule,
  BudgetMonthJarRow,
  PendingBudgetMonthEventRow,
  PendingEventWithTemplateRow,
  ChosenEventsTotalsResult,
} from '../types/month.types';
import type {
  LifeEventTemplateRow,
  ModuleEventPoolWeightRow,
  LifeEventOptionRow,
} from '../types/event.types';
import { TxClient } from '@app/prisma/transaction.runner';

/**
 * Read-only data access for budget months, jars, bill/index resolution, and life events.
 * Write operations are in BudgetMonthRepository.
 */
@Injectable()
export class BudgetMonthQuery {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: TxClient) {
    return tx ?? this.prisma;
  }

  /** Previous month for a run (by monthIndex desc). */
  async findPreviousMonth(
    runId: bigint,
    tx?: TxClient,
  ): Promise<MonthPreviousRow | null> {
    return this.client(tx).budgetRunMonth.findFirst({
      where: { budgetRunId: runId },
      orderBy: { monthIndex: 'desc' },
      include: { billResolution: true, indexResolution: true },
    });
  }

  /** Month by id with budgetRun (for auth and runId). Pass tx when inside a transaction so reads see uncommitted updates. */
  async findMonthWithRun(
    monthId: bigint,
    tx?: TxClient,
  ): Promise<MonthWithRun | null> {
    return this.client(tx).budgetRunMonth.findUnique({
      where: { id: monthId },
      include: { budgetRun: true, billResolution: true, indexResolution: true },
    });
  }

  /** Month with run and jobState + job.levels (for resolveWeek forced rest income loss). Pass tx when inside a transaction. */
  async findMonthWithRunAndJobLevel(
    monthId: bigint,
    tx?: TxClient,
  ): Promise<MonthWithRunAndJobLevel | null> {
    return this.client(tx).budgetRunMonth.findUnique({
      where: { id: monthId },
      include: {
        budgetRun: {
          include: {
            jobState: {
              include: {
                job: { include: { levels: true } },
              },
            },
          },
        },
        billResolution: true,
        indexResolution: true,
      },
    });
  }

  /** Month with run, job levels, module, and jars in one read (resolveWeek load phase). */
  async findMonthWithRunAndJobLevelAndJars(
    monthId: bigint,
  ): Promise<MonthWithRunAndJobLevelAndJars | null> {
    return this.prisma.budgetRunMonth.findUnique({
      where: { id: monthId },
      include: {
        budgetRun: {
          include: {
            jobState: {
              include: {
                job: { include: { levels: true } },
              },
            },
            module: true,
          },
        },
        billResolution: true,
        indexResolution: true,
        jars: true,
      },
    });
  }

  /** Month by id with jars. */
  async findMonthWithJars(monthId: bigint): Promise<MonthWithJars | null> {
    return this.prisma.budgetRunMonth.findUnique({
      where: { id: monthId },
      include: { jars: true, billResolution: true, indexResolution: true },
    });
  }

  /** Month by id with run, jobState (for index resolution), and jars (for applyEventChoice: auth + payment + index in one read). */
  async findMonthWithRunAndJars(
    monthId: bigint,
  ): Promise<MonthWithRunAndJars | null> {
    return this.prisma.budgetRunMonth.findUnique({
      where: { id: monthId },
      include: {
        budgetRun: {
          include: {
            jobState: {
              include: {
                job: { include: { levels: true } },
              },
            },
          },
        },
        billResolution: true,
        indexResolution: true,
        jars: true,
      },
    });
  }

  /** Month with run, module, and indexResolution (for spawnEvent LQI state). Pass tx when inside a transaction. */
  async findMonthWithRunAndModule(
    monthId: bigint,
    tx?: TxClient,
  ): Promise<MonthWithRunAndModule | null> {
    return this.client(tx).budgetRunMonth.findUnique({
      where: { id: monthId },
      include: {
        budgetRun: { include: { module: true } },
        indexResolution: true,
      },
    });
  }

  /** Month by id (minimal). Pass tx when inside a transaction so reads see uncommitted updates. */
  async findMonthById(
    monthId: bigint,
    tx?: TxClient,
  ): Promise<Prisma.BudgetRunMonthGetPayload<Record<string, never>> | null> {
    return this.client(tx).budgetRunMonth.findUnique({
      where: { id: monthId },
    });
  }

  /** Jars for a month, optionally filtered by jar codes. Pass tx when inside a transaction. */
  async findJarsForMonth(
    monthId: bigint,
    jarCodes?: string[],
    tx?: TxClient,
  ): Promise<BudgetMonthJarRow[]> {
    return this.client(tx).budgetMonthJar.findMany({
      where: {
        budgetMonthId: monthId,
        ...(jarCodes?.length ? { jarCode: { in: jarCodes } } : {}),
      },
    });
  }

  /** Single jar by month and jar code. Pass tx when inside a transaction so reads see uncommitted updates. */
  async findJarByMonthAndJar(
    monthId: bigint,
    jarCode: string,
    tx?: TxClient,
  ): Promise<BudgetMonthJarRow | null> {
    return this.client(tx).budgetMonthJar.findUnique({
      where: {
        budgetMonthId_jarCode: { budgetMonthId: monthId, jarCode },
      },
    });
  }

  /** Pending event (unchosen) for week. Pass tx when inside a transaction. */
  async findPendingEvent(
    monthId: bigint,
    week: number,
    tx?: TxClient,
  ): Promise<PendingBudgetMonthEventRow | null> {
    return this.client(tx).budgetMonthEvent.findFirst({
      where: {
        budgetMonthId: monthId,
        week,
        chosenOptionId: null,
      },
      orderBy: [{ eventSource: 'asc' }],
    });
  }

  /** Count unresolved events for a week (module 3 may have two). */
  async countPendingEventsForWeek(
    monthId: bigint,
    week: number,
    tx?: TxClient,
  ): Promise<number> {
    return this.client(tx).budgetMonthEvent.count({
      where: {
        budgetMonthId: monthId,
        week,
        chosenOptionId: null,
      },
    });
  }

  /** Pending event with template and options. Pass tx when inside a transaction. */
  async findPendingEventWithTemplate(
    monthId: bigint,
    week: number,
    tx?: TxClient,
  ): Promise<PendingEventWithTemplateRow | null> {
    return this.client(tx).budgetMonthEvent.findFirst({
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

  /** Pending life-lane event for week (module 3). */
  async findPendingLifeEventWithTemplate(
    monthId: bigint,
    week: number,
    tx?: TxClient,
  ): Promise<PendingEventWithTemplateRow | null> {
    return this.client(tx).budgetMonthEvent.findFirst({
      where: {
        budgetMonthId: monthId,
        week,
        chosenOptionId: null,
        eventSource: EVENT_SOURCE_LIFE,
      },
      include: {
        template: {
          include: { options: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
  }

  /** Pending work/overtime event for week (module 3). */
  async findPendingOvertimeEventWithTemplate(
    monthId: bigint,
    week: number,
    tx?: TxClient,
  ): Promise<PendingEventWithTemplateRow | null> {
    return this.client(tx).budgetMonthEvent.findFirst({
      where: {
        budgetMonthId: monthId,
        week,
        chosenOptionId: null,
        eventSource: EVENT_SOURCE_WORK,
        eventSubtype: EVENT_SUBTYPE_OVERTIME,
      },
      include: {
        template: {
          include: { options: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
  }

  /** Single pending row by id (apply-choice targeting). */
  async findPendingEventWithTemplateById(
    eventId: bigint,
    tx?: TxClient,
  ): Promise<PendingEventWithTemplateRow | null> {
    return this.client(tx).budgetMonthEvent.findFirst({
      where: {
        id: eventId,
        chosenOptionId: null,
      },
      include: {
        template: {
          include: { options: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
  }

  /** OT template for module 3 (work / overtime). */
  async findOvertimeEventTemplate(
    moduleId: number,
  ): Promise<LifeEventTemplateRow | null> {
    return this.prisma.lifeEventTemplate.findFirst({
      where: {
        moduleId,
        eventSource: EVENT_SOURCE_WORK,
        eventSubtype: EVENT_SUBTYPE_OVERTIME,
      },
    });
  }

  /** Chosen events for a week (for weekly HI/LQI, including dynamic OT penalty). */
  async findChosenEventsForWeekWithTemplates(
    monthId: bigint,
    week: number,
    tx?: TxClient,
  ): Promise<
    Array<{
      chosenOptionId: bigint | null;
      eventSource: string;
      eventSubtype: string | null;
      template: {
        options: Array<{ id: bigint; sortOrder: number }>;
      };
      option: { healthDelta: number; lqiDelta: number } | null;
    }>
  > {
    return this.client(tx).budgetMonthEvent.findMany({
      where: {
        budgetMonthId: monthId,
        week,
        chosenOptionId: { not: null },
      },
      include: {
        option: true,
        template: {
          select: { options: { select: { id: true, sortOrder: true } } },
        },
      },
    }) as Promise<
      Array<{
        chosenOptionId: bigint | null;
        eventSource: string;
        eventSubtype: string | null;
        template: {
          options: Array<{ id: bigint; sortOrder: number }>;
        };
        option: { healthDelta: number; lqiDelta: number } | null;
      }>
    >;
  }

  /** True if this week already has a life-lane event (pending or resolved). */
  async hasLifeLaneEventForWeek(
    monthId: bigint,
    week: number,
    tx?: TxClient,
  ): Promise<boolean> {
    const n = await this.client(tx).budgetMonthEvent.count({
      where: {
        budgetMonthId: monthId,
        week,
        eventSource: EVENT_SOURCE_LIFE,
      },
    });
    return n > 0;
  }

  /** True if this week already has an OT event. */
  async hasOvertimeEventForWeek(
    monthId: bigint,
    week: number,
    tx?: TxClient,
  ): Promise<boolean> {
    const n = await this.client(tx).budgetMonthEvent.count({
      where: {
        budgetMonthId: monthId,
        week,
        eventSource: EVENT_SOURCE_WORK,
        eventSubtype: EVENT_SUBTYPE_OVERTIME,
      },
    });
    return n > 0;
  }

  /** Count events created for this month (for max_event_count_per_month cap). Pass tx when inside a transaction. */
  async countEventsForMonth(monthId: bigint, tx?: TxClient): Promise<number> {
    return this.client(tx).budgetMonthEvent.count({
      where: { budgetMonthId: monthId },
    });
  }

  /** Sum of health_delta and lqi_delta from chosen options for this month (for index resolution). Pass tx when inside a transaction. */
  async getChosenEventsHealthAndLqiTotals(
    monthId: bigint,
    tx?: TxClient,
  ): Promise<ChosenEventsTotalsResult> {
    const events = await this.client(tx).budgetMonthEvent.findMany({
      where: {
        budgetMonthId: monthId,
        chosenOptionId: { not: null },
      },
      include: { option: true },
    });
    let healthDeltaTotal = 0;
    let lqiDeltaTotal = 0;
    for (const e of events) {
      if (e.option) {
        healthDeltaTotal += Number(e.option.healthDelta ?? 0);
        lqiDeltaTotal += Number(e.option.lqiDelta ?? 0);
      }
    }
    return { healthDeltaTotal, lqiDeltaTotal };
  }

  /** Event template ids used in a run in a month range. */
  async findUsedEventTemplateIds(
    runId: bigint,
    fromMonthIndex: number,
    toMonthIndex: number,
  ): Promise<bigint[]> {
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

  /** Life-lane template ids used in range (OT template ids excluded from dedup pool). */
  async findUsedLifeEventTemplateIds(
    runId: bigint,
    fromMonthIndex: number,
    toMonthIndex: number,
  ): Promise<bigint[]> {
    const events = await this.prisma.budgetMonthEvent.findMany({
      where: {
        eventSource: EVENT_SOURCE_LIFE,
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

  /** Life-lane templates only (excludes work/OT). */
  async findLifeEventTemplatesForModule(
    moduleId: number,
    excludeTemplateIds: bigint[],
  ): Promise<LifeEventTemplateRow[]> {
    return this.prisma.lifeEventTemplate.findMany({
      where: {
        moduleId,
        eventSource: { not: EVENT_SOURCE_WORK },
        id: excludeTemplateIds.length
          ? { notIn: excludeTemplateIds }
          : undefined,
      },
    });
  }

  /** Life-lane templates by LQI category (positive, neutral, compromise, undesirable). */
  async findLifeEventTemplatesForModuleByCategory(
    moduleId: number,
    category: string,
    excludeTemplateIds: bigint[],
  ): Promise<LifeEventTemplateRow[]> {
    return this.prisma.lifeEventTemplate.findMany({
      where: {
        moduleId,
        category,
        eventSource: { not: EVENT_SOURCE_WORK },
        id: excludeTemplateIds.length
          ? { notIn: excludeTemplateIds }
          : undefined,
      },
    });
  }

  /** Event pool weights for module and LQI state (for weighted category pick). */
  async findEventPoolWeights(
    moduleId: number,
    lqiState: string,
  ): Promise<ModuleEventPoolWeightRow[]> {
    return this.prisma.moduleEventPoolWeight.findMany({
      where: { moduleId, lqiState },
    });
  }

  async findLifeEventOptionById(
    optionId: bigint,
  ): Promise<LifeEventOptionRow | null> {
    return this.prisma.lifeEventOption.findUnique({
      where: { id: optionId },
    });
  }

  /** Chosen events health/LQI totals for a given week. Pass tx when inside a transaction so reads see uncommitted event choices. */
  async getChosenEventsHealthAndLqiTotalsForWeek(
    monthId: bigint,
    week: number,
    tx?: TxClient,
  ): Promise<ChosenEventsTotalsResult> {
    const rows = await this.client(tx).budgetMonthEvent.findMany({
      where: {
        budgetMonthId: monthId,
        week,
        chosenOptionId: { not: null },
      },
      include: {
        option: true,
      },
    });

    let healthDeltaTotal = 0;
    let lqiDeltaTotal = 0;

    for (const row of rows) {
      healthDeltaTotal += Number(row.option?.healthDelta ?? 0);
      lqiDeltaTotal += Number(row.option?.lqiDelta ?? 0);
    }

    return { healthDeltaTotal, lqiDeltaTotal };
  }
}
