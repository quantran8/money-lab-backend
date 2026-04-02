-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "budget";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "invest";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "app_user" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "username" TEXT,
    "region" TEXT,
    "avatar" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modules" (
    "id" SMALLSERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" SMALLINT NOT NULL DEFAULT 0,
    "config" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_module_progress" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "module_id" SMALLINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'locked',
    "score" INTEGER,
    "unlocked_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_module_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lessons" (
    "id" BIGSERIAL NOT NULL,
    "module_id" SMALLINT NOT NULL,
    "title" TEXT NOT NULL,
    "lesson_type" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "estimated_seconds" INTEGER NOT NULL DEFAULT 0,
    "content" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_lesson_progress" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "lesson_id" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "best_score" INTEGER,
    "last_attempt_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_lesson_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget"."event_pool_weights" (
    "id" BIGSERIAL NOT NULL,
    "module_id" SMALLINT NOT NULL,
    "lqi_state" TEXT NOT NULL,
    "event_category" TEXT NOT NULL,
    "weight" DECIMAL NOT NULL,

    CONSTRAINT "event_pool_weights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget"."jobs" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "base_monthly_income" INTEGER NOT NULL,
    "income_variance_min" INTEGER NOT NULL DEFAULT 0,
    "income_variance_max" INTEGER NOT NULL DEFAULT 0,
    "overtime_income_per_unit" INTEGER NOT NULL DEFAULT 0,
    "overtime_health_penalty" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "income_stability" TEXT,
    "stress_profile" TEXT,
    "base_energy_load" INTEGER NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget"."job_levels" (
    "id" BIGSERIAL NOT NULL,
    "job_id" BIGINT NOT NULL,
    "level" INTEGER NOT NULL,
    "rank_label" TEXT,
    "title_prefix" TEXT,
    "income_variance_min" INTEGER,
    "income_variance_max" INTEGER,
    "overtime_income_per_unit" INTEGER,
    "overtime_health_penalty" SMALLINT,
    "xp_required_total" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "base_energy_load_override" INTEGER NOT NULL,
    "absence_deduction_per_day" INTEGER NOT NULL DEFAULT 0,
    "overtime_spawn_weight" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "overtime_monthly_cap" SMALLINT NOT NULL DEFAULT 1,
    "min_hi_for_overtime" SMALLINT NOT NULL DEFAULT 55,
    "income_multiplier" DECIMAL(8,4) NOT NULL DEFAULT 1,

    CONSTRAINT "job_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget"."user_job_state" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "job_id" BIGINT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "current_monthly_income" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_job_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget"."runs" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "module_id" SMALLINT NOT NULL,
    "job_state_id" BIGINT NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "total_months" INTEGER NOT NULL DEFAULT 0,
    "final_future_you_savings" INTEGER NOT NULL DEFAULT 0,
    "passed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget"."commitment_templates" (
    "id" BIGSERIAL NOT NULL,
    "module_id" SMALLINT NOT NULL,
    "layer" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "base_monthly_amount" INTEGER NOT NULL DEFAULT 0,
    "variance_min" INTEGER NOT NULL DEFAULT 0,
    "variance_max" INTEGER NOT NULL DEFAULT 0,
    "sort_order" SMALLINT NOT NULL DEFAULT 0,
    "is_optional" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "impact" JSONB NOT NULL DEFAULT '{}',
    "dissolves_into_category" TEXT,

    CONSTRAINT "commitment_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget"."user_run_commitments" (
    "id" BIGSERIAL NOT NULL,
    "run_id" BIGINT NOT NULL,
    "commitment_template_id" BIGINT NOT NULL,
    "selected_amount" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_from_month_index" INTEGER NOT NULL DEFAULT 1,
    "effective_to_month_index" INTEGER,

    CONSTRAINT "user_run_commitments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget"."run_months" (
    "id" BIGSERIAL NOT NULL,
    "run_id" BIGINT NOT NULL,
    "month_index" INTEGER NOT NULL,
    "income" INTEGER NOT NULL DEFAULT 0,
    "locked_commitments_total" INTEGER NOT NULL DEFAULT 0,
    "bills_estimated" INTEGER NOT NULL DEFAULT 0,
    "bills_actual" INTEGER DEFAULT 0,
    "cumulative_future_you" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "current_week" SMALLINT NOT NULL DEFAULT 0,
    "bill_reserve_option_code" TEXT,
    "spend_mode_code" TEXT,
    "structural_overcommitment_occurred" BOOLEAN NOT NULL DEFAULT false,
    "stress_mode_active" BOOLEAN NOT NULL DEFAULT false,
    "free_cash" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "accepted_overtime_count" INTEGER NOT NULL DEFAULT 0,
    "overtime_income_earned" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "run_months_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget"."month_bill_resolution" (
    "id" BIGSERIAL NOT NULL,
    "month_id" BIGINT NOT NULL,
    "bill_reserve_target" INTEGER,
    "bill_reserve_start" INTEGER,
    "bill_reserve_end" INTEGER,
    "bill_reconcile_breakdown" JSONB,
    "shortfall_total" INTEGER,
    "surplus_to_free_cash" INTEGER,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "month_bill_resolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget"."month_index_resolution" (
    "id" BIGSERIAL NOT NULL,
    "month_id" BIGINT NOT NULL,
    "hi_start" SMALLINT,
    "hi_end" SMALLINT,
    "lqi_start" SMALLINT,
    "lqi_end" SMALLINT,
    "lqi_state_start" TEXT,
    "lqi_state_end" TEXT,
    "baseline_recovery" SMALLINT,
    "fun_recovery_bonus" SMALLINT,
    "job_drain" SMALLINT,
    "event_hi_effect_total" SMALLINT,
    "stress_effect" SMALLINT,
    "hi_net_change" SMALLINT,
    "baseline_recovery_efficiency_pct" DECIMAL,
    "fun_recovery_efficiency_pct" DECIMAL,
    "event_pool_bias_state" TEXT,
    "forced_rest_week" SMALLINT,
    "income_loss_from_forced_rest" INTEGER,
    "hi_recovery_from_forced_rest" SMALLINT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "weekly_index_progress" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "month_index_resolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget"."month_jars" (
    "id" BIGSERIAL NOT NULL,
    "month_id" BIGINT NOT NULL,
    "jar_code" TEXT NOT NULL,
    "allocated_amount" INTEGER NOT NULL DEFAULT 0,
    "spent_amount" INTEGER NOT NULL DEFAULT 0,
    "overflow_in_amount" INTEGER NOT NULL DEFAULT 0,
    "overflow_out_amount" INTEGER NOT NULL DEFAULT 0,
    "remaining_balance_end" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "month_jars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget"."life_event_templates" (
    "id" BIGSERIAL NOT NULL,
    "module_id" SMALLINT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "rarity" SMALLINT NOT NULL DEFAULT 1,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "event_source" TEXT NOT NULL DEFAULT 'life',
    "event_subtype" TEXT,

    CONSTRAINT "life_event_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget"."life_event_options" (
    "id" BIGSERIAL NOT NULL,
    "event_template_id" BIGINT NOT NULL,
    "option_label" TEXT NOT NULL,
    "description" TEXT,
    "money_delta" INTEGER NOT NULL DEFAULT 0,
    "health_delta" SMALLINT NOT NULL DEFAULT 0,
    "lqi_delta" SMALLINT NOT NULL DEFAULT 0,
    "learning_xp_delta" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "default_jar_code" TEXT,

    CONSTRAINT "life_event_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget"."month_events" (
    "id" BIGSERIAL NOT NULL,
    "month_id" BIGINT NOT NULL,
    "event_template_id" BIGINT NOT NULL,
    "chosen_option_id" BIGINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "week" SMALLINT,
    "payment_breakdown" JSONB,
    "event_source" TEXT,
    "event_subtype" TEXT,

    CONSTRAINT "month_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invest"."sectors" (
    "id" SMALLSERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invest"."assets" (
    "id" BIGSERIAL NOT NULL,
    "sector_id" SMALLINT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "asset_type" TEXT NOT NULL,
    "risk_tier" TEXT NOT NULL,
    "volatility_profile" TEXT NOT NULL,
    "attention_sensitivity" TEXT NOT NULL,
    "description" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invest"."market_ticks" (
    "id" BIGSERIAL NOT NULL,
    "tick_index" BIGINT NOT NULL,
    "sim_day" INTEGER NOT NULL DEFAULT 0,
    "sim_month" INTEGER NOT NULL DEFAULT 0,
    "sim_year" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_ticks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invest"."world_state_at_tick" (
    "id" BIGSERIAL NOT NULL,
    "tick_id" BIGINT NOT NULL,
    "state_data" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "world_state_at_tick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invest"."asset_price_points" (
    "id" BIGSERIAL NOT NULL,
    "asset_id" BIGINT NOT NULL,
    "tick_id" BIGINT NOT NULL,
    "price" INTEGER NOT NULL,
    "change_from_prev" INTEGER NOT NULL DEFAULT 0,
    "change_pct" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_price_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invest"."market_event_templates" (
    "id" BIGSERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "is_positive" BOOLEAN NOT NULL DEFAULT true,
    "impact_min_pct" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "impact_max_pct" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "rarity" SMALLINT NOT NULL DEFAULT 1,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_event_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invest"."market_event_log" (
    "id" BIGSERIAL NOT NULL,
    "tick_id" BIGINT NOT NULL,
    "event_template_id" BIGINT NOT NULL,
    "applied_impact_pct" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "applied_meta" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_event_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invest"."user_credits" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_credits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invest"."portfolio_positions" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "asset_id" BIGINT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avg_buy_price" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invest"."portfolio_transactions" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "asset_id" BIGINT NOT NULL,
    "tick_id" BIGINT NOT NULL,
    "side" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "price_per_unit" INTEGER NOT NULL,
    "total_amount" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invest"."sim_news_items" (
    "id" BIGSERIAL NOT NULL,
    "tick_id" BIGINT NOT NULL,
    "sim_day" INTEGER NOT NULL DEFAULT 0,
    "sim_month" INTEGER NOT NULL DEFAULT 0,
    "sim_year" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "tone" TEXT NOT NULL DEFAULT 'neutral',
    "intensity" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "narrative_tag" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sim_news_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invest"."sim_news_asset_impacts" (
    "id" BIGSERIAL NOT NULL,
    "news_id" BIGINT NOT NULL,
    "asset_id" BIGINT NOT NULL,
    "impact_pct" DECIMAL(8,4) NOT NULL DEFAULT 0,

    CONSTRAINT "sim_news_asset_impacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invest"."sim_news_sector_impacts" (
    "id" BIGSERIAL NOT NULL,
    "news_id" BIGINT NOT NULL,
    "sector_id" SMALLINT NOT NULL,
    "impact_pct" DECIMAL(8,4) NOT NULL DEFAULT 0,

    CONSTRAINT "sim_news_sector_impacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invest"."asset_spotlight_templates" (
    "id" BIGSERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "rarity" SMALLINT NOT NULL DEFAULT 1,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_spotlight_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invest"."asset_spotlight_instances" (
    "id" BIGSERIAL NOT NULL,
    "template_id" BIGINT NOT NULL,
    "asset_id" BIGINT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'dormant',
    "ticks_in_current_state" INTEGER NOT NULL DEFAULT 0,
    "started_at_tick" BIGINT NOT NULL,
    "ended_at_tick" BIGINT,
    "cooldown_until_tick" BIGINT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_spotlight_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invest"."world_arc_types" (
    "id" SMALLSERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "world_arc_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invest"."world_arc_instances" (
    "id" BIGSERIAL NOT NULL,
    "arc_type_id" SMALLINT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'background',
    "ticks_in_current_state" INTEGER NOT NULL DEFAULT 0,
    "progress" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "started_at_tick" BIGINT NOT NULL,
    "ended_at_tick" BIGINT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "world_arc_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invest"."policy_thread_templates" (
    "id" BIGSERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "rarity" SMALLINT NOT NULL DEFAULT 1,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_thread_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invest"."policy_thread_instances" (
    "id" BIGSERIAL NOT NULL,
    "template_id" BIGINT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'undeclared',
    "ticks_in_current_state" INTEGER NOT NULL DEFAULT 0,
    "actions_total" SMALLINT NOT NULL DEFAULT 3,
    "actions_completed" SMALLINT NOT NULL DEFAULT 0,
    "started_at_tick" BIGINT NOT NULL,
    "resolved_at_tick" BIGINT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_thread_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invest"."behavior_windows" (
    "id" BIGSERIAL NOT NULL,
    "window_type" TEXT NOT NULL,
    "start_tick_index" BIGINT NOT NULL,
    "end_tick_index" BIGINT,
    "trigger_reason" TEXT NOT NULL,
    "is_open" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behavior_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invest"."user_behavior_snapshots" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "window_id" BIGINT NOT NULL,
    "turnover_score" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "reaction_time_score" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "concentration_change" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "volatility_chasing_score" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "exposure_by_sector" JSONB NOT NULL DEFAULT '{}',
    "exposure_by_asset_type" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_behavior_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invest"."user_stability_metrics" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "tick_index" BIGINT NOT NULL,
    "diversification_score" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "volatility_score" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "concentration_penalty" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "holding_duration_score" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "stability_factor" DECIMAL(8,4) NOT NULL DEFAULT 1,
    "calculated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_stability_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invest"."user_scores" (
    "user_id" UUID NOT NULL,
    "wealth_points" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "stability_factor" DECIMAL(8,4) NOT NULL DEFAULT 1,
    "wealth_tier" TEXT NOT NULL DEFAULT 'beginner',
    "last_calculated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_scores_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "invest"."reflection_templates" (
    "id" BIGSERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body_template" TEXT NOT NULL,
    "condition" JSONB NOT NULL DEFAULT '{}',
    "meta" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reflection_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invest"."user_reflections" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "tick_index" BIGINT NOT NULL,
    "template_id" BIGINT NOT NULL,
    "reflection_text" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_reflections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invest"."missions" (
    "id" BIGSERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "condition" JSONB NOT NULL DEFAULT '{}',
    "reward_credits" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "missions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invest"."user_missions" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "mission_id" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "progress" JSONB NOT NULL DEFAULT '{}',
    "unlocked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "user_missions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invest"."sim_reports" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "tick_index" BIGINT NOT NULL,
    "sim_day" INTEGER NOT NULL,
    "sim_month" INTEGER NOT NULL,
    "sim_year" INTEGER NOT NULL,
    "sector_exposure" JSONB NOT NULL DEFAULT '{}',
    "asset_type_exposure" JSONB NOT NULL DEFAULT '{}',
    "avg_volatility" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "stability_score" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "reflection_summary" TEXT,
    "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sim_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_user_email_key" ON "app_user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_username_key" ON "app_user"("username");

-- CreateIndex
CREATE UNIQUE INDEX "modules_code_key" ON "modules"("code");

-- CreateIndex
CREATE INDEX "idx_ump_user" ON "user_module_progress"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_module_progress_user_id_module_id_key" ON "user_module_progress"("user_id", "module_id");

-- CreateIndex
CREATE INDEX "idx_lessons_module_order" ON "lessons"("module_id", "order_index");

-- CreateIndex
CREATE INDEX "idx_ulp_lesson" ON "user_lesson_progress"("lesson_id");

-- CreateIndex
CREATE INDEX "idx_ulp_user" ON "user_lesson_progress"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_lesson_progress_user_id_lesson_id_key" ON "user_lesson_progress"("user_id", "lesson_id");

-- CreateIndex
CREATE INDEX "idx_event_pool_weights_module_lqi" ON "budget"."event_pool_weights"("module_id", "lqi_state");

-- CreateIndex
CREATE INDEX "idx_job_levels_job" ON "budget"."job_levels"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_levels_job_id_level_key" ON "budget"."job_levels"("job_id", "level");

-- CreateIndex
CREATE INDEX "idx_user_job_state_job" ON "budget"."user_job_state"("job_id");

-- CreateIndex
CREATE INDEX "idx_user_job_state_user" ON "budget"."user_job_state"("user_id");

-- CreateIndex
CREATE INDEX "idx_runs_job_state" ON "budget"."runs"("job_state_id");

-- CreateIndex
CREATE INDEX "idx_runs_module" ON "budget"."runs"("module_id");

-- CreateIndex
CREATE INDEX "idx_runs_user" ON "budget"."runs"("user_id");

-- CreateIndex
CREATE INDEX "idx_commitment_templates_layer" ON "budget"."commitment_templates"("layer");

-- CreateIndex
CREATE INDEX "idx_commitment_templates_module" ON "budget"."commitment_templates"("module_id");

-- CreateIndex
CREATE INDEX "idx_user_run_commitments_run" ON "budget"."user_run_commitments"("run_id");

-- CreateIndex
CREATE INDEX "idx_user_run_commitments_template" ON "budget"."user_run_commitments"("commitment_template_id");

-- CreateIndex
CREATE INDEX "idx_user_run_commitments_effective_range" ON "budget"."user_run_commitments"("run_id", "effective_from_month_index", "effective_to_month_index");

-- CreateIndex
CREATE INDEX "idx_urc_run_month_range" ON "budget"."user_run_commitments"("run_id", "effective_from_month_index", "effective_to_month_index");

-- CreateIndex
CREATE INDEX "idx_urc_template_id" ON "budget"."user_run_commitments"("commitment_template_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_run_commitments_run_id_commitment_template_id_key" ON "budget"."user_run_commitments"("run_id", "commitment_template_id");

-- CreateIndex
CREATE INDEX "idx_run_months_run" ON "budget"."run_months"("run_id");

-- CreateIndex
CREATE UNIQUE INDEX "run_months_run_id_month_index_key" ON "budget"."run_months"("run_id", "month_index");

-- CreateIndex
CREATE UNIQUE INDEX "month_bill_resolution_month_id_key" ON "budget"."month_bill_resolution"("month_id");

-- CreateIndex
CREATE INDEX "idx_month_bill_resolution_month" ON "budget"."month_bill_resolution"("month_id");

-- CreateIndex
CREATE UNIQUE INDEX "month_index_resolution_month_id_key" ON "budget"."month_index_resolution"("month_id");

-- CreateIndex
CREATE INDEX "idx_month_index_resolution_month" ON "budget"."month_index_resolution"("month_id");

-- CreateIndex
CREATE UNIQUE INDEX "month_jars_unique" ON "budget"."month_jars"("month_id", "jar_code");

-- CreateIndex
CREATE INDEX "idx_life_event_templates_module" ON "budget"."life_event_templates"("module_id");

-- CreateIndex
CREATE INDEX "idx_life_event_options_template" ON "budget"."life_event_options"("event_template_id");

-- CreateIndex
CREATE INDEX "idx_month_events_month" ON "budget"."month_events"("month_id");

-- CreateIndex
CREATE INDEX "idx_month_events_option" ON "budget"."month_events"("chosen_option_id");

-- CreateIndex
CREATE INDEX "idx_month_events_template" ON "budget"."month_events"("event_template_id");

-- CreateIndex
CREATE INDEX "idx_month_events_month_week_chosen" ON "budget"."month_events"("month_id", "week", "chosen_option_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_month_events_month_week_source" ON "budget"."month_events"("month_id", "week", "event_source");

-- CreateIndex
CREATE UNIQUE INDEX "sectors_code_key" ON "invest"."sectors"("code");

-- CreateIndex
CREATE UNIQUE INDEX "assets_code_key" ON "invest"."assets"("code");

-- CreateIndex
CREATE INDEX "idx_assets_sector" ON "invest"."assets"("sector_id");

-- CreateIndex
CREATE INDEX "idx_assets_type" ON "invest"."assets"("asset_type");

-- CreateIndex
CREATE UNIQUE INDEX "market_ticks_tick_index_key" ON "invest"."market_ticks"("tick_index");

-- CreateIndex
CREATE UNIQUE INDEX "world_state_at_tick_tick_id_key" ON "invest"."world_state_at_tick"("tick_id");

-- CreateIndex
CREATE INDEX "idx_price_points_tick" ON "invest"."asset_price_points"("tick_id");

-- CreateIndex
CREATE INDEX "idx_price_points_asset" ON "invest"."asset_price_points"("asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_price_points_asset_id_tick_id_key" ON "invest"."asset_price_points"("asset_id", "tick_id");

-- CreateIndex
CREATE INDEX "idx_event_log_tick" ON "invest"."market_event_log"("tick_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_credits_user_id_key" ON "invest"."user_credits"("user_id");

-- CreateIndex
CREATE INDEX "idx_positions_user" ON "invest"."portfolio_positions"("user_id");

-- CreateIndex
CREATE INDEX "idx_positions_asset" ON "invest"."portfolio_positions"("asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_positions_user_id_asset_id_key" ON "invest"."portfolio_positions"("user_id", "asset_id");

-- CreateIndex
CREATE INDEX "idx_transactions_user" ON "invest"."portfolio_transactions"("user_id");

-- CreateIndex
CREATE INDEX "idx_transactions_asset" ON "invest"."portfolio_transactions"("asset_id");

-- CreateIndex
CREATE INDEX "idx_transactions_user_time" ON "invest"."portfolio_transactions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_news_tick" ON "invest"."sim_news_items"("tick_id");

-- CreateIndex
CREATE INDEX "idx_news_asset_impact_news" ON "invest"."sim_news_asset_impacts"("news_id");

-- CreateIndex
CREATE INDEX "idx_news_sector_impact_news" ON "invest"."sim_news_sector_impacts"("news_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_spotlight_templates_code_key" ON "invest"."asset_spotlight_templates"("code");

-- CreateIndex
CREATE INDEX "idx_spotlight_inst_asset" ON "invest"."asset_spotlight_instances"("asset_id");

-- CreateIndex
CREATE INDEX "idx_spotlight_inst_active" ON "invest"."asset_spotlight_instances"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "world_arc_types_code_key" ON "invest"."world_arc_types"("code");

-- CreateIndex
CREATE INDEX "idx_arc_inst_active" ON "invest"."world_arc_instances"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "policy_thread_templates_code_key" ON "invest"."policy_thread_templates"("code");

-- CreateIndex
CREATE INDEX "idx_policy_inst_active" ON "invest"."policy_thread_instances"("is_active");

-- CreateIndex
CREATE INDEX "idx_bw_open" ON "invest"."behavior_windows"("is_open");

-- CreateIndex
CREATE INDEX "idx_bw_start_tick" ON "invest"."behavior_windows"("start_tick_index");

-- CreateIndex
CREATE INDEX "idx_behavior_snap_user" ON "invest"."user_behavior_snapshots"("user_id");

-- CreateIndex
CREATE INDEX "idx_behavior_snap_window" ON "invest"."user_behavior_snapshots"("window_id");

-- CreateIndex
CREATE INDEX "idx_stability_user" ON "invest"."user_stability_metrics"("user_id");

-- CreateIndex
CREATE INDEX "idx_stability_user_tick" ON "invest"."user_stability_metrics"("user_id", "tick_index");

-- CreateIndex
CREATE UNIQUE INDEX "reflection_templates_code_key" ON "invest"."reflection_templates"("code");

-- CreateIndex
CREATE INDEX "idx_reflections_user" ON "invest"."user_reflections"("user_id");

-- CreateIndex
CREATE INDEX "idx_reflections_user_tick" ON "invest"."user_reflections"("user_id", "tick_index");

-- CreateIndex
CREATE UNIQUE INDEX "missions_code_key" ON "invest"."missions"("code");

-- CreateIndex
CREATE INDEX "idx_user_missions_user" ON "invest"."user_missions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_missions_user_id_mission_id_key" ON "invest"."user_missions"("user_id", "mission_id");

-- CreateIndex
CREATE INDEX "idx_reports_user" ON "invest"."sim_reports"("user_id");

-- CreateIndex
CREATE INDEX "idx_reports_user_tick" ON "invest"."sim_reports"("user_id", "tick_index");

-- AddForeignKey
ALTER TABLE "user_module_progress" ADD CONSTRAINT "user_module_progress_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_module_progress" ADD CONSTRAINT "user_module_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_lesson_progress" ADD CONSTRAINT "user_lesson_progress_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_lesson_progress" ADD CONSTRAINT "user_lesson_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "budget"."event_pool_weights" ADD CONSTRAINT "event_pool_weights_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "budget"."job_levels" ADD CONSTRAINT "job_levels_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "budget"."jobs"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "budget"."user_job_state" ADD CONSTRAINT "user_job_state_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "budget"."jobs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "budget"."user_job_state" ADD CONSTRAINT "user_job_state_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "budget"."runs" ADD CONSTRAINT "runs_job_state_id_fkey" FOREIGN KEY ("job_state_id") REFERENCES "budget"."user_job_state"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "budget"."runs" ADD CONSTRAINT "runs_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "budget"."runs" ADD CONSTRAINT "runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "budget"."commitment_templates" ADD CONSTRAINT "commitment_templates_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "budget"."user_run_commitments" ADD CONSTRAINT "user_run_commitments_commitment_template_id_fkey" FOREIGN KEY ("commitment_template_id") REFERENCES "budget"."commitment_templates"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "budget"."user_run_commitments" ADD CONSTRAINT "user_run_commitments_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "budget"."runs"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "budget"."run_months" ADD CONSTRAINT "run_months_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "budget"."runs"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "budget"."month_bill_resolution" ADD CONSTRAINT "month_bill_resolution_month_id_fkey" FOREIGN KEY ("month_id") REFERENCES "budget"."run_months"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "budget"."month_index_resolution" ADD CONSTRAINT "month_index_resolution_month_id_fkey" FOREIGN KEY ("month_id") REFERENCES "budget"."run_months"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "budget"."month_jars" ADD CONSTRAINT "month_jars_month_id_fkey" FOREIGN KEY ("month_id") REFERENCES "budget"."run_months"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "budget"."life_event_templates" ADD CONSTRAINT "life_event_templates_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "budget"."life_event_options" ADD CONSTRAINT "life_event_options_event_template_id_fkey" FOREIGN KEY ("event_template_id") REFERENCES "budget"."life_event_templates"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "budget"."month_events" ADD CONSTRAINT "month_events_chosen_option_id_fkey" FOREIGN KEY ("chosen_option_id") REFERENCES "budget"."life_event_options"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "budget"."month_events" ADD CONSTRAINT "month_events_event_template_id_fkey" FOREIGN KEY ("event_template_id") REFERENCES "budget"."life_event_templates"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "budget"."month_events" ADD CONSTRAINT "month_events_month_id_fkey" FOREIGN KEY ("month_id") REFERENCES "budget"."run_months"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invest"."assets" ADD CONSTRAINT "assets_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "invest"."sectors"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invest"."world_state_at_tick" ADD CONSTRAINT "world_state_at_tick_tick_id_fkey" FOREIGN KEY ("tick_id") REFERENCES "invest"."market_ticks"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invest"."asset_price_points" ADD CONSTRAINT "asset_price_points_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "invest"."assets"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invest"."asset_price_points" ADD CONSTRAINT "asset_price_points_tick_id_fkey" FOREIGN KEY ("tick_id") REFERENCES "invest"."market_ticks"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invest"."market_event_log" ADD CONSTRAINT "market_event_log_event_template_id_fkey" FOREIGN KEY ("event_template_id") REFERENCES "invest"."market_event_templates"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invest"."market_event_log" ADD CONSTRAINT "market_event_log_tick_id_fkey" FOREIGN KEY ("tick_id") REFERENCES "invest"."market_ticks"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invest"."user_credits" ADD CONSTRAINT "user_credits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invest"."portfolio_positions" ADD CONSTRAINT "portfolio_positions_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "invest"."assets"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invest"."portfolio_positions" ADD CONSTRAINT "portfolio_positions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invest"."portfolio_transactions" ADD CONSTRAINT "portfolio_transactions_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "invest"."assets"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invest"."portfolio_transactions" ADD CONSTRAINT "portfolio_transactions_tick_id_fkey" FOREIGN KEY ("tick_id") REFERENCES "invest"."market_ticks"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invest"."portfolio_transactions" ADD CONSTRAINT "portfolio_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invest"."sim_news_items" ADD CONSTRAINT "sim_news_items_tick_id_fkey" FOREIGN KEY ("tick_id") REFERENCES "invest"."market_ticks"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invest"."sim_news_asset_impacts" ADD CONSTRAINT "sim_news_asset_impacts_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "invest"."assets"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invest"."sim_news_asset_impacts" ADD CONSTRAINT "sim_news_asset_impacts_news_id_fkey" FOREIGN KEY ("news_id") REFERENCES "invest"."sim_news_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invest"."sim_news_sector_impacts" ADD CONSTRAINT "sim_news_sector_impacts_news_id_fkey" FOREIGN KEY ("news_id") REFERENCES "invest"."sim_news_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invest"."sim_news_sector_impacts" ADD CONSTRAINT "sim_news_sector_impacts_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "invest"."sectors"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invest"."asset_spotlight_instances" ADD CONSTRAINT "asset_spotlight_instances_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "invest"."assets"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invest"."asset_spotlight_instances" ADD CONSTRAINT "asset_spotlight_instances_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "invest"."asset_spotlight_templates"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invest"."world_arc_instances" ADD CONSTRAINT "world_arc_instances_arc_type_id_fkey" FOREIGN KEY ("arc_type_id") REFERENCES "invest"."world_arc_types"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invest"."policy_thread_instances" ADD CONSTRAINT "policy_thread_instances_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "invest"."policy_thread_templates"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invest"."behavior_windows" ADD CONSTRAINT "behavior_windows_end_tick_index_fkey" FOREIGN KEY ("end_tick_index") REFERENCES "invest"."market_ticks"("tick_index") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invest"."behavior_windows" ADD CONSTRAINT "behavior_windows_start_tick_index_fkey" FOREIGN KEY ("start_tick_index") REFERENCES "invest"."market_ticks"("tick_index") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invest"."user_behavior_snapshots" ADD CONSTRAINT "user_behavior_snapshots_window_id_fkey" FOREIGN KEY ("window_id") REFERENCES "invest"."behavior_windows"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invest"."user_stability_metrics" ADD CONSTRAINT "user_stability_metrics_tick_index_fkey" FOREIGN KEY ("tick_index") REFERENCES "invest"."market_ticks"("tick_index") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invest"."user_reflections" ADD CONSTRAINT "user_reflections_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "invest"."reflection_templates"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invest"."user_reflections" ADD CONSTRAINT "user_reflections_tick_index_fkey" FOREIGN KEY ("tick_index") REFERENCES "invest"."market_ticks"("tick_index") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invest"."user_missions" ADD CONSTRAINT "user_missions_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "invest"."missions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invest"."sim_reports" ADD CONSTRAINT "sim_reports_tick_index_fkey" FOREIGN KEY ("tick_index") REFERENCES "invest"."market_ticks"("tick_index") ON DELETE RESTRICT ON UPDATE NO ACTION;

