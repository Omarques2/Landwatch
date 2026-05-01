SELECT
  d.code AS dataset_code,
  COUNT(*) FILTER (WHERE a.is_active) AS active_assets,
  COUNT(*) AS total_assets,
  MAX(a.snapshot_date) AS latest_snapshot_date,
  MAX(a.created_at) AS latest_created_at
FROM landwatch.lw_dataset_pmtiles_asset a
JOIN landwatch.lw_dataset d
  ON d.dataset_id = a.dataset_id
GROUP BY d.code
ORDER BY d.code;

SELECT
  d.code AS dataset_code,
  a.version_id,
  a.feature_count AS asset_feature_count,
  counts.active_feature_count
FROM landwatch.lw_dataset_pmtiles_asset a
JOIN landwatch.lw_dataset d
  ON d.dataset_id = a.dataset_id
JOIN (
  SELECT dataset_id, COUNT(*)::bigint AS active_feature_count
  FROM landwatch.mv_feature_active_attrs_light
  GROUP BY dataset_id
) counts
  ON counts.dataset_id = a.dataset_id
WHERE a.is_active = TRUE
ORDER BY d.code;
