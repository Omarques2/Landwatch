-- Validacoes do cache pre-processado para tiles (3857 + simplificacoes)

-- 1) A relacao final deve ser tabela ('r') depois do swap.
SELECT c.relkind
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'landwatch'
  AND c.relname = 'mv_feature_geom_tile_active';

-- 2) Contagem total deve bater com geometrias ativas transformaveis para 3857.
SELECT
  (
    SELECT COUNT(*)
    FROM landwatch.mv_feature_geom_active
    WHERE landwatch.safe_transform_to_3857(geom) IS NOT NULL
  ) AS geom_active_transformable_count,
  (SELECT COUNT(*) FROM landwatch.mv_feature_geom_tile_active) AS geom_tile_cache_count;

-- 3) Nao pode haver features faltantes no cache.
SELECT COUNT(*) AS missing_in_tile_cache
FROM landwatch.mv_feature_geom_active a
LEFT JOIN landwatch.mv_feature_geom_tile_active t
  ON t.dataset_id = a.dataset_id
 AND t.feature_id = a.feature_id
WHERE landwatch.safe_transform_to_3857(a.geom) IS NOT NULL
  AND t.feature_id IS NULL;

-- 4) Nao pode haver features extras no cache.
SELECT COUNT(*) AS extra_in_tile_cache
FROM landwatch.mv_feature_geom_tile_active t
LEFT JOIN landwatch.mv_feature_geom_active a
  ON a.dataset_id = t.dataset_id
 AND a.feature_id = t.feature_id
WHERE a.feature_id IS NULL;

-- 5) Nao deve haver geometria raw nula no cache.
SELECT COUNT(*) AS null_geom_3857_raw
FROM landwatch.mv_feature_geom_tile_active
WHERE geom_3857_raw IS NULL;

-- 6) Amostra por dataset para checagem rapida de integridade.
SELECT
  d.code AS dataset_code,
  COUNT(*) AS total_rows
FROM landwatch.mv_feature_geom_tile_active t
JOIN landwatch.lw_dataset d ON d.dataset_id = t.dataset_id
GROUP BY d.code
ORDER BY total_rows DESC
LIMIT 20;
