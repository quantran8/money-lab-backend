import { Prisma } from '@prisma/client';

export type JobRow = Prisma.JobGetPayload<Record<string, never>>;

export type JobWithLevel1Row = Prisma.JobGetPayload<{
  include: { levels: { where: { level: number } } };
}>;

export type ActiveRunWithDetailsRow = Prisma.RunGetPayload<{
  include: {
    jobState: {
      include: {
        job: { include: { levels: true } };
      };
    };
    module: true;
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

export type RunWithJobStateRow = Prisma.RunGetPayload<{
  include: {
    jobState: { include: { job: { include: { levels: true } } } };
  };
}>;

export type RunWithLatestMonthAndCommitmentsRow = Prisma.RunGetPayload<{
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

export type RunWithAllMonthsRow = Prisma.RunGetPayload<{
  include: {
    jobState: {
      include: {
        job: true;
      };
    };
    months: {
      orderBy: { monthIndex: 'asc' };
      include: {
        jars: true;
        billResolution: true;
        indexResolution: true;
        events: {
          include: { option: true };
        };
      };
    };
  };
}>;

export type UserJobStateLatestRow = Prisma.UserJobStateGetPayload<
  Record<string, never>
>;

export type UserRunCommitmentWithTemplateRow =
  Prisma.UserRunCommitmentGetPayload<{
    include: { template: true };
  }>;
