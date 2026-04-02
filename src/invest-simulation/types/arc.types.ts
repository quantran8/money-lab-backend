import { Prisma } from '@prisma/client';

/** World arc type row. */
export type ArcTypeRow = Prisma.WorldArcTypeGetPayload<Record<string, never>>;

/** World arc instance row. */
export type ArcInstanceRow = Prisma.WorldArcInstanceGetPayload<
  Record<string, never>
>;

/** Arc instance with type and its sector impacts. */
export type ArcInstanceWithTypeRow = Prisma.WorldArcInstanceGetPayload<{
  include: { arcType: { include: { sectorImpacts: true } } };
}>;

/** Arc sector impact row. */
export type ArcSectorImpactRow = Prisma.WorldArcSectorImpactGetPayload<
  Record<string, never>
>;

/** Arc → spotlight template mapping row. */
export type ArcSpotlightTemplateRow = Prisma.ArcSpotlightTemplateGetPayload<
  Record<string, never>
>;

/** Arc → asset affinity mapping row. */
export type ArcAssetAffinityRow = Prisma.ArcAssetAffinityGetPayload<
  Record<string, never>
>;
