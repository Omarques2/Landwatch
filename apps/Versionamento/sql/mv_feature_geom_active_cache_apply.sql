SET search_path TO landwatch, app, public, pg_catalog;

DO $$
DECLARE
  v_geom_relkind "char";
  v_tile_relkind "char";
BEGIN
  SELECT c.relkind
  INTO v_geom_relkind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'landwatch'
    AND c.relname = 'mv_feature_geom_active';

  IF v_geom_relkind IS NULL THEN
    RAISE EXCEPTION 'landwatch.mv_feature_geom_active nao existe';
  END IF;

  IF v_geom_relkind <> 'm' THEN
    RAISE EXCEPTION
      'landwatch.mv_feature_geom_active deve ser materialized view antes do swap; relkind atual=%',
      v_geom_relkind;
  END IF;

  SELECT c.relkind
  INTO v_tile_relkind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'landwatch'
    AND c.relname = 'mv_feature_geom_tile_active';

  IF v_tile_relkind = 'm' THEN
    RAISE EXCEPTION
      'Aplique mv_feature_geom_tile_cache_apply.sql antes deste script; tile ainda e materialized view.';
  END IF;

  IF to_regclass('landwatch.mv_feature_geom_active_old') IS NOT NULL THEN
    RAISE EXCEPTION 'Rollback object landwatch.mv_feature_geom_active_old ja existe; revise antes de aplicar.';
  END IF;

  IF to_regclass('landwatch.mv_feature_active_attrs_light_geom_active_old') IS NOT NULL THEN
    RAISE EXCEPTION 'Rollback object landwatch.mv_feature_active_attrs_light_geom_active_old ja existe; revise antes de aplicar.';
  END IF;

  IF to_regclass('landwatch.mv_feature_tooltip_active_geom_active_old') IS NOT NULL THEN
    RAISE EXCEPTION 'Rollback object landwatch.mv_feature_tooltip_active_geom_active_old ja existe; revise antes de aplicar.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_stat_activity
    WHERE pid <> pg_backend_pid()
      AND query ILIKE '%REFRESH MATERIALIZED VIEW%'
      AND (
        query ILIKE '%mv_feature_geom_active%'
        OR query ILIKE '%mv_feature_active_attrs_light%'
        OR query ILIKE '%mv_feature_tooltip_active%'
      )
  ) THEN
    RAISE EXCEPTION 'Existe REFRESH MATERIALIZED VIEW em execucao para MVs dependentes de geom_active.';
  END IF;
END $$;

DROP MATERIALIZED VIEW IF EXISTS landwatch.mv_feature_tooltip_active_cache;
DROP MATERIALIZED VIEW IF EXISTS landwatch.mv_feature_active_attrs_light_cache;
DROP TABLE IF EXISTS landwatch.mv_feature_geom_active_cache;

CREATE TABLE landwatch.mv_feature_geom_active_cache (
  dataset_id BIGINT NOT NULL,
  feature_id BIGINT NOT NULL,
  geom_id BIGINT NOT NULL,
  version_id BIGINT NOT NULL,
  geom geometry
);

