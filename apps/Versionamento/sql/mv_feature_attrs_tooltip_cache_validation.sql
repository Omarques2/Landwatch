SET search_path TO landwatch, app, public, pg_catalog;

WITH relation_kinds AS (
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
      'mv_feature_active_attrs_light',
      'mv_feature_active_attrs_light_old',
      'mv_feature_tooltip_active',
      'mv_feature_tooltip_active_old'
    )
)
SELECT *
FROM relation_kinds
ORDER BY relname;

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
  JOIN expected e
    ON e.dataset_id = c.dataset_id
   AND e.feature_id = c.feature_id
  WHERE c.dataset_code IS DISTINCT FROM e.dataset_code
     OR c.feature_key IS DISTINCT FROM e.feature_key
     OR c.geom_id IS DISTINCT FROM e.geom_id
)
SELECT
  (SELECT count(*) FROM expected) AS expected_count,
  (SELECT count(*) FROM landwatch.mv_feature_active_attrs_light) AS cache_count,
  (SELECT count(*) FROM missing) AS missing_count,
  (SELECT count(*) FROM extra) AS extra_count,
  (SELECT count(*) FROM mismatch) AS mismatch_count;

WITH expected AS (
  SELECT
    l.dataset_id,
    l.feature_id,
    NULLIF(COALESCE(
      p.pack_json->>'nome_uc',
      p.pack_json->>'nome',
      p.pack_json->>'NOME',
      p.pack_json->>'nm',
      p.pack_json->>'NM',
      p.pack_json->>'denominacao',
      p.pack_json->>'descricao',
      p.pack_json->>'terrai_nom',
      p.pack_json->>'TERRAI_NOM',
      p.pack_json->>'etnia_nome',
      p.pack_json->>'ETNIA_NOME',
      p.pack_json->>'undadm_nom',
      p.pack_json->>'UNDADM_NOM'
    ), '') AS display_name,
    NULLIF(COALESCE(
      p.pack_json->>'cnuc_code',
      p.pack_json->>'cd_cnuc',
      p.pack_json->>'Cnuc',
      p.pack_json->>'terrai_cod',
      p.pack_json->>'TERRAI_COD',
      p.pack_json->>'id',
      p.pack_json->>'ID',
      p.pack_json->>'objectid',
      p.pack_json->>'OBJECTID'
    ), '') AS natural_id
  FROM landwatch.mv_feature_active_attrs_light l
  LEFT JOIN landwatch.lw_feature_attr_pack_hist h_attr
    ON h_attr.dataset_id = l.dataset_id
   AND h_attr.feature_id = l.feature_id
   AND h_attr.valid_to IS NULL
  LEFT JOIN landwatch.lw_attr_pack p
    ON p.pack_id = h_attr.pack_id
),
missing AS (
  SELECT dataset_id, feature_id FROM expected
  EXCEPT
  SELECT dataset_id, feature_id FROM landwatch.mv_feature_tooltip_active
),
extra AS (
  SELECT dataset_id, feature_id FROM landwatch.mv_feature_tooltip_active
  EXCEPT
  SELECT dataset_id, feature_id FROM expected
),
mismatch AS (
  SELECT c.dataset_id, c.feature_id
  FROM landwatch.mv_feature_tooltip_active c
  JOIN expected e
    ON e.dataset_id = c.dataset_id
   AND e.feature_id = c.feature_id
  WHERE c.display_name IS DISTINCT FROM e.display_name
     OR c.natural_id IS DISTINCT FROM e.natural_id
)
SELECT
  (SELECT count(*) FROM expected) AS expected_count,
  (SELECT count(*) FROM landwatch.mv_feature_tooltip_active) AS cache_count,
  (SELECT count(*) FROM missing) AS missing_count,
  (SELECT count(*) FROM extra) AS extra_count,
  (SELECT count(*) FROM mismatch) AS mismatch_count;

SELECT
  d.code AS dataset_code,
  count(*) AS active_attrs_rows
FROM landwatch.mv_feature_active_attrs_light l
JOIN landwatch.lw_dataset d ON d.dataset_id = l.dataset_id
GROUP BY d.code
ORDER BY active_attrs_rows DESC
LIMIT 20;
