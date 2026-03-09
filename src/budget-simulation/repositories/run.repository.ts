import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Client for use inside $transaction; accepts both PrismaService and tx from $transaction callback. */
export type TxClient = Prisma.TransactionClient;
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

  async createRunCommitments(
    data: Prisma.UserRunCommitmentCreateManyInput[],
    tx?: TxClient,
  ) {
    return this.client(tx).userRunCommitment.createMany({ data });
  }
}
