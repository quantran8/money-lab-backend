import { Controller, Get, Post, Body, Request, UnauthorizedException, UseGuards } from '@nestjs/common';
import { BudgetService } from './budget-simuation.service';
import {
    StartRunDto,
    StartMonthDto,
    ResolveWeekDto,
    ApplyEventChoiceDto,
} from './dto';
import { AuthGuard } from 'src/auth/auth.guard';
import { getUserId } from './budget-simuation.helpers';


@Controller('budget-simulation')
@UseGuards(AuthGuard)
export class BudgetController {
    constructor(private readonly budgetService: BudgetService) { }

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
}
