import { Prisma } from '@prisma/client';

/** Plain asset row without relations. */
export type AssetRow = Prisma.AssetGetPayload<Record<string, never>>;

/** Asset with its sector. */
export type AssetWithSectorRow = Prisma.AssetGetPayload<{
  include: { sector: true };
}>;

/** Sector row. */
export type SectorRow = Prisma.SectorGetPayload<Record<string, never>>;
