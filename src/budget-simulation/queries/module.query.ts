import { PrismaService } from '#app/prisma/prisma.service.js';
import { Injectable } from '@nestjs/common';
import {
  DEFAULT_BUDGET_SIMULATION_MODULE_CONFIG,
  getBudgetSimulationModuleConfig,
  type BudgetSimulationModuleConfig,
} from '../budget-simulation.constant';

@Injectable()
export class ModuleQuery {
  constructor(private readonly prisma: PrismaService) {}

  async findModuleById(moduleId: number) {
    return this.prisma.module.findUnique({
      where: { id: moduleId },
    });
  }

  /**
   * Loads module by id and returns full budget-simulation config in camelCase.
   * Returns merged default + stored config; null if module not found.
   */
  async getModuleConfig(
    moduleId: number,
  ): Promise<BudgetSimulationModuleConfig> {
    const module = await this.prisma.module.findUnique({
      where: { id: moduleId },
      select: { config: true },
    });
    if (!module) return DEFAULT_BUDGET_SIMULATION_MODULE_CONFIG;
    return getBudgetSimulationModuleConfig(module.config);
  }
}
