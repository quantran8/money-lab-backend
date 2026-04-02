import { Prisma } from '@prisma/client';

/** Previous month row with bill + index resolution. */
export type MonthPreviousRow = Prisma.RunMonthGetPayload<{
  include: { billResolution: true; indexResolution: true };
}>;

/** Month with run, bill + index resolution. */
export type MonthWithRun = Prisma.RunMonthGetPayload<{
  include: {
    run: true;
    billResolution: true;
    indexResolution: true;
  };
}>;

/** Month with run, job levels (forced rest), bill + index resolution. */
export type MonthWithRunAndJobLevel = Prisma.RunMonthGetPayload<{
  include: {
    run: {
      include: {
        jobState: {
          include: {
            job: { include: { levels: true } };
          };
        };
      };
    };
    billResolution: true;
    indexResolution: true;
  };
}>;

/** Full resolveWeek load shape: run, module, job levels, jars, resolutions. */
export type MonthWithRunAndJobLevelAndJars = Prisma.RunMonthGetPayload<{
  include: {
    run: {
      include: {
        jobState: {
          include: {
            job: { include: { levels: true } };
          };
        };
        module: true;
      };
    };
    billResolution: true;
    indexResolution: true;
    jars: true;
  };
}>;

/** Month with jars + resolutions. */
export type MonthWithJars = Prisma.RunMonthGetPayload<{
  include: {
    jars: true;
    billResolution: true;
    indexResolution: true;
  };
}>;

/** Month with run (job levels), jars — applyEventChoice load. */
export type MonthWithRunAndJars = Prisma.RunMonthGetPayload<{
  include: {
    run: {
      include: {
        jobState: {
          include: {
            job: { include: { levels: true } };
          };
        };
      };
    };
    billResolution: true;
    indexResolution: true;
    jars: true;
  };
}>;

/** Month with run.module + index (spawn event LQI). */
export type MonthWithRunAndModule = Prisma.RunMonthGetPayload<{
  include: {
    run: { include: { module: true } };
    indexResolution: true;
  };
}>;

export type MonthJarRow = Prisma.MonthJarGetPayload<Record<string, never>>;

export type PendingMonthEventRow = Prisma.MonthEventGetPayload<
  Record<string, never>
>;

export type PendingEventWithTemplateRow = Prisma.MonthEventGetPayload<{
  include: {
    template: {
      include: { options: { orderBy: { sortOrder: 'asc' } } };
    };
  };
}>;

/** Totals from chosen life-event options (index). */
export interface ChosenEventsTotalsResult {
  healthDeltaTotal: number;
  lqiDeltaTotal: number;
}

/** Forced rest effect passed into weekly index. */
export interface ForcedRestNotice {
  incomeLoss: number;
  hiRecovery: number;
}

/** Result after persisting weekly HI/LQI step. */
export interface IndexWeeklyResolutionResult {
  hiEnd: number;
  lqiEnd: number;
}

/** Jars slice passed into bill reconcile (numeric fields from Decimal). */
export interface ReconcileBillsJarInput {
  jarCode: string;
  allocatedAmount: unknown;
  spentAmount: unknown;
  overflowInAmount: unknown;
  overflowOutAmount: unknown;
}

/** Next-month financial preview returned when monthComplete === true. */
export interface NextMonthPreview {
  monthIndex: number;
  income: {
    resolvedBaseJobIncome: number;
    overtimeIncomeEarnedFromPriorMonth: number;
    absenceDeduction: number;
    finalIncome: number;
  };
  commitments: { lockedTotal: number };
  bills: { estimated: number };
  billReserve: { target: number; start: number; refill: number };
  jarRefill: Array<{
    jarCode: string;
    target: number;
    remaining: number;
    refill: number;
  }>;
  freeCash: { current: number; nextMonth: number; total: number };
  structure: { flexibleIncome: number };
}

/** Preloaded month + jars for reconcileBillsWithContext. */
export interface ReconcileBillsContext {
  month: MonthWithRun;
  jars: ReconcileBillsJarInput[];
}
