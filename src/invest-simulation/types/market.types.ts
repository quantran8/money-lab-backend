import { Prisma } from '@prisma/client';

/** Market tick row. */
export type MarketTickRow = Prisma.MarketTickGetPayload<Record<string, never>>;

/** Tick with world state. */
export type TickWithWorldStateRow = Prisma.MarketTickGetPayload<{
  include: { worldState: true };
}>;

/** Price point row. */
export type PricePointRow = Prisma.AssetPricePointGetPayload<
  Record<string, never>
>;

/** Price point with asset info. */
export type PricePointWithAssetRow = Prisma.AssetPricePointGetPayload<{
  include: { asset: true };
}>;

/** World state row. */
export type WorldStateRow = Prisma.WorldStateAtTickGetPayload<
  Record<string, never>
>;
