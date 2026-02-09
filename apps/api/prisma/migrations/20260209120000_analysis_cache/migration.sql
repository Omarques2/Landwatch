-- Add analysis cache table (TTL 2 months)

CREATE TABLE IF NOT EXISTS app.analysis_cache (
  analysis_id uuid NOT NULL,
  payload jsonb NOT NULL,
  cached_at timestamptz(6) NOT NULL DEFAULT now(),
  expires_at timestamptz(6) NOT NULL,
  CONSTRAINT analysis_cache_pkey PRIMARY KEY (analysis_id),
  CONSTRAINT analysis_cache_analysis_id_fkey FOREIGN KEY (analysis_id)
    REFERENCES app.analysis(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS analysis_cache_expires_idx
  ON app.analysis_cache (expires_at);
