DO $$
BEGIN
  CREATE TYPE app.analysis_postprocess_job_type AS ENUM (
    'CNPJ_REFRESH',
    'ALERTS_BUILD',
    'ATTACHMENTS_EFFECTIVE_CAPTURE',
    'ANALYSIS_CACHE_BUILD'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE app.analysis_postprocess_job_status AS ENUM (
    'PENDING',
    'RUNNING',
    'RETRY',
    'COMPLETED',
    'FAILED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS app.analysis_postprocess_job (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  job_type app.analysis_postprocess_job_type NOT NULL,
  analysis_id uuid,
  doc_normalized text,
  dedupe_key text,
  status app.analysis_postprocess_job_status NOT NULL DEFAULT 'PENDING',
  attempt_count integer NOT NULL DEFAULT 0,
  run_after timestamptz(6) NOT NULL DEFAULT now(),
  locked_at timestamptz(6),
  last_error text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT analysis_postprocess_job_pkey PRIMARY KEY (id),
  CONSTRAINT analysis_postprocess_job_analysis_id_fkey
    FOREIGN KEY (analysis_id) REFERENCES app.analysis(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS analysis_postprocess_job_status_run_after_idx
  ON app.analysis_postprocess_job (status, run_after);

CREATE INDEX IF NOT EXISTS analysis_postprocess_job_analysis_id_idx
  ON app.analysis_postprocess_job (analysis_id);

CREATE INDEX IF NOT EXISTS analysis_postprocess_job_type_idx
  ON app.analysis_postprocess_job (job_type);

CREATE UNIQUE INDEX IF NOT EXISTS analysis_postprocess_job_dedupe_active_idx
  ON app.analysis_postprocess_job (dedupe_key)
  WHERE dedupe_key IS NOT NULL
    AND status IN ('PENDING', 'RUNNING', 'RETRY');

CREATE INDEX IF NOT EXISTS analysis_result_analysis_geom_idx
  ON app.analysis_result (analysis_id, geom_id);

CREATE INDEX IF NOT EXISTS analysis_result_analysis_dataset_feature_idx
  ON app.analysis_result (analysis_id, dataset_code, feature_id);
