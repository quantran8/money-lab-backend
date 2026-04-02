import { Prisma } from '@prisma/client';

/** Spotlight template row. */
export type SpotlightTemplateRow = Prisma.AssetSpotlightTemplateGetPayload<
  Record<string, never>
>;

/** Spotlight instance row. */
export type SpotlightInstanceRow = Prisma.AssetSpotlightInstanceGetPayload<
  Record<string, never>
>;

/** Spotlight instance with template. */
export type SpotlightInstanceWithTemplateRow =
  Prisma.AssetSpotlightInstanceGetPayload<{
    include: { template: true };
  }>;

/** Spotlight instance with template, asset, and sector (for tick processing). */
export type SpotlightInstanceFullRow = Prisma.AssetSpotlightInstanceGetPayload<{
  include: { template: true; asset: { include: { sector: true } } };
}>;
