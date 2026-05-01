SET search_path TO landwatch, app, public, pg_catalog;

-- Funcoes de analise (LandWatch)

DROP FUNCTION IF EXISTS landwatch.fn_intersections_current_simple(text);
DROP FUNCTION IF EXISTS landwatch.fn_intersections_asof_simple(text, date);
DROP FUNCTION IF EXISTS landwatch.fn_intersections_current_area(text);
DROP FUNCTION IF EXISTS landwatch.fn_intersections_asof_area(text, date);
DROP FUNCTION IF EXISTS landwatch.fn_intersections_asof_area_legacy(text, date);

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

CREATE INDEX IF NOT EXISTS idx_lw_feature_geom_hist_geom_id_asof
  ON landwatch.lw_feature_geom_hist(geom_id, valid_from, valid_to);

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS landwatch.lw_dataset_pmtiles_asset (
  asset_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dataset_id BIGINT NOT NULL REFERENCES landwatch.lw_dataset(dataset_id),
  version_id BIGINT NOT NULL REFERENCES landwatch.lw_dataset_version(version_id),
  snapshot_date DATE NOT NULL,
  source_layer TEXT NOT NULL,
  blob_container TEXT NOT NULL,
  blob_path TEXT NOT NULL,
  blob_etag TEXT,
  blob_size_bytes BIGINT NOT NULL,
  feature_count BIGINT NOT NULL,
  minzoom INTEGER NOT NULL,
  maxzoom INTEGER NOT NULL,
  bounds_west DOUBLE PRECISION NOT NULL,
  bounds_south DOUBLE PRECISION NOT NULL,
  bounds_east DOUBLE PRECISION NOT NULL,
  bounds_north DOUBLE PRECISION NOT NULL,
  center_lng DOUBLE PRECISION,
  center_lat DOUBLE PRECISION,
  center_zoom INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lw_dataset_pmtiles_asset_blob_path
  ON landwatch.lw_dataset_pmtiles_asset(blob_path);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lw_dataset_pmtiles_asset_active_dataset
  ON landwatch.lw_dataset_pmtiles_asset(dataset_id)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_lw_dataset_pmtiles_asset_version
  ON landwatch.lw_dataset_pmtiles_asset(version_id);

CREATE OR REPLACE FUNCTION landwatch.safe_transform_to_3857(g geometry)
RETURNS geometry
LANGUAGE plpgsql
AS $$
DECLARE
  s integer;
BEGIN
  IF g IS NULL THEN
    RETURN NULL;
  END IF;

  s := public.ST_SRID(g);
  IF s = 0 THEN
    g := public.ST_SetSRID(g, 4674);
    s := 4674;
  END IF;

  IF s IN (4674, 4326) THEN
    IF public.ST_XMin(g) < -180
       OR public.ST_XMax(g) > 180
       OR public.ST_YMin(g) < -90
       OR public.ST_YMax(g) > 90 THEN
      RETURN NULL;
    END IF;
  END IF;

  BEGIN
    RETURN public.ST_Force2D(
      CASE
        WHEN s = 3857 THEN g
        ELSE public.ST_Transform(g, 3857)
      END
    );
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION landwatch.safe_transform_to_4326(g geometry)
RETURNS geometry
LANGUAGE plpgsql
AS $$
DECLARE
  s integer;
BEGIN
  IF g IS NULL THEN
    RETURN NULL;
  END IF;

  s := public.ST_SRID(g);
  IF s = 0 THEN
    g := public.ST_SetSRID(g, 4674);
    s := 4674;
  END IF;

  IF s IN (4674, 4326) THEN
    IF public.ST_XMin(g) < -180
       OR public.ST_XMax(g) > 180
       OR public.ST_YMin(g) < -90
       OR public.ST_YMax(g) > 90 THEN
      RETURN NULL;
    END IF;
  END IF;

  BEGIN
    RETURN public.ST_Force2D(
      CASE
        WHEN s = 4326 THEN g
        ELSE public.ST_Transform(g, 4326)
      END
    );
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
END;
$$;

CREATE MATERIALIZED VIEW IF NOT EXISTS landwatch.mv_feature_geom_tile_active AS
WITH normalized AS (
  SELECT
    a.dataset_id,
    a.feature_id,
    a.geom_id,
    a.version_id,
    landwatch.safe_transform_to_3857(a.geom) AS geom_3857_raw
  FROM landwatch.mv_feature_geom_active a
)
SELECT
  n.dataset_id,
  n.feature_id,
  n.geom_id,
  n.version_id,
  n.geom_3857_raw,
  ST_SimplifyPreserveTopology(n.geom_3857_raw, 600) AS geom_3857_s600,
  ST_SimplifyPreserveTopology(n.geom_3857_raw, 300) AS geom_3857_s300,
  ST_SimplifyPreserveTopology(n.geom_3857_raw, 140) AS geom_3857_s140,
  ST_SimplifyPreserveTopology(n.geom_3857_raw, 70) AS geom_3857_s70,
  ST_SimplifyPreserveTopology(n.geom_3857_raw, 35) AS geom_3857_s35
FROM normalized n
WHERE n.geom_3857_raw IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_feature_geom_tile_active_pk
  ON landwatch.mv_feature_geom_tile_active(dataset_id, feature_id);

CREATE INDEX IF NOT EXISTS idx_mv_feature_geom_tile_active_geom_id
  ON landwatch.mv_feature_geom_tile_active(geom_id);

CREATE INDEX IF NOT EXISTS idx_mv_feature_geom_tile_active_geom_raw
  ON landwatch.mv_feature_geom_tile_active USING GIST (dataset_id, geom_3857_raw);

CREATE INDEX IF NOT EXISTS idx_mv_feature_geom_tile_active_geom_s600
  ON landwatch.mv_feature_geom_tile_active USING GIST (dataset_id, geom_3857_s600);

CREATE INDEX IF NOT EXISTS idx_mv_feature_geom_tile_active_geom_s300
  ON landwatch.mv_feature_geom_tile_active USING GIST (dataset_id, geom_3857_s300);

CREATE INDEX IF NOT EXISTS idx_mv_feature_geom_tile_active_geom_s140
  ON landwatch.mv_feature_geom_tile_active USING GIST (dataset_id, geom_3857_s140);

CREATE INDEX IF NOT EXISTS idx_mv_feature_geom_tile_active_geom_s70
  ON landwatch.mv_feature_geom_tile_active USING GIST (dataset_id, geom_3857_s70);

CREATE INDEX IF NOT EXISTS idx_mv_feature_geom_tile_active_geom_s35
  ON landwatch.mv_feature_geom_tile_active USING GIST (dataset_id, geom_3857_s35);

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

-- MV leve com campos textuais para tooltip/identificacao
CREATE MATERIALIZED VIEW IF NOT EXISTS landwatch.mv_feature_tooltip_active AS
SELECT
  l.dataset_id,
  l.feature_id,
  NULLIF(
    COALESCE(
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
    ),
    ''
  ) AS display_name,
  NULLIF(
    COALESCE(
      p.pack_json->>'cnuc_code',
      p.pack_json->>'cd_cnuc',
      p.pack_json->>'Cnuc',
      p.pack_json->>'terrai_cod',
      p.pack_json->>'TERRAI_COD',
      p.pack_json->>'id',
      p.pack_json->>'ID',
      p.pack_json->>'objectid',
      p.pack_json->>'OBJECTID'
    ),
    ''
  ) AS natural_id
FROM landwatch.mv_feature_active_attrs_light l
LEFT JOIN landwatch.lw_feature_attr_pack_hist h_attr
  ON h_attr.dataset_id = l.dataset_id
 AND h_attr.feature_id = l.feature_id
 AND h_attr.valid_to IS NULL
LEFT JOIN landwatch.lw_attr_pack p
  ON p.pack_id = h_attr.pack_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_feature_tooltip_active_pk
  ON landwatch.mv_feature_tooltip_active(dataset_id, feature_id);

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

-- MV: categoria UCS (texto)
DROP MATERIALIZED VIEW IF EXISTS landwatch.mv_ucs_sigla_active;

CREATE MATERIALIZED VIEW landwatch.mv_ucs_sigla_active AS
SELECT
  d.dataset_id,
  d.code AS dataset_code,
  h.feature_id,
  NULLIF(
    COALESCE(
      p.pack_json->>'categoria_uc',
      p.pack_json->>'CATEGORIA_UC',
      p.pack_json->>'categoria',
      p.pack_json->>'Categoria',
      p.pack_json->>'CATEGORIA'
    ),
    ''
  ) AS categoria_uc
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
    p.pack_json->>'categoria_uc',
    p.pack_json->>'CATEGORIA_UC',
    p.pack_json->>'categoria',
    p.pack_json->>'Categoria',
    p.pack_json->>'CATEGORIA'
  ) IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mv_ucs_sigla_active_dataset
  ON landwatch.mv_ucs_sigla_active(dataset_code);

