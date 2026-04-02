-- DropColumn
ALTER TABLE "invest"."world_arc_types" DROP COLUMN IF EXISTS "direction";

-- CreateTable
CREATE TABLE "invest"."world_arc_sector_impacts" (
    "id" SERIAL NOT NULL,
    "arc_type_id" SMALLINT NOT NULL,
    "sector_id" SMALLINT NOT NULL,
    "category" TEXT,
    "weight" DECIMAL(4,2) NOT NULL,

    CONSTRAINT "world_arc_sector_impacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_arc_sector_category" ON "invest"."world_arc_sector_impacts"("arc_type_id", "sector_id", "category");

-- AddForeignKey
ALTER TABLE "invest"."world_arc_sector_impacts" ADD CONSTRAINT "world_arc_sector_impacts_arc_type_id_fkey" FOREIGN KEY ("arc_type_id") REFERENCES "invest"."world_arc_types"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invest"."world_arc_sector_impacts" ADD CONSTRAINT "world_arc_sector_impacts_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "invest"."sectors"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
