import { Prisma } from '@prisma/client';

/** World arc type row. */
export type ArcTypeRow = Prisma.WorldArcTypeGetPayload<Record<string, never>>;

/** World arc instance row. */
export type ArcInstanceRow = Prisma.WorldArcInstanceGetPayload<Record<string, never>>;

/** Arc instance with type. */
export type ArcInstanceWithTypeRow = Prisma.WorldArcInstanceGetPayload<{
  include: { arcType: true };
}>;
