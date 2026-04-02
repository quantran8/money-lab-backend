import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InvestMarketRepository } from '../repositories/market.repository.js';
import { InvestTickService } from './tick.service.js';

@Injectable()
export class InvestTickScheduler implements OnModuleInit {
  private readonly logger = new Logger(InvestTickScheduler.name);
  private running = false;

  constructor(
    private readonly tickService: InvestTickService,
    private readonly marketRepo: InvestMarketRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.marketRepo.repairIdSequence();
      this.logger.log('market_ticks id sequence repaired');
    } catch (error) {
      this.logger.warn(
        'Failed to repair market_ticks id sequence',
        error instanceof Error ? error.message : error,
      );
    }
  }

  /**
   * Auto-advance the simulation by one tick every 6 hours.
   * Schedule: 0:00, 6:00, 12:00, 18:00 UTC
   *
   * Guard: if a previous tick is still running, skip the invocation
   * to avoid overlapping transactions.
   */
  @Cron(CronExpression.EVERY_12_HOURS)
  async handleTickCron(): Promise<void> {
    if (this.running) {
      this.logger.warn('Tick cron skipped — previous tick still running');
      return;
    }

    this.running = true;
    try {
      this.logger.log('Cron triggered: running tick…');
      const result = await this.tickService.runTick();
      this.logger.log(
        `Cron tick ${result.tickIndex} completed — ` +
          `day ${result.simDay}/${result.simMonth}/${result.simYear}`,
      );
    } catch (error) {
      this.logger.error(
        'Cron tick failed',
        error instanceof Error ? error.stack : error,
      );
    } finally {
      this.running = false;
    }
  }
}
