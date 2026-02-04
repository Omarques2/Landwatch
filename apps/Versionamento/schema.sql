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
