import { Injectable, OnModuleInit } from '@nestjs/common';
import type { BudgetSimulationModuleConfig } from '../budget-simulation.constant';
import { BUDGET_SIMULATION_MODULE_ID } from '../budget-simulation.constant';
import { ModuleQuery } from '../queries/module.query';

/**
 * Holds budget-simulation module config loaded once at app init.
 * Inject this service to read config without querying DB each time.
 */
@Injectable()
export class BudgetSimulationConfigService implements OnModuleInit {
  private config: BudgetSimulationModuleConfig | null = null;

  constructor(private readonly moduleQuery: ModuleQuery) {}

  async onModuleInit(): Promise<void> {
    this.config = await this.moduleQuery.getModuleConfig(
      BUDGET_SIMULATION_MODULE_ID,
    );
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
}
