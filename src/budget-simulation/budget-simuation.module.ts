import { Module } from '@nestjs/common';
import { BudgetController } from './budget-simuation.controller';
import { BudgetSimulationService } from './budget-simuation.service';
import { BudgetSimulationSetupService } from './services/setup.service';
import { BudgetSimulationRunService } from './services/run.service';
import { BudgetSimulationMonthService } from './services/month.service';
import { BudgetRunQuery } from './queries/run.query';
import { BudgetMonthQuery } from './queries/month.query';
import { CommitmentQuery } from './queries/commitment.query';
import { BudgetRunRepository } from './repositories/run.repository';
import { BudgetMonthRepository } from './repositories/month.repository';

@Module({
  controllers: [BudgetController],
  providers: [
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
})
export class BudgetModule {}
