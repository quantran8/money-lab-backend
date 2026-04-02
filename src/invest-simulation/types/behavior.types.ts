import { Prisma } from '@prisma/client';

export type BehaviorWindowRow = Prisma.BehaviorWindowGetPayload<
  Record<string, never>
>;

export type BehaviorSnapshotRow = Prisma.UserBehaviorSnapshotGetPayload<
  Record<string, never>
>;

export type StabilityMetricRow = Prisma.UserStabilityMetricGetPayload<
  Record<string, never>
>;
