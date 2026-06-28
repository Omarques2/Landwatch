import unittest
from unittest.mock import patch

import bulk_ingest


class _FakeIdentifier:
    def __init__(self, name: str):
        self.name = name

    def as_string(self, _conn):
        return f'"{self.name}"'


class StgPayloadGeomPassthroughTest(unittest.TestCase):
    def _shp_query(self, natural_id_col=None):
        conn = object()
        with (
            patch.object(bulk_ingest, "drop_table"),
            patch.object(bulk_ingest, "resolve_stg_column", return_value=natural_id_col),
            patch.object(bulk_ingest, "exec_sql") as exec_sql_mock,
            patch.object(
                bulk_ingest.sql, "Identifier", side_effect=lambda n: _FakeIdentifier(n)
            ),
        ):
            bulk_ingest.create_stg_payload_from_raw_shp(conn, natural_id_col)
        return "".join(c.args[1] for c in exec_sql_mock.call_args_list)

    def _csv_query(self, geom_col=None, srid=4674):
        conn = object()
        with (
            patch.object(bulk_ingest, "drop_table"),
            patch.object(bulk_ingest, "exec_sql") as exec_sql_mock,
            patch.object(
                bulk_ingest.sql, "Identifier", side_effect=lambda n: _FakeIdentifier(n)
            ),
        ):
            bulk_ingest.create_stg_payload_from_raw_csv(conn, geom_col, srid)
        return "".join(c.args[1] for c in exec_sql_mock.call_args_list)

    def test_shp_payload_carries_geometry_not_wkt(self):
        q = self._shp_query(natural_id_col=None)
        self.assertIn("t.geom AS geom", q)
        self.assertNotIn("ST_AsText", q)
        self.assertNotIn("geom_wkt", q)

    def test_csv_payload_parses_wkt_to_geometry_with_same_safe_fn(self):
        q = self._csv_query(geom_col="wkt", srid=4674)
        self.assertIn("safe_geom_from_wkt", q)  # mesma função/comportamento de hoje
        self.assertIn("4674", q)  # mesmo SRID do run_ingest_sql
        self.assertIn("AS geom", q)
        self.assertNotIn("geom_wkt", q)

    def test_csv_payload_without_geom_col_is_null_geometry(self):
        q = self._csv_query(geom_col=None)
        self.assertIn("NULL::geometry AS geom", q)
        self.assertNotIn("geom_wkt", q)

    def test_build_geom_sql_has_no_wkt_parse(self):
        g = bulk_ingest.build_geom_sql(4674, True)
        self.assertNotIn("safe_geom_from_wkt", g)
        self.assertNotIn("geom_wkt", g)
        self.assertNotIn("ST_GeomFromText", g)
        self.assertIn("md5(encode(ST_AsBinary(geom), 'hex'))", g)
        self.assertIn("ST_MakeValid(geom)", g)

    def test_build_geom_sql_non_spatial_nulls_geom(self):
        g = bulk_ingest.build_geom_sql(4674, False)
        self.assertIn("geom = NULL", g)
        self.assertIn("geom_hash = NULL", g)


if __name__ == "__main__":
    unittest.main()
