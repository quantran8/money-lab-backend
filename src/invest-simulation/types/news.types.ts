import { Prisma } from '@prisma/client';

/** News item row. */
export type NewsItemRow = Prisma.SimNewsItemGetPayload<Record<string, never>>;

/** News item with asset and sector impacts. */
export type NewsWithImpactsRow = Prisma.SimNewsItemGetPayload<{
  include: {
    assetImpacts: true;
    sectorImpacts: true;
  };
}>;

/** News asset impact row. */
export type NewsAssetImpactRow = Prisma.SimNewsAssetImpactGetPayload<
  Record<string, never>
>;

/** News sector impact row. */
export type NewsSectorImpactRow = Prisma.SimNewsSectorImpactGetPayload<
  Record<string, never>
>;
