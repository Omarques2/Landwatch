SELECT
  (SELECT COUNT(*) FROM landwatch.mv_feature_active_attrs_light) AS active_attrs_count,
  (SELECT COUNT(*) FROM landwatch.mv_feature_tooltip_active) AS tooltip_count;

SELECT
  l.dataset_id,
  l.feature_id
FROM landwatch.mv_feature_active_attrs_light l
LEFT JOIN landwatch.mv_feature_tooltip_active t
  ON t.dataset_id = l.dataset_id
 AND t.feature_id = l.feature_id
WHERE t.feature_id IS NULL
LIMIT 20;

SELECT
  d.code AS dataset_code,
  COUNT(*) FILTER (WHERE t.display_name IS NOT NULL) AS display_name_count,
  COUNT(*) FILTER (WHERE t.natural_id IS NOT NULL) AS natural_id_count,
  COUNT(*) AS total
FROM landwatch.mv_feature_tooltip_active t
JOIN landwatch.lw_dataset d
  ON d.dataset_id = t.dataset_id
GROUP BY d.code
ORDER BY total DESC
LIMIT 40;
