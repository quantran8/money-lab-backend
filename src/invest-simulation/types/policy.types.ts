import { Prisma } from '@prisma/client';

export type PolicyTemplateRow = Prisma.InvestPolicyThreadTemplateGetPayload<Record<string, never>>;

export type PolicyInstanceRow = Prisma.InvestPolicyThreadInstanceGetPayload<Record<string, never>>;

export type PolicyInstanceWithTemplateRow = Prisma.InvestPolicyThreadInstanceGetPayload<{
  include: { template: true };
}>;
