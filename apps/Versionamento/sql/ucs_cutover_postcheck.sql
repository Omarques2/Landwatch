-- UCS cutover postcheck (CARD-13.2)
-- Execute este script no pgAdmin IMEDIATAMENTE apos o cutover.
-- Ajuste apenas v_dataset_code e v_cutoff_date se necessario.

WITH params AS (
  SELECT
    'UNIDADES_CONSERVACAO'::text AS v_dataset_code,
    DATE '2026-04-09' AS v_cutoff_date
),
ds AS (
  SELECT
    d.dataset_id,
    d.code AS dataset_code,
    d.natural_id_col AS dataset_natural_id_col
  FROM landwatch.lw_dataset d
  JOIN params p ON p.v_dataset_code = d.code
)
SELECT * FROM ds;

WITH params AS (
  SELECT
    'UNIDADES_CONSERVACAO'::text AS v_dataset_code,
    DATE '2026-04-09' AS v_cutoff_date
),
ds AS (
  SELECT d.dataset_id
  FROM landwatch.lw_dataset d
  JOIN params p ON p.v_dataset_code = d.code
)
SELECT
  (SELECT COUNT(*) FROM landwatch.lw_feature_state s JOIN ds ON s.dataset_id = ds.dataset_id WHERE s.is_present = TRUE) AS state_active_should_be_zero,
  (SELECT COUNT(*) FROM landwatch.lw_feature_geom_hist h JOIN ds ON h.dataset_id = ds.dataset_id WHERE h.valid_to IS NULL) AS geom_active_should_be_zero,
  (SELECT COUNT(*) FROM landwatch.lw_feature_attr_pack_hist h JOIN ds ON h.dataset_id = ds.dataset_id WHERE h.valid_to IS NULL) AS attr_active_should_be_zero,
  (SELECT COUNT(*) FROM landwatch.lw_doc_index h JOIN ds ON h.dataset_id = ds.dataset_id WHERE h.valid_to IS NULL) AS doc_active_should_be_zero;

WITH params AS (
  SELECT
    'UNIDADES_CONSERVACAO'::text AS v_dataset_code,
    DATE '2026-04-09' AS v_cutoff_date
),
ds AS (
  SELECT d.dataset_id
  FROM landwatch.lw_dataset d
  JOIN params p ON p.v_dataset_code = d.code
)
SELECT
  COUNT(*) AS geom_rows_closed_on_cutoff
FROM landwatch.lw_feature_geom_hist h
JOIN ds ON h.dataset_id = ds.dataset_id
JOIN params p ON TRUE
WHERE h.valid_to = p.v_cutoff_date;

WITH params AS (
  SELECT
    'UNIDADES_CONSERVACAO'::text AS v_dataset_code,
    DATE '2026-04-09' AS v_cutoff_date
),
ds AS (
  SELECT d.dataset_id
  FROM landwatch.lw_dataset d
  JOIN params p ON p.v_dataset_code = d.code
)
SELECT
  COUNT(*) AS attr_rows_closed_on_cutoff
FROM landwatch.lw_feature_attr_pack_hist h
JOIN ds ON h.dataset_id = ds.dataset_id
JOIN params p ON TRUE
WHERE h.valid_to = p.v_cutoff_date;

WITH params AS (
  SELECT
    'UNIDADES_CONSERVACAO'::text AS v_dataset_code,
    DATE '2026-04-09' AS v_cutoff_date
),
ds AS (
  SELECT d.dataset_id
  FROM landwatch.lw_dataset d
  JOIN params p ON p.v_dataset_code = d.code
)
SELECT
  v.version_id,
  v.version_label,
  v.snapshot_date,
  v.status,
  v.loaded_at
FROM landwatch.lw_dataset_version v
JOIN ds ON v.dataset_id = ds.dataset_id
WHERE v.version_label LIKE 'UNIDADES_CONSERVACAO_CUTOVER_%'
ORDER BY v.version_id DESC
LIMIT 5;

