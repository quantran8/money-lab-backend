import { Module } from '@nestjs/common';
import { BudgetController } from './budget-simuation.controller';
import { BudgetSimulationService } from './budget-simuation.service';

@Module({
    controllers: [BudgetController],
    providers: [BudgetSimulationService],
})
export class BudgetModule { }
