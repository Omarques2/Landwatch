import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if "psycopg2" not in sys.modules:
    psycopg2_stub = types.ModuleType("psycopg2")
    psycopg2_stub.connect = lambda **_kwargs: None
    psycopg2_stub.sql = types.SimpleNamespace(Identifier=lambda name: name)
    sys.modules["psycopg2"] = psycopg2_stub
    sys.modules["psycopg2.sql"] = psycopg2_stub.sql

import build_pmtiles


class BuildPmtilesTest(unittest.TestCase):
    def test_main_continues_after_dataset_failure(self):
        calls = []

        def fake_build(_conn, _schema, dataset_code, *_args):
            calls.append(dataset_code)
            if dataset_code == "A":
                raise RuntimeError("upload timeout")

        with (
            patch.dict(os.environ, {"LANDWATCH_PMTILES_BUILD_ENABLED": "1"}),
            patch.object(build_pmtiles, "parse_args", return_value=type("Args", (), {"dataset_codes": "A,B"})()),
            patch.object(build_pmtiles, "resolve_executable", return_value="/bin/true"),
            patch.object(build_pmtiles, "ensure_blob_client", return_value=(object(), "pmtiles")),
            patch.object(build_pmtiles.psycopg2, "connect") as connect_mock,
            patch.object(build_pmtiles, "build_dataset_pmtiles", side_effect=fake_build),
        ):
            connect_mock.return_value.close.return_value = None
            exit_code = build_pmtiles.main()

        self.assertEqual(calls, ["A", "B"])
        self.assertEqual(exit_code, 1)

    def test_upload_pmtiles_retries_and_reopens_file(self):
        class FakeBlob:
            def get_blob_properties(self):
                return type("Props", (), {"size": 123, "etag": "etag"})()

        class FakeContainer:
            container_name = "container"

            def __init__(self):
                self.attempts = 0
                self.positions = []

            def upload_blob(self, _blob_path, handle, overwrite=True):
                self.attempts += 1
                self.positions.append(handle.tell())
                if self.attempts == 1:
                    raise TimeoutError("timeout")

            def get_blob_client(self, _blob_path):
                return FakeBlob()

        with tempfile.TemporaryDirectory(prefix="pmtiles_upload_test_") as tmp:
            pmtiles_path = Path(tmp) / "test.pmtiles"
            pmtiles_path.write_bytes(b"abc")
            container = FakeContainer()

            with patch.dict(os.environ, {"LANDWATCH_PMTILES_UPLOAD_RETRIES": "2"}), patch.object(
                build_pmtiles.time,
                "sleep",
            ):
                etag, size = build_pmtiles.upload_pmtiles(container, "x.pmtiles", pmtiles_path)

        self.assertEqual(etag, "etag")
        self.assertEqual(size, 123)
        self.assertEqual(container.attempts, 2)
        self.assertEqual(container.positions, [0, 0])


if __name__ == "__main__":
    unittest.main()
