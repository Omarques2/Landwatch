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
    attr_compare_hash TEXT,
    tooltip_hash TEXT,
    snapshot_date DATE NOT NULL,
    current_version_id BIGINT NOT NULL REFERENCES landwatch.lw_dataset_version(version_id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (dataset_id, feature_id)
);

CREATE TABLE IF NOT EXISTS landwatch.lw_feature_delta (
    dataset_id BIGINT NOT NULL REFERENCES landwatch.lw_dataset(dataset_id),
    version_id BIGINT NOT NULL REFERENCES landwatch.lw_dataset_version(version_id),
    feature_id BIGINT NOT NULL REFERENCES landwatch.lw_feature(feature_id),
    action TEXT NOT NULL CHECK (action IN ('NEW', 'CHANGED', 'DISAPPEARED')),
    geom_changed BOOLEAN NOT NULL DEFAULT FALSE,
    attr_changed BOOLEAN NOT NULL DEFAULT FALSE,
    tooltip_changed BOOLEAN NOT NULL DEFAULT FALSE,
    became_present BOOLEAN NOT NULL DEFAULT FALSE,
    became_absent BOOLEAN NOT NULL DEFAULT FALSE,
    snapshot_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (version_id, feature_id)
);

CREATE INDEX IF NOT EXISTS idx_lw_feature_delta_dataset_version
    ON landwatch.lw_feature_delta(dataset_id, version_id);

CREATE INDEX IF NOT EXISTS idx_lw_feature_delta_dataset_feature
    ON landwatch.lw_feature_delta(dataset_id, feature_id);

CREATE INDEX IF NOT EXISTS idx_lw_feature_delta_version_action
    ON landwatch.lw_feature_delta(version_id, action);

CREATE TABLE IF NOT EXISTS landwatch.lw_feature_delta_run (
    dataset_id BIGINT NOT NULL REFERENCES landwatch.lw_dataset(dataset_id),
    version_id BIGINT PRIMARY KEY REFERENCES landwatch.lw_dataset_version(version_id),
    snapshot_date DATE NOT NULL,
    delta_count BIGINT NOT NULL DEFAULT 0,
    geom_delta_count BIGINT NOT NULL DEFAULT 0,
    attr_delta_count BIGINT NOT NULL DEFAULT 0,
    tooltip_delta_count BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lw_feature_delta_run_dataset_version
    ON landwatch.lw_feature_delta_run(dataset_id, version_id);

-- Funções de delta fino dos caches ficam em sql/feature_cache_delta_apply.sql.
-- Elas são separadas porque também servem como migration idempotente em bancos existentes.

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
CREATE TABLE IF NOT EXISTS landwatch.mv_feature_geom_active (
    dataset_id BIGINT NOT NULL,
    feature_id BIGINT NOT NULL,
    geom_id BIGINT NOT NULL,
    version_id BIGINT NOT NULL,
    geom geometry
);

CREATE OR REPLACE FUNCTION landwatch.refresh_feature_geom_active_cache(
    p_dataset_codes text[] DEFAULT NULL
)
RETURNS TABLE(deleted_count bigint, inserted_count bigint)
LANGUAGE plpgsql
AS $$
DECLARE
    v_dataset_codes text[];
    v_dataset_ids bigint[];
    v_full_rebuild boolean;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('landwatch.mv_feature_geom_active'));

    SELECT array_agg(code ORDER BY code)
    INTO v_dataset_codes
    FROM (
        SELECT DISTINCT NULLIF(btrim(code), '') AS code
        FROM unnest(p_dataset_codes) AS raw(code)
    ) cleaned
    WHERE code IS NOT NULL;

    v_full_rebuild := COALESCE(array_length(v_dataset_codes, 1), 0) = 0;

    IF NOT v_full_rebuild THEN
        SELECT array_agg(d.dataset_id ORDER BY d.dataset_id)
        INTO v_dataset_ids
        FROM landwatch.lw_dataset d
        WHERE d.code = ANY(v_dataset_codes);

        IF COALESCE(array_length(v_dataset_ids, 1), 0) = 0 THEN
            deleted_count := 0;
            inserted_count := 0;
            RETURN NEXT;
            RETURN;
        END IF;

        DELETE FROM landwatch.mv_feature_geom_active
        WHERE dataset_id = ANY(v_dataset_ids);
    ELSE
        DELETE FROM landwatch.mv_feature_geom_active;
    END IF;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    INSERT INTO landwatch.mv_feature_geom_active (
        dataset_id,
        feature_id,
        geom_id,
        version_id,
        geom
    )
    SELECT
        h.dataset_id,
        h.feature_id,
        h.geom_id,
        h.version_id,
        g.geom
    FROM landwatch.lw_feature_geom_hist h
    JOIN landwatch.lw_geom_store g ON g.geom_id = h.geom_id
    WHERE h.valid_to IS NULL
      AND (v_full_rebuild OR h.dataset_id = ANY(v_dataset_ids));
    GET DIAGNOSTICS inserted_count = ROW_COUNT;

    ANALYZE landwatch.mv_feature_geom_active;
    RETURN NEXT;
