-- DropForeignKey
ALTER TABLE "farm" DROP CONSTRAINT "farm_org_fk";

-- DropForeignKey
ALTER TABLE "farm" DROP CONSTRAINT "farm_owner_fk";

-- AlterTable
ALTER TABLE "farm" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "farm" ADD CONSTRAINT "farm_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm" ADD CONSTRAINT "farm_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "org"("id") ON DELETE SET NULL ON UPDATE CASCADE;
