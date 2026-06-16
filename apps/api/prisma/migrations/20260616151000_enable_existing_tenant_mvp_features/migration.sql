-- Existing TENANT orgs should keep the MVP features enabled after the
-- org-access migration. This reconciles environments where one of those rows
-- already existed as disabled before the corrected backfill ran.

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
ON CONFLICT (org_id, feature)
DO UPDATE SET enabled = true;
