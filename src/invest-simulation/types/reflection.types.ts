import { Prisma } from '@prisma/client';

export type ReflectionTemplateRow = Prisma.ReflectionTemplateGetPayload<Record<string, never>>;

export type UserReflectionRow = Prisma.UserReflectionGetPayload<Record<string, never>>;

export type UserReflectionWithTemplateRow = Prisma.UserReflectionGetPayload<{
  include: { template: true };
}>;
