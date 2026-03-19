-- Remove UNIQUE (budget_month_id, week) regardless of constraint name; allow life + OT same week.

DO $$
DECLARE
  rec RECORD;
  col_names text[];
BEGIN
  FOR rec IN
    SELECT c.conname, c.conrelid, c.conkey
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'budget_month_events'
      AND c.contype = 'u'
  LOOP
    SELECT coalesce(array_agg(a.attname::text ORDER BY a.attname), ARRAY[]::text[])
    INTO col_names
    FROM unnest(rec.conkey::smallint[]) AS u(attnum)
    JOIN pg_attribute a ON a.attrelid = rec.conrelid AND a.attnum = u.attnum AND a.attnum > 0;
    IF col_names = ARRAY['budget_month_id', 'week'] THEN
      EXECUTE format('ALTER TABLE public.budget_month_events DROP CONSTRAINT %I', rec.conname);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'budget_month_events'
      AND indexdef ILIKE '%UNIQUE%'
      AND indexdef LIKE '%budget_month_id%'
      AND indexdef LIKE '%week%'
      AND indexdef NOT LIKE '%event_source%'
      AND indexname IS DISTINCT FROM 'uq_budget_month_events_month_week_source'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', rec.indexname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_budget_month_events_month_week_source"
  ON "public"."budget_month_events" ("budget_month_id", "week", "event_source");
