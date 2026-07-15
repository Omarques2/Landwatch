UPDATE app.tier
SET data = created_at::date
WHERE data IS NULL;

ALTER TABLE app.tier
  ALTER COLUMN data SET NOT NULL;

DO $$
BEGIN
  CREATE TYPE app.tier_cobranca_status AS ENUM ('NAO_PAGA', 'PAGA', 'CANCELADA');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE app.tier_cobranca (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  proprietario_id uuid NOT NULL,
  periodo_ini date NOT NULL,
  periodo_fim date NOT NULL,
  status app.tier_cobranca_status NOT NULL DEFAULT 'NAO_PAGA',
  valor_base numeric(12,2) NOT NULL,
  valor_adicional numeric(12,2) NOT NULL,
  valor_total numeric(12,2) NOT NULL,
  qtd_animais integer NOT NULL,
  qtd_aprovados integer NOT NULL,
  data_pagamento date,
  valor_pago numeric(12,2),
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(6) NOT NULL,
  CONSTRAINT tier_cobranca_pkey PRIMARY KEY (id)
);

CREATE TABLE app.tier_cobranca_item (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cobranca_id uuid NOT NULL,
  tier_id uuid NOT NULL,
  tier_data date NOT NULL,
  qtd_animais integer NOT NULL,
  status app.tier_status NOT NULL,
  contrato_valor_animal numeric(12,2) NOT NULL,
  contrato_valor_adicional_aprovado numeric(12,2) NOT NULL,
  valor_base numeric(12,2) NOT NULL,
  valor_adicional numeric(12,2) NOT NULL,
  valor_item numeric(12,2) NOT NULL,
  CONSTRAINT tier_cobranca_item_pkey PRIMARY KEY (id)
);

CREATE INDEX tier_cobranca_proprietario_id_status_idx
  ON app.tier_cobranca(proprietario_id, status);
CREATE INDEX tier_cobranca_item_cobranca_id_idx
  ON app.tier_cobranca_item(cobranca_id);
CREATE INDEX tier_cobranca_item_tier_id_idx
  ON app.tier_cobranca_item(tier_id);

ALTER TABLE app.tier_cobranca
  ADD CONSTRAINT tier_cobranca_proprietario_id_fkey
  FOREIGN KEY (proprietario_id) REFERENCES app.tier_proprietario(id)
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE app.tier_cobranca_item
  ADD CONSTRAINT tier_cobranca_item_cobranca_id_fkey
  FOREIGN KEY (cobranca_id) REFERENCES app.tier_cobranca(id)
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE app.tier_cobranca_item
  ADD CONSTRAINT tier_cobranca_item_tier_id_fkey
  FOREIGN KEY (tier_id) REFERENCES app.tier(id)
  ON DELETE RESTRICT ON UPDATE CASCADE;
