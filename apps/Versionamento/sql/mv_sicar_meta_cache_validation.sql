SET search_path TO landwatch, app, public, pg_catalog;

SELECT
  c.relname,
  c.relkind,
  CASE c.relkind
    WHEN 'r' THEN 'table'
    WHEN 'p' THEN 'partitioned table'
    WHEN 'm' THEN 'materialized view'
    ELSE c.relkind::text
  END AS kind
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'landwatch'
  AND c.relname IN (
    'mv_sicar_meta_active',
    'mv_sicar_meta_active_old'
  )
ORDER BY c.relname;

WITH expected AS (
  SELECT
    d.dataset_id,
    d.code AS dataset_code,
    h.feature_id,
    p.pack_json
  FROM landwatch.lw_feature_attr_pack_hist h
  JOIN landwatch.lw_attr_pack p ON p.pack_id = h.pack_id
  JOIN landwatch.lw_dataset d ON d.dataset_id = h.dataset_id
  JOIN landwatch.lw_category c ON c.category_id = d.category_id
  WHERE h.valid_to IS NULL
    AND (c.code = 'SICAR' OR d.code = 'SICAR')
),
missing AS (
  SELECT dataset_id, feature_id FROM expected
  EXCEPT
  SELECT dataset_id, feature_id FROM landwatch.mv_sicar_meta_active
),
extra AS (
  SELECT dataset_id, feature_id FROM landwatch.mv_sicar_meta_active
  EXCEPT
  SELECT dataset_id, feature_id FROM expected
),
mismatch AS (
  SELECT c.dataset_id, c.feature_id
  FROM landwatch.mv_sicar_meta_active c
  JOIN expected e
    ON e.dataset_id = c.dataset_id
   AND e.feature_id = c.feature_id
  WHERE c.dataset_code IS DISTINCT FROM e.dataset_code
     OR c.pack_json IS DISTINCT FROM e.pack_json
)
SELECT
  (SELECT count(*) FROM expected) AS expected_count,
  (SELECT count(*) FROM landwatch.mv_sicar_meta_active) AS cache_count,
  (SELECT count(*) FROM missing) AS missing_count,
  (SELECT count(*) FROM extra) AS extra_count,
  (SELECT count(*) FROM mismatch) AS mismatch_count;

SELECT
  dataset_code,
  count(*) AS total_rows
FROM landwatch.mv_sicar_meta_active
GROUP BY dataset_code
ORDER BY total_rows DESC
LIMIT 20;
