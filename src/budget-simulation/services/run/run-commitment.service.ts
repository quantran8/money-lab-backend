import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { wrapAsync } from '#common/utils/async.utils.js';
import { RunQuery } from '../../queries/run.query';
import { RunRepository } from '#budget-simulation/repositories/run.repository.js';
import { CommitmentQuery } from '../../queries/commitment.query';
import type {
  OptionalCommitmentUpdateInput,
  RunCommitmentWorkingRow,
  UpdateRunCommitmentsResult,
} from '../../types/run-commitment.types';
import { TransactionRunner } from '#app/prisma/transaction.runner.js';

/**
 * Run sub-service: updateRunCommitments (core map + optional templates).
 * Wired by BudgetSimulationRunService; add sibling *SubService files under run/ as needed.
 */
@Injectable()
export class BudgetSimulationRunCommitmentService {
  private readonly logger = new Logger(
    BudgetSimulationRunCommitmentService.name,
  );

  constructor(
    private readonly transactionRunner: TransactionRunner,
    private readonly runQuery: RunQuery,
    private readonly runRepository: RunRepository,
    private readonly commitmentQuery: CommitmentQuery,
  ) {}

  async updateRunCommitments(
    userId: string,
    runId: number,
    commitmentAmounts: Record<number, number>,
    optionals?: OptionalCommitmentUpdateInput[],
  ): Promise<UpdateRunCommitmentsResult> {
    return wrapAsync(this.logger, 'updateRunCommitments', async () => {
      const runIdBig = BigInt(runId);
      const run =
        await this.runQuery.findRunWithLatestMonthAndCommitments(runIdBig);
      if (!run || run.userId !== userId) {
        throw new ForbiddenException('Forbidden or Run not found');
      }

      const entries = Object.entries(commitmentAmounts).map(
        ([templateId, selectedAmount]) => ({
          commitmentTemplateId: BigInt(templateId),
          selectedAmount,
        }),
      );
      const optionalItems = optionals ?? [];
      if (entries.length === 0 && optionalItems.length === 0) {
        return { updated: 0 };
      }

      const templateIdKey = (id: bigint) => id.toString();
      const allIdKeys = new Set<string>();
      for (const e of entries) {
        allIdKeys.add(templateIdKey(e.commitmentTemplateId));
      }
      for (const o of optionalItems) {
        allIdKeys.add(templateIdKey(BigInt(o.id)));
      }
      const allTemplateIds = [...allIdKeys].map((k) => BigInt(k));
      const templateRows =
        await this.commitmentQuery.findTemplatesByIds(allTemplateIds);
      const foundIdSet = new Set(templateRows.map((t) => t.id.toString()));
      const categoryByTemplateId = new Map(
        templateRows.map((t) => [t.id.toString(), t.category]),
      );

      if (entries.length > 0) {
        const missing = entries
          .filter((e) => !foundIdSet.has(templateIdKey(e.commitmentTemplateId)))
          .map((e) => e.commitmentTemplateId.toString());
        if (missing.length > 0) {
          throw new BadRequestException(
            `Unknown commitment template id(s): ${missing.join(', ')}`,
          );
        }
      }
      for (const o of optionalItems) {
        if (o.include && !foundIdSet.has(templateIdKey(BigInt(o.id)))) {
          throw new BadRequestException(
            `Unknown optional commitment template id: ${o.id}`,
          );
        }
      }

      const currentMonthIndex = run.months[0]?.monthIndex ?? 0;
      const nextFromMonthIndex =
        currentMonthIndex === 0 ? 1 : currentMonthIndex + 1;

      const isActiveForMonth = (
        c: {
          effectiveFromMonthIndex: number;
          effectiveToMonthIndex: number | null;
        },
        monthIndex: number,
      ) =>
        c.effectiveFromMonthIndex <= monthIndex &&
        (c.effectiveToMonthIndex === null ||
          c.effectiveToMonthIndex >= monthIndex);

      const workingCommitments: RunCommitmentWorkingRow[] = run.commitments.map(
        (c) => ({
          commitmentTemplateId: c.commitmentTemplateId,
          selectedAmount: c.selectedAmount,
          effectiveFromMonthIndex: c.effectiveFromMonthIndex,
          effectiveToMonthIndex: c.effectiveToMonthIndex,
          template: { category: c.template.category },
        }),
      );

      const syncClosedAtCurrent = (ids: bigint[]) => {
        for (const id of ids) {
          const row = workingCommitments.find(
            (r) => r.commitmentTemplateId === id,
          );
          if (row && row.effectiveFromMonthIndex <= currentMonthIndex) {
            row.effectiveToMonthIndex = currentMonthIndex;
          }
        }
      };

      let updatedCount = 0;
      await this.transactionRunner.run(async (tx) => {
        for (const { commitmentTemplateId, selectedAmount } of entries) {
          const category = categoryByTemplateId.get(
            commitmentTemplateId.toString(),
          )!;

          const activeForCurrent = workingCommitments.filter((c) =>
            isActiveForMonth(c, currentMonthIndex),
          );
          const sameCategoryActive = activeForCurrent.filter(
            (c) => c.template.category === category,
          );
          const existingRow = workingCommitments.find(
            (c) => c.commitmentTemplateId === commitmentTemplateId,
          );
          if (existingRow && existingRow.selectedAmount === selectedAmount) {
            continue;
          }

          if (sameCategoryActive.length > 0) {
            const toCloseIds = sameCategoryActive.map(
              (c) => c.commitmentTemplateId,
            );
            await this.runRepository.setCommitmentsEffectiveTo(
              runIdBig,
              toCloseIds,
              currentMonthIndex,
              tx,
            );
            syncClosedAtCurrent(toCloseIds);
            if (existingRow) {
              await this.runRepository.updateRunCommitmentEffectiveAndAmount(
                runIdBig,
                commitmentTemplateId,
                selectedAmount,
                nextFromMonthIndex,
                tx,
              );
              existingRow.selectedAmount = selectedAmount;
              existingRow.effectiveFromMonthIndex = nextFromMonthIndex;
              existingRow.effectiveToMonthIndex = null;
            } else {
              await this.runRepository.createRunCommitments(
                [
                  {
                    runId: runIdBig,
                    commitmentTemplateId,
                    selectedAmount,
                    effectiveFromMonthIndex: nextFromMonthIndex,
                    effectiveToMonthIndex: null,
                  },
                ],
                tx,
              );
              workingCommitments.push({
                commitmentTemplateId,
                selectedAmount,
                effectiveFromMonthIndex: nextFromMonthIndex,
                effectiveToMonthIndex: null,
                template: { category },
              });
            }
          } else {
            if (existingRow) {
              await this.runRepository.updateRunCommitmentAmounts(
                runIdBig,
                [{ commitmentTemplateId, selectedAmount }],
                tx,
              );
              existingRow.selectedAmount = selectedAmount;
            } else {
              await this.runRepository.createRunCommitments(
                [
                  {
                    runId: runIdBig,
                    commitmentTemplateId,
                    selectedAmount,
                    effectiveFromMonthIndex: nextFromMonthIndex,
                    effectiveToMonthIndex: null,
                  },
                ],
                tx,
              );
              workingCommitments.push({
                commitmentTemplateId,
                selectedAmount,
                effectiveFromMonthIndex: nextFromMonthIndex,
                effectiveToMonthIndex: null,
                template: { category },
              });
            }
          }
          updatedCount += 1;
        }

        for (const item of optionalItems) {
          const commitmentTemplateId = BigInt(item.id);
          const existingRow = workingCommitments.find(
            (c) => c.commitmentTemplateId === commitmentTemplateId,
          );
          if (
            item.include &&
            existingRow &&
            existingRow.selectedAmount === item.amount
          ) {
            continue;
          }
          if (item.include) {
            await this.runRepository.setCommitmentsEffectiveTo(
              runIdBig,
              [commitmentTemplateId],
              currentMonthIndex,
              tx,
            );
            syncClosedAtCurrent([commitmentTemplateId]);
            const categoryOpt =
              categoryByTemplateId.get(commitmentTemplateId.toString()) ?? '';
            if (existingRow) {
              await this.runRepository.updateRunCommitmentEffectiveAndAmount(
                runIdBig,
                commitmentTemplateId,
                item.amount,
                nextFromMonthIndex,
                tx,
              );
              existingRow.selectedAmount = item.amount;
              existingRow.effectiveFromMonthIndex = nextFromMonthIndex;
              existingRow.effectiveToMonthIndex = null;
            } else {
              await this.runRepository.createRunCommitments(
                [
                  {
                    runId: runIdBig,
                    commitmentTemplateId,
                    selectedAmount: item.amount,
                    effectiveFromMonthIndex: nextFromMonthIndex,
                    effectiveToMonthIndex: null,
                  },
                ],
                tx,
              );
              workingCommitments.push({
                commitmentTemplateId,
                selectedAmount: item.amount,
                effectiveFromMonthIndex: nextFromMonthIndex,
                effectiveToMonthIndex: null,
                template: { category: categoryOpt },
              });
            }
            updatedCount += 1;
          } else if (existingRow) {
            if (existingRow.effectiveFromMonthIndex > currentMonthIndex) {
              await this.runRepository.deleteRunCommitment(
                runIdBig,
                commitmentTemplateId,
                tx,
              );
              const idx = workingCommitments.findIndex(
                (r) => r.commitmentTemplateId === commitmentTemplateId,
              );
              if (idx >= 0) workingCommitments.splice(idx, 1);
              updatedCount += 1;
            } else {
              const stillActiveThisMonth =
                existingRow.effectiveToMonthIndex === null ||
                existingRow.effectiveToMonthIndex > currentMonthIndex;
              if (stillActiveThisMonth) {
                await this.runRepository.setCommitmentsEffectiveTo(
                  runIdBig,
                  [commitmentTemplateId],
                  currentMonthIndex,
                  tx,
                );
                syncClosedAtCurrent([commitmentTemplateId]);
                updatedCount += 1;
              }
            }
          }
        }
      });
      return { updated: updatedCount };
    });
  }
}
