CREATE TABLE IF NOT EXISTS app.car_map_search_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES app.app_user(id) ON DELETE CASCADE,
  search_version integer NOT NULL DEFAULT 1,
  params_json jsonb NOT NULL,
  expires_at timestamptz(6) NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS car_map_search_session_user_idx
  ON app.car_map_search_session(actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS car_map_search_session_expires_idx
  ON app.car_map_search_session(expires_at);
