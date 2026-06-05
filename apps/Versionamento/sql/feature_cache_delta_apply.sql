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
    SELECT r.deleted_count, r.inserted_count
      INTO v_deleted, v_inserted
    FROM landwatch.refresh_feature_geom_active_cache(v_dataset_codes) r;
    RETURN QUERY SELECT 'landwatch.mv_feature_geom_active'::text, v_mode, COALESCE(v_deleted, 0), COALESCE(v_inserted, 0), (EXTRACT(EPOCH FROM clock_timestamp() - v_started) * 1000)::bigint;

    v_started := clock_timestamp();
    SELECT r.deleted_count, r.inserted_count
      INTO v_deleted, v_inserted
    FROM landwatch.refresh_feature_active_attrs_light_cache(v_dataset_codes) r;
    RETURN QUERY SELECT 'landwatch.mv_feature_active_attrs_light'::text, v_mode, COALESCE(v_deleted, 0), COALESCE(v_inserted, 0), (EXTRACT(EPOCH FROM clock_timestamp() - v_started) * 1000)::bigint;

    v_started := clock_timestamp();
    SELECT r.deleted_count, r.inserted_count
      INTO v_deleted, v_inserted
    FROM landwatch.refresh_feature_tooltip_active_cache(v_dataset_codes) r;
    RETURN QUERY SELECT 'landwatch.mv_feature_tooltip_active'::text, v_mode, COALESCE(v_deleted, 0), COALESCE(v_inserted, 0), (EXTRACT(EPOCH FROM clock_timestamp() - v_started) * 1000)::bigint;

    v_started := clock_timestamp();
    SELECT r.deleted_count, r.inserted_count
      INTO v_deleted, v_inserted
    FROM landwatch.refresh_sicar_meta_cache(v_dataset_codes) r;
    RETURN QUERY SELECT 'landwatch.mv_sicar_meta_active'::text, v_mode, COALESCE(v_deleted, 0), COALESCE(v_inserted, 0), (EXTRACT(EPOCH FROM clock_timestamp() - v_started) * 1000)::bigint;

    v_started := clock_timestamp();
    SELECT r.deleted_count, r.inserted_count
      INTO v_deleted, v_inserted
    FROM landwatch.refresh_feature_geom_tile_cache(v_dataset_codes) r;
    RETURN QUERY SELECT 'landwatch.mv_feature_geom_tile_active'::text, v_mode, COALESCE(v_deleted, 0), COALESCE(v_inserted, 0), (EXTRACT(EPOCH FROM clock_timestamp() - v_started) * 1000)::bigint;
    RETURN;
  END IF;

  DROP TABLE IF EXISTS pg_temp.__lw_cache_scope;
  CREATE TEMP TABLE __lw_cache_scope ON COMMIT DROP AS
  SELECT DISTINCT
    v.version_id,
    v.dataset_id,
    d.code AS dataset_code
  FROM landwatch.lw_dataset_version v
  JOIN landwatch.lw_dataset d ON d.dataset_id = v.dataset_id
  WHERE v.version_id = ANY(v_version_ids)
    AND (
      COALESCE(array_length(v_dataset_codes, 1), 0) = 0
      OR d.code = ANY(v_dataset_codes)
    );

  DROP TABLE IF EXISTS pg_temp.__lw_cache_rebuild_datasets;
  CREATE TEMP TABLE __lw_cache_rebuild_datasets ON COMMIT DROP AS
  WITH per_dataset AS (
    SELECT
      s.dataset_id,
      s.dataset_code,
      bool_or(NOT EXISTS (
        SELECT 1
        FROM landwatch.lw_feature_delta fd
        WHERE fd.version_id = s.version_id
      )) AS missing_delta,
      count(DISTINCT fd.feature_id)::bigint AS delta_count,
      (
        SELECT count(*)::bigint
        FROM landwatch.lw_feature_state fs
        WHERE fs.dataset_id = s.dataset_id
          AND fs.is_present = TRUE
      ) AS active_count
    FROM __lw_cache_scope s
    LEFT JOIN landwatch.lw_feature_delta fd
      ON fd.version_id = s.version_id
     AND fd.dataset_id = s.dataset_id
    GROUP BY s.dataset_id, s.dataset_code
  )
  SELECT
    dataset_id,
    dataset_code,
    CASE
      WHEN missing_delta THEN 'missing_delta'
      ELSE 'large_delta'
    END AS reason
  FROM per_dataset
  WHERE missing_delta
     OR (
       delta_count > 0
       AND CASE
         WHEN active_count <= 0 THEN TRUE
         ELSE (delta_count::numeric / active_count::numeric) > COALESCE(p_max_delta_ratio, 0.35)
       END
     );

  DROP TABLE IF EXISTS pg_temp.__lw_cache_delta_features;
  CREATE TEMP TABLE __lw_cache_delta_features ON COMMIT DROP AS
  SELECT DISTINCT
    fd.dataset_id,
    s.dataset_code,
    fd.feature_id
  FROM landwatch.lw_feature_delta fd
  JOIN __lw_cache_scope s
    ON s.version_id = fd.version_id
   AND s.dataset_id = fd.dataset_id
  LEFT JOIN __lw_cache_rebuild_datasets rb
    ON rb.dataset_id = fd.dataset_id
  WHERE rb.dataset_id IS NULL;

  CREATE INDEX ON __lw_cache_delta_features(dataset_id, feature_id);

  SELECT array_agg(dataset_code ORDER BY dataset_code), count(*)
  INTO v_rebuild_codes, v_rebuild_count
  FROM __lw_cache_rebuild_datasets;

  SELECT count(*)
  INTO v_delta_count
  FROM __lw_cache_delta_features;

  IF COALESCE(v_rebuild_count, 0) > 0 AND COALESCE(v_delta_count, 0) > 0 THEN
    v_mode := 'delta+cache-dataset-rebuild reason=partial_fallback';
  ELSIF COALESCE(v_rebuild_count, 0) > 0 THEN
    v_mode := 'cache-dataset-rebuild reason=missing_delta_or_large_delta';
  ELSIF COALESCE(v_delta_count, 0) > 0 THEN
    v_mode := 'delta';
  ELSE
    v_mode := 'delta-noop';
  END IF;

  -- 1) Geometria ativa
  v_started := clock_timestamp();
  v_deleted := 0;
  v_inserted := 0;
  IF COALESCE(v_rebuild_count, 0) > 0 THEN
    SELECT r.deleted_count, r.inserted_count
      INTO v_step_deleted, v_step_inserted
    FROM landwatch.refresh_feature_geom_active_cache(v_rebuild_codes) r;
    v_deleted := v_deleted + COALESCE(v_step_deleted, 0);
    v_inserted := v_inserted + COALESCE(v_step_inserted, 0);
  END IF;
  IF COALESCE(v_delta_count, 0) > 0 THEN
    DELETE FROM landwatch.mv_feature_geom_active c
    USING __lw_cache_delta_features f
    WHERE c.dataset_id = f.dataset_id
      AND c.feature_id = f.feature_id;
    GET DIAGNOSTICS v_step_deleted = ROW_COUNT;
    v_deleted := v_deleted + COALESCE(v_step_deleted, 0);

    INSERT INTO landwatch.mv_feature_geom_active (
      dataset_id, feature_id, geom_id, version_id, geom
    )
    SELECT
      h.dataset_id,
      h.feature_id,
      h.geom_id,
      h.version_id,
      g.geom
    FROM __lw_cache_delta_features f
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
  RETURN QUERY SELECT 'landwatch.mv_feature_geom_active'::text, v_mode, v_deleted, v_inserted, (EXTRACT(EPOCH FROM clock_timestamp() - v_started) * 1000)::bigint;

  -- 2) Atributos leves
  v_started := clock_timestamp();
  v_deleted := 0;
  v_inserted := 0;
  IF COALESCE(v_rebuild_count, 0) > 0 THEN
    SELECT r.deleted_count, r.inserted_count
      INTO v_step_deleted, v_step_inserted
    FROM landwatch.refresh_feature_active_attrs_light_cache(v_rebuild_codes) r;
    v_deleted := v_deleted + COALESCE(v_step_deleted, 0);
    v_inserted := v_inserted + COALESCE(v_step_inserted, 0);
  END IF;
  IF COALESCE(v_delta_count, 0) > 0 THEN
    DELETE FROM landwatch.mv_feature_active_attrs_light c
    USING __lw_cache_delta_features f
    WHERE c.dataset_id = f.dataset_id
      AND c.feature_id = f.feature_id;
    GET DIAGNOSTICS v_step_deleted = ROW_COUNT;
    v_deleted := v_deleted + COALESCE(v_step_deleted, 0);

    INSERT INTO landwatch.mv_feature_active_attrs_light (
      dataset_id, dataset_code, feature_id, feature_key, geom_id
    )
    SELECT
      lf.dataset_id,
      d.code AS dataset_code,
      lf.feature_id,
      lf.feature_key,
      a.geom_id
    FROM __lw_cache_delta_features f
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
  RETURN QUERY SELECT 'landwatch.mv_feature_active_attrs_light'::text, v_mode, v_deleted, v_inserted, (EXTRACT(EPOCH FROM clock_timestamp() - v_started) * 1000)::bigint;

  -- 3) Tooltip
  v_started := clock_timestamp();
  v_deleted := 0;
  v_inserted := 0;
  IF COALESCE(v_rebuild_count, 0) > 0 THEN
    SELECT r.deleted_count, r.inserted_count
      INTO v_step_deleted, v_step_inserted
    FROM landwatch.refresh_feature_tooltip_active_cache(v_rebuild_codes) r;
    v_deleted := v_deleted + COALESCE(v_step_deleted, 0);
    v_inserted := v_inserted + COALESCE(v_step_inserted, 0);
  END IF;
  IF COALESCE(v_delta_count, 0) > 0 THEN
    DELETE FROM landwatch.mv_feature_tooltip_active c
    USING __lw_cache_delta_features f
    WHERE c.dataset_id = f.dataset_id
      AND c.feature_id = f.feature_id;
    GET DIAGNOSTICS v_step_deleted = ROW_COUNT;
    v_deleted := v_deleted + COALESCE(v_step_deleted, 0);

    INSERT INTO landwatch.mv_feature_tooltip_active (
      dataset_id, feature_id, display_name, natural_id
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
    FROM __lw_cache_delta_features f
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
  RETURN QUERY SELECT 'landwatch.mv_feature_tooltip_active'::text, v_mode, v_deleted, v_inserted, (EXTRACT(EPOCH FROM clock_timestamp() - v_started) * 1000)::bigint;

  -- 4) Metadados SICAR
  v_started := clock_timestamp();
  v_deleted := 0;
  v_inserted := 0;
  IF COALESCE(v_rebuild_count, 0) > 0 THEN
    SELECT r.deleted_count, r.inserted_count
      INTO v_step_deleted, v_step_inserted
    FROM landwatch.refresh_sicar_meta_cache(v_rebuild_codes) r;
    v_deleted := v_deleted + COALESCE(v_step_deleted, 0);
    v_inserted := v_inserted + COALESCE(v_step_inserted, 0);
  END IF;
  IF COALESCE(v_delta_count, 0) > 0 THEN
    DELETE FROM landwatch.mv_sicar_meta_active c
    USING __lw_cache_delta_features f
    WHERE c.dataset_id = f.dataset_id
      AND c.feature_id = f.feature_id;
    GET DIAGNOSTICS v_step_deleted = ROW_COUNT;
    v_deleted := v_deleted + COALESCE(v_step_deleted, 0);

    INSERT INTO landwatch.mv_sicar_meta_active (
      dataset_id, dataset_code, feature_id, pack_json
    )
    SELECT
      d.dataset_id,
      d.code AS dataset_code,
      h.feature_id,
      p.pack_json
    FROM __lw_cache_delta_features f
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
  RETURN QUERY SELECT 'landwatch.mv_sicar_meta_active'::text, v_mode, v_deleted, v_inserted, (EXTRACT(EPOCH FROM clock_timestamp() - v_started) * 1000)::bigint;

  -- 5) Geometria para tiles
  v_started := clock_timestamp();
  v_deleted := 0;
  v_inserted := 0;
  IF COALESCE(v_rebuild_count, 0) > 0 THEN
    SELECT r.deleted_count, r.inserted_count
      INTO v_step_deleted, v_step_inserted
    FROM landwatch.refresh_feature_geom_tile_cache(v_rebuild_codes) r;
    v_deleted := v_deleted + COALESCE(v_step_deleted, 0);
    v_inserted := v_inserted + COALESCE(v_step_inserted, 0);
  END IF;
  IF COALESCE(v_delta_count, 0) > 0 THEN
    DELETE FROM landwatch.mv_feature_geom_tile_active c
    USING __lw_cache_delta_features f
    WHERE c.dataset_id = f.dataset_id
      AND c.feature_id = f.feature_id;
    GET DIAGNOSTICS v_step_deleted = ROW_COUNT;
    v_deleted := v_deleted + COALESCE(v_step_deleted, 0);

    WITH normalized AS (
      SELECT
        a.dataset_id,
        a.feature_id,
        a.geom_id,
        a.version_id,
        landwatch.safe_transform_to_3857(a.geom) AS geom_3857_raw
      FROM __lw_cache_delta_features f
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
  RETURN QUERY SELECT 'landwatch.mv_feature_geom_tile_active'::text, v_mode, v_deleted, v_inserted, (EXTRACT(EPOCH FROM clock_timestamp() - v_started) * 1000)::bigint;
END;
$$;
