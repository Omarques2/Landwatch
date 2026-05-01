-- EPIC Attachments: DDL for attachments module

-- 1) Enums
DO $$ BEGIN
  CREATE TYPE app.attachment_visibility AS ENUM ('PUBLIC', 'PRIVATE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE app.attachment_scope AS ENUM (
    'ORG_FEATURE',
    'ORG_CAR',
    'PLATFORM_FEATURE',
    'PLATFORM_CAR'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE app.attachment_status AS ENUM (
    'PENDING',
    'PARTIALLY_APPROVED',
    'APPROVED',
    'REJECTED',
    'REVOKED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE app.attachment_target_status AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'REMOVED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE app.attachment_event_type AS ENUM (
    'CREATED',
    'UPDATED',
    'TARGET_ADDED',
    'TARGET_UPDATED',
    'TARGET_APPROVED',
    'TARGET_REJECTED',
    'TARGET_REMOVED',
    'SCOPE_CHANGED',
    'VALIDITY_CHANGED',
    'VISIBILITY_CHANGED',
    'STATUS_CHANGED',
    'REVOKED',
    'DOWNLOADED',
    'ZIP_DOWNLOADED',
    'PUBLIC_ACCESS_GRANTED',
    'PUBLIC_ACCESS_DENIED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE app.org_permission AS ENUM ('ATTACHMENT_REVIEW');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Reviewer permission by organization
CREATE TABLE IF NOT EXISTS app.org_user_permission (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES app.org(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app.app_user(id) ON DELETE CASCADE,
  permission app.org_permission NOT NULL,
  granted_by_user_id uuid NOT NULL REFERENCES app.app_user(id) ON DELETE RESTRICT,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT org_user_permission_org_user_permission_key UNIQUE (org_id, user_id, permission)
);

CREATE INDEX IF NOT EXISTS org_user_permission_org_idx
  ON app.org_user_permission(org_id, permission);

CREATE INDEX IF NOT EXISTS org_user_permission_user_idx
  ON app.org_user_permission(user_id, permission);

-- 3) Category catalog
CREATE TABLE IF NOT EXISTS app.attachment_category (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  is_justification boolean NOT NULL DEFAULT false,
  requires_approval boolean NOT NULL DEFAULT false,
  is_public_default boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid NOT NULL REFERENCES app.app_user(id) ON DELETE RESTRICT,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  CHECK (NOT is_justification OR requires_approval = true),
  CHECK (NOT is_justification OR is_public_default = true)
);

CREATE INDEX IF NOT EXISTS attachment_category_active_idx
  ON app.attachment_category(is_active);

-- 4) Attachment file
CREATE TABLE IF NOT EXISTS app.attachment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES app.attachment_category(id) ON DELETE RESTRICT,
  owner_org_id uuid NULL REFERENCES app.org(id) ON DELETE SET NULL,
  created_by_user_id uuid NOT NULL REFERENCES app.app_user(id) ON DELETE RESTRICT,
  original_filename text NOT NULL,
  content_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  sha256 text NOT NULL,
  blob_provider text NOT NULL DEFAULT 'AZURE_BLOB',
  blob_container text NOT NULL,
  blob_path text NOT NULL UNIQUE,
  blob_etag text NULL,
  visibility app.attachment_visibility NOT NULL DEFAULT 'PUBLIC',
  status app.attachment_status NOT NULL DEFAULT 'PENDING',
  is_deleted_logical boolean NOT NULL DEFAULT false,
  deleted_at timestamptz(6) NULL,
  deleted_by_user_id uuid NULL REFERENCES app.app_user(id) ON DELETE SET NULL,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  submitted_at timestamptz(6) NOT NULL DEFAULT now(),
  revoked_at timestamptz(6) NULL,
  revoked_by_user_id uuid NULL REFERENCES app.app_user(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS attachment_owner_org_idx
  ON app.attachment(owner_org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS attachment_status_idx
  ON app.attachment(status);

CREATE INDEX IF NOT EXISTS attachment_category_idx
  ON app.attachment(category_id);

-- 5) N:N links between attachment and target features
CREATE TABLE IF NOT EXISTS app.attachment_target (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attachment_id uuid NOT NULL REFERENCES app.attachment(id) ON DELETE CASCADE,
  dataset_code text NOT NULL,
  feature_id bigint NULL,
  feature_key text NULL,
  natural_id text NULL,
  car_key text NULL,
  scope app.attachment_scope NOT NULL,
  applies_org_id uuid NULL REFERENCES app.org(id) ON DELETE SET NULL,
  valid_from date NOT NULL,
  valid_to date NULL,
  status app.attachment_target_status NOT NULL DEFAULT 'PENDING',
  reviewed_by_user_id uuid NULL REFERENCES app.app_user(id) ON DELETE SET NULL,
  reviewed_at timestamptz(6) NULL,
  review_reason text NULL,
  created_by_user_id uuid NOT NULL REFERENCES app.app_user(id) ON DELETE RESTRICT,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  CHECK (feature_id IS NOT NULL OR feature_key IS NOT NULL OR natural_id IS NOT NULL),
  CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CHECK (
    (scope IN ('ORG_CAR', 'PLATFORM_CAR') AND car_key IS NOT NULL)
    OR
    (scope IN ('ORG_FEATURE', 'PLATFORM_FEATURE'))
  ),
  CHECK (
    (scope IN ('ORG_FEATURE', 'ORG_CAR') AND applies_org_id IS NOT NULL)
    OR
    (scope IN ('PLATFORM_FEATURE', 'PLATFORM_CAR') AND applies_org_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS attachment_target_attachment_idx
  ON app.attachment_target(attachment_id);

CREATE INDEX IF NOT EXISTS attachment_target_feature_lookup_idx
  ON app.attachment_target(dataset_code, feature_id, feature_key, natural_id);

CREATE INDEX IF NOT EXISTS attachment_target_car_idx
  ON app.attachment_target(car_key);

CREATE INDEX IF NOT EXISTS attachment_target_scope_org_idx
  ON app.attachment_target(scope, applies_org_id);

CREATE INDEX IF NOT EXISTS attachment_target_validity_idx
  ON app.attachment_target(status, valid_from, valid_to);

-- 6) Full audit trail
CREATE TABLE IF NOT EXISTS app.attachment_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attachment_id uuid NOT NULL REFERENCES app.attachment(id) ON DELETE CASCADE,
  attachment_target_id uuid NULL REFERENCES app.attachment_target(id) ON DELETE SET NULL,
  event_type app.attachment_event_type NOT NULL,
  actor_user_id uuid NULL REFERENCES app.app_user(id) ON DELETE SET NULL,
  actor_org_id uuid NULL REFERENCES app.org(id) ON DELETE SET NULL,
  actor_ip inet NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz(6) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attachment_event_attachment_idx
  ON app.attachment_event(attachment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS attachment_event_target_idx
  ON app.attachment_event(attachment_target_id, created_at DESC);

-- 7) Public token per analysis (permanent, revokable)
CREATE TABLE IF NOT EXISTS app.analysis_public_access_token (
  analysis_id uuid PRIMARY KEY REFERENCES app.analysis(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  token_prefix text NOT NULL,
  created_by_user_id uuid NOT NULL REFERENCES app.app_user(id) ON DELETE RESTRICT,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  last_used_at timestamptz(6) NULL,
  revoked_at timestamptz(6) NULL,
  revoked_by_user_id uuid NULL REFERENCES app.app_user(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS analysis_public_access_token_active_idx
  ON app.analysis_public_access_token(revoked_at);

-- 8) Public endpoint IP guard (3 invalid attempts => 1h block)
CREATE TABLE IF NOT EXISTS app.public_attachment_ip_guard (
  ip inet PRIMARY KEY,
  invalid_count integer NOT NULL DEFAULT 0 CHECK (invalid_count >= 0),
  first_invalid_at timestamptz(6) NULL,
  last_invalid_at timestamptz(6) NULL,
  blocked_until timestamptz(6) NULL,
  updated_at timestamptz(6) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS public_attachment_ip_guard_blocked_idx
  ON app.public_attachment_ip_guard(blocked_until);

-- 9) Per-analysis snapshot for temporal consistency
CREATE TABLE IF NOT EXISTS app.analysis_attachment_effective (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES app.analysis(id) ON DELETE CASCADE,
  attachment_id uuid NOT NULL REFERENCES app.attachment(id) ON DELETE RESTRICT,
  attachment_target_id uuid NOT NULL REFERENCES app.attachment_target(id) ON DELETE RESTRICT,
  dataset_code text NOT NULL,
  feature_id bigint NULL,
  feature_key text NULL,
  natural_id text NULL,
  car_key text NULL,
  captured_scope app.attachment_scope NOT NULL,
  captured_applies_org_id uuid NULL REFERENCES app.org(id) ON DELETE SET NULL,
  captured_visibility app.attachment_visibility NOT NULL,
  captured_target_status app.attachment_target_status NOT NULL,
  captured_valid_from date NOT NULL,
  captured_valid_to date NULL,
  captured_is_justification boolean NOT NULL,
  captured_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT analysis_attachment_effective_analysis_target_key UNIQUE (analysis_id, attachment_target_id)
);

CREATE INDEX IF NOT EXISTS analysis_attachment_effective_analysis_idx
  ON app.analysis_attachment_effective(analysis_id);

CREATE INDEX IF NOT EXISTS analysis_attachment_effective_feature_idx
  ON app.analysis_attachment_effective(dataset_code, feature_id, feature_key, natural_id);

-- 10) Seed base categories
WITH admin_user AS (
  SELECT u.id
  FROM app.app_user u
  ORDER BY u.created_at ASC
  LIMIT 1
)
INSERT INTO app.attachment_category (
  code,
  name,
  description,
  is_justification,
  requires_approval,
  is_public_default,
  is_active,
  created_by_user_id
)
SELECT *
FROM (
  VALUES
    ('JUSTIFICATIVA_TECNICA', 'Justificativa tecnica', 'Anexo tecnico que justifica a feicao', true, true, true, true),
    ('COMPROVANTE_PDF', 'Comprovante PDF', 'Documento PDF de comprovacao', false, false, true, true),
    ('DOCUMENTO_INFORMATIVO', 'Documento informativo', 'Anexo sem efeito de justificativa', false, false, true, true)
) AS seed(code, name, description, is_justification, requires_approval, is_public_default, is_active)
CROSS JOIN admin_user a
ON CONFLICT (code) DO NOTHING;
