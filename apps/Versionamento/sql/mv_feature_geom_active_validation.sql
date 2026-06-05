-- Validacoes do cache incremental de geometrias ativas.

-- 1) Relações esperadas após swap.
SELECT
  c.relname,
  c.relkind,
  CASE c.relkind
    WHEN 'm' THEN 'materialized view'
    WHEN 'r' THEN 'table'
    WHEN 'p' THEN 'partitioned table'
    ELSE c.relkind::text
  END AS kind
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'landwatch'
  AND c.relname IN (
    'mv_feature_geom_active',
    'mv_feature_geom_active_old',
    'mv_feature_active_attrs_light',
    'mv_feature_active_attrs_light_geom_active_old',
    'mv_feature_tooltip_active',
    'mv_feature_tooltip_active_geom_active_old'
  )
ORDER BY c.relname;

-- 2) Contagem total deve bater com geometrias ativas historicas.
SELECT
  (
    SELECT COUNT(*)
    FROM landwatch.lw_feature_geom_hist
    WHERE valid_to IS NULL
  ) AS geom_hist_active_count,
  (SELECT COUNT(*) FROM landwatch.mv_feature_geom_active) AS geom_active_cache_count;

-- 3) Nao pode haver features faltantes no cache.
SELECT COUNT(*) AS missing_in_geom_active_cache
FROM landwatch.lw_feature_geom_hist h
LEFT JOIN landwatch.mv_feature_geom_active c
  ON c.dataset_id = h.dataset_id
 AND c.feature_id = h.feature_id
WHERE h.valid_to IS NULL
  AND c.feature_id IS NULL;

-- 4) Nao pode haver features extras no cache.
SELECT COUNT(*) AS extra_in_geom_active_cache
FROM landwatch.mv_feature_geom_active c
LEFT JOIN landwatch.lw_feature_geom_hist h
  ON h.dataset_id = c.dataset_id
 AND h.feature_id = c.feature_id
 AND h.valid_to IS NULL
WHERE h.feature_id IS NULL;

-- 5) geom_id/version_id devem bater com historico ativo.
SELECT COUNT(*) AS geom_active_mismatch
FROM landwatch.mv_feature_geom_active c
JOIN landwatch.lw_feature_geom_hist h
  ON h.dataset_id = c.dataset_id
 AND h.feature_id = c.feature_id
 AND h.valid_to IS NULL
WHERE c.geom_id IS DISTINCT FROM h.geom_id
   OR c.version_id IS DISTINCT FROM h.version_id;

-- 6) Amostra por dataset para checagem rapida.
SELECT
  d.code AS dataset_code,
  COUNT(*) AS total_rows
FROM landwatch.mv_feature_geom_active c
JOIN landwatch.lw_dataset d ON d.dataset_id = c.dataset_id
GROUP BY d.code
ORDER BY total_rows DESC
LIMIT 20;
