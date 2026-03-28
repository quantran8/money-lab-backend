import { Prisma } from '@prisma/client';

export type PolicyTemplateRow = Prisma.PolicyThreadTemplateGetPayload<Record<string, never>>;

export type PolicyInstanceRow = Prisma.PolicyThreadInstanceGetPayload<Record<string, never>>;

export type PolicyInstanceWithTemplateRow = Prisma.PolicyThreadInstanceGetPayload<{
  include: { template: true };
}>;