END;
$$;

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

CREATE TABLE IF NOT EXISTS landwatch.mv_feature_geom_tile_active (
    dataset_id BIGINT NOT NULL,
    feature_id BIGINT NOT NULL,
    geom_id BIGINT NOT NULL,
    version_id BIGINT NOT NULL,
    geom_3857_raw geometry,
    geom_3857_s600 geometry,
    geom_3857_s300 geometry,
    geom_3857_s140 geometry,
    geom_3857_s70 geometry,
    geom_3857_s35 geometry
);

CREATE OR REPLACE FUNCTION landwatch.refresh_feature_geom_tile_cache(
    p_dataset_codes text[] DEFAULT NULL
)
RETURNS TABLE(deleted_count bigint, inserted_count bigint)
LANGUAGE plpgsql
AS $$
DECLARE
    v_dataset_codes text[];
    v_dataset_ids bigint[];
    v_full_rebuild boolean;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('landwatch.mv_feature_geom_tile_active'));

    SELECT array_agg(code ORDER BY code)
    INTO v_dataset_codes
    FROM (
        SELECT DISTINCT NULLIF(btrim(code), '') AS code
        FROM unnest(p_dataset_codes) AS raw(code)
    ) cleaned
    WHERE code IS NOT NULL;

    v_full_rebuild := COALESCE(array_length(v_dataset_codes, 1), 0) = 0;

    IF NOT v_full_rebuild THEN
        SELECT array_agg(d.dataset_id ORDER BY d.dataset_id)
        INTO v_dataset_ids
        FROM landwatch.lw_dataset d
        WHERE d.code = ANY(v_dataset_codes);

        IF COALESCE(array_length(v_dataset_ids, 1), 0) = 0 THEN
            deleted_count := 0;
            inserted_count := 0;
            RETURN NEXT;
            RETURN;
        END IF;

        DELETE FROM landwatch.mv_feature_geom_tile_active
        WHERE dataset_id = ANY(v_dataset_ids);
    ELSE
        DELETE FROM landwatch.mv_feature_geom_tile_active;
    END IF;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    WITH normalized AS (
        SELECT
            a.dataset_id,
            a.feature_id,
            a.geom_id,
            a.version_id,
            landwatch.safe_transform_to_3857(a.geom) AS geom_3857_raw
        FROM landwatch.mv_feature_geom_active a
        WHERE v_full_rebuild OR a.dataset_id = ANY(v_dataset_ids)
    )
    INSERT INTO landwatch.mv_feature_geom_tile_active (
        dataset_id,
        feature_id,
        geom_id,
        version_id,
        geom_3857_raw,
        geom_3857_s600,
        geom_3857_s300,
        geom_3857_s140,
        geom_3857_s70,
        geom_3857_s35
    )
    SELECT
        n.dataset_id,
        n.feature_id,
        n.geom_id,
        n.version_id,
        n.geom_3857_raw,
        public.ST_SimplifyPreserveTopology(n.geom_3857_raw, 600),
        public.ST_SimplifyPreserveTopology(n.geom_3857_raw, 300),
        public.ST_SimplifyPreserveTopology(n.geom_3857_raw, 140),
        public.ST_SimplifyPreserveTopology(n.geom_3857_raw, 70),
        public.ST_SimplifyPreserveTopology(n.geom_3857_raw, 35)
    FROM normalized n
    WHERE n.geom_3857_raw IS NOT NULL;
    GET DIAGNOSTICS inserted_count = ROW_COUNT;

    ANALYZE landwatch.mv_feature_geom_tile_active;
    RETURN NEXT;
