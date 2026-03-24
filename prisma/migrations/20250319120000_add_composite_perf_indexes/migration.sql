-- Covers pending-event lookups, count queries, and chosen-event aggregations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_budget_month_events_month_week_chosen
  ON budget_month_events (budget_month_id, week, chosen_option_id);

-- Covers active commitment range queries (findActiveCommitmentsForMonth)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_run_commitments_effective_range
  ON user_run_commitments (budget_run_id, effective_from_month_index, effective_to_month_index);
