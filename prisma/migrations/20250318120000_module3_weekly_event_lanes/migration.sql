-- Module 3: dual weekly event lanes (life vs work/overtime), job-level OT tuning.

ALTER TABLE "public"."job_levels"
  ADD COLUMN IF NOT EXISTS "overtime_spawn_weight" DECIMAL(5,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "overtime_monthly_cap" INTEGER,
  ADD COLUMN IF NOT EXISTS "min_hi_for_overtime" SMALLINT;

ALTER TABLE "public"."life_event_templates"
  ADD COLUMN IF NOT EXISTS "event_source" TEXT NOT NULL DEFAULT 'life',
  ADD COLUMN IF NOT EXISTS "event_subtype" TEXT;

ALTER TABLE "public"."budget_month_events"
  ADD COLUMN IF NOT EXISTS "event_source" TEXT NOT NULL DEFAULT 'life',
  ADD COLUMN IF NOT EXISTS "event_subtype" TEXT;

UPDATE "public"."budget_month_events" AS b
SET
  "event_source" = t."event_source",
  "event_subtype" = t."event_subtype"
FROM "public"."life_event_templates" AS t
WHERE b."event_template_id" = t."id";

CREATE INDEX IF NOT EXISTS "idx_budget_month_events_month_week_source"
  ON "public"."budget_month_events" ("budget_month_id", "week", "event_source");
