-- Analysis tables (MVP)
CREATE SCHEMA IF NOT EXISTS app;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'analysis_status' AND n.nspname = 'app'
  ) THEN
    CREATE TYPE app.analysis_status AS ENUM ('pending', 'completed', 'failed');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS app.analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  car_key text NOT NULL,
  cpf_cnpj text NULL,
  analysis_date date NOT NULL,
  status app.analysis_status NOT NULL DEFAULT 'completed',
  created_by_user_id uuid NOT NULL,
  org_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  CONSTRAINT analysis_created_by_fk FOREIGN KEY (created_by_user_id) REFERENCES app.app_user(id) ON DELETE RESTRICT,
  CONSTRAINT analysis_org_fk FOREIGN KEY (org_id) REFERENCES app.org(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS analysis_car_key_idx ON app.analysis(car_key);
CREATE INDEX IF NOT EXISTS analysis_created_by_idx ON app.analysis(created_by_user_id);

CREATE TABLE IF NOT EXISTS app.analysis_result (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL,
  category_code text NOT NULL,
  dataset_code text NOT NULL,
  snapshot_date date NULL,
  feature_id bigint NULL,
  is_sicar boolean NOT NULL DEFAULT false,
  sicar_area_m2 numeric NULL,
  feature_area_m2 numeric NULL,
  overlap_area_m2 numeric NULL,
  overlap_pct_of_sicar numeric NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT analysis_result_analysis_fk FOREIGN KEY (analysis_id) REFERENCES app.analysis(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS analysis_result_analysis_id_idx ON app.analysis_result(analysis_id);
CREATE INDEX IF NOT EXISTS analysis_result_category_idx ON app.analysis_result(category_code);
