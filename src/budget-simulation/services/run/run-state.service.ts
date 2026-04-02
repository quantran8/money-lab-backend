import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { wrapAsync } from '#common/utils/async.utils.js';
import { RunQuery } from '#budget-simulation/queries/run.query.js';
import { BudgetMonthQuery } from '#budget-simulation/queries/month.query.js';
import {
  FREE_CASH_CODE,
  WEEK_INDEX_COMPLETE_MONTH,
} from '#budget-simulation/budget-simulation.constant.js';
import { BudgetSimulationConfigService } from '../config.service';
import { NextMonthPreviewService } from '../month/next-month-preview.service';
import type { ActiveRunWithDetailsRow } from '#budget-simulation/types/run.types.js';
import type {
  MonthWithRunAndJobLevelAndJars,
  NextMonthPreview,
} from '#budget-simulation/types/month.types.js';
import type { SpawnEventTemplatePayload } from '#budget-simulation/types/event.types.js';

// ── pure helpers (no DB, no DI) ──────────────────────────────────

type MonthRow = NonNullable<ActiveRunWithDetailsRow['months'][0]>;
type JarRow = MonthRow['jars'][number];

function jarBalance(j: JarRow): number {
  return (
    Number(j.allocatedAmount) -
    Number(j.spentAmount) +
    Number(j.overflowInAmount) -
    Number(j.overflowOutAmount)
  );
}

function resolveFreeCashBalance(month: MonthRow): number {
  const freeCashJar = month.jars.find((j) => j.jarCode === FREE_CASH_CODE);
  return freeCashJar ? jarBalance(freeCashJar) : (month.freeCash ?? 0);
}

function resolveNecessitiesTotal(month: MonthRow): number {
  return (
    (month.lockedCommitmentsTotal ?? 0) +
    (month.billsEstimated ?? 0) +
    (month.billResolution?.billReserveTarget ?? 0)
  );
}

function isMonthResolved(month: MonthRow | undefined): boolean {
  return month ? month.billsActual !== null : false;
}

function buildJarsMap(
  jars: JarRow[],
): Record<string, { allocation: number; balance: number }> {
  const map: Record<string, { allocation: number; balance: number }> = {};
  for (const j of jars) {
    if (j.jarCode === FREE_CASH_CODE) continue;
    map[j.jarCode] = {
      allocation: Number(j.allocatedAmount),
      balance: jarBalance(j),
    };
  }
  return map;
}

function mapPendingEventToPayload(e: {
  id: bigint;
  eventSource: string | null;
  eventSubtype: string | null;
  template: {
    id: bigint;
    title: string;
    description: string | null;
    options: Array<{
      id: bigint;
      optionLabel: string;
      description: string | null;
      moneyJarCode: string | null;
      moneyDelta: number;
      healthDelta: number;
      lqiDelta: number;
      learningXpDelta: number;
    }>;
  };
}): SpawnEventTemplatePayload {
  return {
    eventId: e.id.toString(),
    eventSource: e.eventSource ?? 'life',
    eventSubtype: e.eventSubtype,
    templateId: e.template.id.toString(),
    title: e.template.title,
    description: e.template.description ?? '',
    options: e.template.options.map((o) => ({
      optionId: o.id.toString(),
      optionLabel: o.optionLabel,
      description: o.description ?? '',
      defaultJarCode: o.moneyJarCode,
      moneyDelta: o.moneyDelta,
      healthDelta: o.healthDelta,
      lqiDelta: o.lqiDelta,
      learningXpDelta: o.learningXpDelta,
    })),
  };
}

// ── service ──────────────────────────────────────────────────────

@Injectable()
export class BudgetSimulationRunStateService {
  private readonly logger = new Logger(BudgetSimulationRunStateService.name);

  constructor(
    private readonly runQuery: RunQuery,
    private readonly monthQuery: BudgetMonthQuery,
    private readonly configService: BudgetSimulationConfigService,
    private readonly previewService: NextMonthPreviewService,
  ) {}

