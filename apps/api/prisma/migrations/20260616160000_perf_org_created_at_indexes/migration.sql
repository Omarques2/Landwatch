-- Performance: composite indexes for the tenant list hot paths, which filter by
-- org_id and ORDER BY created_at DESC. `analysis` had NO org_id index at all;
-- farm/analysis_schedule already had a simple org_id index (the composite still
-- helps the ordered scan). Index names match the Prisma `@@index(..., map:)`.
--
-- NOTE: additive and idempotent. For large tables in production, prefer creating
-- these CONCURRENTLY (outside a transaction) to avoid write locks, e.g.:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS analysis_org_created_idx ON app.analysis (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS "analysis_org_created_idx"
  ON app.analysis (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS "farm_org_created_idx"
  ON app.farm (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS "analysis_schedule_org_created_idx"
  ON app.analysis_schedule (org_id, created_at DESC);
