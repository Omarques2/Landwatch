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
    AND c.relname = 'mv_sicar_meta_active';

  SELECT c.relkind
  INTO v_old_relkind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'landwatch'
    AND c.relname = 'mv_sicar_meta_active_old';

  IF v_active_relkind NOT IN ('r', 'p') THEN
    RAISE EXCEPTION
      'Rollback esperado com mv_sicar_meta_active como tabela; relkind atual=%',
      v_active_relkind;
  END IF;

  IF v_old_relkind <> 'm' THEN
    RAISE EXCEPTION
      'Rollback esperado com mv_sicar_meta_active_old como materialized view; relkind atual=%',
      v_old_relkind;
  END IF;

  IF to_regclass('landwatch.mv_sicar_meta_active_bad') IS NOT NULL THEN
    RAISE EXCEPTION 'landwatch.mv_sicar_meta_active_bad ja existe; revise antes de rollback.';
  END IF;
END $$;

BEGIN;

ALTER INDEX IF EXISTS landwatch.idx_mv_sicar_meta_active_pk
  RENAME TO idx_mv_sicar_meta_active_pk_bad;

ALTER TABLE landwatch.mv_sicar_meta_active
  RENAME TO mv_sicar_meta_active_bad;

ALTER MATERIALIZED VIEW landwatch.mv_sicar_meta_active_old
  RENAME TO mv_sicar_meta_active;

ALTER INDEX IF EXISTS landwatch.idx_mv_sicar_meta_active_pk_old
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
      AND pg_get_functiondef(p.oid) ~ 'mv_sicar_meta_active_bad'
  LOOP
    ddl := pg_get_functiondef(r.oid);
    ddl := replace(ddl, 'mv_sicar_meta_active_bad', 'mv_sicar_meta_active');
    EXECUTE ddl;
  END LOOP;
END $$;

COMMIT;

ANALYZE landwatch.mv_sicar_meta_active;
