from pathlib import Path


ROOT = Path(__file__).resolve().parent


def test_ingest_sql_persists_feature_delta_actions():
    sql = (ROOT / "ingest.sql").read_text(encoding="utf-8")

    assert "DELETE FROM landwatch.lw_feature_delta" in sql
    assert "landwatch.lw_feature_delta_run" in sql
    assert "'NEW'" in sql
    assert "'CHANGED'" in sql
    assert "'DISAPPEARED'" in sql
    assert "geom_changed" in sql
    assert "attr_changed" in sql
    assert "tooltip_changed" in sql


def test_ingest_sql_uses_semantic_attr_hash_and_split_change_scopes():
    sql = (ROOT / "ingest.sql").read_text(encoding="utf-8")

    assert "attr_compare_hash" in sql
    assert "tooltip_hash" in sql
    assert "{{ATTR_COMPARE_JSON_SQL}}" in sql
    assert "{{FEATURE_KEY_FALLBACK_SQL}}" in sql
    assert "{{TOOLTIP_JSON_SQL}}" in sql
    assert "CREATE TEMP TABLE __geom_changed_features" in sql
    assert "CREATE TEMP TABLE __attr_changed_features" in sql
    assert "CREATE TEMP TABLE __tooltip_changed_features" in sql
    assert "FROM __geom_changed_features c" in sql
    assert "FROM __attr_changed_features c" in sql


def test_delta_apply_sql_creates_delta_table_and_orchestrator():
    sql = (ROOT / "sql" / "feature_cache_delta_apply.sql").read_text(encoding="utf-8")

    assert "CREATE TABLE IF NOT EXISTS landwatch.lw_feature_delta" in sql
    assert "CREATE TABLE IF NOT EXISTS landwatch.lw_feature_delta_run" in sql
    assert "CREATE OR REPLACE FUNCTION landwatch.refresh_feature_caches_delta" in sql
    assert "refresh_feature_geom_active_cache" in sql
    assert "mv_feature_geom_active" in sql
    assert "mv_feature_active_attrs_light" in sql
    assert "mv_feature_tooltip_active" in sql
    assert "mv_sicar_meta_active" in sql
    assert "mv_feature_geom_tile_active" in sql
    assert "ON CONFLICT (dataset_id, feature_id) DO UPDATE" in sql


def test_semantic_delta_migration_adds_columns_and_scoped_cache_delta():
    sql = (ROOT / "sql" / "feature_semantic_delta_apply.sql").read_text(encoding="utf-8")

    assert "ALTER TABLE landwatch.lw_feature_state" in sql
    assert "attr_compare_hash" in sql
    assert "tooltip_hash" in sql
    assert "ALTER TABLE landwatch.lw_feature_delta" in sql
    assert "CREATE TABLE IF NOT EXISTS landwatch.lw_feature_delta_run" in sql
    assert "missing_delta_run" in sql
    assert "tooltip_changed" in sql
    assert "CREATE TEMP TABLE __lw_cache_geom_features" in sql
    assert "CREATE TEMP TABLE __lw_cache_attrs_light_features" in sql
    assert "CREATE TEMP TABLE __lw_cache_tooltip_features" in sql
    assert "CREATE TEMP TABLE __lw_cache_sicar_features" in sql
    assert "CREATE TEMP TABLE __lw_cache_tile_features" in sql
    assert "WHERE f.cache_name = 'landwatch.mv_feature_geom_active'" in sql
    assert "WHERE r.cache_name = v_cache" in sql
    assert "WHERE cache_name = 'landwatch.mv_feature_geom_active'" not in sql
    assert "FROM __lw_cache_rebuild_scope WHERE cache_name = v_cache" not in sql
