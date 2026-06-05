import sys
import types
import unittest
from unittest.mock import patch

if "psycopg2" not in sys.modules:
    psycopg2_stub = types.ModuleType("psycopg2")
    psycopg2_stub.OperationalError = RuntimeError
    psycopg2_stub.InterfaceError = RuntimeError
    psycopg2_stub.connect = lambda **_kwargs: None
    psycopg2_stub.sql = types.SimpleNamespace(Identifier=lambda name: name)
    sys.modules["psycopg2"] = psycopg2_stub
    sys.modules["psycopg2.sql"] = psycopg2_stub.sql

import bulk_ingest


class _FakeConn:
    autocommit = False

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class BulkIngestTileCacheTest(unittest.TestCase):
    def test_refresh_mvs_updates_tile_cache_incrementally_when_relation_is_table(self):
        statements = []

        def fake_exec(_conn, query, params=None):
            statements.append((query, params))

        with (
            patch.object(bulk_ingest, "get_conn", return_value=_FakeConn()),
            patch.object(bulk_ingest, "fetch_one", return_value=("r",)),
            patch.object(bulk_ingest, "exec_sql", side_effect=fake_exec),
            patch.object(bulk_ingest.time, "sleep"),
        ):
            bulk_ingest._refresh_mvs(["PRODES_A", "DETER_A"])

        sql_text = "\n".join(query for query, _params in statements)
        self.assertNotIn("REFRESH MATERIALIZED VIEW landwatch.mv_feature_geom_tile_active", sql_text)
        function_calls = [
            params
            for query, params in statements
            if "landwatch.refresh_feature_geom_tile_cache" in query
        ]
        self.assertEqual(function_calls, [(["DETER_A", "PRODES_A"],)])
        self.assertIn("landwatch.refresh_feature_geom_active_cache", sql_text)

    def test_refresh_mvs_uses_materialized_view_fallback_during_transition(self):
        statements = []

        def fake_exec(_conn, query, params=None):
            statements.append((query, params))

        with (
            patch.object(bulk_ingest, "get_conn", return_value=_FakeConn()),
            patch.object(bulk_ingest, "fetch_one", return_value=("m",)),
            patch.object(bulk_ingest, "exec_sql", side_effect=fake_exec),
            patch.object(bulk_ingest.time, "sleep"),
        ):
            bulk_ingest._refresh_mvs(["PRODES_A"])

        sql_text = "\n".join(query for query, _params in statements)
        self.assertIn("REFRESH MATERIALIZED VIEW landwatch.mv_feature_geom_tile_active", sql_text)
        self.assertNotIn("landwatch.refresh_feature_geom_tile_cache", sql_text)


if __name__ == "__main__":
    unittest.main()
