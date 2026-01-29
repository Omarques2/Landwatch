-- Org-ready + M2M API keys
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS app;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'org_status' AND n.nspname = 'app'
  ) THEN
    CREATE TYPE app.org_status AS ENUM ('active', 'disabled');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'org_role' AND n.nspname = 'app'
  ) THEN
    CREATE TYPE app.org_role AS ENUM ('owner', 'admin', 'member');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'org_group_role' AND n.nspname = 'app'
  ) THEN
    CREATE TYPE app.org_group_role AS ENUM ('admin', 'member');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'api_client_status' AND n.nspname = 'app'
  ) THEN
    CREATE TYPE app.api_client_status AS ENUM ('active', 'disabled');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'api_key_scope' AND n.nspname = 'app'
  ) THEN
    CREATE TYPE app.api_key_scope AS ENUM ('analysis_read', 'analysis_write', 'pdf_read', 'pdf_write');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS app.org (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  status app.org_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.org_membership (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role app.org_role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_membership_org_user_key UNIQUE (org_id, user_id),
  CONSTRAINT org_membership_org_fk FOREIGN KEY (org_id) REFERENCES app.org(id) ON DELETE CASCADE,
  CONSTRAINT org_membership_user_fk FOREIGN KEY (user_id) REFERENCES app.app_user(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app.org_group (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_group_org_name_key UNIQUE (org_id, name),
  CONSTRAINT org_group_org_fk FOREIGN KEY (org_id) REFERENCES app.org(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app.org_group_membership (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role app.org_group_role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_group_membership_group_user_key UNIQUE (group_id, user_id),
  CONSTRAINT org_group_membership_group_fk FOREIGN KEY (group_id) REFERENCES app.org_group(id) ON DELETE CASCADE,
  CONSTRAINT org_group_membership_user_fk FOREIGN KEY (user_id) REFERENCES app.app_user(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app.api_client (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  org_id uuid NULL,
  status app.api_client_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT api_client_org_fk FOREIGN KEY (org_id) REFERENCES app.org(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS app.api_key (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  scopes app.api_key_scope[] NOT NULL,
  expires_at timestamptz NULL,
  last_used_at timestamptz NULL,
  revoked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT api_key_client_fk FOREIGN KEY (client_id) REFERENCES app.api_client(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS api_key_client_id_idx ON app.api_key(client_id);
CREATE INDEX IF NOT EXISTS api_key_prefix_idx ON app.api_key(key_prefix);