END;
$$;

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

CREATE TABLE IF NOT EXISTS landwatch.mv_feature_active_attrs_light (
    dataset_id BIGINT NOT NULL,
    dataset_code TEXT,
    feature_id BIGINT NOT NULL,
    feature_key TEXT,
    geom_id BIGINT
);

CREATE OR REPLACE FUNCTION landwatch.refresh_feature_active_attrs_light_cache(
    p_dataset_codes text[] DEFAULT NULL
)
RETURNS TABLE(deleted_count bigint, inserted_count bigint)
LANGUAGE plpgsql
AS $$
DECLARE
    v_dataset_codes text[];
    v_dataset_ids bigint[];
    v_full_rebuild boolean;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('landwatch.mv_feature_active_attrs_light'));

    SELECT array_agg(code ORDER BY code)
    INTO v_dataset_codes
    FROM (
        SELECT DISTINCT NULLIF(btrim(code), '') AS code
        FROM unnest(p_dataset_codes) AS raw(code)
    ) cleaned
    WHERE code IS NOT NULL;

    v_full_rebuild := COALESCE(array_length(v_dataset_codes, 1), 0) = 0;

    IF NOT v_full_rebuild THEN
        SELECT array_agg(d.dataset_id ORDER BY d.dataset_id)
        INTO v_dataset_ids
        FROM landwatch.lw_dataset d
        WHERE d.code = ANY(v_dataset_codes);

        IF COALESCE(array_length(v_dataset_ids, 1), 0) = 0 THEN
            deleted_count := 0;
            inserted_count := 0;
            RETURN NEXT;
            RETURN;
        END IF;

        DELETE FROM landwatch.mv_feature_active_attrs_light
        WHERE dataset_id = ANY(v_dataset_ids);
    ELSE
        DELETE FROM landwatch.mv_feature_active_attrs_light;
    END IF;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    INSERT INTO landwatch.mv_feature_active_attrs_light (
        dataset_id,
        dataset_code,
        feature_id,
        feature_key,
        geom_id
    )
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
    WHERE v_full_rebuild OR f.dataset_id = ANY(v_dataset_ids);
    GET DIAGNOSTICS inserted_count = ROW_COUNT;

    ANALYZE landwatch.mv_feature_active_attrs_light;
    RETURN NEXT;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_feature_active_attrs_light_pk
    ON landwatch.mv_feature_active_attrs_light(dataset_id, feature_id);

CREATE INDEX IF NOT EXISTS idx_mv_feature_active_attrs_light_dataset
    ON landwatch.mv_feature_active_attrs_light(dataset_code);

CREATE INDEX IF NOT EXISTS idx_mv_feature_active_attrs_light_geom_id
    ON landwatch.mv_feature_active_attrs_light(geom_id);

CREATE INDEX IF NOT EXISTS idx_mv_feature_active_attrs_light_feature_key
    ON landwatch.mv_feature_active_attrs_light(feature_key);

CREATE TABLE IF NOT EXISTS landwatch.mv_feature_tooltip_active (
    dataset_id BIGINT NOT NULL,
    feature_id BIGINT NOT NULL,
    display_name TEXT,
    natural_id TEXT
);

