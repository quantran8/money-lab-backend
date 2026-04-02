import { Prisma } from '@prisma/client';

export type MissionRow = Prisma.MissionGetPayload<Record<string, never>>;

export type UserMissionRow = Prisma.UserMissionGetPayload<
  Record<string, never>
>;

export type UserMissionWithMissionRow = Prisma.UserMissionGetPayload<{
  include: { mission: true };
}>;
