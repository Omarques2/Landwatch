SET search_path TO landwatch, app, public, pg_catalog;

SELECT
  c.relname,
  c.relkind,
  pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'landwatch'
  AND c.relname IN (
    'lw_feature_delta',
    'lw_feature_delta_run',
    'mv_feature_geom_active',
    'mv_feature_active_attrs_light',
    'mv_feature_tooltip_active',
    'mv_sicar_meta_active',
    'mv_feature_geom_tile_active'
  )
ORDER BY c.relname;

SELECT
  p.proname,
  pg_get_function_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'landwatch'
  AND p.proname = 'refresh_feature_caches_delta';

SELECT
  v.version_id,
  d.code AS dataset_code,
  v.status,
  v.snapshot_date,
  count(fd.feature_id)::bigint AS delta_rows,
  max(r.delta_count)::bigint AS delta_run_rows,
  max(r.geom_delta_count)::bigint AS geom_delta_rows,
  max(r.attr_delta_count)::bigint AS attr_delta_rows,
  max(r.tooltip_delta_count)::bigint AS tooltip_delta_rows,
  count(*) FILTER (WHERE fd.action = 'NEW')::bigint AS new_rows,
  count(*) FILTER (WHERE fd.action = 'CHANGED')::bigint AS changed_rows,
  count(*) FILTER (WHERE fd.action = 'DISAPPEARED')::bigint AS disappeared_rows
FROM landwatch.lw_dataset_version v
JOIN landwatch.lw_dataset d ON d.dataset_id = v.dataset_id
LEFT JOIN landwatch.lw_feature_delta_run r ON r.version_id = v.version_id
LEFT JOIN landwatch.lw_feature_delta fd ON fd.version_id = v.version_id
GROUP BY v.version_id, d.code, v.status, v.snapshot_date, v.loaded_at
ORDER BY v.loaded_at DESC, v.version_id DESC
LIMIT 20;

WITH expected AS (
  SELECT h.dataset_id, h.feature_id, h.geom_id, h.version_id
  FROM landwatch.lw_feature_geom_hist h
  WHERE h.valid_to IS NULL
),
missing AS (
  SELECT dataset_id, feature_id FROM expected
  EXCEPT
  SELECT dataset_id, feature_id FROM landwatch.mv_feature_geom_active
),
extra AS (
  SELECT dataset_id, feature_id FROM landwatch.mv_feature_geom_active
  EXCEPT
  SELECT dataset_id, feature_id FROM expected
),
mismatch AS (
  SELECT c.dataset_id, c.feature_id
  FROM landwatch.mv_feature_geom_active c
  JOIN expected e ON e.dataset_id = c.dataset_id AND e.feature_id = c.feature_id
  WHERE c.geom_id IS DISTINCT FROM e.geom_id
     OR c.version_id IS DISTINCT FROM e.version_id
)
SELECT
  'mv_feature_geom_active' AS cache_name,
  (SELECT count(*) FROM expected)::bigint AS expected_rows,
  (SELECT count(*) FROM landwatch.mv_feature_geom_active)::bigint AS cache_rows,
  (SELECT count(*) FROM missing)::bigint AS missing_rows,
  (SELECT count(*) FROM extra)::bigint AS extra_rows,
  (SELECT count(*) FROM mismatch)::bigint AS mismatch_rows;

WITH expected AS (
  SELECT
    f.dataset_id,
    d.code AS dataset_code,
    f.feature_id,
    f.feature_key,
    a.geom_id
  FROM landwatch.lw_feature f
  JOIN landwatch.lw_dataset d ON d.dataset_id = f.dataset_id
  JOIN landwatch.mv_feature_geom_active a
    ON a.dataset_id = f.dataset_id
   AND a.feature_id = f.feature_id
),
missing AS (
  SELECT dataset_id, feature_id FROM expected
  EXCEPT
  SELECT dataset_id, feature_id FROM landwatch.mv_feature_active_attrs_light
),
extra AS (
  SELECT dataset_id, feature_id FROM landwatch.mv_feature_active_attrs_light
  EXCEPT
  SELECT dataset_id, feature_id FROM expected
),
mismatch AS (
  SELECT c.dataset_id, c.feature_id
  FROM landwatch.mv_feature_active_attrs_light c
  JOIN expected e ON e.dataset_id = c.dataset_id AND e.feature_id = c.feature_id
  WHERE c.dataset_code IS DISTINCT FROM e.dataset_code
     OR c.feature_key IS DISTINCT FROM e.feature_key
     OR c.geom_id IS DISTINCT FROM e.geom_id
)
SELECT
  'mv_feature_active_attrs_light' AS cache_name,
  (SELECT count(*) FROM expected)::bigint AS expected_rows,
  (SELECT count(*) FROM landwatch.mv_feature_active_attrs_light)::bigint AS cache_rows,
  (SELECT count(*) FROM missing)::bigint AS missing_rows,
  (SELECT count(*) FROM extra)::bigint AS extra_rows,
  (SELECT count(*) FROM mismatch)::bigint AS mismatch_rows;

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
  JOIN expected e ON e.dataset_id = c.dataset_id AND e.feature_id = c.feature_id
  WHERE c.dataset_code IS DISTINCT FROM e.dataset_code
     OR c.pack_json IS DISTINCT FROM e.pack_json
)
SELECT
  'mv_sicar_meta_active' AS cache_name,
  (SELECT count(*) FROM expected)::bigint AS expected_rows,
  (SELECT count(*) FROM landwatch.mv_sicar_meta_active)::bigint AS cache_rows,
  (SELECT count(*) FROM missing)::bigint AS missing_rows,
  (SELECT count(*) FROM extra)::bigint AS extra_rows,
  (SELECT count(*) FROM mismatch)::bigint AS mismatch_rows;
