-- CreateTable
CREATE TABLE "invest"."arc_spotlight_templates" (
    "id" SERIAL NOT NULL,
    "arc_type_id" SMALLINT NOT NULL,
    "template_id" BIGINT NOT NULL,
    "weight" DECIMAL(4,2) NOT NULL DEFAULT 1.0,

    CONSTRAINT "arc_spotlight_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invest"."arc_asset_affinities" (
    "id" SERIAL NOT NULL,
    "arc_type_id" SMALLINT NOT NULL,
    "asset_id" BIGINT NOT NULL,
    "affinity" DECIMAL(4,2) NOT NULL,

    CONSTRAINT "arc_asset_affinities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_arc_spotlight_template" ON "invest"."arc_spotlight_templates"("arc_type_id", "template_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_arc_asset_affinity" ON "invest"."arc_asset_affinities"("arc_type_id", "asset_id");

-- AddForeignKey
ALTER TABLE "invest"."arc_spotlight_templates" ADD CONSTRAINT "arc_spotlight_templates_arc_type_id_fkey" FOREIGN KEY ("arc_type_id") REFERENCES "invest"."world_arc_types"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invest"."arc_spotlight_templates" ADD CONSTRAINT "arc_spotlight_templates_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "invest"."asset_spotlight_templates"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invest"."arc_asset_affinities" ADD CONSTRAINT "arc_asset_affinities_arc_type_id_fkey" FOREIGN KEY ("arc_type_id") REFERENCES "invest"."world_arc_types"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invest"."arc_asset_affinities" ADD CONSTRAINT "arc_asset_affinities_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "invest"."assets"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
