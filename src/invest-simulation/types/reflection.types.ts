import { Prisma } from '@prisma/client';

export type ReflectionTemplateRow = Prisma.InvestReflectionTemplateGetPayload<Record<string, never>>;

export type UserReflectionRow = Prisma.InvestUserReflectionGetPayload<Record<string, never>>;

export type UserReflectionWithTemplateRow = Prisma.InvestUserReflectionGetPayload<{
  include: { template: true };
}>;
