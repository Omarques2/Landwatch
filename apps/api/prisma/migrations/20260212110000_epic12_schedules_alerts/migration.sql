-- EPIC-12: schedules, alerts and analysis kind

DO $$
BEGIN
  CREATE TYPE app.analysis_kind AS ENUM ('STANDARD', 'DETER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE app.schedule_frequency AS ENUM ('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE app.analysis_alert_type AS ENUM ('NEW_INTERSECTION');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE app.analysis_alert_status AS ENUM ('NEW', 'ACKNOWLEDGED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE app.analysis
  ADD COLUMN IF NOT EXISTS analysis_kind app.analysis_kind NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN IF NOT EXISTS schedule_id uuid;

CREATE INDEX IF NOT EXISTS analysis_kind_idx
  ON app.analysis (analysis_kind);

CREATE INDEX IF NOT EXISTS analysis_schedule_id_idx
  ON app.analysis (schedule_id);

CREATE TABLE IF NOT EXISTS app.analysis_schedule (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL,
  analysis_kind app.analysis_kind NOT NULL,
  frequency app.schedule_frequency NOT NULL,
  next_run_at timestamptz(6) NOT NULL,
  last_run_at timestamptz(6),
  is_active boolean NOT NULL DEFAULT true,
  timezone text NOT NULL DEFAULT 'UTC',
  created_by_user_id uuid NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT analysis_schedule_pkey PRIMARY KEY (id),
  CONSTRAINT analysis_schedule_farm_id_fkey
    FOREIGN KEY (farm_id) REFERENCES app.farm(id) ON DELETE CASCADE,
  CONSTRAINT analysis_schedule_created_by_user_id_fkey
    FOREIGN KEY (created_by_user_id) REFERENCES app.app_user(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS analysis_schedule_farm_id_idx
  ON app.analysis_schedule (farm_id);

CREATE INDEX IF NOT EXISTS analysis_schedule_due_idx
  ON app.analysis_schedule (is_active, next_run_at);

CREATE INDEX IF NOT EXISTS analysis_schedule_user_id_idx
  ON app.analysis_schedule (created_by_user_id);

DO $$
BEGIN
  ALTER TABLE app.analysis
    ADD CONSTRAINT analysis_schedule_id_fkey
    FOREIGN KEY (schedule_id)
    REFERENCES app.analysis_schedule(id)
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS app.analysis_alert (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL,
  schedule_id uuid NOT NULL,
  analysis_id uuid NOT NULL,
  analysis_kind app.analysis_kind NOT NULL,
  alert_type app.analysis_alert_type NOT NULL,
  new_intersection_count integer NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status app.analysis_alert_status NOT NULL DEFAULT 'NEW',
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  resolved_at timestamptz(6),
  CONSTRAINT analysis_alert_pkey PRIMARY KEY (id),
  CONSTRAINT analysis_alert_farm_id_fkey
    FOREIGN KEY (farm_id) REFERENCES app.farm(id) ON DELETE CASCADE,
  CONSTRAINT analysis_alert_schedule_id_fkey
    FOREIGN KEY (schedule_id) REFERENCES app.analysis_schedule(id) ON DELETE CASCADE,
  CONSTRAINT analysis_alert_analysis_id_fkey
    FOREIGN KEY (analysis_id) REFERENCES app.analysis(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS analysis_alert_farm_id_idx
  ON app.analysis_alert (farm_id);

CREATE INDEX IF NOT EXISTS analysis_alert_schedule_id_idx
  ON app.analysis_alert (schedule_id);

CREATE INDEX IF NOT EXISTS analysis_alert_analysis_id_idx
  ON app.analysis_alert (analysis_id);

CREATE INDEX IF NOT EXISTS analysis_alert_status_created_idx
  ON app.analysis_alert (status, created_at DESC);
