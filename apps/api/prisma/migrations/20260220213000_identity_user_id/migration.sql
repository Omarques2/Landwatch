ALTER TABLE app.app_user
  ADD COLUMN IF NOT EXISTS identity_user_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS app_user_identity_user_id_key
  ON app.app_user(identity_user_id)
  WHERE identity_user_id IS NOT NULL;
