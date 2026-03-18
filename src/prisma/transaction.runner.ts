import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/prisma/prisma.service';
import { Prisma } from '@prisma/client';

/** Client for use inside $transaction; accepts both PrismaService and tx from $transaction callback. */
export type TxClient = Prisma.TransactionClient;

/**
 * Executes interactive DB transactions for budget-simulation writes.
 * Workflow services use this instead of PrismaService so Prisma stays in the persistence layer.
 *
 * @param fn - Receives tx to pass into repository methods.
 * @returns Resolves to fn's return value after commit.
 */
@Injectable()
export class TransactionRunner {
  constructor(private readonly prisma: PrismaService) {}

  async run<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }
}
