SET search_path TO landwatch, app, public, pg_catalog;

DROP FUNCTION IF EXISTS landwatch.refresh_feature_caches_delta(bigint[], text[], numeric);

-- A tabela de delta fica preservada por padrão para auditoria e diagnóstico.
-- Se precisar de rollback total da estrutura, execute manualmente:
-- DROP TABLE IF EXISTS landwatch.lw_feature_delta;
