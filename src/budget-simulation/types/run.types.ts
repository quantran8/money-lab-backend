import { Prisma } from '@prisma/client';

export type JobRow = Prisma.JobGetPayload<Record<string, never>>;

export type JobWithLevel1Row = Prisma.JobGetPayload<{
  include: { levels: { where: { level: number } } };
}>;

export type ActiveRunWithDetailsRow = Prisma.BudgetRunGetPayload<{
  include: {
    jobState: true;
    months: {
      orderBy: { monthIndex: 'desc' };
      take: 1;
      include: {
        jars: true;
        billResolution: true;
        indexResolution: true;
      };
    };
    commitments: { include: { template: true } };
  };
}>;

export type RunWithJobStateRow = Prisma.BudgetRunGetPayload<{
  include: {
    jobState: { include: { job: { include: { levels: true } } } };
  };
}>;

export type RunWithLatestMonthAndCommitmentsRow = Prisma.BudgetRunGetPayload<{
  include: {
    jobState: {
      include: {
        job: { include: { levels: true } };
      };
    };
    months: {
      orderBy: { monthIndex: 'desc' };
      take: 1;
      include: {
        jars: true;
        billResolution: true;
        indexResolution: true;
      };
    };
    commitments: { include: { template: true } };
  };
}>;

export type UserJobStateLatestRow = Prisma.UserJobStateGetPayload<
  Record<string, never>
>;

export type UserRunCommitmentWithTemplateRow =
  Prisma.UserRunCommitmentGetPayload<{
    include: { template: true };
  }>;
