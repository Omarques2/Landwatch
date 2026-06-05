SET search_path TO landwatch, app, public, pg_catalog;

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

ALTER TABLE landwatch.lw_feature_state
  ADD COLUMN IF NOT EXISTS attr_compare_hash TEXT,
  ADD COLUMN IF NOT EXISTS tooltip_hash TEXT;

ALTER TABLE landwatch.lw_feature_delta
  ADD COLUMN IF NOT EXISTS tooltip_changed BOOLEAN NOT NULL DEFAULT FALSE;

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

CREATE OR REPLACE FUNCTION landwatch.attr_compare_json(p_pack jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_pack, '{}'::jsonb) - ARRAY['row_id']::text[];
$$;

CREATE OR REPLACE FUNCTION landwatch.tooltip_identity_json(p_pack jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'display_name',
    NULLIF(COALESCE(
      p_pack->>'nome_uc',
      p_pack->>'nome',
      p_pack->>'NOME',
      p_pack->>'nm',
      p_pack->>'NM',
      p_pack->>'denominacao',
      p_pack->>'descricao',
      p_pack->>'terrai_nom',
      p_pack->>'TERRAI_NOM',
      p_pack->>'etnia_nome',
      p_pack->>'ETNIA_NOME',
      p_pack->>'undadm_nom',
      p_pack->>'UNDADM_NOM'
    ), ''),
    'natural_id',
    NULLIF(COALESCE(
      p_pack->>'cnuc_code',
      p_pack->>'cd_cnuc',
      p_pack->>'Cnuc',
      p_pack->>'terrai_cod',
      p_pack->>'TERRAI_COD',
      p_pack->>'id',
      p_pack->>'ID',
      p_pack->>'objectid',
      p_pack->>'OBJECTID'
    ), '')
  );
$$;

UPDATE landwatch.lw_feature_state s
SET
  attr_compare_hash = md5(landwatch.attr_compare_json(p.pack_json)::text),
  tooltip_hash = md5(landwatch.tooltip_identity_json(p.pack_json)::text)
FROM landwatch.lw_feature_attr_pack_hist h
JOIN landwatch.lw_attr_pack p ON p.pack_id = h.pack_id
WHERE h.dataset_id = s.dataset_id
  AND h.feature_id = s.feature_id
  AND h.valid_to IS NULL
  AND (
    s.attr_compare_hash IS NULL
    OR s.tooltip_hash IS NULL
  );

UPDATE landwatch.lw_feature_state
SET
  attr_compare_hash = COALESCE(attr_compare_hash, attr_hash),
  tooltip_hash = COALESCE(tooltip_hash, md5('{}'::jsonb::text))
WHERE attr_compare_hash IS NULL
   OR tooltip_hash IS NULL;

