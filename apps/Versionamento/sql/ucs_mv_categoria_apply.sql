-- CARD-13.5 (simplificado): MV UCS com categoria textual, sem sigla_categ.
-- Execute no pgAdmin no banco de teste/produção apos o ingest do UCS preparado.

BEGIN;

DROP MATERIALIZED VIEW IF EXISTS landwatch.mv_ucs_sigla_active;

CREATE MATERIALIZED VIEW landwatch.mv_ucs_sigla_active AS
SELECT
  d.dataset_id,
  d.code AS dataset_code,
  h.feature_id,
  NULLIF(
    COALESCE(
      p.pack_json->>'categoria_uc',
      p.pack_json->>'CATEGORIA_UC',
      p.pack_json->>'categoria',
      p.pack_json->>'Categoria',
      p.pack_json->>'CATEGORIA'
    ),
    ''
  ) AS categoria_uc
FROM landwatch.lw_feature_attr_pack_hist h
JOIN landwatch.lw_attr_pack p ON p.pack_id = h.pack_id
JOIN landwatch.lw_dataset d ON d.dataset_id = h.dataset_id
JOIN landwatch.lw_category c ON c.category_id = d.category_id
WHERE h.valid_to IS NULL
  AND (
    c.code IN ('UCS_SNIRH', 'UCS')
    OR UPPER(d.code) LIKE '%UCS%'
    OR UPPER(d.code) LIKE '%CONSERV%'
  )
  AND COALESCE(
    p.pack_json->>'categoria_uc',
    p.pack_json->>'CATEGORIA_UC',
    p.pack_json->>'categoria',
    p.pack_json->>'Categoria',
    p.pack_json->>'CATEGORIA'
  ) IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mv_ucs_sigla_active_dataset
  ON landwatch.mv_ucs_sigla_active(dataset_code);

CREATE INDEX IF NOT EXISTS idx_mv_ucs_sigla_active_feature
  ON landwatch.mv_ucs_sigla_active(feature_id);

CREATE INDEX IF NOT EXISTS idx_mv_ucs_sigla_active_categoria
  ON landwatch.mv_ucs_sigla_active(categoria_uc);

COMMIT;

