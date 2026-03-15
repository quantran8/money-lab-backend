import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { wrapAsync } from '@common/utils/async.utils';
import {
  BudgetMonthQuery,
  WeeklyIndexProgressItem,
  WeeklySpendSummary,
} from '../queries/month.query';
import { BudgetMonthRepository } from '@budget-simulation/repositories/month.repository';
import { BudgetRunRepository } from '@budget-simulation/repositories/run.repository';
import { CommitmentQuery } from '@budget-simulation/queries/commitment.query';
import { PrismaService } from '@prisma/prisma.service';
import {
  clampHi,
  clampLqi,
  computeBillsFinal,
  deterministicRandom,
  genAutoSpendLabel,
  resolveLqiState,
} from '@app/budget-simulation/budget-simulation.helpers';
import { JarCode, LqiState, SpendModeCode } from '../budget-simulation.enum';
import { BudgetSimulationConfigService } from './config.service';
import {
  END_OF_MONTH_WEEK,
  NUMBER_OF_WEEKS_PER_MONTH,
  TxClient,
} from '../budget-simulation.constant';

/**
 * Month/week resolution: resolve week, apply event choice, spend jars, finalize bills.
 * Uses Query for reads, Repository for writes; transactions at service layer.
 */
@Injectable()
export class BudgetSimulationMonthService {
  private readonly logger = new Logger(BudgetSimulationMonthService.name);

  private static readonly VALID_JAR_CODES = new Set([
    'free_cash',
    'fun',
    'learning',
    'give',
    'future_you',
  ]);

  constructor(
    private readonly prisma: PrismaService,
    private readonly monthQuery: BudgetMonthQuery,
    private readonly monthRepository: BudgetMonthRepository,
    private readonly runRepository: BudgetRunRepository,
    private readonly commitmentQuery: CommitmentQuery,
    private readonly configService: BudgetSimulationConfigService,
  ) {}

  private async getSpendModeRate(code: string): Promise<number> {
    const option = await this.commitmentQuery.findSpendModeOptionByCode(code);
    if (!option)
      throw new BadRequestException(`Invalid spend_mode_code: ${code}`);
    return Number(option.rate);
  }

  private async getJarAvailable(
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
    return Math.max(
      0,
      Number(jar.allocatedAmount) -
        Number(jar.spentAmount) +
        Number(jar.overflowInAmount) -
        Number(jar.overflowOutAmount),
    );
  }

  /** In-memory jar state for batch spend: avoid N getJarAvailable round-trips. */
  private static jarAvailable(
    allocated: number,
    spent: number,
    overflowIn: number,
    overflowOut: number,
  ): number {
    return Math.max(0, allocated - spent + overflowIn - overflowOut);
  }

  private async deductFromJar(
    monthId: bigint,
    jarCode: string,
    amount: number,
    tx?: TxClient,
  ) {
    const available = await this.getJarAvailable(monthId, jarCode, tx);
    const spent = Math.min(Math.max(0, available), amount);
    const jarBalance = available - spent;
    return { spent, jarBalance };
  }

