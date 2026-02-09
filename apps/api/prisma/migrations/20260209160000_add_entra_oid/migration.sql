-- Add entra_oid to app_user

ALTER TABLE IF EXISTS app.app_user
  ADD COLUMN IF NOT EXISTS entra_oid uuid;

CREATE UNIQUE INDEX IF NOT EXISTS app_user_entra_oid_key
  ON app.app_user(entra_oid);
