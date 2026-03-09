import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Read-only data access for budget runs, jobs, and user job state.
 * Write operations are in BudgetRunRepository.
 */
@Injectable()
export class BudgetRunQuery {
  constructor(private readonly prisma: PrismaService) {}

  /** All jobs (for setup options). */
  async findJobsMany() {
    return this.prisma.job.findMany();
  }

  /** Job with level 1 for income calculation. */
  async findJobWithLevel1(jobId: bigint) {
    return this.prisma.job.findFirst({
      where: { id: jobId },
      include: {
        levels: { where: { level: 1 } },
      },
    });
  }

  /** Active run for user with jobState, latest month (allocations, spendByJar), commitments with template. */
  async findActiveRunWithDetails(userId: string) {
    return this.prisma.budgetRun.findFirst({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      include: {
        jobState: true,
        months: {
          orderBy: { monthIndex: 'desc' },
          take: 1,
          include: {
            allocations: true,
            spendByJar: true,
          },
        },
        commitments: { include: { template: true } },
      },
    });
  }

  /** Run by id with jobState and job (for startMonth). */
  async findRunWithJobState(runId: bigint) {
    return this.prisma.budgetRun.findUnique({
      where: { id: runId },
      include: { jobState: { include: { job: true } } },
    });
  }

  /** Run with latest month, spendByJar, allocations, commitments with template, jobState with job.levels. */
  async findRunWithLatestMonthAndCommitments(runId: bigint) {
    return this.prisma.budgetRun.findUnique({
      where: { id: runId },
      include: {
        jobState: {
          include: {
            job: { include: { levels: true } },
          },
        },
        months: {
          orderBy: { monthIndex: 'desc' },
          take: 1,
          include: {
            spendByJar: true,
            allocations: true,
          },
        },
        commitments: { include: { template: true } },
      },
    });
  }

  async findLatestUserJobState(userId: string, jobId: bigint) {
    return this.prisma.userJobState.findFirst({
      where: { userId, jobId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Commitments for a run with template (for startMonth / bills). */
  async findCommitmentsForRunWithTemplates(runId: bigint) {
    return this.prisma.userRunCommitment.findMany({
      where: { budgetRunId: runId },
      include: { template: true },
    });
  }
}