  private async addSpendLog(
    monthId: bigint,
    jarCode: string,
    spent: number,
    overflowIn: number,
    overflowOut: number,
    tx?: TxClient,
  ) {
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
   * All DB reads for resolveWeek in one phase. Returns context for compute + write phases.
   */
  private async loadResolveWeekContext(monthId: bigint): Promise<{
    month: NonNullable<
      Awaited<
        ReturnType<typeof this.monthQuery.findMonthWithRunAndJobLevelAndJars>
      >
    >;
    spendModeRate: number;
    pendingCurrentWeek: Awaited<
      ReturnType<typeof this.monthQuery.findPendingEvent>
    > | null;
    nextWeek: number;
    existingNextWeekEvent: Awaited<
      ReturnType<typeof this.monthQuery.findPendingEventWithTemplate>
    > | null;
    spawnTemplateId: bigint | null;
  } | null> {
    const month =
      await this.monthQuery.findMonthWithRunAndJobLevelAndJars(monthId);
    if (!month) return null;

    const nextWeek = month.currentWeek + 1;
    const [spendModeRate, pendingCurrentWeek, existingNextWeekEvent] =
      await Promise.all([
        this.getSpendModeRate(
          month.spendModeCode ?? SpendModeCode.normal,
        ),
        month.currentWeek >= 1
          ? this.monthQuery.findPendingEvent(monthId, month.currentWeek)
          : Promise.resolve(null),
        this.monthQuery.findPendingEventWithTemplate(monthId, nextWeek),
      ]);

    let spawnTemplateId: bigint | null = null;
    if (!existingNextWeekEvent) {
      spawnTemplateId = await this.loadSpawnEventPoolResult(
        monthId,
        month,
        nextWeek,
      );
    }

    return {
      month,
      spendModeRate,
      pendingCurrentWeek: pendingCurrentWeek ?? null,
      nextWeek,
      existingNextWeekEvent: existingNextWeekEvent ?? null,
      spawnTemplateId,
    };
  }

  /**
   * Spawn event pool resolution (all reads). Returns template id to create in tx, or null.
   */
  private async loadSpawnEventPoolResult(
    monthId: bigint,
    month: NonNullable<
      Awaited<
        ReturnType<typeof this.monthQuery.findMonthWithRunAndJobLevelAndJars>
      >
    >,
    week: number,
  ): Promise<bigint | null> {
    const config = this.configService.getConfig();
    if (month.stressModeActive) {
      const maxEvents =
        config.indexRules.stressMode?.maxEventCountPerMonth ?? 1;
      const eventCount = await this.monthQuery.countEventsForMonth(monthId);
      if (eventCount >= maxEvents) return null;
    }

    const seed = `${month.budgetRunId}:${month.monthIndex}:${week}:spawn`;
    if (deterministicRandom(seed) >= 0.5) return null;

    const lqiState =
      month.indexResolution?.lqiStateEnd ??
      month.indexResolution?.lqiStateStart ??
      LqiState.stable;
    const moduleId = month.budgetRun.moduleId;
    const fromMonth = Math.max(1, month.monthIndex - 5);
    const [weights, usedIds] = await Promise.all([
      this.monthQuery.findEventPoolWeights(moduleId, lqiState),
      this.monthQuery.findUsedEventTemplateIds(
        month.budgetRunId,
        fromMonth,
        month.monthIndex,
      ),
    ]);

    let templates: Awaited<
      ReturnType<typeof this.monthQuery.findLifeEventTemplatesForModule>
    >;
    if (weights.length > 0) {
      const totalWeight = weights.reduce((sum, w) => sum + Number(w.weight), 0);
      const roll =
        deterministicRandom(
          `${month.budgetRunId}:${month.monthIndex}:${week}:category`,
        ) * totalWeight;
      let running = 0;
      let chosenCategory = weights[0].eventCategory;
      for (const w of weights) {
        running += Number(w.weight);
        if (roll <= running) {
          chosenCategory = w.eventCategory;
          break;
        }
      }
      templates =
        await this.monthQuery.findLifeEventTemplatesForModuleByCategory(
          moduleId,
          chosenCategory,
          usedIds,
        );
    } else {
      templates = await this.monthQuery.findLifeEventTemplatesForModule(
        moduleId,
        usedIds,
      );
    }
    if (templates.length === 0) return null;

    const totalWeight = templates.reduce((sum, t) => sum + (11 - t.rarity), 0);
    const rollTemplate =
      deterministicRandom(
        `${month.budgetRunId}:${month.monthIndex}:${week}:template`,
      ) * totalWeight;
    let runningWeight = 0;
    let selectedTemplate = templates[0];
    for (const t of templates) {
      runningWeight += 11 - t.rarity;
      if (runningWeight >= rollTemplate) {
        selectedTemplate = t;
        break;
      }
    }
    return selectedTemplate.id;
  }

  /**
   * Compute weekly jar spend in memory from preloaded month and jars. Returns entries for response and spend ops for writes.
   */
  private computeSpendJarsInMemory(
    month: Awaited<ReturnType<typeof this.monthQuery.findMonthById>> & {
      budgetRunId: bigint;
      monthIndex: number;
      currentWeek: number;
    },
    jars: { jarCode: string; allocatedAmount: unknown; spentAmount: unknown; overflowInAmount: unknown; overflowOutAmount: unknown }[],
    spendModeRate: number,
    nextWeek: number,
  ): {
    entries: {
      type: string;
      jar: string;
      amount: number;
      jarBalance: number;
      label: string;
    }[];
    weeklySpend: WeeklySpendSummary;
    spendOps: { jarCode: string; amount: number }[];
  } {
    const spendModeCode = month.spendModeCode ?? SpendModeCode.normal;
    const coreJars = jars.filter((j) =>
      ([JarCode.fun, JarCode.learning, JarCode.give] as string[]).includes(
        j.jarCode,
      ),
    );
    type JarState = {
      allocated: number;
      spent: number;
      overflowIn: number;
      overflowOut: number;
    };
    const state: Record<string, JarState> = {};
    for (const j of coreJars) {
      state[j.jarCode] = {
        allocated: Number(j.allocatedAmount),
        spent: Number(j.spentAmount),
        overflowIn: Number(j.overflowInAmount),
        overflowOut: Number(j.overflowOutAmount),
      };
    }

    const entries: {
      type: string;
      jar: string;
      amount: number;
      jarBalance: number;
      label: string;
    }[] = [];
    const weeklySpend: WeeklySpendSummary = {
      fun: 0,
      learning: 0,
      give: 0,
    };
    const spendOps: { jarCode: string; amount: number }[] = [];

    for (const jarEntry of coreJars) {
      const jar = jarEntry.jarCode;
      const maxMonthAvailable = Math.round(
        Number(jarEntry.allocatedAmount) * spendModeRate,
      );
      const weeklyAmount = Math.floor(maxMonthAvailable / 4.0);
      if (weeklyAmount <= 0) continue;

      const s = state[jar];
      const available = BudgetSimulationMonthService.jarAvailable(
        s.allocated,
        s.spent,
        s.overflowIn,
        s.overflowOut,
      );
      const spentAmount = Math.min(available, weeklyAmount);
      const jarBalance = available - spentAmount;

      if (spentAmount > 0) {
        s.spent += spentAmount;
        spendOps.push({ jarCode: jar, amount: spentAmount });
        const weekGlobal = (month.monthIndex - 1) * 4 + nextWeek;
        const label = genAutoSpendLabel(
          `${month.budgetRunId}:${month.id}:${jar}`,
          jar as JarCode,
          spentAmount,
          spendModeCode,
          weekGlobal,
        );
        entries.push({
          type: 'auto_spend',
          jar,
          amount: spentAmount,
          jarBalance,
          label,
        });
        if (jar === JarCode.fun) weeklySpend.fun += spentAmount;
        if (jar === JarCode.learning) weeklySpend.learning += spentAmount;
        if (jar === JarCode.give) weeklySpend.give += spentAmount;
      }
    }

    return { entries, weeklySpend, spendOps };
  }

  private async spendJarsForWeek(monthId: bigint, tx?: TxClient) {
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

    type JarState = {
      allocated: number;
      spent: number;
      overflowIn: number;
      overflowOut: number;
    };
    const state: Record<string, JarState> = {};
    for (const j of jars) {
      state[j.jarCode] = {
        allocated: Number(j.allocatedAmount),
        spent: Number(j.spentAmount),
        overflowIn: Number(j.overflowInAmount),
        overflowOut: Number(j.overflowOutAmount),
      };
    }

    const entries: {
      type: string;
      jar: string;
      amount: number;
      jarBalance: number;
      label: string;
    }[] = [];
    const weeklySpend: WeeklySpendSummary = {
      fun: 0,
      learning: 0,
      give: 0,
    };

    for (const jarEntry of jars) {
      const jar = jarEntry.jarCode;
      const maxMonthAvailable = Math.round(
        Number(jarEntry.allocatedAmount) * rate,
      );
      const weeklyAmount = Math.floor(maxMonthAvailable / 4.0);
      if (weeklyAmount <= 0) continue;

      const s = state[jar];
      const available = BudgetSimulationMonthService.jarAvailable(
        s.allocated,
        s.spent,
        s.overflowIn,
        s.overflowOut,
      );
      const spentAmount = Math.min(available, weeklyAmount);
      const jarBalance = available - spentAmount;

      if (spentAmount > 0) {
        s.spent += spentAmount;
        await this.addSpendLog(monthId, jar, spentAmount, 0, 0, tx);
        const weekGlobal = (month.monthIndex - 1) * 4 + month.currentWeek;
        const label = genAutoSpendLabel(
          `${month.budgetRunId}:${monthId}:${jar}`,
          jar,
          spentAmount,
          spendModeCode,
          weekGlobal,
        );
        entries.push({
          type: 'auto_spend',
          jar,
          amount: spentAmount,
          jarBalance,
          label,
        });
        if (jar === JarCode.fun) weeklySpend.fun += spentAmount;
        if (jar === JarCode.learning) weeklySpend.learning += spentAmount;
        if (jar === JarCode.give) weeklySpend.give += spentAmount;
      }
    }

    return { entries, weeklySpend };
  }

  private async spawnEventForWeek(
    monthId: bigint,
    week: number,
    tx?: TxClient,
  ) {
    const [month, existing] = await Promise.all([
      this.monthQuery.findMonthWithRunAndModule(monthId, tx),
      this.monthQuery.findPendingEventWithTemplate(monthId, week, tx),
    ]);
    if (!month) return null;

    if (existing) {
      return {
        templateId: existing.template.id.toString(),
        title: existing.template.title,
        description: existing.template.description,
        options: existing.template.options.map((o) => ({
          optionId: o.id.toString(),
          optionLabel: o.optionLabel,
          description: o.description,
          defaultJarCode: o.moneyJarCode,
          moneyDelta: o.moneyDelta,
          healthDelta: o.healthDelta,
          lqiDelta: o.lqiDelta,
          learningXpDelta: o.learningXpDelta,
        })),
      };
    }

    const config = this.configService.getConfig();
    if (month.stressModeActive) {
      const maxEvents =
        config.indexRules.stressMode?.maxEventCountPerMonth ?? 1;
      const eventCount = await this.monthQuery.countEventsForMonth(monthId, tx);
      if (eventCount >= maxEvents) return null;
    }

    const seed = `${month.budgetRunId}:${month.monthIndex}:${week}:spawn`;
    if (deterministicRandom(seed) >= 0.5) return null;

    const lqiState =
      month.indexResolution?.lqiStateEnd ??
      month.indexResolution?.lqiStateStart ??
      LqiState.stable;
    const moduleId = month.budgetRun.moduleId;
    const fromMonth = Math.max(1, month.monthIndex - 5);
    const [weights, usedIds] = await Promise.all([
      this.monthQuery.findEventPoolWeights(moduleId, lqiState),
      this.monthQuery.findUsedEventTemplateIds(
        month.budgetRunId,
        fromMonth,
        month.monthIndex,
      ),
    ]);

    let templates: Awaited<
      ReturnType<typeof this.monthQuery.findLifeEventTemplatesForModule>
    >;
    if (weights.length > 0) {
      const totalWeight = weights.reduce((sum, w) => sum + Number(w.weight), 0);
      const roll =
        deterministicRandom(
          `${month.budgetRunId}:${month.monthIndex}:${week}:category`,
        ) * totalWeight;
      let running = 0;
      let chosenCategory = weights[0].eventCategory;
      for (const w of weights) {
        running += Number(w.weight);
        if (roll <= running) {
          chosenCategory = w.eventCategory;
          break;
        }
      }
      templates =
        await this.monthQuery.findLifeEventTemplatesForModuleByCategory(
          moduleId,
          chosenCategory,
          usedIds,
        );
    } else {
      templates = await this.monthQuery.findLifeEventTemplatesForModule(
        moduleId,
        usedIds,
      );
    }
    if (templates.length === 0) return null;

    const totalWeight = templates.reduce((sum, t) => sum + (11 - t.rarity), 0);
    const rollTemplate =
      deterministicRandom(
        `${month.budgetRunId}:${month.monthIndex}:${week}:template`,
      ) * totalWeight;
    let runningWeight = 0;
    let selectedTemplate = templates[0];
    for (const t of templates) {
      runningWeight += 11 - t.rarity;
      if (runningWeight >= rollTemplate) {
        selectedTemplate = t;
        break;
      }
    }

    const event = await this.monthRepository.createEventWithTemplate(
      monthId,
      selectedTemplate.id,
      week,
      tx,
    );
    return {
      templateId: event.template.id.toString(),
      title: event.template.title,
      description: event.template.description,
      options: event.template.options.map((o) => ({
        optionId: o.id.toString(),
        optionLabel: o.optionLabel,
        description: o.description,
        defaultJarCode: o.moneyJarCode,
        moneyDelta: o.moneyDelta,
        healthDelta: o.healthDelta,
        lqiDelta: o.lqiDelta,
        learningXpDelta: o.learningXpDelta,
      })),
    };
  }

  /** Returns baseline and fun efficiency (0-100) for a LQI state. */
  private getRecoveryEfficiencyForState(
    state: 'stable' | 'compressed' | 'strained',
  ): { baselinePct: number; funPct: number } {
    const config = this.configService.getConfig();
    const rep = config.indexRules.recoveryEfficiencyPct;
    const s = rep?.[state];
    return {
      baselinePct: s?.baseline ?? 100,
      funPct: s?.fun ?? 100,
    };
  }

  /**
   * Computes and persists monthly index resolution (baseline recovery, HI net change, LQI state, etc.)
   * using module index_rules. Call when month completes (e.g. week 4 no event).
   */
  // private async computeAndPersistMonthlyIndexResolution(
  //   monthIdBig: bigint,
  //   month: {
  //     indexResolution: {
  //       hiStart: number;
  //       lqiStart: number;
  //       lqiStateStart: string | null;
  //     } | null;
  //   },
  //   tx?: TxClient,
  // ): Promise<void> {
  //   if (!month.indexResolution) return;
  //   const config = this.configService.getConfig();
  //   const ir = month.indexResolution;
  //   const hiStart = Number(ir.hiStart);
  //   const lqiStart = Number(ir.lqiStart);
  //   const lqiStateStart =
  //     (ir.lqiStateStart as 'stable' | 'compressed' | 'strained') ?? 'stable';

  //   const { healthDeltaTotal, lqiDeltaTotal } =
  //     await this.monthQuery.getChosenEventsHealthAndLqiTotals(monthIdBig);
  //   const { baselinePct, funPct } =
  //     this.getRecoveryEfficiencyForState(lqiStateStart);

  //   const baselineHiRecovery = config.indexRules.baselineHiRecovery ?? 10;
  //   const baselineRecovery = Math.round(
  //     baselineHiRecovery * (baselinePct / 100),
  //   );
  //   const funBonusRaw = 2;
  //   const funRecoveryBonus = Math.round(funBonusRaw * (funPct / 100));
  //   const jobDrain = 0;
  //   const stressEffect = 0;
  //   const hiNetChange =
  //     baselineRecovery +
  //     funRecoveryBonus -
  //     jobDrain +
  //     healthDeltaTotal -
  //     stressEffect;
  //   const rawHiEnd = hiStart + hiNetChange;
  //   const hiEnd = clampHi(rawHiEnd, config);
  //   const rawLqiEnd = lqiStart + lqiDeltaTotal;
  //   const lqiEnd = clampLqi(rawLqiEnd, config);
  //   const lqiStateEnd = resolveLqiState(lqiEnd, config);

  //   await this.monthRepository.updateIndexResolution(
  //     monthIdBig,
  //     {
  //       baselineRecovery,
  //       funRecoveryBonus,
  //       jobDrain,
  //       eventHiEffectTotal: healthDeltaTotal,
  //       stressEffect,
  //       hiNetChange,
  //       hiEnd,
  //       lqiEnd,
  //       lqiStateEnd,
  //       baselineRecoveryEfficiencyPct: baselinePct,
  //       funRecoveryEfficiencyPct: funPct,
  //       eventPoolBiasState: lqiStateEnd,
  //     },
  //     tx,
  //   );
  // }

  /**
   * Persists weekly index resolution. Pass preloaded month and eventTotals to avoid DB reads.
   * Returns computed hiEnd, lqiEnd so callers can build response without re-querying.
   */
  private async computeAndPersistWeeklyIndexResolution(
    monthIdBig: bigint,
    week: number,
    weeklySpend: WeeklySpendSummary,
    forcedRestNotice: { incomeLoss: number; hiRecovery: number } | null,
    tx?: TxClient,
    preloaded?: {
      month: Awaited<
        ReturnType<typeof this.monthQuery.findMonthWithRunAndJobLevel>
      >;
      eventTotals?: { healthDeltaTotal: number; lqiDeltaTotal: number };
    },
  ): Promise<{ hiEnd: number; lqiEnd: number } | undefined> {
    const month =
      preloaded?.month ??
      (await this.monthQuery.findMonthWithRunAndJobLevel(monthIdBig, tx));
    if (!month?.indexResolution) return undefined;

    const config = this.configService.getConfig();
    const ir = month.indexResolution;

    const hiStart = Number(ir.hiEnd ?? ir.hiStart ?? 50);
    const lqiStart = Number(ir.lqiEnd ?? ir.lqiStart ?? 50);

    const lqiStateStart = resolveLqiState(lqiStart, config) as
      | 'stable'
      | 'compressed'
      | 'strained';

    const { baselinePct, funPct } =
      this.getRecoveryEfficiencyForState(lqiStateStart);

    // Weekly baseline recovery
    const weeklyBaselineRecovery = Math.round(
      (config.indexRules.baselineHiRecovery ?? 10) / NUMBER_OF_WEEKS_PER_MONTH,
    );

    // Weekly job drain:
    // simplest version = distribute monthly drain evenly
    // replace this with job-level based energy load lookup if available
    const monthlyJobDrain =
      Number(month.budgetRun?.jobState?.job?.baseEnergyLoad ?? 0) || 0;
    const weeklyJobDrain = Math.round(monthlyJobDrain / 4);

    // Weekly event totals (use preloaded 0,0 when no choice yet for this week)
    const { healthDeltaTotal, lqiDeltaTotal } =
      preloaded?.eventTotals ??
      (await this.monthQuery.getChosenEventsHealthAndLqiTotalsForWeek(
        monthIdBig,
        week,
        tx,
      ));

    // Weekly fun recovery bonus
    let funBonusRaw = 0;
    if (weeklySpend.fun >= 75) funBonusRaw = 1;
    else if (weeklySpend.fun >= 25) funBonusRaw = 0.5;

    const weeklyFunRecoveryBonus = Math.round(funBonusRaw * (funPct / 100));

    const stressEffect = 0;

    const forcedRestRecovery = forcedRestNotice?.hiRecovery ?? 0;

    const hiNetChange =
      weeklyBaselineRecovery +
      weeklyFunRecoveryBonus -
      weeklyJobDrain +
      healthDeltaTotal -
      stressEffect +
      forcedRestRecovery;

    const lqiNetChange = lqiDeltaTotal;

    const hiEnd = clampHi(hiStart + hiNetChange, config);
    const lqiEnd = clampLqi(lqiStart + lqiNetChange, config);
    const lqiStateEnd = resolveLqiState(lqiEnd, config);

    const weeklyPayload: WeeklyIndexProgressItem = {
      hiStart,
      hiEnd,
      hiNetChange,
      lqiStart,
      lqiEnd,
      lqiNetChange,
      lqiStateStart,
      lqiStateEnd,
      baselineRecovery: weeklyBaselineRecovery,
      funRecoveryBonus: weeklyFunRecoveryBonus,
      jobDrain: weeklyJobDrain,
      eventHiEffectTotal: healthDeltaTotal,
      eventLqiEffectTotal: lqiDeltaTotal,
      stressEffect,
      baselineRecoveryEfficiencyPct: baselinePct,
      funRecoveryEfficiencyPct: funPct,
      forcedRestTriggered: !!forcedRestNotice,
      incomeLossFromForcedRest: forcedRestNotice?.incomeLoss ?? 0,
      hiRecoveryFromForcedRest: forcedRestNotice?.hiRecovery ?? 0,
    };

    const currentProgress =
      (ir.weeklyIndexProgress as Record<
        string,
        WeeklyIndexProgressItem
      > | null) ?? {};

    const nextProgress = {
      ...currentProgress,
      [`week${week}`]: weeklyPayload,
    };

    await this.monthRepository.updateIndexResolution(
      monthIdBig,
      {
        hiEnd,
        lqiEnd,
        lqiStateEnd,
        baselineRecovery: weeklyBaselineRecovery,
        funRecoveryBonus: weeklyFunRecoveryBonus,
        jobDrain: weeklyJobDrain,
        eventHiEffectTotal: Object.values(nextProgress).reduce(
          (sum, x) => sum + Number(x.eventHiEffectTotal ?? 0),
          0,
        ),
        stressEffect,
        hiNetChange: hiEnd - Number(ir.hiStart),
        baselineRecoveryEfficiencyPct: baselinePct,
        funRecoveryEfficiencyPct: funPct,
        eventPoolBiasState: lqiStateEnd,
        weeklyIndexProgress: nextProgress,
      },
      tx,
    );
    return { hiEnd, lqiEnd };
  }

  private async finalizeBills(
    runId: number,
    monthIndex: number,
    estimated: number,
  ) {
    return computeBillsFinal(runId, monthIndex, estimated);
  }

  /**
   * Builds jarCode -> available amount from preloaded month and jars (no DB).
   */
  private static buildJarAvailableMap(
    month: { freeCash: unknown },
    jars: {
      jarCode: string;
      allocatedAmount: unknown;
      spentAmount: unknown;
      overflowInAmount: unknown;
      overflowOutAmount: unknown;
    }[],
  ): Map<string, number> {
    const map = new Map<string, number>();
    map.set(
      'free_cash',
      Math.max(0, Number(month.freeCash ?? 0)),
    );
    for (const j of jars) {
      const available = BudgetSimulationMonthService.jarAvailable(
        Number(j.allocatedAmount),
        Number(j.spentAmount),
        Number(j.overflowInAmount),
        Number(j.overflowOutAmount),
      );
      map.set(j.jarCode, available);
    }
    return map;
  }

  /**
   * Finalize bills using preloaded month and jars; computes breakdown in memory, then writes only.
   * When called from resolveWeek, pass effectiveCurrentWeek (e.g. nextWeek) because month is from load phase and still has old currentWeek.
   */
  private async finalizeBillsForMonthWithContext(
    userId: string,
    monthId: number,
    actual: number,
    context: {
      month: Awaited<ReturnType<typeof this.monthQuery.findMonthWithRun>>;
      jars: { jarCode: string; allocatedAmount: unknown; spentAmount: unknown; overflowInAmount: unknown; overflowOutAmount: unknown }[];
    },
    tx: TxClient,
    effectiveCurrentWeek?: number,
  ): Promise<Record<string, number>> {
    const monthIdBig = BigInt(monthId);
    const { month, jars } = context;
    if (month.budgetRun.userId !== userId)
      throw new ForbiddenException('Forbidden');
    const weekToCheck = effectiveCurrentWeek ?? month.currentWeek;
    if (weekToCheck < END_OF_MONTH_WEEK)
      throw new BadRequestException('Cannot finalize bills before week 4');

    const delta = actual - month.billsEstimated;
    const breakdown: Record<string, number> = {};
    const billReserveEnd = month.billResolution?.billReserveEnd ?? 0;

    if (delta <= 0) {
      const surplus = Math.abs(delta);
      breakdown['billsDelta'] = delta;
      breakdown['surplusToFreeCash'] = surplus;
      await this.monthRepository.updateMonth(
        monthIdBig,
        { billsActual: actual, freeCash: { increment: surplus } },
        tx,
      );
      await this.monthRepository.updateBillResolution(
        monthIdBig,
        {
          billReconcileBreakdown: breakdown,
          surplusToFreeCash: surplus,
        },
        tx,
      );
      return breakdown;
    }

    let rem = delta;
    const takenReserve = Math.min(billReserveEnd, rem);
    rem -= takenReserve;
    breakdown['billReserve'] = takenReserve;
    const billReserveEndAfter = billReserveEnd - takenReserve;
    await this.monthRepository.updateBillResolution(
      monthIdBig,
      { billReserveEnd: billReserveEndAfter },
      tx,
    );

    const jarOrder = ['fun', 'give', 'learning', 'free_cash', 'future_you'];
    const availableMap = BudgetSimulationMonthService.buildJarAvailableMap(
      month,
      jars,
    );
    let freeCashDeficit = 0;
    for (const jar of jarOrder) {
      if (rem <= 0) break;
      const available = availableMap.get(jar) ?? 0;
      const spent = Math.min(available, rem);
      if (spent > 0) {
        if (jar === 'free_cash') {
          freeCashDeficit = spent;
        } else {
          await this.addSpendLog(monthIdBig, jar, 0, 0, spent, tx);
        }
        availableMap.set(jar, available - spent);
        rem -= spent;
        breakdown[jar] = spent;
      }
    }

    await this.monthRepository.updateMonth(
      monthIdBig,
      {
        billsActual: actual,
        structuralOvercommitmentOccurred: rem > 0,
        freeCash: { decrement: freeCashDeficit },
      },
      tx,
    );
    await this.monthRepository.updateBillResolution(
      monthIdBig,
      {
        billReconcileBreakdown: {
          ...breakdown,
          billsDelta: delta,
          uncovered: rem,
        },
        shortfallTotal: rem > 0 ? rem : 0,
      },
      tx,
    );
    return breakdown;
  }

  private async finalizeBillsForMonth(
    userId: string,
    monthId: number,
    actual: number,
    tx?: TxClient,
  ) {
    const monthIdBig = BigInt(monthId);
    const month = await this.monthQuery.findMonthWithRun(monthIdBig, tx);
    if (!month || month.budgetRun.userId !== userId)
      throw new ForbiddenException('Forbidden');
    const jars = await this.monthQuery.findJarsForMonth(
      monthIdBig,
      ['fun', 'give', 'learning', 'free_cash', 'future_you'],
      tx,
    );
    return this.finalizeBillsForMonthWithContext(
      userId,
      monthId,
      actual,
      { month, jars },
      tx!,
    );
  }

  async resolveWeek(userId: string, monthId: number) {
    
    return wrapAsync(this.logger, 'resolveWeek', async () => {
      const monthIdBig = BigInt(monthId);

      // ——— Load phase: all DB reads ———
      const ctx = await this.loadResolveWeekContext(monthIdBig);
      if (!ctx)
        throw new ForbiddenException('Forbidden or Month not found');
      const { month, spendModeRate, pendingCurrentWeek, nextWeek, existingNextWeekEvent, spawnTemplateId } = ctx;

      if (month.budgetRun.userId !== userId)
        throw new ForbiddenException('Forbidden or Month not found');
      if (month.currentWeek >= 5)
        throw new BadRequestException('Month already complete');
      if (pendingCurrentWeek)
        throw new BadRequestException('Previous week event unresolved');

      const config = this.configService.getConfig();
      const maxForcedRest =
        config.indexRules.stressMode?.maxForcedRestPerMonth ?? 1;
      const hiRecoveryFromForcedRest = 5;

      // ——— Compute phase: in-memory only ———
      const idx = month.indexResolution;
      const currentHi = idx ? Number(idx.hiEnd ?? idx.hiStart ?? 50) : 50;
      const didForcedRest = !!(
        idx &&
        idx.forcedRestWeek == null &&
        currentHi < config.indexRules.hiFloor &&
        maxForcedRest >= 1
      );
      let incomeLossFromForcedRest = 0;
      if (didForcedRest) {
        const jobState = month.budgetRun.jobState;
        const levels = jobState?.job?.levels ?? [];
        const levelRow =
          levels.find((l) => l.level === jobState?.level) ?? levels[0];
        incomeLossFromForcedRest =
          levelRow?.absenceDeductionPerDay != null
            ? Number(levelRow.absenceDeductionPerDay)
            : 0;
      }

      const spendResult = this.computeSpendJarsInMemory(
        month,
        month.jars,
        spendModeRate,
        nextWeek,
      );

      const hasEvent = didForcedRest
        ? false
        : !!(existingNextWeekEvent || spawnTemplateId != null);
      const forcedRestPayload = didForcedRest
        ? {
            incomeLoss: incomeLossFromForcedRest,
            hiRecovery: hiRecoveryFromForcedRest,
          }
        : null;

      const futureYouJar = month.jars.find((j) => j.jarCode === JarCode.futureYou);
      const futureRemainInMonth = futureYouJar
        ? BudgetSimulationMonthService.jarAvailable(
            Number(futureYouJar.allocatedAmount),
            Number(futureYouJar.spentAmount),
            Number(futureYouJar.overflowInAmount),
            Number(futureYouJar.overflowOutAmount),
          )
        : 0;

      // ——— Write phase: transaction with writes only ———
      type ResolveTxResult = readonly [
        { type: string; jar: string; amount: number; jarBalance: number; label: string }[],
        unknown,
        { actual: number } | null,
        typeof forcedRestPayload,
      ];
      const [entries, eventPending, billsFromTx, forcedRestNotice] =
        await this.prisma.$transaction(async (tx) => {
          await this.monthRepository.updateMonth(
            monthIdBig,
            { currentWeek: nextWeek },
            tx,
          );

          if (didForcedRest) {
            await this.monthRepository.updateIndexResolution(
              monthIdBig,
              {
                forcedRestWeek: nextWeek,
                incomeLossFromForcedRest,
                hiRecoveryFromForcedRest: hiRecoveryFromForcedRest,
              },
              tx,
            );
          }

          for (const op of spendResult.spendOps) {
            await this.addSpendLog(
              monthIdBig,
              op.jarCode,
              op.amount,
              0,
              0,
              tx,
            );
          }

          let eventPayload: unknown = null;
          if (!didForcedRest && existingNextWeekEvent) {
            eventPayload = {
              templateId: existingNextWeekEvent.template.id.toString(),
              title: existingNextWeekEvent.template.title,
              description: existingNextWeekEvent.template.description,
              options: existingNextWeekEvent.template.options.map((o) => ({
                optionId: o.id.toString(),
                optionLabel: o.optionLabel,
                description: o.description,
                defaultJarCode: o.moneyJarCode,
                moneyDelta: o.moneyDelta,
                healthDelta: o.healthDelta,
                lqiDelta: o.lqiDelta,
                learningXpDelta: o.learningXpDelta,
              })),
            };
          } else if (!didForcedRest && spawnTemplateId != null) {
            const created = await this.monthRepository.createEventWithTemplate(
              monthIdBig,
              spawnTemplateId,
              nextWeek,
              tx,
            );
            eventPayload = {
              templateId: created.template.id.toString(),
              title: created.template.title,
              description: created.template.description,
              options: created.template.options.map((o) => ({
                optionId: o.id.toString(),
                optionLabel: o.optionLabel,
                description: o.description,
                defaultJarCode: o.moneyJarCode,
                moneyDelta: o.moneyDelta,
                healthDelta: o.healthDelta,
                lqiDelta: o.lqiDelta,
                learningXpDelta: o.learningXpDelta,
              })),
            };
          }

          if (!eventPayload) {
            await this.computeAndPersistWeeklyIndexResolution(
              monthIdBig,
              nextWeek,
              spendResult.weeklySpend,
              forcedRestPayload,
              tx,
              {
                month,
                eventTotals: { healthDeltaTotal: 0, lqiDeltaTotal: 0 },
              },
            );
          }

          let billsFromTxInner: { actual: number } | null = null;
          if (nextWeek === END_OF_MONTH_WEEK && !eventPayload) {
            const billResult = await this.finalizeBills(
              Number(month.budgetRunId),
              month.monthIndex,
              month.billsEstimated,
            );
            const jarsAfterSpend = month.jars.map((j) => {
              const op = spendResult.spendOps.find((o) => o.jarCode === j.jarCode);
              const add = op ? op.amount : 0;
              return {
                ...j,
                spentAmount: Number(j.spentAmount) + add,
              };
            });
            await this.finalizeBillsForMonthWithContext(
              userId,
              Number(monthId),
              billResult.actual,
              { month, jars: jarsAfterSpend },
              tx,
              nextWeek,
            );
            await this.monthRepository.updateMonth(
              monthIdBig,
              {
                currentWeek: 5,
                cumulativeFutureYou: { increment: futureRemainInMonth },
              },
              tx,
            );
            billsFromTxInner = billResult;
          }

          return [
            spendResult.entries,
            eventPayload,
            billsFromTxInner,
            forcedRestPayload,
          ] as ResolveTxResult;
        });

      // ——— Response: single read for updated state ———
      const refreshedMonth =
        await this.monthQuery.findMonthWithJars(monthIdBig);
      const monthComplete =
        nextWeek === END_OF_MONTH_WEEK && !eventPending;
      const bills = monthComplete ? billsFromTx ?? null : null;
      const futureTotal = refreshedMonth?.cumulativeFutureYou ?? month.cumulativeFutureYou;
      const freeCashBalance = refreshedMonth?.freeCash ?? month.freeCash;
      const spendingSummary: Record<string, number> = {};
      if (refreshedMonth) {
        for (const j of refreshedMonth.jars) {
          spendingSummary[j.jarCode] = Number(j.spentAmount);
        }
      }

      const hiAfter = clampHi(
        Number(
          refreshedMonth?.indexResolution?.hiEnd ??
            refreshedMonth?.indexResolution?.hiStart ??
            50,
        ),
        config,
      );
      const lqiAfter = clampLqi(
        Number(
          refreshedMonth?.indexResolution?.lqiEnd ??
            refreshedMonth?.indexResolution?.lqiStart ??
            50,
        ),
        config,
      );

      const systemNotice =
        forcedRestNotice != null
          ? {
              type: 'forced_rest' as const,
              title: 'Forced Rest',
              message:
                'HI quá thấp. Bạn phải nghỉ 1 ngày, một ca làm bị hủy (không lương).',
              week: nextWeek,
              effects: {
                incomeLoss: forcedRestNotice.incomeLoss,
                hiRecovery: forcedRestNotice.hiRecovery,
              },
            }
          : null;

      return {
        week: nextWeek,
        entries,
        hiAfter,
        lqiAfter,
        systemNotice,
        eventPending: eventPending ?? undefined,
        monthComplete,
        bills,
        futureYouTotal: futureTotal,
        freeCashBalance,
        spendingSummary,
      };
    });
  }

  /** Get available amount for a jar from pre-loaded month with jars (no DB). */
  private static jarAvailableFromLoaded(
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
    if (jarCode === 'free_cash') {
      return Math.max(0, Number(month.freeCash ?? 0));
    }
    const jar = jars.find((j) => j.jarCode === jarCode);
    if (!jar) return 0;
    return BudgetSimulationMonthService.jarAvailable(
      Number(jar.allocatedAmount),
      Number(jar.spentAmount),
      Number(jar.overflowInAmount),
      Number(jar.overflowOutAmount),
    );
  }

  async applyEventChoice(
    userId: string,
    monthId: number,
    week: number,
    optionId: number,
    paymentJarCode: string,
    coverJarCodes: string[] = [],
  ) {
    return wrapAsync(this.logger, 'applyEventChoice', async () => {
      const monthIdBig = BigInt(monthId);
      const [month, event, option] = await Promise.all([
        this.monthQuery.findMonthWithRunAndJars(monthIdBig),
        this.monthQuery.findPendingEvent(monthIdBig, week),
        this.monthQuery.findLifeEventOptionById(BigInt(optionId)),
      ]);

      if (!month || month.budgetRun.userId !== userId) {
        throw new ForbiddenException('Forbidden or Month not found');
      }
      if (!event)
        throw new BadRequestException('No pending event for this week');
      if (!option || option.eventTemplateId !== event.eventTemplateId) {
        throw new BadRequestException('Invalid option');
      }

      if (!BudgetSimulationMonthService.VALID_JAR_CODES.has(paymentJarCode)) {
        throw new BadRequestException(`Invalid payment jar: ${paymentJarCode}`);
      }
      for (const code of coverJarCodes) {
        if (!BudgetSimulationMonthService.VALID_JAR_CODES.has(code)) {
          throw new BadRequestException(`Invalid cover jar: ${code}`);
        }
      }
      if (coverJarCodes.includes(paymentJarCode)) {
        throw new BadRequestException(
          'Cover jars must not duplicate the payment jar',
        );
      }

      const moneyDelta = option.moneyDelta ?? 0;
      const cost = moneyDelta < 0 ? Math.abs(moneyDelta) : 0;
      const paymentRecord: { jar: string; amount: number }[] = [];
      const learningXpDelta = option.learningXpDelta ?? 0;
      const jars = month.jars;

      if (cost > 0) {
        const primaryAvailable =
          BudgetSimulationMonthService.jarAvailableFromLoaded(
            month,
            jars,
            paymentJarCode,
          );
        if (primaryAvailable >= cost) {
          paymentRecord.push({ jar: paymentJarCode, amount: cost });
        } else {
          const firstDeduct = primaryAvailable;
          let remaining = cost - firstDeduct;
          paymentRecord.push({ jar: paymentJarCode, amount: firstDeduct });
          for (const coverJar of coverJarCodes) {
            if (remaining <= 0) break;
            const coverAvailable =
              BudgetSimulationMonthService.jarAvailableFromLoaded(
                month,
                jars,
                coverJar,
              );
            const deduct = Math.min(coverAvailable, remaining);
            if (deduct > 0) {
              paymentRecord.push({ jar: coverJar, amount: deduct });
              remaining -= deduct;
            }
          }
          if (remaining > 0) {
            throw new BadRequestException(
              'Not enough funds to cover this option.',
            );
          }
        }
      }

      const futureYouJar = jars.find((j) => j.jarCode === JarCode.futureYou);
      const futureRemainInMonth = futureYouJar
        ? BudgetSimulationMonthService.jarAvailable(
            Number(futureYouJar.allocatedAmount),
            Number(futureYouJar.spentAmount),
            Number(futureYouJar.overflowInAmount),
            Number(futureYouJar.overflowOutAmount),
          )
        : 0;

      const config = this.configService.getConfig();
      const eventTotals = {
        healthDeltaTotal: Number(option.healthDelta ?? 0),
        lqiDeltaTotal: Number(option.lqiDelta ?? 0),
      };

      let monthAfterPayment: typeof month | null = null;
      let jarsAfterPayment: typeof month.jars | null = null;
      if (week === END_OF_MONTH_WEEK) {
        const freeCashSpent = paymentRecord
          .filter((r) => r.jar === 'free_cash')
          .reduce((s, r) => s + r.amount, 0);
        const incomeToFreeCash =
          moneyDelta > 0 && (option.moneyJarCode ?? 'free_cash') === 'free_cash'
            ? moneyDelta
            : 0;
        const freeCashAfter =
          Number(month.freeCash ?? 0) - freeCashSpent + incomeToFreeCash;
        monthAfterPayment = {
          ...month,
          freeCash: freeCashAfter,
        };
        jarsAfterPayment = month.jars.map((j) => {
          const paid = paymentRecord.find((r) => r.jar === j.jarCode);
          const incomeToJar =
            moneyDelta > 0 &&
            (option.moneyJarCode ?? 'free_cash') === j.jarCode
              ? moneyDelta
              : 0;
          return {
            ...j,
            spentAmount: Number(j.spentAmount) + (paid?.amount ?? 0),
            overflowInAmount:
              Number(j.overflowInAmount) + incomeToJar,
          };
        });
      }

      type TxResult = {
        indexResult: { hiEnd: number; lqiEnd: number } | undefined;
        bills: { actual: number } | null;
        monthComplete: boolean;
        futureYouTotal: number;
        spendingSummary: Record<string, number>;
      };
      const txResult = await this.prisma.$transaction(async (tx): Promise<TxResult> => {
        const paymentWrites: Promise<unknown>[] = [];
        if (cost > 0) {
          for (const { jar, amount } of paymentRecord) {
            if (jar === 'free_cash') {
              paymentWrites.push(
                this.monthRepository.updateMonth(
                  monthIdBig,
                  { freeCash: { decrement: amount } },
                  tx,
                ),
              );
            } else {
              paymentWrites.push(
                this.addSpendLog(monthIdBig, jar, amount, 0, 0, tx),
              );
            }
          }
        } else if (moneyDelta > 0) {
          const jar = option.moneyJarCode ?? 'free_cash';
          if (jar === 'free_cash') {
            paymentWrites.push(
              this.monthRepository.updateMonth(
                monthIdBig,
                { freeCash: { increment: moneyDelta } },
                tx,
              ),
            );
          } else {
            paymentWrites.push(
              this.addSpendLog(monthIdBig, jar, 0, moneyDelta, 0, tx),
            );
          }
        }
        await Promise.all(paymentWrites);

        const paymentBreakdown =
          paymentRecord.length > 0
            ? paymentRecord.map(({ jar, amount }) => ({
                jarCode: jar,
                amount,
              }))
            : {};

        await this.monthRepository.updateEventChosen(
          event.id,
          BigInt(optionId),
          paymentBreakdown,
          tx,
        );

        if (learningXpDelta !== 0 && month.budgetRun.jobStateId != null) {
          await this.runRepository.updateUserJobState(
            month.budgetRun.jobStateId,
            { xp: { increment: learningXpDelta } },
            tx,
          );
        }

        const indexResult = await this.computeAndPersistWeeklyIndexResolution(
          monthIdBig,
          week,
          { fun: 0, learning: 0, give: 0 },
          null,
          tx,
          { month, eventTotals },
        );

        let bills: { actual: number } | null = null;
        let monthComplete = false;
        let futureYouTotal = 0;
        const spendingSummary: Record<string, number> = {};

        if (week === END_OF_MONTH_WEEK && monthAfterPayment && jarsAfterPayment) {
          const billResult = await this.finalizeBills(
            Number(month.budgetRunId),
            month.monthIndex,
            month.billsEstimated,
          );
          await this.finalizeBillsForMonthWithContext(
            userId,
            Number(monthId),
            billResult.actual,
            { month: monthAfterPayment, jars: jarsAfterPayment },
            tx,
          );
          await this.monthRepository.updateMonth(
            monthIdBig,
            {
              currentWeek: 5,
              cumulativeFutureYou: { increment: futureRemainInMonth },
            },
            tx,
          );
          monthComplete = true;
          bills = billResult;
          futureYouTotal =
            Number(month.cumulativeFutureYou ?? 0) + futureRemainInMonth;
          for (const j of jarsAfterPayment) {
            spendingSummary[j.jarCode] = Number(j.spentAmount);
          }
        }

        return {
          indexResult,
          bills,
          monthComplete,
          futureYouTotal,
          spendingSummary,
        };
      });

      const hiAfter = txResult.indexResult
        ? clampHi(txResult.indexResult.hiEnd, config)
        : clampHi(50, config);
      const lqiAfter = txResult.indexResult
        ? clampLqi(txResult.indexResult.lqiEnd, config)
        : clampLqi(50, config);

      return {
        optionId: optionId,
        optionLabel: option.optionLabel,
        healthDelta: option.healthDelta,
        lqiDelta: option.lqiDelta,
        learningXpDelta: option.learningXpDelta,
        moneyDelta: option.moneyDelta,
        defaultJarCode: option.moneyJarCode ?? undefined,
        paymentRecord: paymentRecord,
        hiAfter,
        lqiAfter,
        monthComplete: txResult.monthComplete,
        bills: txResult.bills,
        futureYouTotal: txResult.futureYouTotal,
        futureRemainInMonth,
        spendingSummary: txResult.spendingSummary,
      };
    });
  }
}
