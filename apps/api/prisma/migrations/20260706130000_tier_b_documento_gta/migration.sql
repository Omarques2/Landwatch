-- Tier B: documento nome + tipo OUTRO; restructure tier_gta.
ALTER TABLE app.tier_documento ADD COLUMN IF NOT EXISTS nome text;
ALTER TYPE app.tier_doc_tipo ADD VALUE IF NOT EXISTS 'OUTRO';

ALTER TABLE app.tier_gta DROP CONSTRAINT IF EXISTS tier_gta_origem_fazenda_id_fkey;
ALTER TABLE app.tier_gta DROP COLUMN IF EXISTS origem_fazenda_id;
ALTER TABLE app.tier_gta DROP COLUMN IF EXISTS qtd;
ALTER TABLE app.tier_gta DROP COLUMN IF EXISTS sexo;

ALTER TABLE app.tier_gta ADD COLUMN IF NOT EXISTS serie text;
ALTER TABLE app.tier_gta ADD COLUMN IF NOT EXISTS uf text;
ALTER TABLE app.tier_gta ADD COLUMN IF NOT EXISTS sistema text;
ALTER TABLE app.tier_gta ADD COLUMN IF NOT EXISTS origem_nome text;
ALTER TABLE app.tier_gta ADD COLUMN IF NOT EXISTS origem_cpf_cnpj text;
ALTER TABLE app.tier_gta ADD COLUMN IF NOT EXISTS origem_estabelecimento text;
ALTER TABLE app.tier_gta ADD COLUMN IF NOT EXISTS origem_car text;
ALTER TABLE app.tier_gta ADD COLUMN IF NOT EXISTS origem_municipio text;
ALTER TABLE app.tier_gta ADD COLUMN IF NOT EXISTS origem_uf text;
ALTER TABLE app.tier_gta ADD COLUMN IF NOT EXISTS raw_extraction jsonb;
ALTER TABLE app.tier_gta ADD COLUMN IF NOT EXISTS blob_provider text;
ALTER TABLE app.tier_gta ADD COLUMN IF NOT EXISTS blob_container text;
ALTER TABLE app.tier_gta ADD COLUMN IF NOT EXISTS blob_path text;
ALTER TABLE app.tier_gta ADD COLUMN IF NOT EXISTS mime text;
