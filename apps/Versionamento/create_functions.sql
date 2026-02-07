-- Funcoes de analise (LandWatch)

DROP FUNCTION IF EXISTS landwatch.fn_intersections_current_simple(text);
DROP FUNCTION IF EXISTS landwatch.fn_intersections_asof_simple(text, date);
DROP FUNCTION IF EXISTS landwatch.fn_intersections_current_area(text);
DROP FUNCTION IF EXISTS landwatch.fn_intersections_asof_area(text, date);

-- MV de feicoes ativas (necessaria para funcoes "current")
CREATE MATERIALIZED VIEW IF NOT EXISTS landwatch.mv_feature_geom_active AS
SELECT
  h.dataset_id,
  h.feature_id,
  h.geom_id,
  h.version_id,
  g.geom
FROM landwatch.lw_feature_geom_hist h
JOIN landwatch.lw_geom_store g ON g.geom_id = h.geom_id
WHERE h.valid_to IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_feature_geom_active_pk
  ON landwatch.mv_feature_geom_active(dataset_id, feature_id);

CREATE INDEX IF NOT EXISTS idx_mv_feature_geom_active_geom
  ON landwatch.mv_feature_geom_active USING GIST (geom);

CREATE INDEX IF NOT EXISTS idx_mv_feature_geom_active_geom_id
  ON landwatch.mv_feature_geom_active(geom_id);

-- MV leve com chaves/ids ativos
CREATE MATERIALIZED VIEW IF NOT EXISTS landwatch.mv_feature_active_attrs_light AS
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
 AND a.feature_id = f.feature_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_feature_active_attrs_light_pk
  ON landwatch.mv_feature_active_attrs_light(dataset_id, feature_id);

CREATE INDEX IF NOT EXISTS idx_mv_feature_active_attrs_light_dataset
  ON landwatch.mv_feature_active_attrs_light(dataset_code);

CREATE INDEX IF NOT EXISTS idx_mv_feature_active_attrs_light_geom_id
  ON landwatch.mv_feature_active_attrs_light(geom_id);

CREATE INDEX IF NOT EXISTS idx_mv_feature_active_attrs_light_feature_key
  ON landwatch.mv_feature_active_attrs_light(feature_key);

-- MV: meta do SICAR (pack ativo)
CREATE MATERIALIZED VIEW IF NOT EXISTS landwatch.mv_sicar_meta_active AS
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
  AND (c.code = 'SICAR' OR d.code = 'SICAR');

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_sicar_meta_active_pk
  ON landwatch.mv_sicar_meta_active(dataset_id, feature_id);

-- MV: fase TI (terras indigenas)
CREATE MATERIALIZED VIEW IF NOT EXISTS landwatch.mv_indigena_phase_active AS
SELECT
  d.dataset_id,
  d.code AS dataset_code,
  h.feature_id,
  NULLIF(
    COALESCE(
      p.pack_json->>'fase_ti',
      p.pack_json->>'FASE_TI',
      p.pack_json->>'faseTi',
      p.pack_json->>'FASETI',
      p.pack_json->>'fase_it',
      p.pack_json->>'FASE_IT',
      p.pack_json->>'faseIt',
      p.pack_json->>'FASEIT'
    ),
    ''
  ) AS fase_ti
FROM landwatch.lw_feature_attr_pack_hist h
JOIN landwatch.lw_attr_pack p ON p.pack_id = h.pack_id
JOIN landwatch.lw_dataset d ON d.dataset_id = h.dataset_id
JOIN landwatch.lw_category c ON c.category_id = d.category_id
WHERE h.valid_to IS NULL
  AND (
    c.code IN ('INDIGENAS', 'TI')
    OR UPPER(d.code) LIKE 'TI_%'
    OR UPPER(d.code) LIKE 'TI-%'
    OR UPPER(d.code) LIKE '%INDIG%'
  )
  AND COALESCE(
    p.pack_json->>'fase_ti',
    p.pack_json->>'FASE_TI',
    p.pack_json->>'faseTi',
    p.pack_json->>'FASETI',
    p.pack_json->>'fase_it',
    p.pack_json->>'FASE_IT',
    p.pack_json->>'faseIt',
    p.pack_json->>'FASEIT'
  ) IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mv_indigena_phase_active_dataset
  ON landwatch.mv_indigena_phase_active(dataset_code);

CREATE INDEX IF NOT EXISTS idx_mv_indigena_phase_active_feature
  ON landwatch.mv_indigena_phase_active(feature_id);

CREATE INDEX IF NOT EXISTS idx_mv_indigena_phase_active_phase
  ON landwatch.mv_indigena_phase_active(fase_ti);

