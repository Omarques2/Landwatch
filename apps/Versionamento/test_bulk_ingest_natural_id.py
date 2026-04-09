import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import bulk_ingest


class _FakeIdentifier:
    def __init__(self, name: str):
        self.name = name

    def as_string(self, _conn):
        return f'"{self.name}"'


class BulkIngestNaturalIdTest(unittest.TestCase):
    def test_create_stg_payload_uses_natural_id_column_as_feature_key_override(self):
        conn = object()
        with (
            patch.object(bulk_ingest, "drop_table") as drop_table_mock,
            patch.object(
                bulk_ingest,
                "resolve_stg_column",
                return_value="cnuc_code",
            ),
            patch.object(bulk_ingest, "exec_sql") as exec_sql_mock,
            patch.object(
                bulk_ingest.sql,
                "Identifier",
                side_effect=lambda name: _FakeIdentifier(name),
            ),
        ):
            bulk_ingest.create_stg_payload_from_raw_shp(conn, "cnuc_code")

        drop_table_mock.assert_called_once_with(conn, "landwatch.stg_payload")
        query = exec_sql_mock.call_args.args[1]
        self.assertIn(
            't."cnuc_code"::text AS feature_key_override',
            query,
        )

    def test_create_stg_payload_falls_back_to_hash_when_natural_id_column_not_found(self):
        conn = object()
        with (
            patch.object(bulk_ingest, "drop_table"),
            patch.object(bulk_ingest, "resolve_stg_column", return_value=None),
            patch.object(bulk_ingest, "exec_sql") as exec_sql_mock,
            patch.object(bulk_ingest, "log_warn") as log_warn_mock,
        ):
            bulk_ingest.create_stg_payload_from_raw_shp(conn, "cnuc_code")

        query = exec_sql_mock.call_args.args[1]
        self.assertIn("NULL::text AS feature_key_override", query)
        log_warn_mock.assert_called_once()
        self.assertIn("natural_id_col 'cnuc_code'", log_warn_mock.call_args.args[0])

    def test_detect_shp_encoding_uses_cpg_when_present(self):
        with tempfile.TemporaryDirectory(prefix="bulk_ingest_encoding_") as tmp:
            shp = Path(tmp) / "ucs.shp"
            shp.write_bytes(b"")
            shp.with_suffix(".cpg").write_text("UTF-8\n", encoding="utf-8")
            with patch.object(bulk_ingest, "OGR2OGR_ENCODING", "LATIN1"):
                encoding, source = bulk_ingest.detect_shp_encoding(shp)
        self.assertEqual(encoding, "UTF-8")
        self.assertEqual(source, "cpg:ucs.cpg")

    def test_detect_shp_encoding_falls_back_to_env_when_cpg_missing(self):
        with tempfile.TemporaryDirectory(prefix="bulk_ingest_encoding_") as tmp:
            shp = Path(tmp) / "ucs.shp"
            shp.write_bytes(b"")
            with patch.object(bulk_ingest, "OGR2OGR_ENCODING", "LATIN1"):
                encoding, source = bulk_ingest.detect_shp_encoding(shp)
        self.assertEqual(encoding, "ISO-8859-1")
        self.assertEqual(source, "env:LANDWATCH_OGR2OGR_ENCODING")

    def test_build_ogr_cmd_omits_encoding_override_when_not_set(self):
        shp = Path("C:/tmp/ucs.shp")
        with (
            patch.object(bulk_ingest, "resolve_ogr2ogr", return_value="ogr2ogr"),
            patch.object(bulk_ingest, "_pg_conn_str_for_ogr2ogr", return_value="PG:dummy"),
        ):
            cmd = bulk_ingest._build_ogr_cmd(
                shp_path=shp,
                group_size=1000,
                use_makevalid=False,
                shp_encoding=None,
            )
        cmd_str = " ".join(cmd)
        self.assertNotIn("ENCODING=", cmd_str)


if __name__ == "__main__":
    unittest.main()
