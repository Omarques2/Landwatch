-- Validacoes da MV pre-processada para tiles (3857 + simplificacoes)

-- 1) Contagem total deve bater com mv_feature_geom_active
SELECT
  (SELECT COUNT(*) FROM landwatch.mv_feature_geom_active) AS geom_active_count,
  (SELECT COUNT(*) FROM landwatch.mv_feature_geom_tile_active) AS geom_tile_count;

-- 2) Nao pode haver features faltantes na MV nova
SELECT COUNT(*) AS missing_in_tile_mv
FROM landwatch.mv_feature_geom_active a
LEFT JOIN landwatch.mv_feature_geom_tile_active t
  ON t.dataset_id = a.dataset_id
 AND t.feature_id = a.feature_id
WHERE t.feature_id IS NULL;

-- 3) Nao pode haver features extras na MV nova
SELECT COUNT(*) AS extra_in_tile_mv
FROM landwatch.mv_feature_geom_tile_active t
LEFT JOIN landwatch.mv_feature_geom_active a
  ON a.dataset_id = t.dataset_id
 AND a.feature_id = t.feature_id
WHERE a.feature_id IS NULL;

-- 4) Amostra por dataset para checagem rapida de integridade
SELECT
  d.code AS dataset_code,
  COUNT(*) AS total_rows
FROM landwatch.mv_feature_geom_tile_active t
JOIN landwatch.lw_dataset d ON d.dataset_id = t.dataset_id
GROUP BY d.code
ORDER BY total_rows DESC
LIMIT 20;
