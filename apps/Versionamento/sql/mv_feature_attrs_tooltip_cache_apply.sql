SET search_path TO landwatch, app, public, pg_catalog;

DO $$
DECLARE
  v_geom_relkind "char";
  v_attrs_relkind "char";
  v_tooltip_relkind "char";
BEGIN
  SELECT c.relkind
  INTO v_geom_relkind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'landwatch'
    AND c.relname = 'mv_feature_geom_active';

  IF v_geom_relkind NOT IN ('r', 'p') THEN
    RAISE EXCEPTION
      'Aplique mv_feature_geom_active_cache_apply.sql antes deste script; geom_active relkind atual=%',
      v_geom_relkind;
  END IF;

  SELECT c.relkind
  INTO v_attrs_relkind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'landwatch'
    AND c.relname = 'mv_feature_active_attrs_light';

  IF v_attrs_relkind <> 'm' THEN
    RAISE EXCEPTION
      'landwatch.mv_feature_active_attrs_light deve ser materialized view antes do swap; relkind atual=%',
      v_attrs_relkind;
  END IF;

  SELECT c.relkind
  INTO v_tooltip_relkind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'landwatch'
    AND c.relname = 'mv_feature_tooltip_active';

  IF v_tooltip_relkind <> 'm' THEN
    RAISE EXCEPTION
      'landwatch.mv_feature_tooltip_active deve ser materialized view antes do swap; relkind atual=%',
      v_tooltip_relkind;
  END IF;

  IF to_regclass('landwatch.mv_feature_active_attrs_light_old') IS NOT NULL THEN
    RAISE EXCEPTION 'Rollback object landwatch.mv_feature_active_attrs_light_old ja existe; revise antes de aplicar.';
  END IF;

  IF to_regclass('landwatch.mv_feature_tooltip_active_old') IS NOT NULL THEN
    RAISE EXCEPTION 'Rollback object landwatch.mv_feature_tooltip_active_old ja existe; revise antes de aplicar.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_stat_activity
    WHERE pid <> pg_backend_pid()
      AND query ILIKE '%REFRESH MATERIALIZED VIEW%'
      AND (
        query ILIKE '%mv_feature_active_attrs_light%'
        OR query ILIKE '%mv_feature_tooltip_active%'
      )
  ) THEN
    RAISE EXCEPTION 'Existe REFRESH MATERIALIZED VIEW em execucao para attrs/tooltip.';
  END IF;
END $$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'landwatch'
      AND c.relname IN (
        'mv_feature_tooltip_active_cache',
        'mv_feature_active_attrs_light_cache'
      )
    ORDER BY CASE c.relname
      WHEN 'mv_feature_tooltip_active_cache' THEN 1
      ELSE 2
    END
  LOOP
    IF r.relkind = 'm' THEN
      EXECUTE format('DROP MATERIALIZED VIEW landwatch.%I', r.relname);
    ELSIF r.relkind IN ('r', 'p') THEN
      EXECUTE format('DROP TABLE landwatch.%I', r.relname);
    ELSE
      RAISE EXCEPTION 'Objeto shadow inesperado landwatch.% com relkind=%', r.relname, r.relkind;
    END IF;
  END LOOP;
END $$;

CREATE TABLE landwatch.mv_feature_active_attrs_light_cache (
  dataset_id BIGINT NOT NULL,
  dataset_code TEXT,
  feature_id BIGINT NOT NULL,
  feature_key TEXT,
  geom_id BIGINT
);

INSERT INTO landwatch.mv_feature_active_attrs_light_cache (
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
 AND a.feature_id = f.feature_id;

CREATE UNIQUE INDEX idx_mv_feature_active_attrs_light_cache_pk
  ON landwatch.mv_feature_active_attrs_light_cache(dataset_id, feature_id);

CREATE INDEX idx_mv_feature_active_attrs_light_cache_dataset
  ON landwatch.mv_feature_active_attrs_light_cache(dataset_code);

CREATE INDEX idx_mv_feature_active_attrs_light_cache_geom_id
  ON landwatch.mv_feature_active_attrs_light_cache(geom_id);

CREATE INDEX idx_mv_feature_active_attrs_light_cache_feature_key
  ON landwatch.mv_feature_active_attrs_light_cache(feature_key);

ANALYZE landwatch.mv_feature_active_attrs_light_cache;

DO $$
DECLARE
  v_missing bigint;
  v_extra bigint;
  v_mismatch bigint;
BEGIN
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
  )
  SELECT count(*)
  INTO v_missing
  FROM (
    SELECT dataset_id, feature_id FROM expected
    EXCEPT
    SELECT dataset_id, feature_id FROM landwatch.mv_feature_active_attrs_light_cache
  ) missing;

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
  )
  SELECT count(*)
  INTO v_extra
  FROM (
    SELECT dataset_id, feature_id FROM landwatch.mv_feature_active_attrs_light_cache
    EXCEPT
    SELECT dataset_id, feature_id FROM expected
  ) extra;

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
  )
  SELECT count(*)
  INTO v_mismatch
  FROM landwatch.mv_feature_active_attrs_light_cache c
  JOIN expected e
    ON e.dataset_id = c.dataset_id
   AND e.feature_id = c.feature_id
  WHERE c.dataset_code IS DISTINCT FROM e.dataset_code
     OR c.feature_key IS DISTINCT FROM e.feature_key
     OR c.geom_id IS DISTINCT FROM e.geom_id;

  IF v_missing <> 0 OR v_extra <> 0 OR v_mismatch <> 0 THEN
    RAISE EXCEPTION
      'Validacao do cache active_attrs_light falhou: missing=%, extra=%, mismatch=%',
      v_missing, v_extra, v_mismatch;
  END IF;
