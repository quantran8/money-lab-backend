import { Prisma } from '@prisma/client';

/** News item row. */
export type NewsItemRow = Prisma.InvestSimNewsItemGetPayload<Record<string, never>>;

/** News item with asset and sector impacts. */
export type NewsWithImpactsRow = Prisma.InvestSimNewsItemGetPayload<{
  include: {
    assetImpacts: true;
    sectorImpacts: true;
  };
}>;

/** News asset impact row. */
export type NewsAssetImpactRow = Prisma.InvestSimNewsAssetImpactGetPayload<Record<string, never>>;

/** News sector impact row. */
export type NewsSectorImpactRow = Prisma.InvestSimNewsSectorImpactGetPayload<Record<string, never>>;
