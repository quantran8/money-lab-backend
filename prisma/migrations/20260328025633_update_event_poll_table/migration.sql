/*
  Warnings:

  - You are about to drop the `module_event_pool_weights` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "budget"."module_event_pool_weights" DROP CONSTRAINT "module_event_pool_weights_module_id_fkey";

-- DropTable
DROP TABLE "budget"."module_event_pool_weights";

-- CreateTable
CREATE TABLE "budget"."event_pool_weights" (
    "id" BIGSERIAL NOT NULL,
    "module_id" SMALLINT NOT NULL,
    "lqi_state" TEXT NOT NULL,
    "event_category" TEXT NOT NULL,
    "weight" DECIMAL NOT NULL,

    CONSTRAINT "event_pool_weights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_event_pool_weights_module_lqi" ON "budget"."event_pool_weights"("module_id", "lqi_state");

-- AddForeignKey
ALTER TABLE "budget"."event_pool_weights" ADD CONSTRAINT "event_pool_weights_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
