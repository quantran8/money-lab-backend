import { Injectable, Logger } from '@nestjs/common';
import { TxClient } from '#app/prisma/transaction.runner.js';
import { AssetQuery } from '../queries/asset.query.js';
import { InvestMarketQuery } from '../queries/market.query.js';
import { InvestMarketRepository } from '../repositories/market.repository.js';
import { generateTickPrices, type PriceImpacts } from '../domain/index.js';

@Injectable()
export class InvestPricingService {
  private readonly logger = new Logger(InvestPricingService.name);

  constructor(
    private readonly assetQuery: AssetQuery,
    private readonly marketQuery: InvestMarketQuery,
    private readonly marketRepo: InvestMarketRepository,
  ) {}

  /**
   * Generate and persist prices for all active assets at the given tick.
   * Takes pre-computed impacts from spotlight/arc services.
   */
  async generatePricesForTick(
    tickId: bigint,
    tickIndex: bigint,
    spotlightAssetImpacts: Record<string, number>,
    arcAssetImpacts: Record<string, number>,
    policyAssetImpacts: Record<string, number>,
    sectorImpacts: Record<string, number>,
    tx: TxClient,
  ): Promise<void> {
    const assets = await this.assetQuery.findAllWithSector();

    // Build previous price map from the most recent tick before this one
    const prevPrices: Record<string, number> = {};
    const prices = await this.marketQuery.findLatestPrices(tickId);
    // If this is the first tick, there won't be any previous prices yet.
    // In that case we rely on the default in generateTickPrices (100).
    if (prices.length === 0) {
      // Try previous tick
      const prevTick = await this.marketQuery.findCurrentTick();
      if (prevTick && prevTick.id !== tickId) {
        const prev = await this.marketQuery.findLatestPrices(prevTick.id);
        for (const p of prev) {
          prevPrices[p.assetId.toString()] = p.price;
        }
      }
    } else {
      for (const p of prices) {
        prevPrices[p.assetId.toString()] = p.price;
      }
    }

    // Build per-asset impacts
    const impactsPerAsset: Record<string, PriceImpacts> = {};
    for (const asset of assets) {
      const key = asset.id.toString();
      const sectorCode = asset.sector.code;
      impactsPerAsset[key] = {
        sectorImpact: sectorImpacts[sectorCode] ?? 0,
        spotlightImpact: spotlightAssetImpacts[key] ?? 0,
        arcImpact: arcAssetImpacts[key] ?? 0,
        policyImpact: policyAssetImpacts[key] ?? 0,
      };
    }

    // Generate (pure domain)
    const results = generateTickPrices(
      assets.map((a) => ({ id: a.id, volatilityProfile: a.volatilityProfile })),
      prevPrices,
      tickIndex,
      impactsPerAsset,
    );

    // Persist
    const priceData = Object.entries(results).map(([assetIdStr, r]) => ({
      assetId: BigInt(assetIdStr),
      tickId,
      price: r.price,
      changeFromPrev: r.changeFromPrev,
      changePct: r.changePct,
    }));

    if (priceData.length > 0) {
      await this.marketRepo.createPricePoints(priceData, tx);
    }
  }
}
