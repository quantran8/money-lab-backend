import { TxClient } from '@app/prisma/transaction.runner';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@prisma/prisma.service';

/**
 * Write operations for budget runs, user job state, and run commitments.
 * Pass tx when running inside a transaction.
 */
@Injectable()
export class BudgetRunRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: TxClient) {
    return tx ?? this.prisma;
  }

  async createRun(data: Prisma.BudgetRunUncheckedCreateInput, tx?: TxClient) {
    return this.client(tx).budgetRun.create({ data });
  }

  async createUserJobState(
    data: Prisma.UserJobStateUncheckedCreateInput,
    tx?: TxClient,
  ) {
    return this.client(tx).userJobState.create({ data });
  }

  async updateUserJobState(
    id: bigint,
    data: Prisma.UserJobStateUpdateInput,
    tx?: TxClient,
  ) {
    return this.client(tx).userJobState.update({
      where: { id },
      data,
    });
  }

  /**
   * Increments user job state xp by delta, then clamps to >= 0 to satisfy xp check constraint.
   */
  async incrementUserJobStateXpBounded(
    id: bigint,
    delta: number,
    tx?: TxClient,
  ) {
    const client = this.client(tx);
    await client.$executeRaw`
      UPDATE user_job_state
      SET xp = GREATEST(0, xp + ${delta})
      WHERE id = ${id}
    `;
  }

  async createRunCommitments(
    data: Prisma.UserRunCommitmentCreateManyInput[],
    tx?: TxClient,
  ) {
    return this.client(tx).userRunCommitment.createMany({ data });
  }

  /**
   * Deletes one run commitment by run and template id (e.g. optional not yet effective).
   */
  async deleteRunCommitment(
    runId: bigint,
    commitmentTemplateId: bigint,
    tx?: TxClient,
  ) {
    await this.client(tx).userRunCommitment.deleteMany({
      where: { budgetRunId: runId, commitmentTemplateId },
    });
  }

  /**
   * Sets effectiveToMonthIndex for run commitments with given template ids.
   * Only updates rows where effectiveFromMonthIndex <= effectiveToMonthIndex
   * to satisfy check constraint (effective_to >= effective_from).
   */
  async setCommitmentsEffectiveTo(
    runId: bigint,
    commitmentTemplateIds: bigint[],
    effectiveToMonthIndex: number,
    tx?: TxClient,
  ) {
    if (commitmentTemplateIds.length === 0) return;
    await this.client(tx).userRunCommitment.updateMany({
      where: {
        budgetRunId: runId,
        commitmentTemplateId: { in: commitmentTemplateIds },
        effectiveFromMonthIndex: { lte: effectiveToMonthIndex },
      },
      data: { effectiveToMonthIndex },
    });
  }

  async completeRun(
    runId: bigint,
    data: {
      totalMonths: number;
      finalFutureYouSavings: number;
      passed: boolean;
    },
    tx?: TxClient,
  ) {
    return this.client(tx).budgetRun.update({
      where: { id: runId },
      data: {
        finishedAt: new Date(),
        totalMonths: data.totalMonths,
        finalFutureYouSavings: data.finalFutureYouSavings,
        passed: data.passed,
      },
    });
  }

  /**
   * Updates one run commitment: selectedAmount and effective range (from next month).
   * Row must exist (runId + commitmentTemplateId).
   */
  async updateRunCommitmentEffectiveAndAmount(
    runId: bigint,
    commitmentTemplateId: bigint,
    selectedAmount: number,
    effectiveFromMonthIndex: number,
    tx?: TxClient,
  ) {
    await this.client(tx).userRunCommitment.updateMany({
      where: { budgetRunId: runId, commitmentTemplateId },
      data: {
        selectedAmount,
        effectiveFromMonthIndex,
        effectiveToMonthIndex: null,
      },
    });
  }

  /**
   * Updates selectedAmount for existing run commitments (no effective-range change).
   * Each update targets one (runId, commitmentTemplateId). Non-existing pairs are skipped.
   */
  async updateRunCommitmentAmounts(
    runId: bigint,
    updates: Array<{ commitmentTemplateId: bigint; selectedAmount: number }>,
    tx?: TxClient,
  ) {
    const client = this.client(tx);
    await Promise.all(
      updates.map(({ commitmentTemplateId, selectedAmount }) =>
        client.userRunCommitment.updateMany({
          where: { budgetRunId: runId, commitmentTemplateId },
          data: { selectedAmount },
        }),
      ),
    );
  }
}
