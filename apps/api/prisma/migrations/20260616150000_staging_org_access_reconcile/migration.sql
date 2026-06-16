-- Reconcile environments where the 20260611130000 / 20260611160000
-- migrations were applied before the org-access security corrections were
-- folded into those migration files.

-- New org feature rows must be opt-in by default.
ALTER TABLE app.org_feature_access
  ALTER COLUMN enabled SET DEFAULT false;

-- Ensure a PLATFORM org exists for legacy/platform-owned rows.
INSERT INTO app.org (name, slug, kind, status)
SELECT 'LandWatch Platform', 'landwatch-platform', 'PLATFORM', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM app.org WHERE kind = 'PLATFORM'
)
ON CONFLICT (slug) DO NOTHING;

-- Tenant-facing feature rows must never be enabled on the PLATFORM org.
DELETE FROM app.org_feature_access fa
USING app.org o
WHERE fa.org_id = o.id
  AND o.kind = 'PLATFORM'
  AND fa.feature IN (
    'FARMS',
    'ANALYSES',
    'ANALYSIS_CREATE',
    'CAR_SEARCH',
    'SCHEDULES'
  );

-- Existing TENANT orgs keep the MVP feature set enabled after the migration.
INSERT INTO app.org_feature_access (org_id, feature, enabled)
SELECT o.id, f.feature::app.app_feature, true
FROM app.org o
CROSS JOIN (
  VALUES
    ('FARMS'),
    ('ANALYSES'),
    ('ANALYSIS_CREATE'),
    ('CAR_SEARCH'),
    ('SCHEDULES')
) AS f(feature)
WHERE o.kind = 'TENANT'
ON CONFLICT (org_id, feature) DO NOTHING;

-- Existing rows satisfy the check constraint; validate it in environments
-- where the original migration left it NOT VALID.
ALTER TABLE app.api_client
  VALIDATE CONSTRAINT api_client_kind_org_check;
