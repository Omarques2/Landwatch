CREATE TABLE IF NOT EXISTS app.attachment_map_filter_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filter_hash text NOT NULL,
  filter_version integer NOT NULL DEFAULT 1,
  scope_key text NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES app.app_user(id) ON DELETE CASCADE,
  actor_org_id uuid NULL REFERENCES app.org(id) ON DELETE CASCADE,
  is_platform_admin boolean NOT NULL DEFAULT false,
  filters_json jsonb NOT NULL,
  expires_at timestamptz(6) NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attachment_map_filter_session_lookup_idx
  ON app.attachment_map_filter_session(filter_hash, filter_version, scope_key);

CREATE INDEX IF NOT EXISTS attachment_map_filter_session_expires_idx
  ON app.attachment_map_filter_session(expires_at);

CREATE INDEX IF NOT EXISTS attachment_map_filter_session_user_idx
  ON app.attachment_map_filter_session(actor_user_id, created_at DESC);
