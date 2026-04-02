import { Injectable } from '@nestjs/common';
import { PrismaService } from '#app/prisma/prisma.service.js';
import type {
  JobRow,
  JobWithLevel1Row,
  ActiveRunWithDetailsRow,
  RunWithJobStateRow,
  RunWithLatestMonthAndCommitmentsRow,
  RunWithAllMonthsRow,
  UserJobStateLatestRow,
  UserRunCommitmentWithTemplateRow,
} from '../types/run.types';

/**
 * Read-only data access for budget runs, jobs, and user job state.
 * Write operations are in RunRepository.
 */
@Injectable()
export class RunQuery {
  constructor(private readonly prisma: PrismaService) {}

  /** All jobs (for setup options). */
  async findJobsMany(): Promise<JobRow[]> {
    return this.prisma.job.findMany();
  }

  /** Job with level 1 for income calculation. */
  async findJobWithLevel1(jobId: bigint): Promise<JobWithLevel1Row | null> {
    return this.prisma.job.findFirst({
      where: { id: jobId },
      include: {
        levels: { where: { level: 1 } },
      },
    });
  }

  /** Active run for user with jobState, latest month (jars, bill/index resolution), commitments with template. */
  async findActiveRunWithDetails(
    userId: string,
  ): Promise<ActiveRunWithDetailsRow | null> {
    return this.prisma.run.findFirst({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      include: {
        jobState: {
          include: {
            job: { include: { levels: true } },
          },
        },
        module: true,
        months: {
          orderBy: { monthIndex: 'desc' },
          take: 1,
          include: {
            jars: true,
            billResolution: true,
            indexResolution: true,
          },
        },
        commitments: { include: { template: true } },
      },
    });
  }

  /** Run by id with jobState and job (for startMonth). */
  async findRunWithJobState(runId: bigint): Promise<RunWithJobStateRow | null> {
    return this.prisma.run.findUnique({
      where: { id: runId },
      include: {
        jobState: { include: { job: { include: { levels: true } } } },
      },
    });
  }

  /** Run with latest month, jars, bill/index resolution, commitments with template, jobState with job.levels. */
  async findRunWithLatestMonthAndCommitments(
    runId: bigint,
  ): Promise<RunWithLatestMonthAndCommitmentsRow | null> {
    return this.prisma.run.findUnique({
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
            jars: true,
            billResolution: true,
            indexResolution: true,
          },
        },
        commitments: { include: { template: true } },
      },
    });
  }

  /** All months for a run ordered asc (for post-run analysis). */
  async findRunWithAllMonths(
    runId: bigint,
  ): Promise<RunWithAllMonthsRow | null> {
    return this.prisma.run.findUnique({
      where: { id: runId },
      include: {
        jobState: {
          include: { job: true },
        },
        months: {
          orderBy: { monthIndex: 'asc' },
          include: {
            jars: true,
            billResolution: true,
            indexResolution: true,
            events: {
              include: { option: true },
            },
          },
        },
      },
    });
  }

  async findLatestUserJobState(
    userId: string,
    jobId: bigint,
  ): Promise<UserJobStateLatestRow | null> {
    return this.prisma.userJobState.findFirst({
      where: { userId, jobId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Commitments for a run with template (for startMonth / bills). */
  async findCommitmentsForRunWithTemplates(
    runId: bigint,
  ): Promise<UserRunCommitmentWithTemplateRow[]> {
    return this.prisma.userRunCommitment.findMany({
      where: { runId: runId },
      include: { template: true },
    });
  }

  /**
   * Commitments active for a given month: effectiveFromMonthIndex <= monthIndex
   * and (effectiveToMonthIndex is null or effectiveToMonthIndex >= monthIndex).
   * Returns rows with template for use in month-based calculations.
   */
  async findActiveCommitmentsForMonth(
    runId: bigint,
    monthIndex: number,
  ): Promise<UserRunCommitmentWithTemplateRow[]> {
    return this.prisma.userRunCommitment.findMany({
      where: {
        runId: runId,
        effectiveFromMonthIndex: { lte: monthIndex },
        OR: [
          { effectiveToMonthIndex: null },
          { effectiveToMonthIndex: { gte: monthIndex } },
        ],
      },
      include: { template: true },
    });
  }
}
