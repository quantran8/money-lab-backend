import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { wrapAsync } from '#common/utils/async.utils.js';
import { TxClient } from '#app/prisma/transaction.runner.js';
import { InvestNewsQuery } from '../queries/news.query.js';
import { InvestNewsRepository } from '../repositories/news.repository.js';
import { InvestConfigService } from './config.service.js';
import {
  generateNewsFromTransitions,
  type StateTransitionEvent,
  type GeneratedNewsItem,
} from '../domain/index.js';

@Injectable()
export class InvestNewsService {
  private readonly logger = new Logger(InvestNewsService.name);

  constructor(
    private readonly newsQuery: InvestNewsQuery,
    private readonly newsRepo: InvestNewsRepository,
    private readonly configService: InvestConfigService,
  ) {}

  // ── Public read APIs ──────────────────────────────────────────

  async getNewsFeed(limit: number = 20) {
    return wrapAsync(this.logger, 'getNewsFeed', async () => {
      const items = await this.newsQuery.findRecent(limit);
      return items.map((n) => ({
        id: n.id.toString(),
        tickId: n.tickId.toString(),
        title: n.title,
        body: n.body,
        tone: n.tone,
        intensity: Number(n.intensity),
        narrativeTag: n.narrativeTag,
        createdAt: n.createdAt.toISOString(),
        assetImpacts: n.assetImpacts.map((ai) => ({
          assetId: ai.assetId.toString(),
          impactPct: Number(ai.impactPct),
        })),
        sectorImpacts: n.sectorImpacts.map((si) => ({
          sectorId: si.sectorId,
          impactPct: Number(si.impactPct),
        })),
      }));
    });
  }

  async getNewsById(newsId: bigint) {
    return wrapAsync(this.logger, 'getNewsById', async () => {
      const n = await this.newsQuery.findById(newsId);
      if (!n) throw new NotFoundException('News item not found');
      return {
        id: n.id.toString(),
        tickId: n.tickId.toString(),
        title: n.title,
        body: n.body,
        tone: n.tone,
        intensity: Number(n.intensity),
        narrativeTag: n.narrativeTag,
        createdAt: n.createdAt.toISOString(),
        assetImpacts: n.assetImpacts.map((ai) => ({
          assetId: ai.assetId.toString(),
          impactPct: Number(ai.impactPct),
        })),
        sectorImpacts: n.sectorImpacts.map((si) => ({
          sectorId: si.sectorId,
          impactPct: Number(si.impactPct),
        })),
      };
    });
  }

  // ── Internal: generate news from tick events ───────────────────

  /**
   * Generate and persist news items from state transition events.
   * Returns sector impacts aggregated from all generated news (for price generation).
   */
  async generateNewsForTick(
    tickId: bigint,
    tickIndex: bigint,
    simDay: number,
    simMonth: number,
    simYear: number,
    events: StateTransitionEvent[],
    tx: TxClient,
  ): Promise<Record<string, number>> {
    const items = generateNewsFromTransitions(events, tickIndex);

    const sectors = await this.configService.getSectors();
    const sectorCodeToId: Record<string, number> = {};
    for (const s of sectors) {
      sectorCodeToId[s.code] = s.id;
    }

    // Aggregate sector impacts across all news items
    const aggregatedSectorImpacts: Record<string, number> = {};

    for (const item of items) {
      const newsRow = await this.newsRepo.createNewsItem(
        {
          tickId,
          simDay,
          simMonth,
          simYear,
          title: item.title,
          body: item.body,
          tone: item.tone,
          intensity: item.intensity,
          narrativeTag: item.narrativeTag,
        },
        tx,
      );

      // Asset impacts
      const assetImpactData = Object.entries(item.assetImpacts).map(
        ([assetIdStr, impactPct]) => ({
          newsId: newsRow.id,
          assetId: BigInt(assetIdStr),
          impactPct,
        }),
      );
      await this.newsRepo.createAssetImpacts(assetImpactData, tx);

      // Sector impacts
      const sectorImpactData = Object.entries(item.sectorImpacts)
        .filter(([code]) => sectorCodeToId[code] != null)
        .map(([code, impactPct]) => ({
          newsId: newsRow.id,
          sectorId: sectorCodeToId[code],
          impactPct,
        }));
      await this.newsRepo.createSectorImpacts(sectorImpactData, tx);

      // Aggregate for price generation
      for (const [code, impact] of Object.entries(item.sectorImpacts)) {
        aggregatedSectorImpacts[code] = (aggregatedSectorImpacts[code] ?? 0) + impact;
      }
    }

    return aggregatedSectorImpacts;
  }
}