CREATE OR REPLACE FUNCTION landwatch.refresh_feature_caches_delta(
  p_version_ids bigint[],
  p_dataset_codes text[] DEFAULT NULL,
  p_max_delta_ratio numeric DEFAULT 0.35
)
RETURNS TABLE(
  cache_name text,
  mode text,
  deleted_count bigint,
  inserted_count bigint,
  elapsed_ms bigint
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_version_ids bigint[];
  v_dataset_codes text[];
  v_rebuild_codes text[];
  v_rebuild_count bigint;
  v_delta_count bigint;
  v_mode text;
  v_cache text;
  v_started timestamptz;
  v_deleted bigint;
  v_inserted bigint;
  v_step_deleted bigint;
  v_step_inserted bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('landwatch.refresh_feature_caches_delta'));

  SELECT array_agg(version_id ORDER BY version_id)
  INTO v_version_ids
  FROM (
    SELECT DISTINCT raw.version_id::bigint AS version_id
    FROM unnest(p_version_ids) AS raw(version_id)
    WHERE raw.version_id IS NOT NULL AND raw.version_id > 0
  ) cleaned;

  SELECT array_agg(code ORDER BY code)
  INTO v_dataset_codes
  FROM (
    SELECT DISTINCT NULLIF(btrim(code), '') AS code
    FROM unnest(p_dataset_codes) AS raw(code)
  ) cleaned
  WHERE code IS NOT NULL;

  IF COALESCE(array_length(v_version_ids, 1), 0) = 0 THEN
    v_mode := 'cache-dataset-rebuild reason=no_version_ids';

    v_started := clock_timestamp();
    SELECT r.deleted_count, r.inserted_count INTO v_deleted, v_inserted
    FROM landwatch.refresh_feature_geom_active_cache(v_dataset_codes) r;
    RETURN QUERY SELECT 'landwatch.mv_feature_geom_active'::text, v_mode, COALESCE(v_deleted, 0), COALESCE(v_inserted, 0), (EXTRACT(EPOCH FROM clock_timestamp() - v_started) * 1000)::bigint;

    v_started := clock_timestamp();
    SELECT r.deleted_count, r.inserted_count INTO v_deleted, v_inserted
    FROM landwatch.refresh_feature_active_attrs_light_cache(v_dataset_codes) r;
    RETURN QUERY SELECT 'landwatch.mv_feature_active_attrs_light'::text, v_mode, COALESCE(v_deleted, 0), COALESCE(v_inserted, 0), (EXTRACT(EPOCH FROM clock_timestamp() - v_started) * 1000)::bigint;

    v_started := clock_timestamp();
    SELECT r.deleted_count, r.inserted_count INTO v_deleted, v_inserted
    FROM landwatch.refresh_feature_tooltip_active_cache(v_dataset_codes) r;
    RETURN QUERY SELECT 'landwatch.mv_feature_tooltip_active'::text, v_mode, COALESCE(v_deleted, 0), COALESCE(v_inserted, 0), (EXTRACT(EPOCH FROM clock_timestamp() - v_started) * 1000)::bigint;

    v_started := clock_timestamp();
    SELECT r.deleted_count, r.inserted_count INTO v_deleted, v_inserted
    FROM landwatch.refresh_sicar_meta_cache(v_dataset_codes) r;
    RETURN QUERY SELECT 'landwatch.mv_sicar_meta_active'::text, v_mode, COALESCE(v_deleted, 0), COALESCE(v_inserted, 0), (EXTRACT(EPOCH FROM clock_timestamp() - v_started) * 1000)::bigint;

    v_started := clock_timestamp();
    SELECT r.deleted_count, r.inserted_count INTO v_deleted, v_inserted
    FROM landwatch.refresh_feature_geom_tile_cache(v_dataset_codes) r;
    RETURN QUERY SELECT 'landwatch.mv_feature_geom_tile_active'::text, v_mode, COALESCE(v_deleted, 0), COALESCE(v_inserted, 0), (EXTRACT(EPOCH FROM clock_timestamp() - v_started) * 1000)::bigint;
    RETURN;
  END IF;

  DROP TABLE IF EXISTS pg_temp.__lw_cache_scope;
  CREATE TEMP TABLE __lw_cache_scope ON COMMIT DROP AS
  SELECT DISTINCT
    v.version_id,
    v.dataset_id,
    d.code AS dataset_code,
    r.version_id IS NULL AS missing_delta_run
  FROM landwatch.lw_dataset_version v
  JOIN landwatch.lw_dataset d ON d.dataset_id = v.dataset_id
  LEFT JOIN landwatch.lw_feature_delta_run r
    ON r.version_id = v.version_id
   AND r.dataset_id = v.dataset_id
  WHERE v.version_id = ANY(v_version_ids)
    AND (
      COALESCE(array_length(v_dataset_codes, 1), 0) = 0
      OR d.code = ANY(v_dataset_codes)
    );

  DROP TABLE IF EXISTS pg_temp.__lw_cache_delta_source;
  CREATE TEMP TABLE __lw_cache_delta_source ON COMMIT DROP AS
  SELECT
    fd.dataset_id,
    s.dataset_code,
    fd.feature_id,
    fd.action,
    fd.geom_changed,
    fd.attr_changed,
    fd.tooltip_changed,
    fd.became_present,
    fd.became_absent
  FROM landwatch.lw_feature_delta fd
  JOIN __lw_cache_scope s
    ON s.version_id = fd.version_id
   AND s.dataset_id = fd.dataset_id
  WHERE NOT s.missing_delta_run;

  DROP TABLE IF EXISTS pg_temp.__lw_cache_feature_scope;
  CREATE TEMP TABLE __lw_cache_feature_scope ON COMMIT DROP AS
  SELECT DISTINCT 'landwatch.mv_feature_geom_active'::text AS cache_name, dataset_id, dataset_code, feature_id
  FROM __lw_cache_delta_source
  WHERE action IN ('NEW', 'DISAPPEARED') OR geom_changed OR became_present OR became_absent
  UNION ALL
  SELECT DISTINCT 'landwatch.mv_feature_active_attrs_light'::text, dataset_id, dataset_code, feature_id
  FROM __lw_cache_delta_source
  WHERE action IN ('NEW', 'DISAPPEARED') OR geom_changed OR became_present OR became_absent
  UNION ALL
  SELECT DISTINCT 'landwatch.mv_feature_tooltip_active'::text, dataset_id, dataset_code, feature_id
  FROM __lw_cache_delta_source
  WHERE action IN ('NEW', 'DISAPPEARED') OR tooltip_changed OR became_present OR became_absent
  UNION ALL
  SELECT DISTINCT 'landwatch.mv_sicar_meta_active'::text, dataset_id, dataset_code, feature_id
  FROM __lw_cache_delta_source
  WHERE action IN ('NEW', 'DISAPPEARED') OR attr_changed OR became_present OR became_absent
  UNION ALL
  SELECT DISTINCT 'landwatch.mv_feature_geom_tile_active'::text, dataset_id, dataset_code, feature_id
  FROM __lw_cache_delta_source
  WHERE action IN ('NEW', 'DISAPPEARED') OR geom_changed OR became_present OR became_absent;

  CREATE INDEX ON __lw_cache_feature_scope(cache_name, dataset_id, feature_id);

  DROP TABLE IF EXISTS pg_temp.__lw_cache_rebuild_scope;
  CREATE TEMP TABLE __lw_cache_rebuild_scope ON COMMIT DROP AS
  WITH cache_names(cache_name) AS (
    VALUES
      ('landwatch.mv_feature_geom_active'::text),
      ('landwatch.mv_feature_active_attrs_light'::text),
      ('landwatch.mv_feature_tooltip_active'::text),
      ('landwatch.mv_sicar_meta_active'::text),
      ('landwatch.mv_feature_geom_tile_active'::text)
  ),
  missing AS (
    SELECT cn.cache_name, s.dataset_id, s.dataset_code, 'missing_delta_run'::text AS reason
    FROM __lw_cache_scope s
    CROSS JOIN cache_names cn
    WHERE s.missing_delta_run
  ),
  large AS (
    SELECT
      f.cache_name,
      f.dataset_id,
      f.dataset_code,
      'large_delta'::text AS reason
    FROM __lw_cache_feature_scope f
    GROUP BY f.cache_name, f.dataset_id, f.dataset_code
    HAVING count(DISTINCT f.feature_id) > 0
       AND (
         count(DISTINCT f.feature_id)::numeric
         / GREATEST((
             SELECT count(*)::numeric
             FROM landwatch.lw_feature_state fs
             WHERE fs.dataset_id = f.dataset_id
               AND fs.is_present = TRUE
           ), 1)
       ) > COALESCE(p_max_delta_ratio, 0.35)
  )
  SELECT DISTINCT * FROM missing
  UNION
  SELECT DISTINCT * FROM large;

  DELETE FROM __lw_cache_feature_scope f
  USING __lw_cache_rebuild_scope r
  WHERE r.cache_name = f.cache_name
    AND r.dataset_id = f.dataset_id;

  CREATE TEMP TABLE __lw_cache_geom_features ON COMMIT DROP AS
  SELECT f.dataset_id, f.dataset_code, f.feature_id
  FROM __lw_cache_feature_scope f
  WHERE f.cache_name = 'landwatch.mv_feature_geom_active';

  CREATE TEMP TABLE __lw_cache_attrs_light_features ON COMMIT DROP AS
  SELECT f.dataset_id, f.dataset_code, f.feature_id
  FROM __lw_cache_feature_scope f
  WHERE f.cache_name = 'landwatch.mv_feature_active_attrs_light';

  CREATE TEMP TABLE __lw_cache_tooltip_features ON COMMIT DROP AS
  SELECT f.dataset_id, f.dataset_code, f.feature_id
  FROM __lw_cache_feature_scope f
  WHERE f.cache_name = 'landwatch.mv_feature_tooltip_active';

  CREATE TEMP TABLE __lw_cache_sicar_features ON COMMIT DROP AS
  SELECT f.dataset_id, f.dataset_code, f.feature_id
  FROM __lw_cache_feature_scope f
  WHERE f.cache_name = 'landwatch.mv_sicar_meta_active';

  CREATE TEMP TABLE __lw_cache_tile_features ON COMMIT DROP AS
  SELECT f.dataset_id, f.dataset_code, f.feature_id
  FROM __lw_cache_feature_scope f
  WHERE f.cache_name = 'landwatch.mv_feature_geom_tile_active';

  CREATE INDEX ON __lw_cache_geom_features(dataset_id, feature_id);
  CREATE INDEX ON __lw_cache_attrs_light_features(dataset_id, feature_id);
  CREATE INDEX ON __lw_cache_tooltip_features(dataset_id, feature_id);
  CREATE INDEX ON __lw_cache_sicar_features(dataset_id, feature_id);
  CREATE INDEX ON __lw_cache_tile_features(dataset_id, feature_id);

  -- 1) Geometria ativa
  v_cache := 'landwatch.mv_feature_geom_active';
  v_started := clock_timestamp();
  v_deleted := 0;
  v_inserted := 0;
  SELECT array_agg(dataset_code ORDER BY dataset_code), count(*) INTO v_rebuild_codes, v_rebuild_count
  FROM __lw_cache_rebuild_scope r WHERE r.cache_name = v_cache;
  SELECT count(*) INTO v_delta_count FROM __lw_cache_geom_features;
  IF COALESCE(v_rebuild_count, 0) > 0 THEN
    SELECT r.deleted_count, r.inserted_count INTO v_step_deleted, v_step_inserted
    FROM landwatch.refresh_feature_geom_active_cache(v_rebuild_codes) r;
    v_deleted := v_deleted + COALESCE(v_step_deleted, 0);
    v_inserted := v_inserted + COALESCE(v_step_inserted, 0);
  END IF;
  IF COALESCE(v_delta_count, 0) > 0 THEN
    DELETE FROM landwatch.mv_feature_geom_active c
    USING __lw_cache_geom_features f
    WHERE c.dataset_id = f.dataset_id AND c.feature_id = f.feature_id;
    GET DIAGNOSTICS v_step_deleted = ROW_COUNT;
    v_deleted := v_deleted + COALESCE(v_step_deleted, 0);

    INSERT INTO landwatch.mv_feature_geom_active (dataset_id, feature_id, geom_id, version_id, geom)
    SELECT h.dataset_id, h.feature_id, h.geom_id, h.version_id, g.geom
    FROM __lw_cache_geom_features f
    JOIN landwatch.lw_feature_geom_hist h
      ON h.dataset_id = f.dataset_id
     AND h.feature_id = f.feature_id
     AND h.valid_to IS NULL
    JOIN landwatch.lw_geom_store g ON g.geom_id = h.geom_id
    ON CONFLICT (dataset_id, feature_id) DO UPDATE
    SET geom_id = EXCLUDED.geom_id,
        version_id = EXCLUDED.version_id,
        geom = EXCLUDED.geom;
    GET DIAGNOSTICS v_step_inserted = ROW_COUNT;
    v_inserted := v_inserted + COALESCE(v_step_inserted, 0);
    ANALYZE landwatch.mv_feature_geom_active;
  END IF;
  v_mode := CASE
    WHEN COALESCE(v_rebuild_count, 0) > 0 AND COALESCE(v_delta_count, 0) > 0 THEN 'delta+cache-dataset-rebuild reason=partial_fallback'
    WHEN COALESCE(v_rebuild_count, 0) > 0 THEN 'cache-dataset-rebuild reason=missing_delta_or_large_delta'
    WHEN COALESCE(v_delta_count, 0) > 0 THEN 'delta'
    ELSE 'delta-noop'
  END;
  RETURN QUERY SELECT v_cache, v_mode, v_deleted, v_inserted, (EXTRACT(EPOCH FROM clock_timestamp() - v_started) * 1000)::bigint;

  -- 2) Atributos leves
  v_cache := 'landwatch.mv_feature_active_attrs_light';
  v_started := clock_timestamp();
  v_deleted := 0;
  v_inserted := 0;
  SELECT array_agg(dataset_code ORDER BY dataset_code), count(*) INTO v_rebuild_codes, v_rebuild_count
  FROM __lw_cache_rebuild_scope r WHERE r.cache_name = v_cache;
  SELECT count(*) INTO v_delta_count FROM __lw_cache_attrs_light_features;
  IF COALESCE(v_rebuild_count, 0) > 0 THEN
    SELECT r.deleted_count, r.inserted_count INTO v_step_deleted, v_step_inserted
    FROM landwatch.refresh_feature_active_attrs_light_cache(v_rebuild_codes) r;
    v_deleted := v_deleted + COALESCE(v_step_deleted, 0);
    v_inserted := v_inserted + COALESCE(v_step_inserted, 0);
  END IF;
  IF COALESCE(v_delta_count, 0) > 0 THEN
    DELETE FROM landwatch.mv_feature_active_attrs_light c
    USING __lw_cache_attrs_light_features f
    WHERE c.dataset_id = f.dataset_id AND c.feature_id = f.feature_id;
    GET DIAGNOSTICS v_step_deleted = ROW_COUNT;
    v_deleted := v_deleted + COALESCE(v_step_deleted, 0);

    INSERT INTO landwatch.mv_feature_active_attrs_light (dataset_id, dataset_code, feature_id, feature_key, geom_id)
    SELECT lf.dataset_id, d.code, lf.feature_id, lf.feature_key, a.geom_id
    FROM __lw_cache_attrs_light_features f
    JOIN landwatch.lw_feature lf
      ON lf.dataset_id = f.dataset_id
     AND lf.feature_id = f.feature_id
    JOIN landwatch.lw_dataset d ON d.dataset_id = lf.dataset_id
    JOIN landwatch.mv_feature_geom_active a
      ON a.dataset_id = lf.dataset_id
     AND a.feature_id = lf.feature_id
    ON CONFLICT (dataset_id, feature_id) DO UPDATE
    SET dataset_code = EXCLUDED.dataset_code,
        feature_key = EXCLUDED.feature_key,
        geom_id = EXCLUDED.geom_id;
    GET DIAGNOSTICS v_step_inserted = ROW_COUNT;
    v_inserted := v_inserted + COALESCE(v_step_inserted, 0);
    ANALYZE landwatch.mv_feature_active_attrs_light;
  END IF;
  v_mode := CASE
    WHEN COALESCE(v_rebuild_count, 0) > 0 AND COALESCE(v_delta_count, 0) > 0 THEN 'delta+cache-dataset-rebuild reason=partial_fallback'
    WHEN COALESCE(v_rebuild_count, 0) > 0 THEN 'cache-dataset-rebuild reason=missing_delta_or_large_delta'
    WHEN COALESCE(v_delta_count, 0) > 0 THEN 'delta'
    ELSE 'delta-noop'
  END;
  RETURN QUERY SELECT v_cache, v_mode, v_deleted, v_inserted, (EXTRACT(EPOCH FROM clock_timestamp() - v_started) * 1000)::bigint;

  -- 3) Tooltip
  v_cache := 'landwatch.mv_feature_tooltip_active';
  v_started := clock_timestamp();
  v_deleted := 0;
  v_inserted := 0;
  SELECT array_agg(dataset_code ORDER BY dataset_code), count(*) INTO v_rebuild_codes, v_rebuild_count
  FROM __lw_cache_rebuild_scope r WHERE r.cache_name = v_cache;
  SELECT count(*) INTO v_delta_count FROM __lw_cache_tooltip_features;
  IF COALESCE(v_rebuild_count, 0) > 0 THEN
    SELECT r.deleted_count, r.inserted_count INTO v_step_deleted, v_step_inserted
    FROM landwatch.refresh_feature_tooltip_active_cache(v_rebuild_codes) r;
    v_deleted := v_deleted + COALESCE(v_step_deleted, 0);
    v_inserted := v_inserted + COALESCE(v_step_inserted, 0);
  END IF;
  IF COALESCE(v_delta_count, 0) > 0 THEN
    DELETE FROM landwatch.mv_feature_tooltip_active c
    USING __lw_cache_tooltip_features f
    WHERE c.dataset_id = f.dataset_id AND c.feature_id = f.feature_id;
    GET DIAGNOSTICS v_step_deleted = ROW_COUNT;
    v_deleted := v_deleted + COALESCE(v_step_deleted, 0);

    INSERT INTO landwatch.mv_feature_tooltip_active (dataset_id, feature_id, display_name, natural_id)
    SELECT
      l.dataset_id,
      l.feature_id,
      landwatch.tooltip_identity_json(p.pack_json)->>'display_name',
      landwatch.tooltip_identity_json(p.pack_json)->>'natural_id'
    FROM __lw_cache_tooltip_features f
    JOIN landwatch.mv_feature_active_attrs_light l
      ON l.dataset_id = f.dataset_id
     AND l.feature_id = f.feature_id
    LEFT JOIN landwatch.lw_feature_attr_pack_hist h_attr
      ON h_attr.dataset_id = l.dataset_id
     AND h_attr.feature_id = l.feature_id
     AND h_attr.valid_to IS NULL
    LEFT JOIN landwatch.lw_attr_pack p ON p.pack_id = h_attr.pack_id
    ON CONFLICT (dataset_id, feature_id) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        natural_id = EXCLUDED.natural_id;
    GET DIAGNOSTICS v_step_inserted = ROW_COUNT;
    v_inserted := v_inserted + COALESCE(v_step_inserted, 0);
    ANALYZE landwatch.mv_feature_tooltip_active;
  END IF;
  v_mode := CASE
    WHEN COALESCE(v_rebuild_count, 0) > 0 AND COALESCE(v_delta_count, 0) > 0 THEN 'delta+cache-dataset-rebuild reason=partial_fallback'
    WHEN COALESCE(v_rebuild_count, 0) > 0 THEN 'cache-dataset-rebuild reason=missing_delta_or_large_delta'
    WHEN COALESCE(v_delta_count, 0) > 0 THEN 'delta'
    ELSE 'delta-noop'
  END;
  RETURN QUERY SELECT v_cache, v_mode, v_deleted, v_inserted, (EXTRACT(EPOCH FROM clock_timestamp() - v_started) * 1000)::bigint;

  -- 4) Metadados SICAR
  v_cache := 'landwatch.mv_sicar_meta_active';
  v_started := clock_timestamp();
  v_deleted := 0;
  v_inserted := 0;
  SELECT array_agg(dataset_code ORDER BY dataset_code), count(*) INTO v_rebuild_codes, v_rebuild_count
  FROM __lw_cache_rebuild_scope r WHERE r.cache_name = v_cache;
  SELECT count(*) INTO v_delta_count FROM __lw_cache_sicar_features;
  IF COALESCE(v_rebuild_count, 0) > 0 THEN
    SELECT r.deleted_count, r.inserted_count INTO v_step_deleted, v_step_inserted
    FROM landwatch.refresh_sicar_meta_cache(v_rebuild_codes) r;
    v_deleted := v_deleted + COALESCE(v_step_deleted, 0);
    v_inserted := v_inserted + COALESCE(v_step_inserted, 0);
  END IF;
  IF COALESCE(v_delta_count, 0) > 0 THEN
    DELETE FROM landwatch.mv_sicar_meta_active c
    USING __lw_cache_sicar_features f
    WHERE c.dataset_id = f.dataset_id AND c.feature_id = f.feature_id;
    GET DIAGNOSTICS v_step_deleted = ROW_COUNT;
    v_deleted := v_deleted + COALESCE(v_step_deleted, 0);

    INSERT INTO landwatch.mv_sicar_meta_active (dataset_id, dataset_code, feature_id, pack_json)
    SELECT d.dataset_id, d.code, h.feature_id, p.pack_json
    FROM __lw_cache_sicar_features f
    JOIN landwatch.lw_feature_attr_pack_hist h
      ON h.dataset_id = f.dataset_id
     AND h.feature_id = f.feature_id
     AND h.valid_to IS NULL
    JOIN landwatch.lw_attr_pack p ON p.pack_id = h.pack_id
    JOIN landwatch.lw_dataset d ON d.dataset_id = h.dataset_id
    JOIN landwatch.lw_category c ON c.category_id = d.category_id
    WHERE c.code = 'SICAR' OR d.code = 'SICAR'
    ON CONFLICT (dataset_id, feature_id) DO UPDATE
    SET dataset_code = EXCLUDED.dataset_code,
        pack_json = EXCLUDED.pack_json;
    GET DIAGNOSTICS v_step_inserted = ROW_COUNT;
    v_inserted := v_inserted + COALESCE(v_step_inserted, 0);
    ANALYZE landwatch.mv_sicar_meta_active;
  END IF;
  v_mode := CASE
    WHEN COALESCE(v_rebuild_count, 0) > 0 AND COALESCE(v_delta_count, 0) > 0 THEN 'delta+cache-dataset-rebuild reason=partial_fallback'
    WHEN COALESCE(v_rebuild_count, 0) > 0 THEN 'cache-dataset-rebuild reason=missing_delta_or_large_delta'
    WHEN COALESCE(v_delta_count, 0) > 0 THEN 'delta'
    ELSE 'delta-noop'
  END;
  RETURN QUERY SELECT v_cache, v_mode, v_deleted, v_inserted, (EXTRACT(EPOCH FROM clock_timestamp() - v_started) * 1000)::bigint;

  -- 5) Geometria para tiles
  v_cache := 'landwatch.mv_feature_geom_tile_active';
  v_started := clock_timestamp();
  v_deleted := 0;
  v_inserted := 0;
  SELECT array_agg(dataset_code ORDER BY dataset_code), count(*) INTO v_rebuild_codes, v_rebuild_count
  FROM __lw_cache_rebuild_scope r WHERE r.cache_name = v_cache;
  SELECT count(*) INTO v_delta_count FROM __lw_cache_tile_features;
  IF COALESCE(v_rebuild_count, 0) > 0 THEN
    SELECT r.deleted_count, r.inserted_count INTO v_step_deleted, v_step_inserted
    FROM landwatch.refresh_feature_geom_tile_cache(v_rebuild_codes) r;
    v_deleted := v_deleted + COALESCE(v_step_deleted, 0);
    v_inserted := v_inserted + COALESCE(v_step_inserted, 0);
  END IF;
  IF COALESCE(v_delta_count, 0) > 0 THEN
    DELETE FROM landwatch.mv_feature_geom_tile_active c
    USING __lw_cache_tile_features f
    WHERE c.dataset_id = f.dataset_id AND c.feature_id = f.feature_id;
    GET DIAGNOSTICS v_step_deleted = ROW_COUNT;
    v_deleted := v_deleted + COALESCE(v_step_deleted, 0);

    WITH normalized AS (
      SELECT
        a.dataset_id,
        a.feature_id,
        a.geom_id,
        a.version_id,
        landwatch.safe_transform_to_3857(a.geom) AS geom_3857_raw
      FROM __lw_cache_tile_features f
      JOIN landwatch.mv_feature_geom_active a
        ON a.dataset_id = f.dataset_id
       AND a.feature_id = f.feature_id
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
    WHERE n.geom_3857_raw IS NOT NULL
    ON CONFLICT (dataset_id, feature_id) DO UPDATE
    SET geom_id = EXCLUDED.geom_id,
        version_id = EXCLUDED.version_id,
        geom_3857_raw = EXCLUDED.geom_3857_raw,
        geom_3857_s600 = EXCLUDED.geom_3857_s600,
        geom_3857_s300 = EXCLUDED.geom_3857_s300,
        geom_3857_s140 = EXCLUDED.geom_3857_s140,
        geom_3857_s70 = EXCLUDED.geom_3857_s70,
        geom_3857_s35 = EXCLUDED.geom_3857_s35;
    GET DIAGNOSTICS v_step_inserted = ROW_COUNT;
    v_inserted := v_inserted + COALESCE(v_step_inserted, 0);
    ANALYZE landwatch.mv_feature_geom_tile_active;
  END IF;
  v_mode := CASE
    WHEN COALESCE(v_rebuild_count, 0) > 0 AND COALESCE(v_delta_count, 0) > 0 THEN 'delta+cache-dataset-rebuild reason=partial_fallback'
    WHEN COALESCE(v_rebuild_count, 0) > 0 THEN 'cache-dataset-rebuild reason=missing_delta_or_large_delta'
    WHEN COALESCE(v_delta_count, 0) > 0 THEN 'delta'
    ELSE 'delta-noop'
  END;
  RETURN QUERY SELECT v_cache, v_mode, v_deleted, v_inserted, (EXTRACT(EPOCH FROM clock_timestamp() - v_started) * 1000)::bigint;
END;
$$;
