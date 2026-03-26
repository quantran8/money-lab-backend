import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { wrapAsync } from '#common/utils/async.utils.js';
import { InvestMarketQuery } from '../queries/market.query.js';
import { InvestAssetQuery } from '../queries/asset.query.js';

@Injectable()
export class InvestMarketStateService {
  private readonly logger = new Logger(InvestMarketStateService.name);

  constructor(
    private readonly marketQuery: InvestMarketQuery,
    private readonly assetQuery: InvestAssetQuery,
  ) {}

  async getCurrentMarketState() {
    return wrapAsync(this.logger, 'getCurrentMarketState', async () => {
      const tick = await this.marketQuery.findCurrentTickWithWorldState();
      if (!tick) throw new NotFoundException('No market ticks available');

      return {
        tickIndex: tick.tickIndex,
        simDay: tick.simDay,
        simMonth: tick.simMonth,
        simYear: tick.simYear,
        worldState: tick.worldState?.stateData ?? {},
      };
    });
  }

  async getLatestPrices() {
    return wrapAsync(this.logger, 'getLatestPrices', async () => {
      const tick = await this.marketQuery.findCurrentTick();
      if (!tick) throw new NotFoundException('No market ticks available');

      const prices = await this.marketQuery.findLatestPrices(tick.id);
      return {
        tickIndex: tick.tickIndex,
        prices: prices.map((p) => ({
          assetId: p.assetId.toString(),
          price: p.price,
          changeFromPrev: p.changeFromPrev,
          changePct: Number(p.changePct),
        })),
      };
    });
  }
}
