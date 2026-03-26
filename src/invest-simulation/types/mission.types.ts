import { Prisma } from '@prisma/client';

export type MissionRow = Prisma.InvestMissionGetPayload<Record<string, never>>;

export type UserMissionRow = Prisma.InvestUserMissionGetPayload<Record<string, never>>;

export type UserMissionWithMissionRow = Prisma.InvestUserMissionGetPayload<{
  include: { mission: true };
}>;