CREATE INDEX IF NOT EXISTS idx_mv_ucs_sigla_active_feature
  ON landwatch.mv_ucs_sigla_active(feature_id);

CREATE INDEX IF NOT EXISTS idx_mv_ucs_sigla_active_categoria
  ON landwatch.mv_ucs_sigla_active(categoria_uc);

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

CREATE OR REPLACE FUNCTION landwatch.fn_intersections_asof_area_legacy(p_cod_imovel text, p_as_of_date date)
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
  ),
  sicar_metrics AS (
    SELECT
      s.dataset_id,
      s.feature_id,
      s.sicar_geom_id,
      s.sicar_geom,
      ST_Area(s.sicar_geom::geography) AS sicar_area_m2
    FROM sicar_feature s
  )
  SELECT
    'SICAR' AS category_code,
    d.code AS dataset_code,
    NULL::date AS snapshot_date,
    f.feature_id,
    s.sicar_geom_id AS geom_id,
    s.sicar_geom AS geom,
    s.sicar_area_m2,
    NULL::numeric AS feature_area_m2,
    NULL::numeric AS overlap_area_m2,
    NULL::numeric AS overlap_pct_of_sicar
  FROM sicar_metrics s
  JOIN landwatch.lw_feature f
    ON f.dataset_id = s.dataset_id
   AND f.feature_id = s.feature_id
  JOIN landwatch.lw_dataset d ON d.dataset_id = f.dataset_id

  UNION ALL

  SELECT
    candidates.category_code,
    candidates.dataset_code,
    candidates.snapshot_date,
    candidates.feature_id,
    candidates.geom_id,
    candidates.geom,
    s.sicar_area_m2,
    ST_Area(candidates.geom::geography) AS feature_area_m2,
    ST_Area(overlap.overlap_geom::geography) AS overlap_area_m2,
    CASE
      WHEN s.sicar_area_m2 = 0 THEN 0
      ELSE ST_Area(overlap.overlap_geom::geography) / s.sicar_area_m2 * 100
    END AS overlap_pct_of_sicar
  FROM sicar_metrics s
  CROSS JOIN LATERAL (
    SELECT
      c.code AS category_code,
      d.code AS dataset_code,
      v.snapshot_date AS snapshot_date,
      f.feature_id,
      h.geom_id,
      g.geom
    FROM landwatch.lw_geom_store g
    JOIN landwatch.lw_feature_geom_hist h
      ON h.geom_id = g.geom_id
     AND h.valid_from <= p_as_of_date
     AND (h.valid_to IS NULL OR h.valid_to > p_as_of_date)
    JOIN landwatch.lw_feature f
      ON f.dataset_id = h.dataset_id
     AND f.feature_id = h.feature_id
    JOIN landwatch.lw_dataset d ON d.dataset_id = f.dataset_id
    JOIN landwatch.lw_category c ON c.category_id = d.category_id
    JOIN landwatch.lw_dataset_version v ON v.version_id = h.version_id
    WHERE c.code NOT IN ('SICAR', 'DETER')
      AND g.geom && s.sicar_geom
      AND ST_Intersects(s.sicar_geom, g.geom)
  ) candidates
  CROSS JOIN LATERAL (
    SELECT ST_Intersection(s.sicar_geom, candidates.geom) AS overlap_geom
  ) overlap
  WHERE NOT ST_IsEmpty(overlap.overlap_geom)
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
