import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { wrapAsync } from '#common/utils/async.utils.js';
import { InvestAssetQuery } from '../queries/asset.query.js';
import { InvestMarketQuery } from '../queries/market.query.js';
import { DEFAULT_PRICE_HISTORY_LIMIT } from '../invest-simulation.constant.js';

@Injectable()
export class InvestAssetService {
  private readonly logger = new Logger(InvestAssetService.name);

  constructor(
    private readonly assetQuery: InvestAssetQuery,
    private readonly marketQuery: InvestMarketQuery,
  ) {}

  async getAssetList() {
    return wrapAsync(this.logger, 'getAssetList', async () => {
      const [assets, tick] = await Promise.all([
        this.assetQuery.findAllWithSector(),
        this.marketQuery.findCurrentTick(),
      ]);

      let priceMap: Record<string, { price: number; changePct: number }> = {};
      if (tick) {
        const prices = await this.marketQuery.findLatestPrices(tick.id);
        for (const p of prices) {
          priceMap[p.assetId.toString()] = {
            price: p.price,
            changePct: Number(p.changePct),
          };
        }
      }

      return assets.map((a) => ({
        id: a.id.toString(),
        code: a.code,
        name: a.name,
        assetType: a.assetType,
        riskTier: a.riskTier,
        sector: { id: a.sector.id, code: a.sector.code, name: a.sector.name },
        latestPrice: priceMap[a.id.toString()]?.price ?? null,
        changePct: priceMap[a.id.toString()]?.changePct ?? null,
      }));
    });
  }

  async getAssetDetail(assetId: bigint) {
    return wrapAsync(this.logger, 'getAssetDetail', async () => {
      const [asset, priceHistory] = await Promise.all([
        this.assetQuery.findById(assetId),
        this.marketQuery.findPriceHistory(assetId, DEFAULT_PRICE_HISTORY_LIMIT),
      ]);

      if (!asset) throw new NotFoundException('Asset not found');

      return {
        id: asset.id.toString(),
        code: asset.code,
        name: asset.name,
        assetType: asset.assetType,
        riskTier: asset.riskTier,
        volatilityProfile: asset.volatilityProfile,
        attentionSensitivity: asset.attentionSensitivity,
        description: asset.description,
        sector: { id: asset.sector.id, code: asset.sector.code, name: asset.sector.name },
        priceHistory: priceHistory.map((p) => ({
          tickId: p.tickId.toString(),
          price: p.price,
          changeFromPrev: p.changeFromPrev,
          changePct: Number(p.changePct),
        })),
      };
    });
  }
}
