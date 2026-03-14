import { Controller, Get, Post, Body, Request, UseGuards, Param } from '@nestjs/common';
import { BudgetSimulationService } from './budget-simulation.service';
import {
    StartRunDto,
    StartMonthDto,
    ResolveWeekDto,
    ApplyEventChoiceDto,
} from './dto';
import { AuthGuard } from 'src/auth/auth.guard';
import { getUserId } from 'src/common/utils/auth.utils';


@Controller('budget-simulation')
@UseGuards(AuthGuard)
export class BudgetController {
    constructor(private readonly budgetService: BudgetSimulationService) { }

    @Get('get-setup-options')
    getSetupOptions() {
        return this.budgetService.getSetupOptions();
    }

    @Post('start-run')
    startRun(@Request() req: { user?: { id: string } }, @Body() body: StartRunDto) {
        return this.budgetService.startBudgetRun(
            getUserId(req),
            body.moduleId,
            body.jobId,
            body.commitmentAmounts as Record<number, number>,
        );
    }

    @Post('start-month')
    startMonth(@Request() req: { user?: { id: string } }, @Body() body: StartMonthDto) {
        return this.budgetService.startMonth(
            getUserId(req),
            body.runId,
            body.allocations,
            body.billReserveOptionCode,
            body.spendModeCode,
        );
    }

    @Post('resolve-week')
    resolveWeek(@Request() req: { user?: { id: string } }, @Body() body: ResolveWeekDto) {
        return this.budgetService.resolveWeek(getUserId(req), body.monthId);
    }

    @Post('apply-event-choice')
    applyEventChoice(@Request() req: { user?: { id: string } }, @Body() body: ApplyEventChoiceDto) {
        return this.budgetService.applyEventChoice(
            getUserId(req),
            body.monthId,
            body.week,
            body.optionId,
            body.paymentJarCode,
            body.coverJarCodes ?? [],
        );
    }

    @Get('active-run')
    getActiveRun(@Request() req: { user?: { id: string } }) {
        return this.budgetService.getActiveBudgetRun(getUserId(req));
    }

    @Post('run/:runId/prepare-next-month')
    prepareNextMonth(@Request() req: { user?: { id: string } }, @Param('runId') runId: string) {
        return this.budgetService.prepareNextMonth(getUserId(req), parseInt(runId));
    }
}
