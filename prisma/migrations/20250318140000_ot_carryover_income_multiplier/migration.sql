-- OT carry-over on budget_run_months; job level income as decimal multiplier (was basis points).

ALTER TABLE "public"."budget_run_months"
  ADD COLUMN IF NOT EXISTS "accepted_overtime_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "overtime_income_earned" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "public"."job_levels"
  ADD COLUMN IF NOT EXISTS "income_multiplier" DECIMAL(8,4) NOT NULL DEFAULT 1;

UPDATE "public"."job_levels"
SET "income_multiplier" = CASE
  WHEN "income_multiplier_bp" IS NULL OR "income_multiplier_bp" = 0 THEN 1::decimal
  ELSE ("income_multiplier_bp"::numeric / 10000)
END
WHERE EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'job_levels' AND column_name = 'income_multiplier_bp'
);

ALTER TABLE "public"."job_levels" DROP COLUMN IF EXISTS "income_multiplier_bp";
