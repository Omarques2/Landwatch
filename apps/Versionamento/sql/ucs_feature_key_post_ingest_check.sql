-- CARD-13.8: verificação pós-ingest para confirmar chave natural de UCS.
-- Execute no pgAdmin após o primeiro ingest do dataset preparado.

WITH ds AS (
  SELECT d.dataset_id, d.code, d.natural_id_col
  FROM landwatch.lw_dataset d
  WHERE d.code = 'UNIDADES_CONSERVACAO'
)
SELECT
  ds.dataset_id,
  ds.code AS dataset_code,
  ds.natural_id_col,
  COUNT(*) AS total_features,
  COUNT(*) FILTER (WHERE f.feature_key ~ '^[0-9]{4}\.[0-9]{2}\.[0-9]{4}$') AS cnuc_pattern_count,
  COUNT(*) FILTER (WHERE f.feature_key ~ '^[a-f0-9]{32}$') AS md5_like_count
FROM ds
JOIN landwatch.lw_feature f ON f.dataset_id = ds.dataset_id
GROUP BY ds.dataset_id, ds.code, ds.natural_id_col;

WITH ds AS (
  SELECT d.dataset_id
  FROM landwatch.lw_dataset d
  WHERE d.code = 'UNIDADES_CONSERVACAO'
)
SELECT
  MIN(f.feature_key) AS min_feature_key,
  MAX(f.feature_key) AS max_feature_key
FROM ds
JOIN landwatch.lw_feature f ON f.dataset_id = ds.dataset_id;
