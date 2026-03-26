import { Prisma } from '@prisma/client';

/** Market tick row. */
export type MarketTickRow = Prisma.InvestMarketTickGetPayload<Record<string, never>>;

/** Tick with world state. */
export type TickWithWorldStateRow = Prisma.InvestMarketTickGetPayload<{
  include: { worldState: true };
}>;

/** Price point row. */
export type PricePointRow = Prisma.InvestAssetPricePointGetPayload<Record<string, never>>;

/** Price point with asset info. */
export type PricePointWithAssetRow = Prisma.InvestAssetPricePointGetPayload<{
  include: { asset: true };
}>;

/** World state row. */
export type WorldStateRow = Prisma.InvestWorldStateAtTickGetPayload<Record<string, never>>;
