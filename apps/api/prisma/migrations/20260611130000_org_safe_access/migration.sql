CREATE TYPE app.org_kind AS ENUM ('TENANT', 'PLATFORM');
CREATE TYPE app.app_feature AS ENUM (
  'FARMS',
  'ANALYSES',
  'ANALYSIS_CREATE',
  'CAR_SEARCH',
  'SCHEDULES',
  'ATTACHMENTS',
  'ATTACHMENTS_REVIEW'
);
CREATE TYPE app.api_client_kind AS ENUM ('TENANT', 'PLATFORM');

ALTER TABLE app.org
  ADD COLUMN IF NOT EXISTS kind app.org_kind NOT NULL DEFAULT 'TENANT';

CREATE UNIQUE INDEX IF NOT EXISTS org_single_platform_kind_idx
  ON app.org ((kind))
  WHERE kind = 'PLATFORM';

CREATE TABLE IF NOT EXISTS app.org_feature_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES app.org(id) ON DELETE CASCADE,
  feature app.app_feature NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT org_feature_access_org_feature_key UNIQUE (org_id, feature)
);

CREATE INDEX IF NOT EXISTS org_feature_access_org_idx
  ON app.org_feature_access(org_id);

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
ON CONFLICT (org_id, feature) DO NOTHING;

ALTER TABLE app.analysis_schedule
  ADD COLUMN IF NOT EXISTS org_id uuid;

UPDATE app.analysis_schedule s
SET org_id = f.org_id
FROM app.farm f
WHERE s.farm_id = f.id
  AND s.org_id IS NULL;

CREATE INDEX IF NOT EXISTS analysis_schedule_org_id_idx
  ON app.analysis_schedule(org_id);

ALTER TABLE app.analysis_schedule
  ADD CONSTRAINT analysis_schedule_org_id_fkey
  FOREIGN KEY (org_id) REFERENCES app.org(id) ON DELETE RESTRICT;

UPDATE app.analysis a
SET org_id = f.org_id
FROM app.farm f
WHERE a.farm_id = f.id
  AND a.org_id IS NULL;

ALTER TABLE app.api_client
  ADD COLUMN IF NOT EXISTS kind app.api_client_kind NOT NULL DEFAULT 'TENANT';

UPDATE app.api_client
SET kind = 'PLATFORM'
WHERE org_id IS NULL;

ALTER TABLE app.api_client
  ADD CONSTRAINT api_client_kind_org_check
  CHECK (
    (kind = 'TENANT' AND org_id IS NOT NULL)
    OR (kind = 'PLATFORM' AND org_id IS NULL)
  ) NOT VALID;

ALTER TABLE app.api_client DROP CONSTRAINT IF EXISTS api_client_org_id_fkey;
ALTER TABLE app.api_client
  ADD CONSTRAINT api_client_org_id_fkey
  FOREIGN KEY (org_id) REFERENCES app.org(id) ON DELETE RESTRICT;

ALTER TABLE app.farm DROP CONSTRAINT IF EXISTS farm_org_id_fkey;
ALTER TABLE app.farm
  ADD CONSTRAINT farm_org_id_fkey
  FOREIGN KEY (org_id) REFERENCES app.org(id) ON DELETE RESTRICT;

ALTER TABLE app.farm DROP CONSTRAINT IF EXISTS farm_car_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS farm_org_car_key_key
  ON app.farm(org_id, car_key)
  WHERE org_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS farm_public_car_key_key
  ON app.farm(car_key)
  WHERE org_id IS NULL;

ALTER TABLE app.car_map_search_session
  ADD COLUMN IF NOT EXISTS actor_org_id uuid;

ALTER TABLE app.car_map_search_session
  ADD CONSTRAINT car_map_search_session_actor_org_id_fkey
  FOREIGN KEY (actor_org_id) REFERENCES app.org(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS car_map_search_session_org_idx
  ON app.car_map_search_session(actor_org_id, created_at DESC);
