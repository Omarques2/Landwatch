-- LandWatch initial schema (app)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS app;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'user_status' AND n.nspname = 'app'
  ) THEN
    CREATE TYPE app.user_status AS ENUM ('pending', 'active', 'disabled');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS app.app_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entra_sub text NOT NULL,
  email text,
  display_name text,
  status app.user_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS app_user_entra_sub_key ON app.app_user(entra_sub);
CREATE INDEX IF NOT EXISTS idx_app_user_email ON app.app_user(email);
