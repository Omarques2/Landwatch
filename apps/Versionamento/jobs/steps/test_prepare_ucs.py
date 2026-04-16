import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

import geopandas as gpd
from shapely.geometry import Polygon

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from jobs.steps.prepare_ucs import (
    PrepareUcsError,
    build_prepared_ucs,
    prepare_ucs_files,
    run,
)
from jobs.steps.common import DatasetArtifact


class PrepareUcsTest(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = Path(tempfile.mkdtemp(prefix="prepare_ucs_test_"))
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

    def _make_federal(self) -> gpd.GeoDataFrame:
        return gpd.GeoDataFrame(
            {
                "Cnuc": ["0000.00.0001", "0000.00.0002"],
                "NomeUC": ["Federal A", "Federal B"],
            },
            geometry=[self._poly(0, 0), self._poly(10, 10)],
            crs="EPSG:4674",
        )

    def _make_cnuc(self) -> gpd.GeoDataFrame:
        return gpd.GeoDataFrame(
            {
                "cd_cnuc": ["0000.00.0001", "0000.00.0002", "0000.00.0003", "0000.00.0004"],
                "nome_uc": [
                    "Cnuc A",
                    "Cnuc B",
                    "Reserva Particular do Patrimônio Natural Sítio Teste",
                    "Cnuc D",
                ],
                "categoria": ["PARQUE NACIONAL", "RESERVA EXTRATIVISTA", "APA", "RPPN"],
                "grupo": ["PROTECAO INTEGRAL", "USO SUSTENTAVEL", "USO SUSTENTAVEL", "USO SUSTENTAVEL"],
                "esfera": ["FEDERAL", "FEDERAL", "ESTADUAL", "PARTICULAR"],
                "situacao": ["ATIVA", "ATIVA", "ATIVA", "ATIVA"],
            },
            geometry=[self._poly(2, 2), self._poly(12, 12), self._poly(20, 20), None],
            crs="EPSG:4674",
        )

    def test_build_prepared_ucs_prioritizes_federal_geometry_and_adds_cnuc_complement(self):
        fed = self._make_federal()
        cnuc = self._make_cnuc()

        out_gdf, qa = build_prepared_ucs(fed, cnuc)

        self.assertEqual(qa["fed_in"], 2)
        self.assertEqual(qa["cnuc_in"], 4)
        self.assertEqual(qa["intersect"], 2)
        self.assertEqual(qa["cnuc_complement"], 2)
        self.assertEqual(qa["dropped_null_geom"], 1)
        self.assertEqual(qa["output_total"], 3)

        self.assertEqual(list(out_gdf["cnuc_code"]), ["0000.00.0001", "0000.00.0002", "0000.00.0003"])
        self.assertEqual(list(out_gdf["source"]), ["FEDERAL", "FEDERAL", "CNUC_COMPLEMENTAR"])

        row_a = out_gdf[out_gdf["cnuc_code"] == "0000.00.0001"].iloc[0]
        self.assertEqual(row_a["nome_uc"], "Federal A")
        self.assertEqual(row_a["categoria"], "PARQUE NACIONAL")
        self.assertTrue(row_a.geometry.equals(fed.iloc[0].geometry))
        row_c = out_gdf[out_gdf["cnuc_code"] == "0000.00.0003"].iloc[0]
        self.assertEqual(row_c["nome_uc"], "RPPN Sítio Teste")

    def test_build_prepared_ucs_fails_when_federal_code_has_no_cnuc_category(self):
        fed = self._make_federal()
        fed.loc[1, "Cnuc"] = "0000.00.0099"
        cnuc = self._make_cnuc()

        with self.assertRaises(PrepareUcsError):
            build_prepared_ucs(fed, cnuc)

    def test_build_prepared_ucs_uses_federal_attr_fallback_for_missing_cnuc_code(self):
        fed = gpd.GeoDataFrame(
            {
                "Cnuc": ["0000.00.0001", "0000.00.0099"],
                "NomeUC": ["Federal A", "Federal Extra"],
                "SiglaCateg": ["PARNA", "APA"],
                "GrupoUC": ["PROTECAO INTEGRAL", "USO SUSTENTAVEL"],
                "EsferaAdm": ["FEDERAL", "FEDERAL"],
            },
            geometry=[self._poly(0, 0), self._poly(10, 10)],
            crs="EPSG:4674",
        )
        cnuc = self._make_cnuc()

        out_gdf, qa = build_prepared_ucs(fed, cnuc)

        self.assertEqual(qa["fed_missing_cnuc_categoria"], 1)
        self.assertEqual(qa["output_total"], 4)

        extra = out_gdf[out_gdf["cnuc_code"] == "0000.00.0099"].iloc[0]
        self.assertEqual(extra["source"], "FEDERAL")
        self.assertEqual(extra["categoria"], "Área de Proteção Ambiental")
        self.assertEqual(extra["grupo"], "USO SUSTENTAVEL")
        self.assertEqual(extra["esfera"], "FEDERAL")

    def test_prepare_ucs_files_writes_single_output_with_qa_report(self):
        fed = self._make_federal()
        cnuc = self._make_cnuc()
        fed_path = self.tmp_dir / "limites_fed.shp"
        cnuc_path = self.tmp_dir / "cnuc.shp"
        output_dir = self.tmp_dir / "prepared"
        output_dir.mkdir(parents=True, exist_ok=True)
        fed.to_file(fed_path, driver="ESRI Shapefile", encoding="UTF-8")
        cnuc.to_file(cnuc_path, driver="ESRI Shapefile", encoding="UTF-8")

        result = prepare_ucs_files(
            fed_shp=fed_path,
            cnuc_shp=cnuc_path,
            output_dir=output_dir,
        )

        self.assertTrue(result.output_shp.exists())
        self.assertTrue(result.qa_report_path.exists())

        for ext in [".shp", ".dbf", ".shx", ".prj", ".cpg"]:
            self.assertTrue(result.output_shp.with_suffix(ext).exists())

        qa = json.loads(result.qa_report_path.read_text(encoding="utf-8"))
        self.assertEqual(qa["output_total"], 3)

        prepared = gpd.read_file(result.output_shp)
        out_cols = {c.lower() for c in prepared.columns}
        for expected in {"cnuc_code", "nome_uc", "categoria", "grupo", "esfera", "source", "geometry"}:
            self.assertIn(expected, out_cols)

    def test_build_prepared_ucs_fails_on_duplicate_cnuc_code_after_normalization(self):
        fed = self._make_federal()
        cnuc = self._make_cnuc()
        cnuc.loc[1, "cd_cnuc"] = " 0000.00.0001 "

        with self.assertRaises(PrepareUcsError):
            build_prepared_ucs(fed, cnuc)

    def test_prepare_ucs_files_merges_novas_fontes_and_infers_specific_category_from_name(self):
        fed = self._make_federal()
        cnuc = self._make_cnuc()
        fed_path = self.tmp_dir / "limites_fed.shp"
        cnuc_path = self.tmp_dir / "cnuc.shp"
        fed.to_file(fed_path, driver="ESRI Shapefile", encoding="UTF-8")
        cnuc.to_file(cnuc_path, driver="ESRI Shapefile", encoding="UTF-8")

        novas_root = self.tmp_dir / "NovasFontes"
        src_dir = novas_root / "10-siga.meioambiente.go.gov.br"
        src_dir.mkdir(parents=True, exist_ok=True)
        novas = gpd.GeoDataFrame(
            {
                "nome": ["Área de Proteção Ambiental Serra Azul"],
                "categoria": ["Unidade de Conservação - Uso Sustentável"],
                "grupo": ["US"],
                "esferaadmi": ["municipal"],
                "codigo": ["NF001"],
            },
            geometry=[self._poly(100, 100)],
            crs="EPSG:4674",
        )
        novas.to_file(src_dir / "novas.shp", driver="ESRI Shapefile", encoding="UTF-8")

        result = prepare_ucs_files(
            fed_shp=fed_path,
            cnuc_shp=cnuc_path,
            output_dir=self.tmp_dir / "prepared_with_novas",
            novas_fontes_root=novas_root,
        )

        out = gpd.read_file(result.output_shp)
        row = out[out["source"].str.contains("SIGA_MEIOAMBIENTE_GO_GOV_BR", regex=False)].iloc[0]
        self.assertEqual(row["categoria"], "Área de Proteção Ambiental")
        self.assertIn("novas_output_total", result.metrics)
        self.assertEqual(result.metrics["novas_output_total"], 1)

    def test_run_detects_sources_and_returns_single_prepared_artifact(self):
        fed = self._make_federal()
        cnuc = self._make_cnuc()
        fed_path = self.tmp_dir / "raw" / "UCS" / "fed.shp"
        cnuc_path = self.tmp_dir / "raw" / "UCS" / "cnuc.shp"
        fed_path.parent.mkdir(parents=True, exist_ok=True)
        cnuc_path.parent.mkdir(parents=True, exist_ok=True)
        fed.to_file(fed_path, driver="ESRI Shapefile", encoding="UTF-8")
        cnuc.to_file(cnuc_path, driver="ESRI Shapefile", encoding="UTF-8")

        artifacts = [
            DatasetArtifact(
                category="UCS",
                dataset_code="FED",
                files=[fed_path],
                snapshot_date="2026-04-09",
            ),
            DatasetArtifact(
                category="UCS",
                dataset_code="CNUC",
                files=[cnuc_path],
                snapshot_date="2026-04-09",
            ),
        ]

        out = run(artifacts=artifacts, work_dir=self.tmp_dir / "work", snapshot_date="2026-04-09")

        self.assertEqual(out.category, "UCS")
        self.assertEqual(out.dataset_code, "UNIDADES_CONSERVACAO")
        self.assertTrue(any(p.name.lower() == "unidades_conservacao.shp" for p in out.files))


if __name__ == "__main__":
    unittest.main()
