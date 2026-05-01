DROP SCHEMA landwatch CASCADE;

-- LandWatch v2 - schema otimizado para armazenamento mínimo
-- Data: 2026-01-29
-- Observação: requer PostGIS habilitado.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================================================
-- Schema
-- =========================================================
CREATE SCHEMA IF NOT EXISTS landwatch;

-- =========================================================
-- 1) Metadados
-- =========================================================
CREATE TABLE IF NOT EXISTS landwatch.lw_category (
    category_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    description TEXT,
    default_srid INTEGER NOT NULL DEFAULT 4674,
    natural_id_col TEXT
);

CREATE TABLE IF NOT EXISTS landwatch.lw_dataset (
    dataset_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    category_id BIGINT NOT NULL REFERENCES landwatch.lw_category(category_id),
    code TEXT NOT NULL UNIQUE,
    description TEXT,
    is_spatial BOOLEAN NOT NULL DEFAULT TRUE,
    default_srid INTEGER NOT NULL DEFAULT 4674,
    natural_id_col TEXT,
    csv_delimiter TEXT,
    csv_encoding TEXT,
    csv_doc_col TEXT,
    csv_date_closed_col TEXT,
    csv_geom_col TEXT,
    attr_store_mode TEXT NOT NULL DEFAULT 'PACK_JSONB',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (attr_store_mode IN ('PACK_JSONB'))
);

CREATE TABLE IF NOT EXISTS landwatch.lw_dataset_version (
    version_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dataset_id BIGINT NOT NULL REFERENCES landwatch.lw_dataset(dataset_id),
    version_label TEXT NOT NULL,
    snapshot_date DATE NOT NULL,
    status TEXT NOT NULL,
    source_path TEXT,
    source_fingerprint TEXT,
    loaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    error_message TEXT,
    CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED_NO_CHANGES'))
);

CREATE INDEX IF NOT EXISTS idx_lw_dataset_version_dataset
    ON landwatch.lw_dataset_version(dataset_id, snapshot_date);

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

-- =========================================================
-- 2) Feature keys e estado
-- =========================================================
CREATE TABLE IF NOT EXISTS landwatch.lw_feature (
    feature_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dataset_id BIGINT NOT NULL REFERENCES landwatch.lw_dataset(dataset_id),
    feature_key TEXT NOT NULL,
    UNIQUE (dataset_id, feature_key)
);

CREATE TABLE IF NOT EXISTS landwatch.lw_feature_state (
    dataset_id BIGINT NOT NULL REFERENCES landwatch.lw_dataset(dataset_id),
    feature_id BIGINT NOT NULL REFERENCES landwatch.lw_feature(feature_id),
    is_present BOOLEAN NOT NULL,
    geom_hash TEXT,
    attr_hash TEXT,
    snapshot_date DATE NOT NULL,
    current_version_id BIGINT NOT NULL REFERENCES landwatch.lw_dataset_version(version_id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (dataset_id, feature_id)
);

-- =========================================================
-- 3) Geometria deduplicada
-- =========================================================
CREATE TABLE IF NOT EXISTS landwatch.lw_geom_store (
    geom_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    geom_hash TEXT NOT NULL UNIQUE,
    geom geometry NOT NULL,
    srid INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lw_geom_store_geom
    ON landwatch.lw_geom_store USING GIST (geom);

CREATE TABLE IF NOT EXISTS landwatch.lw_feature_geom_hist (
    dataset_id BIGINT NOT NULL REFERENCES landwatch.lw_dataset(dataset_id),
    feature_id BIGINT NOT NULL REFERENCES landwatch.lw_feature(feature_id),
    geom_id BIGINT NOT NULL REFERENCES landwatch.lw_geom_store(geom_id),
    version_id BIGINT NOT NULL REFERENCES landwatch.lw_dataset_version(version_id),
    valid_from DATE NOT NULL,
    valid_to DATE,
    PRIMARY KEY (dataset_id, feature_id, version_id)
);

CREATE INDEX IF NOT EXISTS idx_lw_feature_geom_hist_active
    ON landwatch.lw_feature_geom_hist(dataset_id, feature_id)
    WHERE valid_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_lw_feature_geom_hist_geom_id_asof
    ON landwatch.lw_feature_geom_hist(geom_id, valid_from, valid_to);

-- =========================================================
-- 3.1) MV de feicoes ativas (acelera consultas correntes)
-- =========================================================
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

CREATE EXTENSION IF NOT EXISTS btree_gist;

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
                WHEN s = 4674 THEN public.ST_Transform(g, 4326)
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
FROM normalized n;

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

-- =========================================================
-- 4) Atributos (JSONB dedupe)
-- =========================================================
CREATE TABLE IF NOT EXISTS landwatch.lw_attr_pack (
    pack_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pack_hash TEXT NOT NULL UNIQUE,
    pack_json JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS landwatch.lw_feature_attr_pack_hist (
    dataset_id BIGINT NOT NULL REFERENCES landwatch.lw_dataset(dataset_id),
    feature_id BIGINT NOT NULL REFERENCES landwatch.lw_feature(feature_id),
    pack_id BIGINT NOT NULL REFERENCES landwatch.lw_attr_pack(pack_id),
    version_id BIGINT NOT NULL REFERENCES landwatch.lw_dataset_version(version_id),
    valid_from DATE NOT NULL,
    valid_to DATE,
    PRIMARY KEY (dataset_id, feature_id, version_id)
);

CREATE INDEX IF NOT EXISTS idx_lw_feature_attr_pack_hist_active
    ON landwatch.lw_feature_attr_pack_hist(dataset_id, feature_id)
    WHERE valid_to IS NULL;

-- =========================================================
-- 5) Índice específico de CPF/CNPJ (consulta principal CSV)
-- =========================================================
CREATE TABLE IF NOT EXISTS landwatch.lw_doc_index (
    dataset_id BIGINT NOT NULL REFERENCES landwatch.lw_dataset(dataset_id),
    feature_id BIGINT NOT NULL REFERENCES landwatch.lw_feature(feature_id),
    doc_normalized TEXT NOT NULL,
    date_closed DATE,
    version_id BIGINT NOT NULL REFERENCES landwatch.lw_dataset_version(version_id),
    valid_from DATE NOT NULL,
    valid_to DATE,
    PRIMARY KEY (dataset_id, feature_id, version_id)
);

CREATE INDEX IF NOT EXISTS idx_lw_doc_index_active
    ON landwatch.lw_doc_index(dataset_id, doc_normalized)
    WHERE date_closed IS NULL AND valid_to IS NULL;
