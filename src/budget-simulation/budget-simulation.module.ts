import { Global, Module } from '@nestjs/common';
import { BudgetController } from './budget-simulation.controller';
import { BudgetSimulationService } from './budget-simulation.service';
import { BudgetSimulationConfigService } from './services/config.service';
import { BudgetSimulationSetupService } from './services/setup.service';
import { BudgetSimulationRunCommitmentService } from './services/run/run-commitment.service';
import { BudgetSimulationRunService } from './services/run/run.service';
import { BudgetSimulationMonthService } from './services/month/month.service';
import { MonthWeekService } from './services/month/month-week.service';
import { MonthEventService } from './services/month/month-event.service';
import { MonthSpendService } from './services/month/month-spend.service';
import { MonthIndexService } from './services/month/month-index.service';
import { MonthBillService } from './services/month/month-bill.service';
import { BudgetRunQuery } from './queries/run.query';
import { BudgetMonthQuery } from './queries/month.query';
import { CommitmentQuery } from './queries/commitment.query';
import { ModuleQuery } from './queries/module.query';
import { BudgetRunRepository } from './repositories/run.repository';
import { BudgetMonthRepository } from './repositories/month.repository';
import { TransactionRunner } from '@app/prisma/transaction.runner';

@Global()
@Module({
  controllers: [BudgetController],
  providers: [
    TransactionRunner,
    ModuleQuery,
    BudgetSimulationConfigService,
    BudgetRunQuery,
    BudgetMonthQuery,
    CommitmentQuery,
    BudgetRunRepository,
    BudgetMonthRepository,
    BudgetSimulationSetupService,
    BudgetSimulationRunService,
    BudgetSimulationRunCommitmentService,
    MonthSpendService,
    MonthIndexService,
    MonthBillService,
    MonthEventService,
    MonthWeekService,
    BudgetSimulationMonthService,
    BudgetSimulationService,
  ],
  exports: [BudgetSimulationConfigService],
})
export class BudgetModule {}
