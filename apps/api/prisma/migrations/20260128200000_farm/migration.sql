-- Farm entity (MVP)
CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE IF NOT EXISTS app.farm (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  car_key text NOT NULL,
  cpf_cnpj text NULL,
  owner_user_id uuid NOT NULL,
  org_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT farm_car_key_key UNIQUE (car_key),
  CONSTRAINT farm_owner_fk FOREIGN KEY (owner_user_id) REFERENCES app.app_user(id) ON DELETE RESTRICT,
  CONSTRAINT farm_org_fk FOREIGN KEY (org_id) REFERENCES app.org(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS farm_owner_user_id_idx ON app.farm(owner_user_id);
CREATE INDEX IF NOT EXISTS farm_org_id_idx ON app.farm(org_id);
