import { Prisma } from '@prisma/client';

/** World arc type row. */
export type ArcTypeRow = Prisma.InvestWorldArcTypeGetPayload<Record<string, never>>;

/** World arc instance row. */
export type ArcInstanceRow = Prisma.InvestWorldArcInstanceGetPayload<Record<string, never>>;

/** Arc instance with type. */
export type ArcInstanceWithTypeRow = Prisma.InvestWorldArcInstanceGetPayload<{
  include: { arcType: true };
}>;
