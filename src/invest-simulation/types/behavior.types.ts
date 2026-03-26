import { Prisma } from '@prisma/client';

export type BehaviorWindowRow = Prisma.InvestBehaviorWindowGetPayload<Record<string, never>>;

export type BehaviorSnapshotRow = Prisma.InvestUserBehaviorSnapshotGetPayload<Record<string, never>>;

export type StabilityMetricRow = Prisma.InvestUserStabilityMetricGetPayload<Record<string, never>>;
