DROP INDEX IF EXISTS app.app_user_identity_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS app_user_identity_user_id_key
  ON app.app_user(identity_user_id);
