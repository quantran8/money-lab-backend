import { Injectable } from '@nestjs/common';
import { BudgetSimulationSetupService } from './services/setup.service';
import { BudgetSimulationRunService } from './services/run.service';
import { BudgetSimulationMonthService } from './services/month/month.service';

/**
 * Facade for budget-simulation domain. Delegates to setup, run, and month services.
 * Keeps controller thin and single entry point per domain.
 */
@Injectable()
export class BudgetSimulationService {
  constructor(
    private readonly setupService: BudgetSimulationSetupService,
    private readonly runService: BudgetSimulationRunService,
    private readonly monthService: BudgetSimulationMonthService,
  ) {}

  async getSetupOptions() {
    return this.setupService.getSetupOptions();
  }

  async getActiveBudgetRun(userId: string) {
    return this.runService.getActiveBudgetRun(userId);
  }

  async startBudgetRun(
    userId: string,
    moduleId: number,
    jobId: number,
    commitmentAmounts: Record<number, number>,
  ) {
    return this.runService.startBudgetRun(
      userId,
      moduleId,
      jobId,
      commitmentAmounts,
    );
  }

  async startMonth(
    userId: string,
    runId: number,
    allocations: Record<string, number>,
    billReserveOptionCode: string,
    spendModeCode: string,
  ) {
    return this.runService.startMonth(
      userId,
      runId,
      allocations,
      billReserveOptionCode,
      spendModeCode,
    );
  }

  async resolveWeek(userId: string, monthId: number) {
    return this.monthService.resolveWeek(userId, monthId);
  }

  async applyEventChoice(
    userId: string,
    monthId: number,
    week: number,
    optionId: number,
    paymentJarCode: string,
    coverJarCodes: string[] = [],
  ) {
    return this.monthService.applyEventChoice(
      userId,
      monthId,
      week,
      optionId,
      paymentJarCode,
      coverJarCodes,
    );
  }

  async prepareNextMonth(userId: string, runId: number) {
    return this.runService.prepareNextMonth(userId, runId);
  }
}
