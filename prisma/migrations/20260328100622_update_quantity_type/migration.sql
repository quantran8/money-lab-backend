-- AlterTable
ALTER TABLE "invest"."portfolio_positions" ALTER COLUMN "quantity" SET DEFAULT 0,
ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "invest"."portfolio_transactions" ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION;
