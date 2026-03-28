import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '#app/prisma/prisma.service.js';
import { TxClient } from '#app/prisma/transaction.runner.js';

@Injectable()
export class InvestReportRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: TxClient) {
    return tx ?? this.prisma;
  }

  async createReport(
    data: Prisma.SimReportUncheckedCreateInput,
    tx?: TxClient,
  ) {
    return this.client(tx).simReport.create({ data });
  }
}
