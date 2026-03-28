import { Injectable, Logger } from '@nestjs/common';
import { wrapAsync } from '#common/utils/async.utils.js';
import { TransactionRunner } from '#app/prisma/transaction.runner.js';
import { InvestReflectionQuery } from '../queries/reflection.query.js';
import { InvestBehaviorQuery } from '../queries/behavior.query.js';
import { InvestReflectionRepository } from '../repositories/reflection.repository.js';
import {
  generateReflections,
  type ReflectionTemplate,
  type BehaviorSnapshot,
} from '../domain/index.js';

@Injectable()
export class InvestReflectionService {
  private readonly logger = new Logger(InvestReflectionService.name);

  constructor(
    private readonly transactionRunner: TransactionRunner,
    private readonly reflectionQuery: InvestReflectionQuery,
    private readonly behaviorQuery: InvestBehaviorQuery,
    private readonly reflectionRepo: InvestReflectionRepository,
  ) {}

  async getUserReflections(userId: string) {
    return wrapAsync(this.logger, 'getUserReflections', async () => {
      const reflections = await this.reflectionQuery.findUserReflections(userId);
      return reflections.map((r) => ({
        id: r.id.toString(),
        tickIndex: Number(r.tickIndex),
        templateTitle: r.template.title,
        reflectionText: r.reflectionText,
        createdAt: r.createdAt.toISOString(),
      }));
    });
  }

  /**
   * Generate reflections for a user based on their latest behavior snapshot.
   */
  async generateForUser(userId: string, tickIndex: bigint): Promise<number> {
    const [templates, snapshots] = await Promise.all([
      this.reflectionQuery.findTemplates(),
      this.behaviorQuery.findSnapshotsByUser(userId, 1),
    ]);

    if (snapshots.length === 0) return 0;

    const snap = snapshots[0];
    const behaviorSnapshot: BehaviorSnapshot = {
      turnoverScore: Number(snap.turnoverScore),
      reactionTimeScore: Number(snap.reactionTimeScore),
      concentrationChange: Number(snap.concentrationChange),
      volatilityChasingScore: Number(snap.volatilityChasingScore),
    };

    const domainTemplates: ReflectionTemplate[] = templates.map((t) => ({
      id: t.id,
      code: t.code,
      title: t.title,
      bodyTemplate: t.bodyTemplate,
      condition: t.condition as Record<string, unknown>,
    }));

    const generated = generateReflections(domainTemplates, behaviorSnapshot);

    if (generated.length === 0) return 0;

    await this.transactionRunner.run(async (tx) => {
      for (const g of generated) {
        await this.reflectionRepo.createReflection(
          {
            userId,
            tickIndex,
            templateId: g.templateId,
            reflectionText: g.reflectionText,
          },
          tx,
        );
      }
    });

    return generated.length;
  }
}
