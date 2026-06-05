SET search_path TO landwatch, app, public, pg_catalog;

DO $$
DECLARE
  v_active_relkind "char";
  v_old_relkind "char";
BEGIN
  SELECT c.relkind
  INTO v_active_relkind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'landwatch'
    AND c.relname = 'mv_feature_geom_tile_active';

  SELECT c.relkind
  INTO v_old_relkind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'landwatch'
    AND c.relname = 'mv_feature_geom_tile_active_old';

  IF v_active_relkind NOT IN ('r', 'p') THEN
    RAISE EXCEPTION
      'Rollback esperado com mv_feature_geom_tile_active como tabela; relkind atual=%',
      v_active_relkind;
  END IF;

  IF v_old_relkind <> 'm' THEN
    RAISE EXCEPTION
      'Rollback esperado com mv_feature_geom_tile_active_old como materialized view; relkind atual=%',
      v_old_relkind;
  END IF;

  IF to_regclass('landwatch.mv_feature_geom_tile_active_bad') IS NOT NULL THEN
    RAISE EXCEPTION 'landwatch.mv_feature_geom_tile_active_bad ja existe; revise antes de rollback.';
  END IF;
END $$;

BEGIN;

ALTER INDEX IF EXISTS landwatch.idx_mv_feature_geom_tile_active_pk
  RENAME TO idx_mv_feature_geom_tile_active_pk_bad;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_geom_tile_active_geom_id
  RENAME TO idx_mv_feature_geom_tile_active_geom_id_bad;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_geom_tile_active_geom_raw
  RENAME TO idx_mv_feature_geom_tile_active_geom_raw_bad;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_geom_tile_active_geom_s600
  RENAME TO idx_mv_feature_geom_tile_active_geom_s600_bad;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_geom_tile_active_geom_s300
  RENAME TO idx_mv_feature_geom_tile_active_geom_s300_bad;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_geom_tile_active_geom_s140
  RENAME TO idx_mv_feature_geom_tile_active_geom_s140_bad;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_geom_tile_active_geom_s70
  RENAME TO idx_mv_feature_geom_tile_active_geom_s70_bad;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_geom_tile_active_geom_s35
  RENAME TO idx_mv_feature_geom_tile_active_geom_s35_bad;

ALTER TABLE landwatch.mv_feature_geom_tile_active
  RENAME TO mv_feature_geom_tile_active_bad;
ALTER MATERIALIZED VIEW landwatch.mv_feature_geom_tile_active_old
  RENAME TO mv_feature_geom_tile_active;

ALTER INDEX IF EXISTS landwatch.idx_mv_feature_geom_tile_active_pk_old
  RENAME TO idx_mv_feature_geom_tile_active_pk;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_geom_tile_active_geom_id_old
  RENAME TO idx_mv_feature_geom_tile_active_geom_id;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_geom_tile_active_geom_raw_old
  RENAME TO idx_mv_feature_geom_tile_active_geom_raw;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_geom_tile_active_geom_s600_old
  RENAME TO idx_mv_feature_geom_tile_active_geom_s600;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_geom_tile_active_geom_s300_old
  RENAME TO idx_mv_feature_geom_tile_active_geom_s300;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_geom_tile_active_geom_s140_old
  RENAME TO idx_mv_feature_geom_tile_active_geom_s140;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_geom_tile_active_geom_s70_old
  RENAME TO idx_mv_feature_geom_tile_active_geom_s70;
ALTER INDEX IF EXISTS landwatch.idx_mv_feature_geom_tile_active_geom_s35_old
  RENAME TO idx_mv_feature_geom_tile_active_geom_s35;

COMMIT;

ANALYZE landwatch.mv_feature_geom_tile_active;
