import { Prisma } from '@prisma/client';

/** Position row. */
export type PositionRow = Prisma.PortfolioPositionGetPayload<Record<string, never>>;

/** Position with asset and sector info. */
export type PositionWithAssetRow = Prisma.PortfolioPositionGetPayload<{
  include: { asset: { include: { sector: true } } };
}>;

/** Transaction row. */
export type TransactionRow = Prisma.PortfolioTransactionGetPayload<Record<string, never>>;

/** Transaction with asset info. */
export type TransactionWithAssetRow = Prisma.PortfolioTransactionGetPayload<{
  include: { asset: true };
}>;
