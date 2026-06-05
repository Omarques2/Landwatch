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


class BulkIngestGeomActiveCacheTest(unittest.TestCase):
    def test_refresh_geom_active_cache_incrementally_when_relation_is_table(self):
        statements = []
        logs = []

        def fake_exec(_conn, query, params=None):
            statements.append((query, params))

        with (
            patch.object(bulk_ingest, "get_conn", return_value=_FakeConn()),
            patch.object(bulk_ingest, "fetch_one", return_value=("r",)),
            patch.object(bulk_ingest, "exec_sql", side_effect=fake_exec),
            patch.object(bulk_ingest, "log_info", side_effect=logs.append),
            patch.object(bulk_ingest.time, "monotonic", side_effect=[10.0, 12.4]),
        ):
            bulk_ingest._refresh_geom_active_cache(["PRODES_A", "DETER_A", "PRODES_A"])

        sql_text = "\n".join(query for query, _params in statements)
        self.assertNotIn("REFRESH MATERIALIZED VIEW landwatch.mv_feature_geom_active", sql_text)
        function_calls = [
            params
            for query, params in statements
            if "landwatch.refresh_feature_geom_active_cache" in query
        ]
        self.assertEqual(function_calls, [(["DETER_A", "PRODES_A"],)])
        self.assertTrue(any("kind=cache" in log and "elapsed=2s" in log for log in logs))
        self.assertTrue(any("datasets=DETER_A,PRODES_A" in log for log in logs))

    def test_refresh_geom_active_uses_materialized_view_fallback_during_transition(self):
        statements = []
        logs = []

        def fake_exec(_conn, query, params=None):
            statements.append((query, params))

        with (
            patch.object(bulk_ingest, "get_conn", return_value=_FakeConn()),
            patch.object(bulk_ingest, "fetch_one", return_value=("m",)),
            patch.object(bulk_ingest, "exec_sql", side_effect=fake_exec),
            patch.object(bulk_ingest, "log_info", side_effect=logs.append),
            patch.object(bulk_ingest.time, "monotonic", side_effect=[20.0, 25.1]),
        ):
            bulk_ingest._refresh_geom_active_cache(["PRODES_A"])

        sql_text = "\n".join(query for query, _params in statements)
        self.assertIn("REFRESH MATERIALIZED VIEW landwatch.mv_feature_geom_active", sql_text)
        self.assertNotIn("landwatch.refresh_feature_geom_active_cache", sql_text)
        self.assertTrue(any("kind=mv" in log and "elapsed=5s" in log for log in logs))

    def test_refresh_mvs_updates_geom_first_and_tile_last(self):
        order = []

        with (
            patch.object(
                bulk_ingest,
                "_refresh_geom_active_cache",
                side_effect=lambda codes: order.append(("geom", list(codes or []))),
            ),
            patch.object(
                bulk_ingest,
                "_refresh_active_attrs_cache",
                side_effect=lambda codes: order.append(("attrs", list(codes or []))),
            ),
            patch.object(
                bulk_ingest,
                "_refresh_tooltip_cache",
                side_effect=lambda codes: order.append(("tooltip", list(codes or []))),
            ),
            patch.object(
                bulk_ingest,
                "_refresh_sicar_meta_cache",
                side_effect=lambda codes: order.append(("sicar", list(codes or []))),
            ),
            patch.object(
                bulk_ingest,
                "_refresh_materialized_view",
                side_effect=lambda view: order.append(("mv", view)),
            ),
            patch.object(
                bulk_ingest,
                "_refresh_tile_cache",
                side_effect=lambda codes: order.append(("tile", list(codes or []))),
            ),
        ):
            ok = bulk_ingest._refresh_mvs(["PRODES_A"])

        self.assertTrue(ok)
        self.assertEqual(
            order,
            [
                ("geom", ["PRODES_A"]),
                ("attrs", ["PRODES_A"]),
                ("tooltip", ["PRODES_A"]),
                ("sicar", ["PRODES_A"]),
                ("mv", "landwatch.mv_indigena_phase_active"),
                ("mv", "landwatch.mv_ucs_sigla_active"),
                ("tile", ["PRODES_A"]),
            ],
        )


if __name__ == "__main__":
    unittest.main()
