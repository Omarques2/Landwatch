/*
  Warnings:

  - You are about to alter the column `sicar_area_m2` on the `analysis_result` table. The data in that column could be lost. The data in that column will be cast from `Decimal` to `Decimal(65,30)`.
  - You are about to alter the column `feature_area_m2` on the `analysis_result` table. The data in that column could be lost. The data in that column will be cast from `Decimal` to `Decimal(65,30)`.
  - You are about to alter the column `overlap_area_m2` on the `analysis_result` table. The data in that column could be lost. The data in that column will be cast from `Decimal` to `Decimal(65,30)`.
  - You are about to alter the column `overlap_pct_of_sicar` on the `analysis_result` table. The data in that column could be lost. The data in that column will be cast from `Decimal` to `Decimal(65,30)`.

*/
-- DropForeignKey
ALTER TABLE "analysis" DROP CONSTRAINT "analysis_created_by_fk";

-- DropForeignKey
ALTER TABLE "analysis" DROP CONSTRAINT "analysis_org_fk";

-- DropForeignKey
ALTER TABLE "analysis_result" DROP CONSTRAINT "analysis_result_analysis_fk";

-- AlterTable
ALTER TABLE "analysis_result" ALTER COLUMN "sicar_area_m2" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "feature_area_m2" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "overlap_area_m2" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "overlap_pct_of_sicar" SET DATA TYPE DECIMAL(65,30);

-- AddForeignKey
ALTER TABLE "analysis" ADD CONSTRAINT "analysis_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis" ADD CONSTRAINT "analysis_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "org"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_result" ADD CONSTRAINT "analysis_result_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