  async getActiveRun(userId: string) {
    return wrapAsync(this.logger, 'getActiveRun', async () => {
      const run = await this.runQuery.findActiveRunWithDetails(userId);
      if (!run) return null;

      const latestMonth = run.months[0];
      const monthResolved = isMonthResolved(latestMonth);

      const [commitments, billEstimatedTemplates] = this.resolveCommitments(
        run,
        latestMonth,
      );

      const [nextMonthPreview, pendingEvents] = await this.resolveEnrichments(
        run,
        latestMonth,
        monthResolved,
      );

      return {
        id: run.id.toString(),
        runCompleted: run.passed,
        monthId: latestMonth?.id.toString(),
        moduleId: run.moduleId,
        userId: run.userId,
        jobId: run.jobState.jobId.toString(),
        currentMonthIndex: latestMonth?.monthIndex ?? 1,
        currentWeekIndex: latestMonth?.currentWeek ?? 0,
        isMonthResolved: monthResolved,
        freeCash: latestMonth ? resolveFreeCashBalance(latestMonth) : 0,
        cumulativeFutureYou: latestMonth?.cumulativeFutureYou ?? 0,
        income: latestMonth?.income ?? 0,
        hi: latestMonth?.indexResolution?.hiEnd ?? 0,
        lqi: latestMonth?.indexResolution?.lqiEnd ?? 0,
        necessitiesTotal: latestMonth
          ? resolveNecessitiesTotal(latestMonth)
          : 0,
        spendMode: latestMonth?.spendModeCode,
        billReserveOption: latestMonth?.billReserveOptionCode,
        commitments: [...commitments, ...billEstimatedTemplates],
        jars: latestMonth ? buildJarsMap(latestMonth.jars) : {},
        nextMonthPreview,
        pendingEvents,
      };
    });
  }

  private resolveCommitments(
    run: ActiveRunWithDetailsRow,
    latestMonth: MonthRow | undefined,
  ) {
    const activeMonthIndex = latestMonth?.monthIndex ?? 1;
    const activeCommitments = run.commitments.filter(
      (c) =>
        c.effectiveFromMonthIndex <= activeMonthIndex &&
        (c.effectiveToMonthIndex === null ||
          c.effectiveToMonthIndex >= activeMonthIndex),
    );

    const housingId = activeCommitments.find(
      (c) => c.template.category === 'housing',
    )?.template.id;
    const housingUtilityModifiers = housingId
      ? this.configService.getHousingModifiersByCommitmentIds([housingId])
      : [];

    const commitments = activeCommitments.map((c) => ({
      templateId: c.commitmentTemplateId.toString(),
      name: c.template.name,
      layer: c.template.layer,
      amount: c.selectedAmount,
    }));

    const billEstimatedTemplates = this.configService
      .getBillTemplates()
      .map((t) => {
        const modifier = housingUtilityModifiers.find(
          (m) => m.utilityName === t.name,
        );
        return {
          templateId: t.id.toString(),
          name: t.name,
          layer: t.layer,
          amount: Number(modifier?.multiplier ?? 1) * t.baseMonthlyAmount,
        };
      });

    return [commitments, billEstimatedTemplates] as const;
  }

  private async resolveEnrichments(
    run: ActiveRunWithDetailsRow,
    latestMonth: MonthRow | undefined,
    monthResolved: boolean,
  ): Promise<
    [NextMonthPreview | undefined, SpawnEventTemplatePayload[] | undefined]
  > {
    if (monthResolved && latestMonth) {
      const fullMonth: MonthWithRunAndJobLevelAndJars = {
        ...latestMonth,
        run: { ...run, jobState: run.jobState },
      } as MonthWithRunAndJobLevelAndJars;
      const preview = await this.previewService.computePreview(fullMonth);
      return [preview, undefined];
    }

    if (latestMonth && latestMonth.currentWeek > 0) {
      const pending = await this.monthQuery.findPendingEventWithTemplate(
        latestMonth.id,
        latestMonth.currentWeek,
      );
      if (pending) {
        return [undefined, [mapPendingEventToPayload(pending)]];
      }
    }

    return [undefined, undefined];
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
        latestMonth.currentWeek < WEEK_INDEX_COMPLETE_MONTH
      ) {
        throw new BadRequestException('Current month not fully resolved');
      }

      const fullMonth =
        await this.monthQuery.findMonthWithRunAndJobLevelAndJars(
          latestMonth.id,
        );
      if (!fullMonth) throw new NotFoundException('Month not found');

      return this.previewService.computePreview(fullMonth);
    });
  }
}