-- MV: sigla categoria UCS
CREATE MATERIALIZED VIEW IF NOT EXISTS landwatch.mv_ucs_sigla_active AS
SELECT
  d.dataset_id,
  d.code AS dataset_code,
  h.feature_id,
  NULLIF(
    COALESCE(
      p.pack_json->>'SiglaCateg',
      p.pack_json->>'SIGLACATEG',
      p.pack_json->>'siglacateg',
      p.pack_json->>'sigla_categ'
    ),
    ''
  ) AS sigla_categ
FROM landwatch.lw_feature_attr_pack_hist h
JOIN landwatch.lw_attr_pack p ON p.pack_id = h.pack_id
JOIN landwatch.lw_dataset d ON d.dataset_id = h.dataset_id
JOIN landwatch.lw_category c ON c.category_id = d.category_id
WHERE h.valid_to IS NULL
  AND (
    c.code IN ('UCS_SNIRH', 'UCS')
    OR UPPER(d.code) LIKE '%UCS%'
    OR UPPER(d.code) LIKE '%CONSERV%'
  )
  AND COALESCE(
    p.pack_json->>'SiglaCateg',
    p.pack_json->>'SIGLACATEG',
    p.pack_json->>'siglacateg',
    p.pack_json->>'sigla_categ'
  ) IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mv_ucs_sigla_active_dataset
  ON landwatch.mv_ucs_sigla_active(dataset_code);

CREATE INDEX IF NOT EXISTS idx_mv_ucs_sigla_active_feature
  ON landwatch.mv_ucs_sigla_active(feature_id);

CREATE INDEX IF NOT EXISTS idx_mv_ucs_sigla_active_sigla
  ON landwatch.mv_ucs_sigla_active(sigla_categ);

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
    a.geom
  FROM landwatch.lw_feature f
  JOIN landwatch.lw_dataset d ON d.dataset_id = f.dataset_id
  JOIN landwatch.lw_category c ON c.category_id = d.category_id
  JOIN landwatch.mv_feature_geom_active a
    ON a.dataset_id = f.dataset_id
   AND a.feature_id = f.feature_id
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
      a.geom_id AS sicar_geom_id,
      a.geom AS sicar_geom
    FROM landwatch.lw_feature f
    JOIN landwatch.lw_dataset d ON d.dataset_id = f.dataset_id
    JOIN landwatch.lw_category c ON c.category_id = d.category_id
    JOIN landwatch.mv_feature_geom_active a
      ON a.dataset_id = f.dataset_id
     AND a.feature_id = f.feature_id
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
    a.geom_id AS geom_id,
    a.geom AS geom
  FROM sicar_feature s
  JOIN landwatch.mv_feature_geom_active a ON TRUE
  JOIN landwatch.lw_feature f
    ON f.dataset_id = a.dataset_id
   AND f.feature_id = a.feature_id
  JOIN landwatch.lw_dataset d ON d.dataset_id = f.dataset_id
  JOIN landwatch.lw_category c ON c.category_id = d.category_id
  JOIN landwatch.lw_dataset_version v ON v.version_id = a.version_id
  WHERE c.code NOT IN ('SICAR', 'DETER')
    AND a.geom && s.sicar_geom
    AND ST_Intersects(s.sicar_geom, a.geom)
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
      a.geom_id AS sicar_geom_id,
      a.geom AS sicar_geom
    FROM landwatch.lw_feature f
    JOIN landwatch.lw_dataset d ON d.dataset_id = f.dataset_id
    JOIN landwatch.lw_category c ON c.category_id = d.category_id
    JOIN landwatch.mv_feature_geom_active a
      ON a.dataset_id = f.dataset_id
     AND a.feature_id = f.feature_id
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
    a.geom_id AS geom_id,
    a.geom AS geom,
    ST_Area(s.sicar_geom::geography) AS sicar_area_m2,
    ST_Area(a.geom::geography) AS feature_area_m2,
    ST_Area(ST_Intersection(s.sicar_geom, a.geom)::geography) AS overlap_area_m2,
    CASE
      WHEN ST_Area(s.sicar_geom::geography) = 0 THEN 0
      ELSE ST_Area(ST_Intersection(s.sicar_geom, a.geom)::geography)
           / ST_Area(s.sicar_geom::geography) * 100
    END AS overlap_pct_of_sicar
  FROM sicar_feature s
  JOIN landwatch.mv_feature_geom_active a ON TRUE
  JOIN landwatch.lw_feature f
    ON f.dataset_id = a.dataset_id
   AND f.feature_id = a.feature_id
  JOIN landwatch.lw_dataset d ON d.dataset_id = f.dataset_id
  JOIN landwatch.lw_category c ON c.category_id = d.category_id
  JOIN landwatch.lw_dataset_version v ON v.version_id = a.version_id
  WHERE c.code NOT IN ('SICAR', 'DETER')
    AND a.geom && s.sicar_geom
    AND ST_Intersects(s.sicar_geom, a.geom)
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
