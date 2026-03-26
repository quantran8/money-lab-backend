import { Prisma } from '@prisma/client';

/** Plain asset row without relations. */
export type AssetRow = Prisma.InvestAssetGetPayload<Record<string, never>>;

/** Asset with its sector. */
export type AssetWithSectorRow = Prisma.InvestAssetGetPayload<{
  include: { sector: true };
}>;

/** Sector row. */
export type SectorRow = Prisma.InvestSectorGetPayload<Record<string, never>>;
