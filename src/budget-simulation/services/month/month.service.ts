import { Injectable } from '@nestjs/common';
import { wrapAsync } from '@common/utils/async.utils';
import { Logger } from '@nestjs/common';
import { MonthWeekService } from './month-week.service';
import { MonthEventService } from './month-event.service';

/**
 * Month orchestration: routes resolveWeek and applyEventChoice to dedicated services.
 */
@Injectable()
export class BudgetSimulationMonthService {
  private readonly logger = new Logger(BudgetSimulationMonthService.name);

  constructor(
    private readonly weekService: MonthWeekService,
    private readonly eventService: MonthEventService,
  ) {}

  resolveWeek(userId: string, monthId: number) {
    return this.weekService.resolveWeek(userId, monthId);
  }

  applyEventChoice(
    userId: string,
    monthId: number,
    week: number,
    optionId: number,
    paymentJarCode: string,
    coverJarCodes: string[] = [],
  ) {
    return wrapAsync(this.logger, 'applyEventChoice', () =>
      this.eventService.applyChoice(
        userId,
        monthId,
        week,
        optionId,
        paymentJarCode,
        coverJarCodes,
      ),
    );
  }
}
