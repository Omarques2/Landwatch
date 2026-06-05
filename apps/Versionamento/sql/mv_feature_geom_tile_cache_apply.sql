SET search_path TO landwatch, app, public, pg_catalog;

DO $$
DECLARE
  v_relkind "char";
BEGIN
  SELECT c.relkind
  INTO v_relkind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'landwatch'
    AND c.relname = 'mv_feature_geom_tile_active';

  IF v_relkind IS NULL THEN
    RAISE EXCEPTION 'landwatch.mv_feature_geom_tile_active nao existe';
  END IF;

  IF v_relkind <> 'm' THEN
    RAISE EXCEPTION
      'landwatch.mv_feature_geom_tile_active deve ser materialized view antes do swap; relkind atual=%',
      v_relkind;
  END IF;

  IF to_regclass('landwatch.mv_feature_geom_tile_active_old') IS NOT NULL THEN
    RAISE EXCEPTION 'Rollback object landwatch.mv_feature_geom_tile_active_old ja existe; revise antes de aplicar.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_stat_activity
    WHERE pid <> pg_backend_pid()
      AND query ILIKE '%REFRESH MATERIALIZED VIEW%'
      AND query ILIKE '%mv_feature_geom_tile_active%'
  ) THEN
    RAISE EXCEPTION 'Existe REFRESH MATERIALIZED VIEW em execucao para mv_feature_geom_tile_active.';
  END IF;
END $$;

DROP TABLE IF EXISTS landwatch.mv_feature_geom_tile_active_cache;

CREATE TABLE landwatch.mv_feature_geom_tile_active_cache (
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

WITH normalized AS (
  SELECT
    a.dataset_id,
    a.feature_id,
    a.geom_id,
    a.version_id,
    landwatch.safe_transform_to_3857(a.geom) AS geom_3857_raw
  FROM landwatch.mv_feature_geom_active a
)
INSERT INTO landwatch.mv_feature_geom_tile_active_cache (
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

CREATE UNIQUE INDEX idx_mv_feature_geom_tile_active_cache_pk
  ON landwatch.mv_feature_geom_tile_active_cache(dataset_id, feature_id);

CREATE INDEX idx_mv_feature_geom_tile_active_cache_geom_id
  ON landwatch.mv_feature_geom_tile_active_cache(geom_id);

CREATE INDEX idx_mv_feature_geom_tile_active_cache_geom_raw
  ON landwatch.mv_feature_geom_tile_active_cache USING GIST (dataset_id, geom_3857_raw);

CREATE INDEX idx_mv_feature_geom_tile_active_cache_geom_s600
  ON landwatch.mv_feature_geom_tile_active_cache USING GIST (dataset_id, geom_3857_s600);

CREATE INDEX idx_mv_feature_geom_tile_active_cache_geom_s300
  ON landwatch.mv_feature_geom_tile_active_cache USING GIST (dataset_id, geom_3857_s300);

CREATE INDEX idx_mv_feature_geom_tile_active_cache_geom_s140
  ON landwatch.mv_feature_geom_tile_active_cache USING GIST (dataset_id, geom_3857_s140);

CREATE INDEX idx_mv_feature_geom_tile_active_cache_geom_s70
  ON landwatch.mv_feature_geom_tile_active_cache USING GIST (dataset_id, geom_3857_s70);

CREATE INDEX idx_mv_feature_geom_tile_active_cache_geom_s35
  ON landwatch.mv_feature_geom_tile_active_cache USING GIST (dataset_id, geom_3857_s35);

ANALYZE landwatch.mv_feature_geom_tile_active_cache;

DO $$
DECLARE
  v_missing bigint;
  v_extra bigint;
  v_null_raw bigint;
BEGIN
  SELECT count(*)
  INTO v_missing
  FROM (
    SELECT a.dataset_id, a.feature_id
    FROM landwatch.mv_feature_geom_active a
    WHERE landwatch.safe_transform_to_3857(a.geom) IS NOT NULL
    EXCEPT
    SELECT c.dataset_id, c.feature_id
    FROM landwatch.mv_feature_geom_tile_active_cache c
  ) missing;

  SELECT count(*)
  INTO v_extra
  FROM (
    SELECT c.dataset_id, c.feature_id
    FROM landwatch.mv_feature_geom_tile_active_cache c
    EXCEPT
    SELECT a.dataset_id, a.feature_id
    FROM landwatch.mv_feature_geom_active a
    WHERE landwatch.safe_transform_to_3857(a.geom) IS NOT NULL
  ) extra;

  SELECT count(*)
  INTO v_null_raw
  FROM landwatch.mv_feature_geom_tile_active_cache
  WHERE geom_3857_raw IS NULL;

  IF v_missing <> 0 OR v_extra <> 0 OR v_null_raw <> 0 THEN
    RAISE EXCEPTION
      'Validacao do cache falhou: missing=%, extra=%, geom_3857_raw_null=%',
      v_missing, v_extra, v_null_raw;
  END IF;
END $$;

BEGIN;

ALTER INDEX IF EXISTS landwatch.idx_mv_feature_geom_tile_active_pk
  RENAME TO idx_mv_feature_geom_tile_active_pk_old;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_geom_tile_active_geom_id
  RENAME TO idx_mv_feature_geom_tile_active_geom_id_old;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_geom_tile_active_geom_raw
  RENAME TO idx_mv_feature_geom_tile_active_geom_raw_old;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_geom_tile_active_geom_s600
  RENAME TO idx_mv_feature_geom_tile_active_geom_s600_old;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_geom_tile_active_geom_s300
  RENAME TO idx_mv_feature_geom_tile_active_geom_s300_old;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_geom_tile_active_geom_s140
  RENAME TO idx_mv_feature_geom_tile_active_geom_s140_old;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_geom_tile_active_geom_s70
  RENAME TO idx_mv_feature_geom_tile_active_geom_s70_old;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_geom_tile_active_geom_s35
  RENAME TO idx_mv_feature_geom_tile_active_geom_s35_old;

ALTER MATERIALIZED VIEW landwatch.mv_feature_geom_tile_active
  RENAME TO mv_feature_geom_tile_active_old;
ALTER TABLE landwatch.mv_feature_geom_tile_active_cache
  RENAME TO mv_feature_geom_tile_active;

ALTER INDEX IF EXISTS landwatch.idx_mv_feature_geom_tile_active_cache_pk
  RENAME TO idx_mv_feature_geom_tile_active_pk;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_geom_tile_active_cache_geom_id
  RENAME TO idx_mv_feature_geom_tile_active_geom_id;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_geom_tile_active_cache_geom_raw
  RENAME TO idx_mv_feature_geom_tile_active_geom_raw;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_geom_tile_active_cache_geom_s600
  RENAME TO idx_mv_feature_geom_tile_active_geom_s600;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_geom_tile_active_cache_geom_s300
  RENAME TO idx_mv_feature_geom_tile_active_geom_s300;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_geom_tile_active_cache_geom_s140
  RENAME TO idx_mv_feature_geom_tile_active_geom_s140;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_geom_tile_active_cache_geom_s70
  RENAME TO idx_mv_feature_geom_tile_active_geom_s70;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_geom_tile_active_cache_geom_s35
  RENAME TO idx_mv_feature_geom_tile_active_geom_s35;

COMMIT;

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

ANALYZE landwatch.mv_feature_geom_tile_active;
