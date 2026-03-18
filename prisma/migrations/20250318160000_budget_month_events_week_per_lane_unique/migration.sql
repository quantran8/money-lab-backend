-- Replace (budget_month_id, week) unique with (budget_month_id, week, event_source)
-- so life + work OT can coexist in the same week.

DROP INDEX IF EXISTS "public"."idx_budget_month_events_month_week_source";

ALTER TABLE "public"."budget_month_events"
  DROP CONSTRAINT IF EXISTS "budget_month_events_budget_month_id_week_key";

CREATE UNIQUE INDEX "uq_budget_month_events_month_week_source"
  ON "public"."budget_month_events" ("budget_month_id", "week", "event_source");