CREATE OR REPLACE FUNCTION landwatch.refresh_feature_tooltip_active_cache(
    p_dataset_codes text[] DEFAULT NULL
)
RETURNS TABLE(deleted_count bigint, inserted_count bigint)
LANGUAGE plpgsql
AS $$
DECLARE
    v_dataset_codes text[];
    v_dataset_ids bigint[];
    v_full_rebuild boolean;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('landwatch.mv_feature_tooltip_active'));

    SELECT array_agg(code ORDER BY code)
    INTO v_dataset_codes
    FROM (
        SELECT DISTINCT NULLIF(btrim(code), '') AS code
        FROM unnest(p_dataset_codes) AS raw(code)
    ) cleaned
    WHERE code IS NOT NULL;

    v_full_rebuild := COALESCE(array_length(v_dataset_codes, 1), 0) = 0;

    IF NOT v_full_rebuild THEN
        SELECT array_agg(d.dataset_id ORDER BY d.dataset_id)
        INTO v_dataset_ids
        FROM landwatch.lw_dataset d
        WHERE d.code = ANY(v_dataset_codes);

        IF COALESCE(array_length(v_dataset_ids, 1), 0) = 0 THEN
            deleted_count := 0;
            inserted_count := 0;
            RETURN NEXT;
            RETURN;
        END IF;

        DELETE FROM landwatch.mv_feature_tooltip_active
        WHERE dataset_id = ANY(v_dataset_ids);
    ELSE
        DELETE FROM landwatch.mv_feature_tooltip_active;
    END IF;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    INSERT INTO landwatch.mv_feature_tooltip_active (
        dataset_id,
        feature_id,
        display_name,
        natural_id
    )
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
    WHERE v_full_rebuild OR l.dataset_id = ANY(v_dataset_ids);
    GET DIAGNOSTICS inserted_count = ROW_COUNT;

    ANALYZE landwatch.mv_feature_tooltip_active;
    RETURN NEXT;
END;
$$;

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

CREATE TABLE IF NOT EXISTS landwatch.mv_sicar_meta_active (
    dataset_id BIGINT NOT NULL,
    dataset_code TEXT,
    feature_id BIGINT NOT NULL,
    pack_json JSONB
);

CREATE OR REPLACE FUNCTION landwatch.refresh_sicar_meta_cache(
    p_dataset_codes text[] DEFAULT NULL
)
RETURNS TABLE(deleted_count bigint, inserted_count bigint)
LANGUAGE plpgsql
AS $$
DECLARE
    v_dataset_codes text[];
    v_dataset_ids bigint[];
    v_full_rebuild boolean;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('landwatch.mv_sicar_meta_active'));

    SELECT array_agg(code ORDER BY code)
    INTO v_dataset_codes
    FROM (
        SELECT DISTINCT NULLIF(btrim(code), '') AS code
        FROM unnest(p_dataset_codes) AS raw(code)
    ) cleaned
    WHERE code IS NOT NULL;

    v_full_rebuild := COALESCE(array_length(v_dataset_codes, 1), 0) = 0;

    IF NOT v_full_rebuild THEN
        SELECT array_agg(d.dataset_id ORDER BY d.dataset_id)
        INTO v_dataset_ids
        FROM landwatch.lw_dataset d
        WHERE d.code = ANY(v_dataset_codes);

        IF COALESCE(array_length(v_dataset_ids, 1), 0) = 0 THEN
            deleted_count := 0;
            inserted_count := 0;
            RETURN NEXT;
            RETURN;
        END IF;

        DELETE FROM landwatch.mv_sicar_meta_active
        WHERE dataset_id = ANY(v_dataset_ids);
    ELSE
        DELETE FROM landwatch.mv_sicar_meta_active;
    END IF;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    INSERT INTO landwatch.mv_sicar_meta_active (
        dataset_id,
        dataset_code,
        feature_id,
        pack_json
    )
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
      AND (c.code = 'SICAR' OR d.code = 'SICAR')
      AND (v_full_rebuild OR h.dataset_id = ANY(v_dataset_ids));
    GET DIAGNOSTICS inserted_count = ROW_COUNT;

    ANALYZE landwatch.mv_sicar_meta_active;
    RETURN NEXT;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_sicar_meta_active_pk
    ON landwatch.mv_sicar_meta_active(dataset_id, feature_id);

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
