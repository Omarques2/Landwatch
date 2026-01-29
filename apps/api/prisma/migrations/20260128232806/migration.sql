-- DropForeignKey
ALTER TABLE "api_client" DROP CONSTRAINT "api_client_org_fk";

-- DropForeignKey
ALTER TABLE "api_key" DROP CONSTRAINT "api_key_client_fk";

-- DropForeignKey
ALTER TABLE "org_group" DROP CONSTRAINT "org_group_org_fk";

-- DropForeignKey
ALTER TABLE "org_group_membership" DROP CONSTRAINT "org_group_membership_group_fk";

-- DropForeignKey
ALTER TABLE "org_group_membership" DROP CONSTRAINT "org_group_membership_user_fk";

-- DropForeignKey
ALTER TABLE "org_membership" DROP CONSTRAINT "org_membership_org_fk";

-- DropForeignKey
ALTER TABLE "org_membership" DROP CONSTRAINT "org_membership_user_fk";

-- AddForeignKey
ALTER TABLE "org_membership" ADD CONSTRAINT "org_membership_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_membership" ADD CONSTRAINT "org_membership_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_group" ADD CONSTRAINT "org_group_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_group_membership" ADD CONSTRAINT "org_group_membership_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "org_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_group_membership" ADD CONSTRAINT "org_group_membership_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_client" ADD CONSTRAINT "api_client_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "org"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "api_client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
