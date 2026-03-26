import { Prisma } from '@prisma/client';

/** Position row. */
export type PositionRow = Prisma.InvestPortfolioPositionGetPayload<Record<string, never>>;

/** Position with asset and sector info. */
export type PositionWithAssetRow = Prisma.InvestPortfolioPositionGetPayload<{
  include: { asset: { include: { sector: true } } };
}>;

/** Transaction row. */
export type TransactionRow = Prisma.InvestPortfolioTransactionGetPayload<Record<string, never>>;

/** Transaction with asset info. */
export type TransactionWithAssetRow = Prisma.InvestPortfolioTransactionGetPayload<{
  include: { asset: true };
}>;
