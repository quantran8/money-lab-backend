import { Prisma } from '@prisma/client';

/** User credit row. */
export type UserCreditRow = Prisma.UserCreditGetPayload<Record<string, never>>;