INSERT INTO landwatch.mv_feature_geom_active_cache (
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
WHERE h.valid_to IS NULL;

CREATE UNIQUE INDEX idx_mv_feature_geom_active_cache_pk
  ON landwatch.mv_feature_geom_active_cache(dataset_id, feature_id);

CREATE INDEX idx_mv_feature_geom_active_cache_geom
  ON landwatch.mv_feature_geom_active_cache USING GIST (geom);

CREATE INDEX idx_mv_feature_geom_active_cache_geom_id
  ON landwatch.mv_feature_geom_active_cache(geom_id);

ANALYZE landwatch.mv_feature_geom_active_cache;

DO $$
DECLARE
  v_missing bigint;
  v_extra bigint;
  v_mismatch bigint;
BEGIN
  SELECT count(*)
  INTO v_missing
  FROM (
    SELECT h.dataset_id, h.feature_id
    FROM landwatch.lw_feature_geom_hist h
    WHERE h.valid_to IS NULL
    EXCEPT
    SELECT c.dataset_id, c.feature_id
    FROM landwatch.mv_feature_geom_active_cache c
  ) missing;

  SELECT count(*)
  INTO v_extra
  FROM (
    SELECT c.dataset_id, c.feature_id
    FROM landwatch.mv_feature_geom_active_cache c
    EXCEPT
    SELECT h.dataset_id, h.feature_id
    FROM landwatch.lw_feature_geom_hist h
    WHERE h.valid_to IS NULL
  ) extra;

  SELECT count(*)
  INTO v_mismatch
  FROM landwatch.mv_feature_geom_active_cache c
  JOIN landwatch.lw_feature_geom_hist h
    ON h.dataset_id = c.dataset_id
   AND h.feature_id = c.feature_id
   AND h.valid_to IS NULL
  WHERE c.geom_id IS DISTINCT FROM h.geom_id
     OR c.version_id IS DISTINCT FROM h.version_id;

  IF v_missing <> 0 OR v_extra <> 0 OR v_mismatch <> 0 THEN
    RAISE EXCEPTION
      'Validacao do cache geom_active falhou: missing=%, extra=%, mismatch=%',
      v_missing, v_extra, v_mismatch;
  END IF;
END $$;

CREATE MATERIALIZED VIEW landwatch.mv_feature_active_attrs_light_cache AS
SELECT
  f.dataset_id,
  d.code AS dataset_code,
  f.feature_id,
  f.feature_key,
  a.geom_id
FROM landwatch.lw_feature f
JOIN landwatch.lw_dataset d ON d.dataset_id = f.dataset_id
JOIN landwatch.mv_feature_geom_active_cache a
  ON a.dataset_id = f.dataset_id
 AND a.feature_id = f.feature_id;

CREATE UNIQUE INDEX idx_mv_feature_active_attrs_light_cache_pk
  ON landwatch.mv_feature_active_attrs_light_cache(dataset_id, feature_id);

CREATE INDEX idx_mv_feature_active_attrs_light_cache_dataset
  ON landwatch.mv_feature_active_attrs_light_cache(dataset_code);

CREATE INDEX idx_mv_feature_active_attrs_light_cache_geom_id
  ON landwatch.mv_feature_active_attrs_light_cache(geom_id);

CREATE INDEX idx_mv_feature_active_attrs_light_cache_feature_key
  ON landwatch.mv_feature_active_attrs_light_cache(feature_key);

CREATE MATERIALIZED VIEW landwatch.mv_feature_tooltip_active_cache AS
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
FROM landwatch.mv_feature_active_attrs_light_cache l
LEFT JOIN landwatch.lw_feature_attr_pack_hist h_attr
  ON h_attr.dataset_id = l.dataset_id
 AND h_attr.feature_id = l.feature_id
 AND h_attr.valid_to IS NULL
LEFT JOIN landwatch.lw_attr_pack p
  ON p.pack_id = h_attr.pack_id;

CREATE UNIQUE INDEX idx_mv_feature_tooltip_active_cache_pk
  ON landwatch.mv_feature_tooltip_active_cache(dataset_id, feature_id);

ANALYZE landwatch.mv_feature_active_attrs_light_cache;
ANALYZE landwatch.mv_feature_tooltip_active_cache;

BEGIN;

ALTER INDEX IF EXISTS landwatch.idx_mv_feature_geom_active_pk
  RENAME TO idx_mv_feature_geom_active_pk_old;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_geom_active_geom
  RENAME TO idx_mv_feature_geom_active_geom_old;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_geom_active_geom_id
  RENAME TO idx_mv_feature_geom_active_geom_id_old;

ALTER INDEX IF EXISTS landwatch.idx_mv_feature_active_attrs_light_pk
  RENAME TO idx_mv_feature_active_attrs_light_pk_geom_active_old;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_active_attrs_light_dataset
  RENAME TO idx_mv_feature_active_attrs_light_dataset_geom_active_old;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_active_attrs_light_geom_id
  RENAME TO idx_mv_feature_active_attrs_light_geom_id_geom_active_old;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_active_attrs_light_feature_key
  RENAME TO idx_mv_feature_active_attrs_light_feature_key_geom_active_old;

ALTER INDEX IF EXISTS landwatch.idx_mv_feature_tooltip_active_pk
  RENAME TO idx_mv_feature_tooltip_active_pk_geom_active_old;

ALTER MATERIALIZED VIEW landwatch.mv_feature_tooltip_active
  RENAME TO mv_feature_tooltip_active_geom_active_old;
ALTER MATERIALIZED VIEW landwatch.mv_feature_active_attrs_light
  RENAME TO mv_feature_active_attrs_light_geom_active_old;
ALTER MATERIALIZED VIEW landwatch.mv_feature_geom_active
  RENAME TO mv_feature_geom_active_old;

ALTER TABLE landwatch.mv_feature_geom_active_cache
  RENAME TO mv_feature_geom_active;
ALTER MATERIALIZED VIEW landwatch.mv_feature_active_attrs_light_cache
  RENAME TO mv_feature_active_attrs_light;
ALTER MATERIALIZED VIEW landwatch.mv_feature_tooltip_active_cache
  RENAME TO mv_feature_tooltip_active;

ALTER INDEX IF EXISTS landwatch.idx_mv_feature_geom_active_cache_pk
  RENAME TO idx_mv_feature_geom_active_pk;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_geom_active_cache_geom
  RENAME TO idx_mv_feature_geom_active_geom;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_geom_active_cache_geom_id
  RENAME TO idx_mv_feature_geom_active_geom_id;

ALTER INDEX IF EXISTS landwatch.idx_mv_feature_active_attrs_light_cache_pk
  RENAME TO idx_mv_feature_active_attrs_light_pk;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_active_attrs_light_cache_dataset
  RENAME TO idx_mv_feature_active_attrs_light_dataset;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_active_attrs_light_cache_geom_id
  RENAME TO idx_mv_feature_active_attrs_light_geom_id;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_active_attrs_light_cache_feature_key
  RENAME TO idx_mv_feature_active_attrs_light_feature_key;

ALTER INDEX IF EXISTS landwatch.idx_mv_feature_tooltip_active_cache_pk
  RENAME TO idx_mv_feature_tooltip_active_pk;

DO $$
DECLARE
  r record;
  ddl text;
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'landwatch'
      AND p.prokind = 'f'
      AND pg_get_functiondef(p.oid) ~ 'mv_feature_(geom_active_old|active_attrs_light_geom_active_old|tooltip_active_geom_active_old)'
  LOOP
    ddl := pg_get_functiondef(r.oid);
    ddl := replace(ddl, 'mv_feature_geom_active_old', 'mv_feature_geom_active');
    ddl := replace(ddl, 'mv_feature_active_attrs_light_geom_active_old', 'mv_feature_active_attrs_light');
    ddl := replace(ddl, 'mv_feature_tooltip_active_geom_active_old', 'mv_feature_tooltip_active');
    EXECUTE ddl;
  END LOOP;
END $$;

COMMIT;

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

ANALYZE landwatch.mv_feature_geom_active;
ANALYZE landwatch.mv_feature_active_attrs_light;
ANALYZE landwatch.mv_feature_tooltip_active;
