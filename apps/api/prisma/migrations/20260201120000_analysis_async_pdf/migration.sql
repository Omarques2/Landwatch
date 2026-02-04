-- Async analysis + PDF metadata
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'analysis_status' AND n.nspname = 'app'
  ) THEN
    CREATE TYPE app.analysis_status AS ENUM ('running', 'pending', 'completed', 'failed');
  ELSE
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE t.typname = 'analysis_status' AND n.nspname = 'app' AND e.enumlabel = 'running'
    ) THEN
      ALTER TYPE app.analysis_status ADD VALUE 'running';
    END IF;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'analysis_pdf_status' AND n.nspname = 'app'
  ) THEN
    CREATE TYPE app.analysis_pdf_status AS ENUM ('pending', 'ready', 'failed', 'expired');
  END IF;
END$$;

ALTER TABLE app.analysis
  ADD COLUMN IF NOT EXISTS farm_id uuid,
  ADD COLUMN IF NOT EXISTS pdf_status app.analysis_pdf_status,
  ADD COLUMN IF NOT EXISTS pdf_path text,
  ADD COLUMN IF NOT EXISTS pdf_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS pdf_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS pdf_error text,
  ADD COLUMN IF NOT EXISTS has_intersections boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS intersection_count integer NOT NULL DEFAULT 0;

ALTER TABLE app.analysis
  ALTER COLUMN status SET DEFAULT 'pending';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'app'
      AND table_name = 'analysis'
      AND constraint_name = 'analysis_farm_fk'
  ) THEN
    ALTER TABLE app.analysis
      ADD CONSTRAINT analysis_farm_fk
      FOREIGN KEY (farm_id) REFERENCES app.farm(id) ON DELETE SET NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS analysis_farm_id_idx ON app.analysis(farm_id);
CREATE INDEX IF NOT EXISTS analysis_status_idx ON app.analysis(status);
CREATE INDEX IF NOT EXISTS analysis_pdf_status_idx ON app.analysis(pdf_status);
