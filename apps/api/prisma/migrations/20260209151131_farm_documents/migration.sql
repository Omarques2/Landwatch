-- Add farm documents table and migrate existing cpf_cnpj

DO $$
BEGIN
  CREATE TYPE app.farm_doc_type AS ENUM ('CPF', 'CNPJ');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS app.farm_document (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL,
  doc_type app.farm_doc_type NOT NULL,
  doc_normalized text NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT farm_document_pkey PRIMARY KEY (id),
  CONSTRAINT farm_document_farm_id_fkey FOREIGN KEY (farm_id)
    REFERENCES app.farm(id) ON DELETE CASCADE,
  CONSTRAINT farm_document_unique UNIQUE (farm_id, doc_normalized)
);

CREATE INDEX IF NOT EXISTS farm_document_doc_idx
  ON app.farm_document (doc_normalized);

CREATE INDEX IF NOT EXISTS farm_document_farm_idx
  ON app.farm_document (farm_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'app'
      AND table_name = 'farm'
      AND column_name = 'cpf_cnpj'
  ) THEN
    EXECUTE $sql$
      INSERT INTO app.farm_document (farm_id, doc_type, doc_normalized)
      SELECT
        id,
        CASE
          WHEN length(cpf_cnpj) = 11 THEN 'CPF'::app.farm_doc_type
          ELSE 'CNPJ'::app.farm_doc_type
        END,
        cpf_cnpj
      FROM app.farm
      WHERE cpf_cnpj IS NOT NULL
      ON CONFLICT (farm_id, doc_normalized) DO NOTHING;
    $sql$;
  END IF;
END $$;

ALTER TABLE app.farm DROP COLUMN IF EXISTS cpf_cnpj;
