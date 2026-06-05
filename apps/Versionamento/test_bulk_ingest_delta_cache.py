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


class BulkIngestDeltaCacheTest(unittest.TestCase):
    def test_refresh_mvs_uses_delta_orchestrator_when_version_ids_are_available(self):
        statements = []
        logs = []

        def fake_exec(_conn, query, params=None):
            statements.append((query, params))

        def fake_fetch_all(_conn, query, params=None):
            statements.append((query, params))
            return [
                ("landwatch.mv_feature_geom_active", "delta", 10, 9, 4200),
            ]

        with (
            patch.object(bulk_ingest, "get_conn", return_value=_FakeConn()),
            patch.object(bulk_ingest, "fetch_one", return_value=("r",)),
            patch.object(bulk_ingest, "exec_sql", side_effect=fake_exec),
            patch.object(bulk_ingest, "fetch_all", side_effect=fake_fetch_all),
            patch.object(bulk_ingest, "_refresh_materialized_view", return_value=None),
            patch.object(bulk_ingest, "log_info", side_effect=logs.append),
            patch.object(bulk_ingest.time, "monotonic", side_effect=[10.0, 14.2]),
        ):
            ok = bulk_ingest._refresh_mvs(["PRODES_A", "PRODES_A"], [123, 124])

        self.assertTrue(ok)
        sql_text = "\n".join(query for query, _params in statements)
        self.assertIn("landwatch.refresh_feature_caches_delta", sql_text)
        self.assertNotIn("refresh_feature_geom_active_cache", sql_text)
        self.assertNotIn("refresh_feature_geom_tile_cache", sql_text)
        self.assertEqual(statements[0][1][0], [123, 124])
        self.assertEqual(statements[0][1][1], ["PRODES_A"])
        self.assertTrue(any("kind=delta" in log and "versions=123,124" in log for log in logs))

    def test_refresh_mvs_falls_back_to_existing_cache_functions_without_version_ids(self):
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
            ok = bulk_ingest._refresh_mvs(["PRODES_A"], [])

        self.assertTrue(ok)
        self.assertEqual(order[0], ("geom", ["PRODES_A"]))
        self.assertEqual(order[-1], ("tile", ["PRODES_A"]))


if __name__ == "__main__":
    unittest.main()
