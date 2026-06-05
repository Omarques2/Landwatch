import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import run_job
from steps.common import DatasetArtifact, JobConfig
from steps.ingest import IngestResult


class RunJobFlowTest(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = Path(tempfile.mkdtemp(prefix="run_job_flow_test_"))
        self.addCleanup(lambda: shutil.rmtree(self.tmp_dir, ignore_errors=True))

    def _config(self) -> JobConfig:
        return JobConfig(
            work_dir=self.tmp_dir / "work",
            storage_mode="local",
            blob_conn=None,
            blob_container=None,
            blob_prefix="landwatch",
            retention_runs=2,
            save_raw=False,
        )

    def _artifact(self, category: str, code: str, content: bytes) -> DatasetArtifact:
        shp = self.tmp_dir / "work" / category / f"{code}.shp"
        shp.parent.mkdir(parents=True, exist_ok=True)
        shp.write_bytes(content)
        return DatasetArtifact(category=category, dataset_code=code, files=[shp], snapshot_date="2026-05-21")

    def test_run_all_ingests_all_before_single_mv_and_single_pmtiles(self):
        order = []
        config = self._config()

        def fake_run_ingest_only(artifacts, snapshot_date):
            order.append(("ingest", [a.dataset_code for a in artifacts], snapshot_date))
            return IngestResult(successes=[a.dataset_code for a in artifacts], failures={})

        with (
            patch.dict(os.environ, {"LANDWATCH_LOCAL_ROOT": str(self.tmp_dir / "storage")}),
            patch.object(run_job, "now_run_id", return_value="20260521T000000Z"),
            patch.object(run_job, "download_prodes", return_value=[self._artifact("PRODES", "PRODES_A", b"a")]),
            patch.object(run_job, "download_deter", return_value=[self._artifact("DETER", "DETER_A", b"b")]),
            patch.object(run_job, "download_sicar", return_value=[]),
            patch.object(run_job, "download_url", return_value=[]),
            patch.object(run_job, "run_ingest_only", side_effect=fake_run_ingest_only),
            patch.object(
                run_job,
                "refresh_mvs_once",
                side_effect=lambda codes=None, versions=None: order.append(("mv", sorted(codes or []), sorted(versions or []))) or True,
            ),
            patch.object(run_job, "run_pmtiles_build", side_effect=lambda codes: order.append(("pmtiles", sorted(codes))) or True),
        ):
            results = run_job.run_all(config, "2026-05-21")

        self.assertEqual(
            order,
            [
                ("ingest", ["PRODES_A", "DETER_A"], "2026-05-21"),
                ("mv", ["DETER_A", "PRODES_A"], []),
                ("pmtiles", ["DETER_A", "PRODES_A"]),
            ],
        )
        self.assertEqual(results["PRODES"]["status"], "ingested")
        self.assertEqual(results["DETER"]["status"], "ingested")

    def test_failed_dataset_does_not_advance_manifest_fingerprint(self):
        config = self._config()
        storage_root = self.tmp_dir / "storage"
        prev_dir = storage_root / "manifests" / "PRODES"
        prev_dir.mkdir(parents=True)
        prev_manifest = {
            "run_id": "old",
            "category": "PRODES",
            "status": "ingested",
            "datasets": [
                {
                    "dataset_code": "PRODES_A",
                    "snapshot_date": "2026-05-20",
                    "files": ["PRODES_A.shp"],
                    "fingerprint": "previous-fingerprint",
                    "extra": {},
                }
            ],
        }
        (prev_dir / "20260520T000000Z.json").write_text(json.dumps(prev_manifest), encoding="utf-8")

        with (
            patch.dict(os.environ, {"LANDWATCH_LOCAL_ROOT": str(storage_root)}),
            patch.object(run_job, "now_run_id", return_value="20260521T000000Z"),
            patch.object(run_job, "download_prodes", return_value=[self._artifact("PRODES", "PRODES_A", b"new")]),
            patch.object(run_job, "run_ingest_only", return_value=IngestResult(successes=[], failures={"PRODES_A": "exit=1"})),
            patch.object(run_job, "refresh_mvs_once") as refresh_mock,
            patch.object(run_job, "run_pmtiles_build") as pmtiles_mock,
        ):
            results = run_job.run_all(config, "2026-05-21", categories=["PRODES"])

        manifest_path = storage_root / "manifests" / "PRODES" / "20260521T000000Z.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        dataset = manifest["datasets"][0]
        self.assertEqual(results["PRODES"]["status"], "failed")
        self.assertEqual(dataset["fingerprint"], "previous-fingerprint")
        self.assertEqual(dataset["fingerprint_status"], "previous_retained_after_failure")
        refresh_mock.assert_not_called()
        pmtiles_mock.assert_not_called()


if __name__ == "__main__":
    unittest.main()
