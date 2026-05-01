ALTER TABLE "app"."analysis"
  ADD COLUMN "attachments_snapshot_cutoff_at" TIMESTAMPTZ(6),
  ADD COLUMN "attachments_snapshot_captured_at" TIMESTAMPTZ(6);
