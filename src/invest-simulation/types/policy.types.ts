import { Prisma } from '@prisma/client';

export type PolicyTemplateRow = Prisma.PolicyThreadTemplateGetPayload<
  Record<string, never>
>;

export type PolicyInstanceRow = Prisma.PolicyThreadInstanceGetPayload<
  Record<string, never>
>;

export type PolicyInstanceWithTemplateRow =
  Prisma.PolicyThreadInstanceGetPayload<{
    include: { template: true };
  }>;

/** Policy sector impact row. */
export type PolicySectorImpactRow = Prisma.PolicySectorImpactGetPayload<
  Record<string, never>
>;

/** Policy template with sector impacts included. */
export type PolicyTemplateWithImpactsRow =
  Prisma.PolicyThreadTemplateGetPayload<{
    include: { sectorImpacts: true };
  }>;

/** Policy instance with template and its sector impacts. */
export type PolicyInstanceWithTemplateAndImpactsRow =
  Prisma.PolicyThreadInstanceGetPayload<{
    include: { template: { include: { sectorImpacts: true } } };
  }>;
