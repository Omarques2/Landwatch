-- UCS cutover precheck (CARD-13.2)
-- Execute este script no pgAdmin ANTES do cutover.
-- Ajuste apenas o valor de v_cutoff_date no CTE params.

WITH params AS (
  SELECT
    'UNIDADES_CONSERVACAO'::text AS v_dataset_code,
    DATE '2026-04-09' AS v_cutoff_date
),
ds AS (
  SELECT
    d.dataset_id,
    d.code AS dataset_code,
    d.natural_id_col AS dataset_natural_id_col,
    c.category_id,
    c.code AS category_code,
    c.natural_id_col AS category_natural_id_col
  FROM landwatch.lw_dataset d
  JOIN landwatch.lw_category c ON c.category_id = d.category_id
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
  (SELECT COUNT(*) FROM landwatch.lw_dataset_version v JOIN ds ON v.dataset_id = ds.dataset_id WHERE v.status = 'RUNNING') AS running_versions,
  (SELECT MAX(v.snapshot_date) FROM landwatch.lw_dataset_version v JOIN ds ON v.dataset_id = ds.dataset_id WHERE v.status IN ('COMPLETED', 'SKIPPED_NO_CHANGES')) AS last_good_snapshot_date,
  (SELECT v_cutoff_date FROM params) AS chosen_cutoff_date,
  ((SELECT v_cutoff_date FROM params) > COALESCE((SELECT MAX(v.snapshot_date) FROM landwatch.lw_dataset_version v JOIN ds ON v.dataset_id = ds.dataset_id WHERE v.status IN ('COMPLETED', 'SKIPPED_NO_CHANGES')), DATE '1900-01-01')) AS cutoff_is_newer_than_last_snapshot;

WITH params AS (
  SELECT 'UNIDADES_CONSERVACAO'::text AS v_dataset_code
),
ds AS (
  SELECT d.dataset_id
  FROM landwatch.lw_dataset d
  JOIN params p ON p.v_dataset_code = d.code
)
SELECT
  (SELECT COUNT(*) FROM landwatch.lw_feature f JOIN ds ON f.dataset_id = ds.dataset_id) AS total_features,
  (SELECT COUNT(*) FROM landwatch.lw_feature_state s JOIN ds ON s.dataset_id = ds.dataset_id WHERE s.is_present = TRUE) AS state_active,
  (SELECT COUNT(*) FROM landwatch.lw_feature_state s JOIN ds ON s.dataset_id = ds.dataset_id WHERE s.is_present = FALSE) AS state_inactive,
  (SELECT COUNT(*) FROM landwatch.lw_feature_geom_hist h JOIN ds ON h.dataset_id = ds.dataset_id WHERE h.valid_to IS NULL) AS geom_active,
  (SELECT COUNT(*) FROM landwatch.lw_feature_attr_pack_hist h JOIN ds ON h.dataset_id = ds.dataset_id WHERE h.valid_to IS NULL) AS attr_active,
  (SELECT COUNT(*) FROM landwatch.lw_doc_index h JOIN ds ON h.dataset_id = ds.dataset_id WHERE h.valid_to IS NULL) AS doc_active;

WITH params AS (
  SELECT 'UNIDADES_CONSERVACAO'::text AS v_dataset_code
),
ds AS (
  SELECT d.dataset_id
  FROM landwatch.lw_dataset d
  JOIN params p ON p.v_dataset_code = d.code
)
SELECT
  COUNT(*) FILTER (WHERE f.feature_key ~ '^[a-f0-9]{32}$') AS md5_like_keys,
  COUNT(*) FILTER (WHERE f.feature_key ~ '^[0-9]{4}\.[0-9]{2}\.[0-9]{4}$') AS cnuc_like_keys,
  COUNT(*) AS total_keys
FROM landwatch.lw_feature f
JOIN ds ON f.dataset_id = ds.dataset_id;

WITH params AS (
  SELECT 'UNIDADES_CONSERVACAO'::text AS v_dataset_code
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
ORDER BY v.version_id DESC
LIMIT 20;

