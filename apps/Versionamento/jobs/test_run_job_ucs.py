import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import geopandas as gpd
from shapely.geometry import Polygon

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import run_job  # noqa: E402
from steps.common import DatasetArtifact, JobConfig, StorageClient  # noqa: E402


class RunJobUcsTest(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = Path(tempfile.mkdtemp(prefix="run_job_ucs_test_"))
        self.addCleanup(lambda: shutil.rmtree(self.tmp_dir, ignore_errors=True))

    def _poly(self, x0: float, y0: float, size: float = 1.0) -> Polygon:
        return Polygon(
            [
                (x0, y0),
                (x0 + size, y0),
                (x0 + size, y0 + size),
                (x0, y0 + size),
                (x0, y0),
            ]
        )

    def _write_federal_shp(self, base: Path) -> Path:
        base.parent.mkdir(parents=True, exist_ok=True)
        gdf = gpd.GeoDataFrame(
            {
                "Cnuc": ["0000.00.0001"],
                "NomeUC": ["Federal A"],
            },
            geometry=[self._poly(0, 0)],
            crs="EPSG:4674",
        )
        gdf.to_file(base, driver="ESRI Shapefile", encoding="UTF-8")
        return base

    def _write_cnuc_shp(self, base: Path) -> Path:
        base.parent.mkdir(parents=True, exist_ok=True)
        gdf = gpd.GeoDataFrame(
            {
                "cd_cnuc": ["0000.00.0001", "0000.00.0002"],
                "nome_uc": ["Cnuc A", "Cnuc B"],
                "categoria": ["PARQUE NACIONAL", "APA"],
                "grupo": ["PROTECAO INTEGRAL", "USO SUSTENTAVEL"],
                "esfera": ["FEDERAL", "ESTADUAL"],
                "situacao": ["ATIVA", "ATIVA"],
            },
            geometry=[self._poly(1, 1), self._poly(2, 2)],
            crs="EPSG:4674",
        )
        gdf.to_file(base, driver="ESRI Shapefile", encoding="UTF-8")
        return base

    def _job_config(self) -> JobConfig:
        return JobConfig(
            work_dir=self.tmp_dir / "work",
            storage_mode="local",
            blob_conn=None,
            blob_container=None,
            blob_prefix="landwatch",
            retention_runs=2,
            save_raw=False,
        )

    def test_transform_url_ucs_artifacts_replaces_raw_with_prepared_dataset(self):
        config = self._job_config()
        fed_shp = self._write_federal_shp(
            self.tmp_dir / "work" / "URL" / "UCS" / "federal.shp"
        )
        cnuc_shp = self._write_cnuc_shp(
            self.tmp_dir / "work" / "URL" / "UCS" / "cnuc.shp"
        )
        other_csv = self.tmp_dir / "work" / "URL" / "OUTROS" / "dummy.csv"
        other_csv.parent.mkdir(parents=True, exist_ok=True)
        other_csv.write_text("col\n1\n", encoding="utf-8")

        artifacts = [
            DatasetArtifact("UCS", "FEDERAL", list(fed_shp.parent.glob("federal.*")), "2026-04-08"),
            DatasetArtifact("UCS", "CNUC", list(cnuc_shp.parent.glob("cnuc.*")), "2026-04-08"),
            DatasetArtifact("OUTROS", "DUMMY", [other_csv], "2026-04-08"),
        ]

        transformed = run_job._transform_url_ucs_artifacts(artifacts, config, "2026-04-08")
        prepared = [a for a in transformed if a.dataset_code == "UNIDADES_CONSERVACAO"]
        self.assertEqual(len(prepared), 1)

        source_disabled = [
            a
            for a in transformed
            if (a.extra or {}).get(run_job.EXCLUDE_FROM_MANIFEST_KEY) is True
            and (a.extra or {}).get(run_job.EXCLUDE_FROM_INGEST_KEY) is True
        ]
        self.assertEqual(len(source_disabled), 2)

        manifest_artifacts = run_job._filter_manifest_artifacts(transformed)
        self.assertTrue(any(a.dataset_code == "UNIDADES_CONSERVACAO" for a in manifest_artifacts))
        self.assertFalse(any(a.dataset_code in {"FEDERAL", "CNUC"} for a in manifest_artifacts))

    def test_process_category_uses_only_manifest_eligible_artifacts(self):
        config = self._job_config()
        storage = StorageClient(mode="local", local_root=self.tmp_dir / "storage")
        run_id = "20260408T000000Z"

        raw_shp = self.tmp_dir / "work" / "URL" / "UCS" / "raw.shp"
        raw_shp.parent.mkdir(parents=True, exist_ok=True)
        raw_shp.write_bytes(b"raw")

        prepared_shp = self.tmp_dir / "work" / "URL" / "UCS" / "UNIDADES_CONSERVACAO.shp"
        prepared_dbf = prepared_shp.with_suffix(".dbf")
        prepared_shp.parent.mkdir(parents=True, exist_ok=True)
        prepared_shp.write_bytes(b"prepared-shp")
        prepared_dbf.write_bytes(b"prepared-dbf")

        artifacts = [
            DatasetArtifact(
                category="UCS",
                dataset_code="RAW_UCS",
                files=[raw_shp],
                snapshot_date="2026-04-08",
                extra={
                    run_job.EXCLUDE_FROM_MANIFEST_KEY: True,
                    run_job.EXCLUDE_FROM_INGEST_KEY: True,
                },
            ),
            DatasetArtifact(
                category="UCS",
                dataset_code="UNIDADES_CONSERVACAO",
                files=[prepared_shp, prepared_dbf],
                snapshot_date="2026-04-08",
            ),
        ]

        with patch.object(run_job, "run_ingest", return_value=True) as run_ingest_mock:
            result = run_job.process_category(storage, run_id, "URL", artifacts, config)

        self.assertEqual(result["status"], "ingested")
        run_ingest_mock.assert_called_once()
        ingest_arg = run_ingest_mock.call_args[0][0]
        self.assertEqual([a.dataset_code for a in ingest_arg], ["UNIDADES_CONSERVACAO"])

        manifest_path = self.tmp_dir / "storage" / "manifests" / "URL" / f"{run_id}.json"
        self.assertTrue(manifest_path.exists())
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        dataset_codes = [d["dataset_code"] for d in manifest["datasets"]]
        self.assertEqual(dataset_codes, ["UNIDADES_CONSERVACAO"])

    def test_transform_url_ucs_artifacts_skips_only_ucs_when_prepare_fails(self):
        config = self._job_config()
        ucs_shp = self.tmp_dir / "work" / "URL" / "UCS" / "federal_only.shp"
        ucs_shp.parent.mkdir(parents=True, exist_ok=True)
        ucs_shp.write_bytes(b"not-a-real-shp")

        other_csv = self.tmp_dir / "work" / "URL" / "OUTROS" / "dummy.csv"
        other_csv.parent.mkdir(parents=True, exist_ok=True)
        other_csv.write_text("col\n1\n", encoding="utf-8")

        artifacts = [
            DatasetArtifact("UCS", "FEDERAL", [ucs_shp], "2026-04-08"),
            DatasetArtifact("OUTROS", "DUMMY", [other_csv], "2026-04-08"),
        ]

        with patch.object(run_job, "prepare_ucs_run", side_effect=RuntimeError("missing cnuc")):
            transformed = run_job._transform_url_ucs_artifacts(
                artifacts, config, "2026-04-08"
            )

        ucs = [a for a in transformed if a.dataset_code == "FEDERAL"][0]
        self.assertTrue((ucs.extra or {}).get(run_job.EXCLUDE_FROM_INGEST_KEY))
        self.assertTrue((ucs.extra or {}).get(run_job.EXCLUDE_FROM_MANIFEST_KEY))

        others = [a for a in transformed if a.dataset_code == "DUMMY"][0]
        self.assertFalse((others.extra or {}).get(run_job.EXCLUDE_FROM_INGEST_KEY))
        self.assertFalse((others.extra or {}).get(run_job.EXCLUDE_FROM_MANIFEST_KEY))


if __name__ == "__main__":
    unittest.main()
