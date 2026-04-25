-- AlterTable
ALTER TABLE "invest"."policy_thread_templates" ADD COLUMN     "state_descriptions" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "invest"."policy_sector_impacts" (
    "id" SERIAL NOT NULL,
    "template_id" BIGINT NOT NULL,
    "sector_id" SMALLINT NOT NULL,
    "category" TEXT,
    "weight" DECIMAL(4,2) NOT NULL,

    CONSTRAINT "policy_sector_impacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_policy_sector_category" ON "invest"."policy_sector_impacts"("template_id", "sector_id", "category");

-- AddForeignKey
ALTER TABLE "invest"."policy_sector_impacts" ADD CONSTRAINT "policy_sector_impacts_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "invest"."policy_thread_templates"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invest"."policy_sector_impacts" ADD CONSTRAINT "policy_sector_impacts_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "invest"."sectors"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
