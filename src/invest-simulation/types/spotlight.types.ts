import { Prisma } from '@prisma/client';

/** Spotlight template row. */
export type SpotlightTemplateRow = Prisma.InvestAssetSpotlightTemplateGetPayload<Record<string, never>>;

/** Spotlight instance row. */
export type SpotlightInstanceRow = Prisma.InvestAssetSpotlightInstanceGetPayload<Record<string, never>>;

/** Spotlight instance with template. */
export type SpotlightInstanceWithTemplateRow = Prisma.InvestAssetSpotlightInstanceGetPayload<{
  include: { template: true };
}>;

/** Spotlight instance with template, asset, and sector (for tick processing). */
export type SpotlightInstanceFullRow = Prisma.InvestAssetSpotlightInstanceGetPayload<{
  include: { template: true; asset: { include: { sector: true } } };
}>;
