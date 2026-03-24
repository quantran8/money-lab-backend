import { Injectable, OnModuleInit } from '@nestjs/common';
import type { BudgetSimulationModuleConfig } from '../budget-simulation.constant';
import { BUDGET_SIMULATION_MODULE_ID } from '../budget-simulation.constant';
import { CommitmentLayer } from '../budget-simulation.enum';
import { ModuleQuery } from '../queries/module.query';
import { CommitmentQuery, HousingModifierRow } from '../queries/commitment.query';

/** Cached bill template shape (subset of CommitmentTemplate). */
export interface CachedBillTemplate {
  id: bigint;
  name: string;
  layer: string;
  baseMonthlyAmount: number;
}

/**
 * Holds budget-simulation module config and cached reference data loaded once at app init.
 * Inject this service to read config/bill templates without querying DB each time.
 */
@Injectable()
export class BudgetSimulationConfigService implements OnModuleInit {
  private config: BudgetSimulationModuleConfig | null = null;
  private billTemplatesCache: CachedBillTemplate[] = [];
  private housingModifiersCache: HousingModifierRow[] = [];

  constructor(
    private readonly moduleQuery: ModuleQuery,
    private readonly commitmentQuery: CommitmentQuery,
  ) {}

  async onModuleInit(): Promise<void> {
    const [config, billTemplates, housingModifiers] = await Promise.all([
      this.moduleQuery.getModuleConfig(BUDGET_SIMULATION_MODULE_ID),
      this.commitmentQuery.findBillTemplatesByLayer(
        BUDGET_SIMULATION_MODULE_ID,
        CommitmentLayer.bills,
      ),
      this.commitmentQuery.findHousingModifiersAll(),
    ]);
    this.config = config;
    this.billTemplatesCache = billTemplates.map((t) => ({
      id: t.id,
      name: t.name,
      layer: t.layer,
      baseMonthlyAmount: t.baseMonthlyAmount,
    }));
    this.housingModifiersCache = housingModifiers;
  }

  /** Returns module config (camelCase). Throws if config not yet loaded. */
  getConfig(): BudgetSimulationModuleConfig {
    if (this.config == null) {
      throw new Error(
        'BudgetSimulationConfigService: config not loaded yet (onModuleInit may not have run)',
      );
    }
    return this.config;
  }

  /** Returns module config or null if not yet loaded. */
  getConfigOrNull(): BudgetSimulationModuleConfig | null {
    return this.config;
  }

  /** Returns cached bill templates (loaded once at init). */
  getBillTemplates(): CachedBillTemplate[] {
    return this.billTemplatesCache;
  }

  /** Returns cached housing utility modifiers (loaded once at init). */
  getHousingModifiers(): HousingModifierRow[] {
    return this.housingModifiersCache;
  }

  /** Returns housing modifiers filtered by commitment ids. */
  getHousingModifiersByCommitmentIds(ids: bigint[]): HousingModifierRow[] {
    if (ids.length === 0) return [];
    const idSet = new Set(ids.map((id) => id.toString()));
    return this.housingModifiersCache.filter((m) =>
      idSet.has(m.housingCommitmentId.toString()),
    );
  }
}
