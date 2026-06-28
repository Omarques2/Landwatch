from pathlib import Path

ROOT = Path(__file__).resolve().parent


def _ingest_sql() -> str:
    return (ROOT / "ingest.sql").read_text(encoding="utf-8")


def test_ingest_sql_has_no_wkt_roundtrip():
    sql = _ingest_sql()
    # P1: geometria não passa mais por texto WKT no ingest.sql.
    assert "geom_wkt" not in sql
    assert "safe_geom_from_wkt" not in sql
    assert "ST_GeomFromText" not in sql


def test_ingest_sql_joins_geom_from_stg_payload_by_row_id():
    sql = _ingest_sql()
    # P3: geom entra só após o dedup, via join por row_id (fora do sort).
    assert "JOIN {{STG_TABLE}} p ON p.row_id = r.row_id" in sql


def test_ingest_sql_delegates_geom_processing_to_placeholder():
    sql = _ingest_sql()
    # O hashing/makevalid da geom continua delegado ao {{GEOM_SQL}} (build_geom_sql).
    assert "{{GEOM_SQL}}" in sql


def test_ingest_sql_indexes_diff_temp_tables():
    sql = _ingest_sql()
    for t in (
        "__new_features",
        "__changed_features",
        "__geom_changed_features",
        "__attr_changed_features",
        "__tooltip_changed_features",
        "__disappeared",
    ):
        assert f"CREATE INDEX ON {t}(feature_id)" in sql, t


def test_ingest_sql_analyzes_join_temps():
    sql = _ingest_sql()
    for t in ("__stg_map", "__prev_state", "__new_features", "__changed_features"):
        assert f"ANALYZE {t}" in sql, t


def test_no_placeholder_inside_comments():
    # run_ingest_sql faz str.replace do placeholder por SQL multi-linha e depois
    # remove linhas que começam com '--'. Se um {{PLACEHOLDER}} estiver DENTRO de
    # um comentário, o replace injeta SQL no comentário e o strip só apaga a 1a
    # linha — o resto vira lixo executável (causou `syntax error at "."` no gate).
    for line in _ingest_sql().splitlines():
        if line.strip().startswith("--"):
            assert "{{" not in line, f"placeholder em comentario: {line!r}"


def test_rendered_sql_has_no_orphan_punctuation():
    import bulk_ingest as b

    tmpl = _ingest_sql()
    for is_spatial in (True, False):
        t = tmpl
        for k, v in {
            "{{STG_TABLE}}": "landwatch.stg_payload",
            "{{ATTR_COMPARE_JSON_SQL}}": b.build_attr_compare_json_sql("s.payload"),
            "{{FEATURE_KEY_FALLBACK_SQL}}": b.build_feature_key_fallback_sql("s.payload"),
            "{{TOOLTIP_JSON_SQL}}": b.build_tooltip_json_sql("s.payload"),
            "{{DOC_DATE_SQL}}": b.build_doc_date_sql(None, None),
            "{{GEOM_SQL}}": b.build_geom_sql(4674, is_spatial),
        }.items():
            t = t.replace(k, v)
        cleaned = "\n".join(
            ln for ln in t.splitlines() if not ln.strip().startswith("--")
        )
        assert "{{" not in cleaned
        for ln in cleaned.splitlines():
            assert ln.strip() not in (".", ";", ".;", ";."), f"linha orfa: {ln!r}"


def test_ingest_sql_keeps_delta_semantics():
    # Garante que a otimização não removeu a lógica de delta existente.
    sql = _ingest_sql()
    for token in (
        "'NEW'",
        "'CHANGED'",
        "'DISAPPEARED'",
        "attr_compare_hash",
        "tooltip_hash",
        "CREATE TEMP TABLE __geom_changed_features",
    ):
        assert token in sql, token
