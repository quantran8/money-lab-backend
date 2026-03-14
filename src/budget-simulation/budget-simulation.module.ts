import { Global, Module } from '@nestjs/common';
import { BudgetController } from './budget-simulation.controller';
import { BudgetSimulationService } from './budget-simulation.service';
import { BudgetSimulationConfigService } from './services/config.service';
import { BudgetSimulationSetupService } from './services/setup.service';
import { BudgetSimulationRunService } from './services/run.service';
import { BudgetSimulationMonthService } from './services/month.service';
import { BudgetRunQuery } from './queries/run.query';
import { BudgetMonthQuery } from './queries/month.query';
import { CommitmentQuery } from './queries/commitment.query';
import { ModuleQuery } from './queries/module.query';
import { BudgetRunRepository } from './repositories/run.repository';
import { BudgetMonthRepository } from './repositories/month.repository';

@Global()
@Module({
  controllers: [BudgetController],
  providers: [
    ModuleQuery,
    BudgetSimulationConfigService,
    BudgetRunQuery,
    BudgetMonthQuery,
    CommitmentQuery,
    BudgetRunRepository,
    BudgetMonthRepository,
    BudgetSimulationSetupService,
    BudgetSimulationRunService,
    BudgetSimulationMonthService,
    BudgetSimulationService,
  ],
  exports: [BudgetSimulationConfigService],
})
export class BudgetModule {}
