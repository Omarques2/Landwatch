ALTER TYPE "app"."analysis_postprocess_job_type" ADD VALUE IF NOT EXISTS 'OVERLAP_METRICS';

ALTER TABLE "app"."analysis" ADD COLUMN IF NOT EXISTS "overlap_summary" jsonb;
