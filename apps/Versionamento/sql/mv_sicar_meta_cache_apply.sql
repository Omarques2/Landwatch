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
    AND c.relname = 'mv_sicar_meta_active';

  IF v_relkind IS NULL THEN
    RAISE EXCEPTION 'landwatch.mv_sicar_meta_active nao existe';
  END IF;

  IF v_relkind <> 'm' THEN
    RAISE EXCEPTION
      'landwatch.mv_sicar_meta_active deve ser materialized view antes do swap; relkind atual=%',
      v_relkind;
  END IF;

  IF to_regclass('landwatch.mv_sicar_meta_active_old') IS NOT NULL THEN
    RAISE EXCEPTION 'Rollback object landwatch.mv_sicar_meta_active_old ja existe; revise antes de aplicar.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_stat_activity
    WHERE pid <> pg_backend_pid()
      AND query ILIKE '%REFRESH MATERIALIZED VIEW%'
      AND query ILIKE '%mv_sicar_meta_active%'
  ) THEN
    RAISE EXCEPTION 'Existe REFRESH MATERIALIZED VIEW em execucao para mv_sicar_meta_active.';
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
      AND c.relname = 'mv_sicar_meta_active_cache'
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

CREATE TABLE landwatch.mv_sicar_meta_active_cache (
  dataset_id BIGINT NOT NULL,
  dataset_code TEXT,
  feature_id BIGINT NOT NULL,
  pack_json JSONB
);

INSERT INTO landwatch.mv_sicar_meta_active_cache (
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
  AND (c.code = 'SICAR' OR d.code = 'SICAR');

CREATE UNIQUE INDEX idx_mv_sicar_meta_active_cache_pk
  ON landwatch.mv_sicar_meta_active_cache(dataset_id, feature_id);

ANALYZE landwatch.mv_sicar_meta_active_cache;

DO $$
DECLARE
  v_missing bigint;
  v_extra bigint;
  v_mismatch bigint;
BEGIN
  WITH expected AS (
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
  )
  SELECT count(*)
  INTO v_missing
  FROM (
    SELECT dataset_id, feature_id FROM expected
    EXCEPT
    SELECT dataset_id, feature_id FROM landwatch.mv_sicar_meta_active_cache
  ) missing;

  WITH expected AS (
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
  )
  SELECT count(*)
  INTO v_extra
  FROM (
    SELECT dataset_id, feature_id FROM landwatch.mv_sicar_meta_active_cache
    EXCEPT
    SELECT dataset_id, feature_id FROM expected
  ) extra;

  WITH expected AS (
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
  )
  SELECT count(*)
  INTO v_mismatch
  FROM landwatch.mv_sicar_meta_active_cache c
  JOIN expected e
    ON e.dataset_id = c.dataset_id
   AND e.feature_id = c.feature_id
  WHERE c.dataset_code IS DISTINCT FROM e.dataset_code
     OR c.pack_json IS DISTINCT FROM e.pack_json;

  IF v_missing <> 0 OR v_extra <> 0 OR v_mismatch <> 0 THEN
    RAISE EXCEPTION
      'Validacao do cache sicar_meta falhou: missing=%, extra=%, mismatch=%',
      v_missing, v_extra, v_mismatch;
  END IF;
END $$;

BEGIN;

ALTER INDEX IF EXISTS landwatch.idx_mv_sicar_meta_active_pk
  RENAME TO idx_mv_sicar_meta_active_pk_old;

ALTER MATERIALIZED VIEW landwatch.mv_sicar_meta_active
  RENAME TO mv_sicar_meta_active_old;

ALTER TABLE landwatch.mv_sicar_meta_active_cache
  RENAME TO mv_sicar_meta_active;

ALTER INDEX IF EXISTS landwatch.idx_mv_sicar_meta_active_cache_pk
  RENAME TO idx_mv_sicar_meta_active_pk;

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
      AND pg_get_functiondef(p.oid) ~ 'mv_sicar_meta_active_old'
  LOOP
    ddl := pg_get_functiondef(r.oid);
    ddl := replace(ddl, 'mv_sicar_meta_active_old', 'mv_sicar_meta_active');
    EXECUTE ddl;
  END LOOP;
END $$;

COMMIT;

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

ANALYZE landwatch.mv_sicar_meta_active;
