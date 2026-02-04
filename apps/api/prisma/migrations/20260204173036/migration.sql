-- DropForeignKey
ALTER TABLE "analysis" DROP CONSTRAINT "analysis_farm_fk";

-- AlterTable
ALTER TABLE "cnpj_info" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "analysis" ADD CONSTRAINT "analysis_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;
