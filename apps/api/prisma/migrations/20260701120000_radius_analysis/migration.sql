CREATE TYPE "app"."subject_type" AS ENUM ('CAR', 'RADIUS');

ALTER TABLE "app"."analysis" ADD COLUMN "subject_type" "app"."subject_type" NOT NULL DEFAULT 'CAR';
ALTER TABLE "app"."analysis" ALTER COLUMN "car_key" DROP NOT NULL;
ALTER TABLE "app"."analysis" ADD COLUMN "radius_center_lat" DECIMAL;
ALTER TABLE "app"."analysis" ADD COLUMN "radius_center_lng" DECIMAL;
ALTER TABLE "app"."analysis" ADD COLUMN "radius_m" INTEGER;
