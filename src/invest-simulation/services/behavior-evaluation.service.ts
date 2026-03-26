import { Injectable, Logger } from '@nestjs/common';
import { TxClient } from '#app/prisma/transaction.runner.js';
import { PrismaService } from '#app/prisma/prisma.service.js';
import { InvestBehaviorRepository } from '../repositories/behavior.repository.js';
import { InvestBehaviorQuery } from '../queries/behavior.query.js';
import { computeBehaviorMetrics, type BehaviorInput } from '../domain/index.js';

@Injectable()
export class InvestBehaviorEvaluationService {
  private readonly logger = new Logger(InvestBehaviorEvaluationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly behaviorRepo: InvestBehaviorRepository,
    private readonly behaviorQuery: InvestBehaviorQuery,
  ) {}

  /**
   * Evaluate all users' behavior for a list of closed window IDs.
   * Bulk-fetches transactions and positions, then computes metrics per user.
   */
  async evaluateClosedWindows(closedWindowIds: bigint[], tx: TxClient): Promise<number> {
    if (closedWindowIds.length === 0) return 0;

    // Fetch window details
    const windows = await this.prisma.investBehaviorWindow.findMany({
      where: { id: { in: closedWindowIds } },
    });

    let snapshotsCreated = 0;

    for (const window of windows) {
      if (window.endTickIndex == null) continue;

      // Bulk fetch: all transactions during this window across all users
      const transactions = await this.prisma.investPortfolioTransaction.findMany({
        where: {
          createdAt: { gte: window.createdAt },
        },
      });

      // Get unique user IDs from transactions + positions
      const userIds = [...new Set(transactions.map((t) => t.userId))];

      // Fetch news tick IDs during the window
      const newsItems = await this.prisma.investSimNewsItem.findMany({
        where: {
          tick: {
            tickIndex: {
              gte: window.startTickIndex,
              lte: window.endTickIndex,
            },
          },
        },
        select: { tickId: true },
      });
      const newsTickIds = newsItems.map((n) => n.tickId);

      for (const userId of userIds) {
        const userTxns = transactions.filter((t) => t.userId === userId);

        // Simplified: use positions at evaluation time
        const positions = await this.prisma.investPortfolioPosition.findMany({
          where: { userId, quantity: { gt: 0 } },
          include: { asset: { include: { sector: true } } },
        });

        const positionsMap: Record<string, { quantity: number; sectorCode: string; assetType: string }> = {};
        for (const p of positions) {
          positionsMap[p.assetId.toString()] = {
            quantity: p.quantity,
            sectorCode: p.asset.sector.code,
            assetType: p.asset.assetType,
          };
        }

        // Compute portfolio value (simplified: just sum of quantities as proxy)
        const totalQty = positions.reduce((s, p) => s + p.quantity, 0);

        const input: BehaviorInput = {
          transactions: userTxns.map((t) => ({
            side: t.side,
            quantity: t.quantity,
            pricePerUnit: t.pricePerUnit,
            totalAmount: t.totalAmount,
            tickId: t.tickId,
          })),
          portfolioValueStart: totalQty,
          portfolioValueEnd: totalQty,
          positionsStart: positionsMap,
          positionsEnd: positionsMap,
          newsTickIds,
          windowDurationTicks: window.endTickIndex - window.startTickIndex,
        };

        const metrics = computeBehaviorMetrics(input);

        await this.behaviorRepo.createSnapshot(
          {
            userId,
            windowId: window.id,
            turnoverScore: metrics.turnoverScore,
            reactionTimeScore: metrics.reactionTimeScore,
            concentrationChange: metrics.concentrationChange,
            volatilityChasingScore: metrics.volatilityChasingScore,
            exposureBySector: metrics.exposureBySector,
            exposureByAssetType: metrics.exposureByAssetType,
          },
          tx,
        );

        snapshotsCreated++;
      }
    }

    return snapshotsCreated;
  }
}
