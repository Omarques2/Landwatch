-- Tier module (cattle traceability). Schema "app", tables prefixed tier_.

DO $$ BEGIN CREATE TYPE app.tier_status AS ENUM ('SUBMETIDO','APROVADO','RECUSADO'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE app.tier_car_vinculo AS ENUM ('PROPRIO','ARRENDAMENTO','COMODATO'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE app.tier_doc_tipo AS ENUM ('INSCRICAO_ESTADUAL','PROCURACAO','CONTRATO_COMODATO','DOC_PESSOAL','PARECER_TECNICO','DECLARACAO_M049','NF'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE app.tier_doc_escopo AS ENUM ('PROPRIETARIO','FAZENDA','CAR','TIER','LOTE','FRIGORIFICO'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS app.tier_proprietario (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cpf_cnpj text,
  tipo text NOT NULL,
  inscricao_estadual text,
  grupo text,
  municipio text,
  estado text,
  contrato_valor_animal numeric(12,2) NOT NULL DEFAULT 1.50,
  contrato_valor_adicional_aprovado numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL,
  CONSTRAINT tier_proprietario_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS app.tier_fazenda (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  municipio text,
  estado text,
  proprietario_dono_id uuid,
  sistema text,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL,
  CONSTRAINT tier_fazenda_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS tier_fazenda_proprietario_dono_id_idx ON app.tier_fazenda (proprietario_dono_id);

CREATE TABLE IF NOT EXISTS app.tier_car (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL,
  car_numero text NOT NULL,
  vinculo app.tier_car_vinculo NOT NULL DEFAULT 'PROPRIO',
  titular_nome text,
  titular_cpf_cnpj text,
  municipio text,
  uf text,
  area_ha numeric(14,4),
  landwatch_analise_id text,
  analise_status text,
  analise_snapshot_at timestamptz(6),
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL,
  CONSTRAINT tier_car_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS tier_car_fazenda_id_idx ON app.tier_car (fazenda_id);
CREATE INDEX IF NOT EXISTS tier_car_car_numero_idx ON app.tier_car (car_numero);

CREATE TABLE IF NOT EXISTS app.tier_grupo_frigorifico (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL,
  CONSTRAINT tier_grupo_frigorifico_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS app.tier_frigorifico (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  inscricao_estadual text,
  cpf_cnpj text,
  municipio text,
  endereco text,
  lat numeric(10,7),
  lon numeric(10,7),
  grupo_id uuid,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL,
  CONSTRAINT tier_frigorifico_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS tier_frigorifico_grupo_id_idx ON app.tier_frigorifico (grupo_id);

CREATE TABLE IF NOT EXISTS app.tier (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  proprietario_id uuid NOT NULL,
  fazenda_id uuid NOT NULL,
  frigorifico_id uuid,
  qtd_animais integer NOT NULL,
  status app.tier_status NOT NULL DEFAULT 'SUBMETIDO',
  data date,
  validado_por text,
  data_aprovacao timestamptz(6),
  contrato_valor_animal numeric(12,2) NOT NULL,
  contrato_valor_adicional_aprovado numeric(12,2) NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL,
  CONSTRAINT tier_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS tier_proprietario_id_idx ON app.tier (proprietario_id);
CREATE INDEX IF NOT EXISTS tier_fazenda_id_idx ON app.tier (fazenda_id);
CREATE INDEX IF NOT EXISTS tier_status_idx ON app.tier (status);

CREATE TABLE IF NOT EXISTS app.tier_lote (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tier_id uuid NOT NULL,
  nome text NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL,
  CONSTRAINT tier_lote_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS tier_lote_tier_id_idx ON app.tier_lote (tier_id);

CREATE TABLE IF NOT EXISTS app.tier_abate (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_abate date NOT NULL,
  frigorifico_id uuid,
  qtd integer NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL,
  CONSTRAINT tier_abate_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS tier_abate_frigorifico_id_idx ON app.tier_abate (frigorifico_id);

CREATE TABLE IF NOT EXISTS app.tier_abate_consumo (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  abate_id uuid NOT NULL,
  tier_id uuid,
  qtd_consumida integer NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT tier_abate_consumo_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS tier_abate_consumo_abate_id_idx ON app.tier_abate_consumo (abate_id);
CREATE INDEX IF NOT EXISTS tier_abate_consumo_tier_id_idx ON app.tier_abate_consumo (tier_id);

CREATE TABLE IF NOT EXISTS app.tier_documento (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tipo app.tier_doc_tipo NOT NULL,
  escopo app.tier_doc_escopo NOT NULL,
  ref_id uuid NOT NULL,
  lote_id uuid,
  data_ref date,
  status_validacao text,
  validado_por text,
  blob_provider text,
  blob_container text,
  blob_path text NOT NULL,
  mime text,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL,
  CONSTRAINT tier_documento_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS tier_documento_escopo_ref_id_idx ON app.tier_documento (escopo, ref_id);
CREATE INDEX IF NOT EXISTS tier_documento_lote_id_idx ON app.tier_documento (lote_id);

CREATE TABLE IF NOT EXISTS app.tier_gta (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  numero text NOT NULL,
  data_emissao date,
  origem_fazenda_id uuid,
  qtd integer,
  sexo text,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL,
  CONSTRAINT tier_gta_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS tier_gta_numero_idx ON app.tier_gta (numero);

CREATE TABLE IF NOT EXISTS app.tier_lote_gta (
  lote_id uuid NOT NULL,
  gta_id uuid NOT NULL,
  CONSTRAINT tier_lote_gta_pkey PRIMARY KEY (lote_id, gta_id)
);

CREATE TABLE IF NOT EXISTS app.tier_lote_origem (
  lote_id uuid NOT NULL,
  fazenda_origem_id uuid NOT NULL,
  CONSTRAINT tier_lote_origem_pkey PRIMARY KEY (lote_id, fazenda_origem_id)
);

-- Foreign keys (constraint names + ON UPDATE CASCADE match Prisma's expected schema)
ALTER TABLE app.tier_fazenda       ADD CONSTRAINT tier_fazenda_proprietario_dono_id_fkey    FOREIGN KEY (proprietario_dono_id) REFERENCES app.tier_proprietario(id)      ON DELETE SET NULL  ON UPDATE CASCADE;
ALTER TABLE app.tier_car           ADD CONSTRAINT tier_car_fazenda_id_fkey                  FOREIGN KEY (fazenda_id)           REFERENCES app.tier_fazenda(id)           ON DELETE CASCADE   ON UPDATE CASCADE;
ALTER TABLE app.tier_frigorifico   ADD CONSTRAINT tier_frigorifico_grupo_id_fkey            FOREIGN KEY (grupo_id)             REFERENCES app.tier_grupo_frigorifico(id) ON DELETE SET NULL  ON UPDATE CASCADE;
ALTER TABLE app.tier               ADD CONSTRAINT tier_proprietario_id_fkey                 FOREIGN KEY (proprietario_id)      REFERENCES app.tier_proprietario(id)      ON DELETE RESTRICT  ON UPDATE CASCADE;
ALTER TABLE app.tier               ADD CONSTRAINT tier_fazenda_id_fkey                      FOREIGN KEY (fazenda_id)           REFERENCES app.tier_fazenda(id)           ON DELETE RESTRICT  ON UPDATE CASCADE;
ALTER TABLE app.tier               ADD CONSTRAINT tier_frigorifico_id_fkey                  FOREIGN KEY (frigorifico_id)       REFERENCES app.tier_frigorifico(id)       ON DELETE SET NULL  ON UPDATE CASCADE;
ALTER TABLE app.tier_lote          ADD CONSTRAINT tier_lote_tier_id_fkey                    FOREIGN KEY (tier_id)              REFERENCES app.tier(id)                   ON DELETE CASCADE   ON UPDATE CASCADE;
ALTER TABLE app.tier_abate         ADD CONSTRAINT tier_abate_frigorifico_id_fkey            FOREIGN KEY (frigorifico_id)       REFERENCES app.tier_frigorifico(id)       ON DELETE SET NULL  ON UPDATE CASCADE;
ALTER TABLE app.tier_abate_consumo ADD CONSTRAINT tier_abate_consumo_abate_id_fkey          FOREIGN KEY (abate_id)             REFERENCES app.tier_abate(id)             ON DELETE CASCADE   ON UPDATE CASCADE;
ALTER TABLE app.tier_abate_consumo ADD CONSTRAINT tier_abate_consumo_tier_id_fkey           FOREIGN KEY (tier_id)              REFERENCES app.tier(id)                   ON DELETE SET NULL  ON UPDATE CASCADE;
ALTER TABLE app.tier_documento     ADD CONSTRAINT tier_documento_lote_id_fkey               FOREIGN KEY (lote_id)              REFERENCES app.tier_lote(id)              ON DELETE CASCADE   ON UPDATE CASCADE;
ALTER TABLE app.tier_gta           ADD CONSTRAINT tier_gta_origem_fazenda_id_fkey           FOREIGN KEY (origem_fazenda_id)    REFERENCES app.tier_fazenda(id)           ON DELETE SET NULL  ON UPDATE CASCADE;
ALTER TABLE app.tier_lote_gta      ADD CONSTRAINT tier_lote_gta_lote_id_fkey                FOREIGN KEY (lote_id)              REFERENCES app.tier_lote(id)              ON DELETE CASCADE   ON UPDATE CASCADE;
ALTER TABLE app.tier_lote_gta      ADD CONSTRAINT tier_lote_gta_gta_id_fkey                 FOREIGN KEY (gta_id)               REFERENCES app.tier_gta(id)               ON DELETE CASCADE   ON UPDATE CASCADE;
ALTER TABLE app.tier_lote_origem   ADD CONSTRAINT tier_lote_origem_lote_id_fkey             FOREIGN KEY (lote_id)              REFERENCES app.tier_lote(id)              ON DELETE CASCADE   ON UPDATE CASCADE;
ALTER TABLE app.tier_lote_origem   ADD CONSTRAINT tier_lote_origem_fazenda_origem_id_fkey   FOREIGN KEY (fazenda_origem_id)    REFERENCES app.tier_fazenda(id)           ON DELETE CASCADE   ON UPDATE CASCADE;