END $$;

CREATE TABLE landwatch.mv_feature_tooltip_active_cache (
  dataset_id BIGINT NOT NULL,
  feature_id BIGINT NOT NULL,
  display_name TEXT,
  natural_id TEXT
);

INSERT INTO landwatch.mv_feature_tooltip_active_cache (
  dataset_id,
  feature_id,
  display_name,
  natural_id
)
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

ANALYZE landwatch.mv_feature_tooltip_active_cache;

DO $$
DECLARE
  v_missing bigint;
  v_extra bigint;
  v_mismatch bigint;
  v_attrs_count bigint;
  v_tooltip_count bigint;
BEGIN
  SELECT count(*) INTO v_attrs_count
  FROM landwatch.mv_feature_active_attrs_light_cache;

  SELECT count(*) INTO v_tooltip_count
  FROM landwatch.mv_feature_tooltip_active_cache;

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
    FROM landwatch.mv_feature_active_attrs_light_cache l
    LEFT JOIN landwatch.lw_feature_attr_pack_hist h_attr
      ON h_attr.dataset_id = l.dataset_id
     AND h_attr.feature_id = l.feature_id
     AND h_attr.valid_to IS NULL
    LEFT JOIN landwatch.lw_attr_pack p
      ON p.pack_id = h_attr.pack_id
  )
  SELECT count(*)
  INTO v_missing
  FROM (
    SELECT dataset_id, feature_id FROM expected
    EXCEPT
    SELECT dataset_id, feature_id FROM landwatch.mv_feature_tooltip_active_cache
  ) missing;

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
    FROM landwatch.mv_feature_active_attrs_light_cache l
    LEFT JOIN landwatch.lw_feature_attr_pack_hist h_attr
      ON h_attr.dataset_id = l.dataset_id
     AND h_attr.feature_id = l.feature_id
     AND h_attr.valid_to IS NULL
    LEFT JOIN landwatch.lw_attr_pack p
      ON p.pack_id = h_attr.pack_id
  )
  SELECT count(*)
  INTO v_extra
  FROM (
    SELECT dataset_id, feature_id FROM landwatch.mv_feature_tooltip_active_cache
    EXCEPT
    SELECT dataset_id, feature_id FROM expected
  ) extra;

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
    FROM landwatch.mv_feature_active_attrs_light_cache l
    LEFT JOIN landwatch.lw_feature_attr_pack_hist h_attr
      ON h_attr.dataset_id = l.dataset_id
     AND h_attr.feature_id = l.feature_id
     AND h_attr.valid_to IS NULL
    LEFT JOIN landwatch.lw_attr_pack p
      ON p.pack_id = h_attr.pack_id
  )
  SELECT count(*)
  INTO v_mismatch
  FROM landwatch.mv_feature_tooltip_active_cache c
  JOIN expected e
    ON e.dataset_id = c.dataset_id
   AND e.feature_id = c.feature_id
  WHERE c.display_name IS DISTINCT FROM e.display_name
     OR c.natural_id IS DISTINCT FROM e.natural_id;

  IF v_attrs_count <> v_tooltip_count
     OR v_missing <> 0
     OR v_extra <> 0
     OR v_mismatch <> 0 THEN
    RAISE EXCEPTION
      'Validacao do cache tooltip falhou: attrs_count=%, tooltip_count=%, missing=%, extra=%, mismatch=%',
      v_attrs_count, v_tooltip_count, v_missing, v_extra, v_mismatch;
  END IF;
END $$;

BEGIN;

ALTER INDEX IF EXISTS landwatch.idx_mv_feature_tooltip_active_pk
  RENAME TO idx_mv_feature_tooltip_active_pk_old;

ALTER INDEX IF EXISTS landwatch.idx_mv_feature_active_attrs_light_pk
  RENAME TO idx_mv_feature_active_attrs_light_pk_old;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_active_attrs_light_dataset
  RENAME TO idx_mv_feature_active_attrs_light_dataset_old;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_active_attrs_light_geom_id
  RENAME TO idx_mv_feature_active_attrs_light_geom_id_old;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_active_attrs_light_feature_key
  RENAME TO idx_mv_feature_active_attrs_light_feature_key_old;

ALTER MATERIALIZED VIEW landwatch.mv_feature_tooltip_active
  RENAME TO mv_feature_tooltip_active_old;
ALTER MATERIALIZED VIEW landwatch.mv_feature_active_attrs_light
  RENAME TO mv_feature_active_attrs_light_old;

ALTER TABLE landwatch.mv_feature_active_attrs_light_cache
  RENAME TO mv_feature_active_attrs_light;
ALTER TABLE landwatch.mv_feature_tooltip_active_cache
  RENAME TO mv_feature_tooltip_active;

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
      AND pg_get_functiondef(p.oid) ~ 'mv_feature_(active_attrs_light_old|tooltip_active_old)'
  LOOP
    ddl := pg_get_functiondef(r.oid);
    ddl := replace(ddl, 'mv_feature_active_attrs_light_old', 'mv_feature_active_attrs_light');
    ddl := replace(ddl, 'mv_feature_tooltip_active_old', 'mv_feature_tooltip_active');
    EXECUTE ddl;
  END LOOP;
END $$;

COMMIT;

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

ANALYZE landwatch.mv_feature_active_attrs_light;
ANALYZE landwatch.mv_feature_tooltip_active;
