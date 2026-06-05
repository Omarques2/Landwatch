import subprocess
import sys
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from steps.common import DatasetArtifact
from steps import ingest


class IngestStepTest(unittest.TestCase):
    def _artifact(self, code: str, suffix: str = ".shp") -> DatasetArtifact:
        return DatasetArtifact(
            category="PRODES",
            dataset_code=code,
            files=[Path(f"/tmp/{code}{suffix}")],
            snapshot_date="2026-05-21",
        )

    def test_run_ingest_only_continues_after_dataset_failure(self):
        calls = []

        def fake_run(cmd, check=False):
            calls.append(cmd)
            return subprocess.CompletedProcess(cmd, 1 if "A.shp" in cmd[3] else 0)

        with patch.object(ingest.subprocess, "run", side_effect=fake_run):
            result = ingest.run_ingest_only(
                [self._artifact("A"), self._artifact("B")],
                "2026-05-21",
            )

        self.assertEqual(result.successes, ["B"])
        self.assertEqual(result.failures, {"A": "exit=1"})
        self.assertEqual(len(calls), 2)
        self.assertTrue(all("--skip-mv-refresh" in call for call in calls))

    def test_run_ingest_only_reads_result_json_versions(self):
        calls = []

        def fake_run(cmd, check=False):
            calls.append(cmd)
            result_path = Path(cmd[cmd.index("--result-json") + 1])
            result_path.write_text(
                json.dumps(
                    {
                        "datasets": [
                            {
                                "dataset_code": "A",
                                "dataset_id": 10,
                                "version_id": 123,
                            }
                        ]
                    }
                ),
                encoding="utf-8",
            )
            return subprocess.CompletedProcess(cmd, 0)

        with (
            tempfile.TemporaryDirectory() as tmp,
            patch.object(ingest.tempfile, "mkdtemp", return_value=tmp),
            patch.object(ingest.subprocess, "run", side_effect=fake_run),
        ):
            result = ingest.run_ingest_only([self._artifact("A")], "2026-05-21")

        self.assertEqual(result.successes, ["A"])
        self.assertEqual(result.success_versions, [123])
        self.assertIn("--result-json", calls[0])

    def test_refresh_mvs_once_runs_refresh_only_command(self):
        calls = []

        def fake_run(cmd, check=False):
            calls.append(cmd)
            return subprocess.CompletedProcess(cmd, 0)

        with patch.object(ingest.subprocess, "run", side_effect=fake_run):
            ok = ingest.refresh_mvs_once()

        self.assertTrue(ok)
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][0], sys.executable)
        self.assertIn("--refresh-mvs-only", calls[0])

    def test_refresh_mvs_once_passes_tile_cache_dataset_codes(self):
        calls = []

        def fake_run(cmd, check=False):
            calls.append(cmd)
            return subprocess.CompletedProcess(cmd, 0)

        with patch.object(ingest.subprocess, "run", side_effect=fake_run):
            ok = ingest.refresh_mvs_once(["PRODES_A", "DETER_A", "PRODES_A"])

        self.assertTrue(ok)
        self.assertEqual(len(calls), 1)
        self.assertIn("--refresh-mvs-only", calls[0])
        self.assertIn("--tile-cache-dataset-codes", calls[0])
        flag_index = calls[0].index("--tile-cache-dataset-codes")
        self.assertEqual(calls[0][flag_index + 1], "DETER_A,PRODES_A")

    def test_refresh_mvs_once_passes_cache_version_ids(self):
        calls = []

        def fake_run(cmd, check=False):
            calls.append(cmd)
            return subprocess.CompletedProcess(cmd, 0)

        with patch.object(ingest.subprocess, "run", side_effect=fake_run):
            ok = ingest.refresh_mvs_once(["PRODES_A"], [123, 124, 123])

        self.assertTrue(ok)
        self.assertIn("--cache-version-ids", calls[0])
        flag_index = calls[0].index("--cache-version-ids")
        self.assertEqual(calls[0][flag_index + 1], "123,124")


if __name__ == "__main__":
    unittest.main()
