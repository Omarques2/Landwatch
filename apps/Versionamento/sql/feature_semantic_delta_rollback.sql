SET search_path TO landwatch, app, public, pg_catalog;

-- Rollback leve: remove orquestrador semântico. Colunas novas e delta_run ficam
-- preservados para auditoria e para evitar perda de informação de versionamento.
DROP FUNCTION IF EXISTS landwatch.refresh_feature_caches_delta(bigint[], text[], numeric);
DROP FUNCTION IF EXISTS landwatch.attr_compare_json(jsonb);
DROP FUNCTION IF EXISTS landwatch.tooltip_identity_json(jsonb);

-- Se precisar rollback destrutivo, execute manualmente após backup:
-- ALTER TABLE landwatch.lw_feature_delta DROP COLUMN IF EXISTS tooltip_changed;
-- ALTER TABLE landwatch.lw_feature_state DROP COLUMN IF EXISTS attr_compare_hash;
-- ALTER TABLE landwatch.lw_feature_state DROP COLUMN IF EXISTS tooltip_hash;
-- DROP TABLE IF EXISTS landwatch.lw_feature_delta_run;
