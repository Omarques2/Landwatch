-- LandWatch v2 - seed de categorias
-- Data: 2026-01-29
-- Observação: use para cadastrar/atualizar categorias baseadas nas pastas.

BEGIN;

INSERT INTO landwatch.lw_category (code, description, default_srid, natural_id_col)
VALUES
  ('PRODES', 'Desmatamento PRODES', 4674, 'uid'),
  ('SICAR', 'Imoveis SICAR', 4674, 'cod_imovel'),
  ('EMBARGOS_IBAMA', 'Embargos do Ibama', 4674, 'objectid'),
  ('EMBARGOS_ICMBIO', 'Embargos do ICMBIO', 4674, 'numero_emb'),
  ('UCS_SNIRH', 'Unidades de conservação - SNIRH', 4674, 'ID_UC0'),
  ('QUILOMBOLAS', 'Terras Quilombolas', 4674, 'nm_comunid'),
  ('INDIGENAS', 'Terras Indigenas', 4674, 'gid'),
  ('BIOMAS', 'Biomas', 4674, 'CD_Bioma'),
  ('LDI_SEMSOBREPOSICAO', 'Embargos LDI Sem Sobreposicao', 4674, 'codLdi'),
  ('LDI_MANUAL', 'Embargos LDI Manual', 4674, 'codList'),
  ('LDI_AUTOMATIZADO', 'Embargos LDI Automatizado', 4674, 'codLdi'),
  ('CADASTRO_EMPREGADORES', 'Cadastro de Empregadores que tenham submetido trabalhadores a condições análogas à de escravo', 4674, NULL),
  ('LISTA_EMBARGOS_IBAMA', 'Cadastro de Empregadores que tenham submetido trabalhadores a condições análogas à de escravo', 4674, NULL)
ON CONFLICT (code) DO UPDATE
SET
  description = EXCLUDED.description,
  default_srid = EXCLUDED.default_srid,
  natural_id_col = EXCLUDED.natural_id_col;

COMMIT;

