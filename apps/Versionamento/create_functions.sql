-- Funcoes de analise (LandWatch)
-- Gerado em 2026-02-01

DROP FUNCTION IF EXISTS landwatch.fn_intersections_current_simple(text);
DROP FUNCTION IF EXISTS landwatch.fn_intersections_asof_simple(text, date);
DROP FUNCTION IF EXISTS landwatch.fn_intersections_current_area(text);
DROP FUNCTION IF EXISTS landwatch.fn_intersections_asof_area(text, date);

CREATE OR REPLACE FUNCTION landwatch.fn_sicar_feature_current(p_cod_imovel text)
RETURNS TABLE (
  dataset_id bigint,
  feature_id bigint,
  feature_key text,
  geom geometry
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    f.dataset_id,
    f.feature_id,
    f.feature_key,
    g.geom
  FROM landwatch.lw_feature f
  JOIN landwatch.lw_dataset d ON d.dataset_id = f.dataset_id
  JOIN landwatch.lw_category c ON c.category_id = d.category_id
  JOIN landwatch.lw_feature_geom_hist h
    ON h.dataset_id = f.dataset_id
   AND h.feature_id = f.feature_id
   AND h.valid_to IS NULL
  JOIN landwatch.lw_geom_store g ON g.geom_id = h.geom_id
  WHERE c.code = 'SICAR'
    AND f.feature_key = p_cod_imovel;
$$;

CREATE OR REPLACE FUNCTION landwatch.fn_sicar_feature_asof(p_cod_imovel text, p_as_of_date date)
RETURNS TABLE (
  dataset_id bigint,
  feature_id bigint,
  feature_key text,
  geom geometry
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    f.dataset_id,
    f.feature_id,
    f.feature_key,
    g.geom
  FROM landwatch.lw_feature f
  JOIN landwatch.lw_dataset d ON d.dataset_id = f.dataset_id
  JOIN landwatch.lw_category c ON c.category_id = d.category_id
  JOIN landwatch.lw_feature_geom_hist h
    ON h.dataset_id = f.dataset_id
   AND h.feature_id = f.feature_id
   AND h.valid_from <= p_as_of_date
   AND (h.valid_to IS NULL OR h.valid_to > p_as_of_date)
  JOIN landwatch.lw_geom_store g ON g.geom_id = h.geom_id
  WHERE c.code = 'SICAR'
    AND f.feature_key = p_cod_imovel;
$$;

CREATE OR REPLACE FUNCTION landwatch.fn_intersections_current_simple(p_cod_imovel text)
RETURNS TABLE (
  category_code text,
  dataset_code text,
  snapshot_date date,
  feature_id bigint,
  geom_id bigint,
  geom geometry
)
LANGUAGE sql
STABLE
AS $$
  WITH sicar_feature AS (
    SELECT
      f.dataset_id,
      f.feature_id,
      h.geom_id AS sicar_geom_id,
      g.geom AS sicar_geom
    FROM landwatch.lw_feature f
    JOIN landwatch.lw_dataset d ON d.dataset_id = f.dataset_id
    JOIN landwatch.lw_category c ON c.category_id = d.category_id
    JOIN landwatch.lw_feature_geom_hist h
      ON h.dataset_id = f.dataset_id
     AND h.feature_id = f.feature_id
     AND h.valid_to IS NULL
    JOIN landwatch.lw_geom_store g ON g.geom_id = h.geom_id
    WHERE c.code = 'SICAR'
      AND f.feature_key = p_cod_imovel
  )
  SELECT
    'SICAR' AS category_code,
    d.code AS dataset_code,
    NULL::date AS snapshot_date,
    f.feature_id,
    s.sicar_geom_id AS geom_id,
    s.sicar_geom AS geom
  FROM sicar_feature s
  JOIN landwatch.lw_feature f
    ON f.dataset_id = s.dataset_id
   AND f.feature_id = s.feature_id
  JOIN landwatch.lw_dataset d ON d.dataset_id = f.dataset_id

  UNION ALL

  SELECT
    c.code AS category_code,
    d.code AS dataset_code,
    v.snapshot_date AS snapshot_date,
    f.feature_id,
    h.geom_id AS geom_id,
    g.geom AS geom
  FROM sicar_feature s
  JOIN landwatch.lw_feature_geom_hist h
    ON h.valid_to IS NULL
  JOIN landwatch.lw_geom_store g ON g.geom_id = h.geom_id
  JOIN landwatch.lw_feature f
    ON f.dataset_id = h.dataset_id
   AND f.feature_id = h.feature_id
  JOIN landwatch.lw_dataset d ON d.dataset_id = f.dataset_id
  JOIN landwatch.lw_category c ON c.category_id = d.category_id
  JOIN landwatch.lw_dataset_version v ON v.version_id = h.version_id
  WHERE c.code NOT IN ('SICAR', 'DETER')
    AND g.geom && s.sicar_geom
    AND ST_Intersects(s.sicar_geom, g.geom)
  ORDER BY dataset_code, feature_id;
$$;

CREATE OR REPLACE FUNCTION landwatch.fn_intersections_asof_simple(p_cod_imovel text, p_as_of_date date)
RETURNS TABLE (
  category_code text,
  dataset_code text,
  snapshot_date date,
  feature_id bigint,
  geom_id bigint,
  geom geometry
)
LANGUAGE sql
STABLE
AS $$
  WITH sicar_feature AS (
    SELECT
      f.dataset_id,
      f.feature_id,
      h.geom_id AS sicar_geom_id,
      g.geom AS sicar_geom
    FROM landwatch.lw_feature f
    JOIN landwatch.lw_dataset d ON d.dataset_id = f.dataset_id
    JOIN landwatch.lw_category c ON c.category_id = d.category_id
    JOIN landwatch.lw_feature_geom_hist h
      ON h.dataset_id = f.dataset_id
     AND h.feature_id = f.feature_id
     AND h.valid_from <= p_as_of_date
     AND (h.valid_to IS NULL OR h.valid_to > p_as_of_date)
    JOIN landwatch.lw_geom_store g ON g.geom_id = h.geom_id
    WHERE c.code = 'SICAR'
      AND f.feature_key = p_cod_imovel
  )
  SELECT
    'SICAR' AS category_code,
    d.code AS dataset_code,
    NULL::date AS snapshot_date,
    f.feature_id,
    s.sicar_geom_id AS geom_id,
    s.sicar_geom AS geom
  FROM sicar_feature s
  JOIN landwatch.lw_feature f
    ON f.dataset_id = s.dataset_id
   AND f.feature_id = s.feature_id
  JOIN landwatch.lw_dataset d ON d.dataset_id = f.dataset_id

  UNION ALL

  SELECT
    c.code AS category_code,
    d.code AS dataset_code,
    v.snapshot_date AS snapshot_date,
    f.feature_id,
    h.geom_id AS geom_id,
    g.geom AS geom
  FROM sicar_feature s
  JOIN landwatch.lw_feature_geom_hist h
    ON h.valid_from <= p_as_of_date
   AND (h.valid_to IS NULL OR h.valid_to > p_as_of_date)
  JOIN landwatch.lw_geom_store g ON g.geom_id = h.geom_id
  JOIN landwatch.lw_feature f
    ON f.dataset_id = h.dataset_id
   AND f.feature_id = h.feature_id
  JOIN landwatch.lw_dataset d ON d.dataset_id = f.dataset_id
  JOIN landwatch.lw_category c ON c.category_id = d.category_id
  JOIN landwatch.lw_dataset_version v ON v.version_id = h.version_id
  WHERE c.code NOT IN ('SICAR', 'DETER')
    AND g.geom && s.sicar_geom
    AND ST_Intersects(s.sicar_geom, g.geom)
  ORDER BY dataset_code, feature_id;
$$;

CREATE OR REPLACE FUNCTION landwatch.fn_intersections_current_area(p_cod_imovel text)
RETURNS TABLE (
  category_code text,
  dataset_code text,
  snapshot_date date,
  feature_id bigint,
  geom_id bigint,
  geom geometry,
  sicar_area_m2 numeric,
  feature_area_m2 numeric,
  overlap_area_m2 numeric,
  overlap_pct_of_sicar numeric
)
LANGUAGE sql
STABLE
AS $$
  WITH sicar_feature AS (
    SELECT
      f.dataset_id,
      f.feature_id,
      h.geom_id AS sicar_geom_id,
      g.geom AS sicar_geom
    FROM landwatch.lw_feature f
    JOIN landwatch.lw_dataset d ON d.dataset_id = f.dataset_id
    JOIN landwatch.lw_category c ON c.category_id = d.category_id
    JOIN landwatch.lw_feature_geom_hist h
      ON h.dataset_id = f.dataset_id
     AND h.feature_id = f.feature_id
     AND h.valid_to IS NULL
    JOIN landwatch.lw_geom_store g ON g.geom_id = h.geom_id
    WHERE c.code = 'SICAR'
      AND f.feature_key = p_cod_imovel
  )
  SELECT
    'SICAR' AS category_code,
    d.code AS dataset_code,
    NULL::date AS snapshot_date,
    f.feature_id,
    s.sicar_geom_id AS geom_id,
    s.sicar_geom AS geom,
    ST_Area(s.sicar_geom::geography) AS sicar_area_m2,
    NULL::numeric AS feature_area_m2,
    NULL::numeric AS overlap_area_m2,
    NULL::numeric AS overlap_pct_of_sicar
  FROM sicar_feature s
  JOIN landwatch.lw_feature f
    ON f.dataset_id = s.dataset_id
   AND f.feature_id = s.feature_id
  JOIN landwatch.lw_dataset d ON d.dataset_id = f.dataset_id

  UNION ALL

  SELECT
    c.code AS category_code,
    d.code AS dataset_code,
    v.snapshot_date AS snapshot_date,
    f.feature_id,
    h.geom_id AS geom_id,
    g.geom AS geom,
    ST_Area(s.sicar_geom::geography) AS sicar_area_m2,
    ST_Area(g.geom::geography) AS feature_area_m2,
    ST_Area(ST_Intersection(s.sicar_geom, g.geom)::geography) AS overlap_area_m2,
    CASE
      WHEN ST_Area(s.sicar_geom::geography) = 0 THEN 0
      ELSE ST_Area(ST_Intersection(s.sicar_geom, g.geom)::geography)
           / ST_Area(s.sicar_geom::geography) * 100
    END AS overlap_pct_of_sicar
  FROM sicar_feature s
  JOIN landwatch.lw_feature_geom_hist h
    ON h.valid_to IS NULL
  JOIN landwatch.lw_geom_store g ON g.geom_id = h.geom_id
  JOIN landwatch.lw_feature f
    ON f.dataset_id = h.dataset_id
   AND f.feature_id = h.feature_id
  JOIN landwatch.lw_dataset d ON d.dataset_id = f.dataset_id
  JOIN landwatch.lw_category c ON c.category_id = d.category_id
  JOIN landwatch.lw_dataset_version v ON v.version_id = h.version_id
  WHERE c.code NOT IN ('SICAR', 'DETER')
    AND g.geom && s.sicar_geom
    AND ST_Intersects(s.sicar_geom, g.geom)
  ORDER BY dataset_code, feature_id;
$$;

CREATE OR REPLACE FUNCTION landwatch.fn_intersections_asof_area(p_cod_imovel text, p_as_of_date date)
RETURNS TABLE (
  category_code text,
  dataset_code text,
  snapshot_date date,
  feature_id bigint,
  geom_id bigint,
  geom geometry,
  sicar_area_m2 numeric,
  feature_area_m2 numeric,
  overlap_area_m2 numeric,
  overlap_pct_of_sicar numeric
)
LANGUAGE sql
STABLE
AS $$
  WITH sicar_feature AS (
    SELECT
      f.dataset_id,
      f.feature_id,
      h.geom_id AS sicar_geom_id,
      g.geom AS sicar_geom
    FROM landwatch.lw_feature f
    JOIN landwatch.lw_dataset d ON d.dataset_id = f.dataset_id
    JOIN landwatch.lw_category c ON c.category_id = d.category_id
    JOIN landwatch.lw_feature_geom_hist h
      ON h.dataset_id = f.dataset_id
     AND h.feature_id = f.feature_id
     AND h.valid_from <= p_as_of_date
     AND (h.valid_to IS NULL OR h.valid_to > p_as_of_date)
    JOIN landwatch.lw_geom_store g ON g.geom_id = h.geom_id
    WHERE c.code = 'SICAR'
      AND f.feature_key = p_cod_imovel
  )
  SELECT
    'SICAR' AS category_code,
    d.code AS dataset_code,
    NULL::date AS snapshot_date,
    f.feature_id,
    s.sicar_geom_id AS geom_id,
    s.sicar_geom AS geom,
    ST_Area(s.sicar_geom::geography) AS sicar_area_m2,
    NULL::numeric AS feature_area_m2,
    NULL::numeric AS overlap_area_m2,
    NULL::numeric AS overlap_pct_of_sicar
  FROM sicar_feature s
  JOIN landwatch.lw_feature f
    ON f.dataset_id = s.dataset_id
   AND f.feature_id = s.feature_id
  JOIN landwatch.lw_dataset d ON d.dataset_id = f.dataset_id

  UNION ALL

  SELECT
    c.code AS category_code,
    d.code AS dataset_code,
    v.snapshot_date AS snapshot_date,
    f.feature_id,
    h.geom_id AS geom_id,
    g.geom AS geom,
    ST_Area(s.sicar_geom::geography) AS sicar_area_m2,
    ST_Area(g.geom::geography) AS feature_area_m2,
    ST_Area(ST_Intersection(s.sicar_geom, g.geom)::geography) AS overlap_area_m2,
    CASE
      WHEN ST_Area(s.sicar_geom::geography) = 0 THEN 0
      ELSE ST_Area(ST_Intersection(s.sicar_geom, g.geom)::geography)
           / ST_Area(s.sicar_geom::geography) * 100
    END AS overlap_pct_of_sicar
  FROM sicar_feature s
  JOIN landwatch.lw_feature_geom_hist h
    ON h.valid_from <= p_as_of_date
   AND (h.valid_to IS NULL OR h.valid_to > p_as_of_date)
  JOIN landwatch.lw_geom_store g ON g.geom_id = h.geom_id
  JOIN landwatch.lw_feature f
    ON f.dataset_id = h.dataset_id
   AND f.feature_id = h.feature_id
  JOIN landwatch.lw_dataset d ON d.dataset_id = f.dataset_id
  JOIN landwatch.lw_category c ON c.category_id = d.category_id
  JOIN landwatch.lw_dataset_version v ON v.version_id = h.version_id
  WHERE c.code NOT IN ('SICAR', 'DETER')
    AND g.geom && s.sicar_geom
    AND ST_Intersects(s.sicar_geom, g.geom)
  ORDER BY dataset_code, feature_id;
$$;

CREATE OR REPLACE FUNCTION landwatch.fn_doc_current(p_doc text)
RETURNS TABLE (
  dataset_code text,
  feature_id bigint,
  doc_normalized text
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    d.code AS dataset_code,
    di.feature_id,
    di.doc_normalized
  FROM landwatch.lw_doc_index di
  JOIN landwatch.lw_dataset d ON d.dataset_id = di.dataset_id
  WHERE di.doc_normalized = p_doc
    AND di.valid_to IS NULL
    AND di.date_closed IS NULL
  ORDER BY d.code;
$$;

CREATE OR REPLACE FUNCTION landwatch.fn_doc_asof(p_doc text, p_as_of_date date)
RETURNS TABLE (
  dataset_code text,
  feature_id bigint,
  doc_normalized text
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    d.code AS dataset_code,
    di.feature_id,
    di.doc_normalized
  FROM landwatch.lw_doc_index di
  JOIN landwatch.lw_dataset d ON d.dataset_id = di.dataset_id
  WHERE di.doc_normalized = p_doc
    AND di.valid_from <= p_as_of_date
    AND (di.valid_to IS NULL OR di.valid_to > p_as_of_date)
    AND (di.date_closed IS NULL OR di.date_closed > p_as_of_date)
  ORDER BY d.code;
$$;
