-- CreateTable
CREATE TABLE "invest"."portfolio_value_snapshots" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "tick_index" BIGINT NOT NULL,
    "total_value" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_value_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_value_snapshots_user_id_tick_index_key" ON "invest"."portfolio_value_snapshots"("user_id", "tick_index");

-- CreateIndex
CREATE INDEX "idx_pv_snapshot_user_tick" ON "invest"."portfolio_value_snapshots"("user_id", "tick_index");

-- AddForeignKey
ALTER TABLE "invest"."portfolio_value_snapshots" ADD CONSTRAINT "portfolio_value_snapshots_tick_index_fkey" FOREIGN KEY ("tick_index") REFERENCES "invest"."market_ticks"("tick_index") ON DELETE RESTRICT ON UPDATE NO ACTION;
