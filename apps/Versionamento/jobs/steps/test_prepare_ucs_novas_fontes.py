import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

import geopandas as gpd
from shapely.geometry import LineString, Polygon

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from jobs.steps.prepare_ucs_novas_fontes import (  # type: ignore
    PrepareNovasFontesUcsError,
    SourceLayer,
    build_prepared_novas_fontes_ucs,
    discover_source_layers,
    prepare_novas_fontes_ucs_files,
)


class PrepareNovasFontesUcsTest(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = Path(tempfile.mkdtemp(prefix="prepare_ucs_novas_fontes_test_"))
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

    def test_build_prepared_novas_fontes_maps_cnuc_and_custom_categories(self):
        source_a = gpd.GeoDataFrame(
            {
                "nomeunidad": [
                    "Parque Natural Municipal do Sol",
                    "Horto Florestal Municipal das Flores",
                    "Uso agrícola intensivo",
                ],
                "categoria": [
                    "Parque Natural Municipal",
                    "Horto Florestal",
                    "Agropecuária",
                ],
                "grupo": ["Proteção Integral - PI", "Não se Aplica", "Não se Aplica"],
                "esferaadmi": ["Municipal", "Municipal", "Municipal"],
            },
            geometry=[self._poly(0, 0), self._poly(2, 2), self._poly(4, 4)],
            crs="EPSG:4674",
        )

        prepared, metrics = build_prepared_novas_fontes_ucs(
            source_layers=[
                SourceLayer(
                    source_name="fonte-teste",
                    shp_path=self.tmp_dir / "a.shp",
                    gdf=source_a,
                )
            ],
            base_ucs=None,
        )

        self.assertEqual(metrics["candidate_in"], 2)
        self.assertEqual(metrics["output_total"], 2)
        self.assertEqual(set(prepared["categoria"]), {"Parque", "Horto Florestal"})
        self.assertEqual(set(prepared["esfera"]), {"MUNICIPAL"})

        out_cols = {c.lower() for c in prepared.columns}
        for expected in {
            "cnuc_code",
            "nome_uc",
            "categoria",
            "grupo",
            "esfera",
            "source",
            "geometry",
        }:
            self.assertIn(expected, out_cols)

    def test_build_prepared_novas_fontes_uses_snirh_cnuc_fields(self):
        snirh = gpd.GeoDataFrame(
            {
                "ID_UC0": ["ABCD1234"],
                "NOME_UC1": ["Área de Proteção Ambiental Serra Verde"],
                "CATEGORI3": ["Área de Proteção Ambiental"],
                "GRUPO4": ["US"],
                "ESFERA5": ["estadual"],
            },
            geometry=[self._poly(0, 0)],
            crs="EPSG:4674",
        )

        prepared, _ = build_prepared_novas_fontes_ucs(
            source_layers=[
                SourceLayer(
                    source_name="8-metadados.snirh.gov.br",
                    shp_path=self.tmp_dir / "snirh.shp",
                    gdf=snirh,
                )
            ],
            base_ucs=None,
        )

        row = prepared.iloc[0]
        self.assertEqual(row["categoria"], "Área de Proteção Ambiental")
        self.assertEqual(row["grupo"], "USO SUSTENTAVEL")
        self.assertEqual(row["esfera"], "ESTADUAL")

    def test_build_prepared_novas_fontes_prefers_descriptive_text_over_ibge_code(self):
        ibge = gpd.GeoDataFrame(
            {
                "REFNAME": ["AC_3.1.1"],
                "TEXT": ["AC_3.1.1"],
                "DESCRIèãO": ["Unidades de conservação de proteção integral em área florestal"],
                "refn_descr": ["AC_3.1.1_Unidades de conservação de proteção integral em área florestal"],
            },
            geometry=[self._poly(0, 0)],
            crs="EPSG:4674",
        )

        prepared, _ = build_prepared_novas_fontes_ucs(
            source_layers=[
                SourceLayer(
                    source_name="7-geoftp.ibge.gov.br",
                    shp_path=self.tmp_dir / "ibge.shp",
                    gdf=ibge,
                )
            ],
            base_ucs=None,
        )

        row = prepared.iloc[0]
        self.assertEqual(row["categoria"], "Área Florestal")
        self.assertIn("Unidades de conservação", row["nome_uc"])

    def test_build_prepared_novas_fontes_handles_cp1252_apostrophe_in_dagua(self):
        ibge = gpd.GeoDataFrame(
            {
                "REFNAME": ["X_1.2.3"],
                "DESCRIèãO": ["Unidades de conservação de uso sustentável em corpo d\u0092água continental"],
            },
            geometry=[self._poly(0, 0)],
            crs="EPSG:4674",
        )

        prepared, _ = build_prepared_novas_fontes_ucs(
            source_layers=[
                SourceLayer(
                    source_name="7-geoftp.ibge.gov.br",
                    shp_path=self.tmp_dir / "ibge_cp1252.shp",
                    gdf=ibge,
                )
            ],
            base_ucs=None,
        )

        row = prepared.iloc[0]
        self.assertEqual(row["categoria"], "UC de Uso Sustentável - Corpo d'Água Continental")

    def test_build_prepared_novas_fontes_prefers_specific_category_from_name_over_us_pi(self):
        source = gpd.GeoDataFrame(
            {
                "nome": [
                    "Área de Proteção Ambiental Serra Azul",
                    "Estação Ecológica Municipal Vale Verde",
                ],
                "categoria": ["US", "PI"],
                "grupo": ["US", "PI"],
            },
            geometry=[self._poly(0, 0), self._poly(2, 2)],
            crs="EPSG:4674",
        )

        prepared, _ = build_prepared_novas_fontes_ucs(
            source_layers=[
                SourceLayer(
                    source_name="10-siga.meioambiente.go.gov.br",
                    shp_path=self.tmp_dir / "name_specific.shp",
                    gdf=source,
                )
            ],
            base_ucs=None,
        )

        categories = set(prepared["categoria"].tolist())
        self.assertIn("Área de Proteção Ambiental", categories)
        self.assertIn("Estação Ecológica", categories)

    def test_prepare_novas_fontes_files_filters_already_existing_uc_from_base(self):
        root = self.tmp_dir / "NovasFontes"
        src_dir = root / "10-siga.meioambiente.go.gov.br"
        src_dir.mkdir(parents=True, exist_ok=True)

        incoming = gpd.GeoDataFrame(
            {
                "nomeunidad": [
                    "Parque Municipal Existente",
                    "Parque Municipal Novo",
                ],
                "categoria": ["Parque", "Parque"],
                "grupo": ["Proteção Integral - PI", "Proteção Integral - PI"],
                "esferaadmi": ["Municipal", "Municipal"],
            },
            geometry=[self._poly(0, 0), self._poly(2, 2)],
            crs="EPSG:4674",
        )
        incoming_shp = src_dir / "incoming.shp"
        incoming.to_file(incoming_shp, driver="ESRI Shapefile", encoding="UTF-8")

        base = gpd.GeoDataFrame(
            {
                "cnuc_code": ["0000.00.0001"],
                "nome_uc": ["Parque Municipal Existente"],
                "categoria": ["Parque"],
                "grupo": ["PROTECAO INTEGRAL"],
                "esfera": ["MUNICIPAL"],
                "source": ["BASE"],
            },
            geometry=[self._poly(0, 0)],
            crs="EPSG:4674",
        )
        base_shp = self.tmp_dir / "UNIDADES_CONSERVACAO.shp"
        base.to_file(base_shp, driver="ESRI Shapefile", encoding="UTF-8")

        result = prepare_novas_fontes_ucs_files(
            input_root=root,
            output_dir=self.tmp_dir / "out",
            base_ucs_shp=base_shp,
        )

        self.assertTrue(result.output_shp.exists())
        out = gpd.read_file(result.output_shp)
        self.assertEqual(len(out), 1)
        self.assertEqual(out.iloc[0]["nome_uc"], "Parque Municipal Novo")

        qa = json.loads(result.qa_report_path.read_text(encoding="utf-8"))
        self.assertEqual(qa["base_filtered"], 1)
        self.assertEqual(qa["output_total"], 1)

    def test_prepare_novas_fontes_files_uses_curated_2249_when_available(self):
        root = self.tmp_dir / "NovasFontes"
        raw_dir = root / "10-siga.meioambiente.go.gov.br"
        raw_dir.mkdir(parents=True, exist_ok=True)

        raw = gpd.GeoDataFrame(
            {
                "nomeunidad": ["Nao deve entrar"],
                "categoria": ["Agropecuaria"],
            },
            geometry=[self._poly(20, 20)],
            crs="EPSG:4674",
        )
        raw.to_file(raw_dir / "raw.shp", driver="ESRI Shapefile", encoding="UTF-8")

        curated_dir = root / "_comparativo_uc_report" / "AnaliseNovasUCs"
        curated_dir.mkdir(parents=True, exist_ok=True)
        curated = gpd.GeoDataFrame(
            {
                "nome": ["Parque Nacional de Teste", "Reserva Ecológica de Teste"],
                "codigo": ["T1", "T2"],
                "categ": ["Parque Nacional", "Reserva Ecológica"],
                "fonte": ["10-siga.meioambiente.go.gov.br", "7-geoftp.ibge.gov.br"],
                "desc": ["desc parque", "desc reserva"],
            },
            geometry=[self._poly(0, 0), self._poly(5, 5)],
            crs="EPSG:4674",
        )
        curated.to_file(curated_dir / "NovasUCs.shp", driver="ESRI Shapefile", encoding="UTF-8")

        base = gpd.GeoDataFrame(
            {
                "cnuc_code": ["BASE1"],
                "nome_uc": ["Parque Nacional de Teste"],
                "categoria": ["Parque"],
                "grupo": ["PROTECAO INTEGRAL"],
                "esfera": ["FEDERAL"],
                "source": ["BASE"],
            },
            geometry=[self._poly(0, 0)],
            crs="EPSG:4674",
        )
        base_shp = self.tmp_dir / "UNIDADES_CONSERVACAO.shp"
        base.to_file(base_shp, driver="ESRI Shapefile", encoding="UTF-8")

        result = prepare_novas_fontes_ucs_files(
            input_root=root,
            output_dir=self.tmp_dir / "out_curated",
            base_ucs_shp=base_shp,
        )

        out = gpd.read_file(result.output_shp)
        self.assertEqual(len(out), 2)
        self.assertIn("Parque", set(out["categoria"]))
        self.assertIn("Reserva Ecológica", set(out["categoria"]))

        qa = json.loads(result.qa_report_path.read_text(encoding="utf-8"))
        self.assertEqual(qa["base_filtered"], 0)
        self.assertEqual(qa["output_total"], 2)

    def test_build_prepared_novas_fontes_fails_when_no_candidates(self):
        source = gpd.GeoDataFrame(
            {
                "classe": ["Agricultura intensiva", "Pastagem antrópica"],
                "descricao": ["Uso agrícola consolidado", "Uso pecuário consolidado"],
            },
            geometry=[self._poly(0, 0), self._poly(2, 2)],
            crs="EPSG:4674",
        )

        with self.assertRaises(PrepareNovasFontesUcsError):
            build_prepared_novas_fontes_ucs(
                source_layers=[
                    SourceLayer(
                        source_name="7-geoftp.ibge.gov.br",
                        shp_path=self.tmp_dir / "ibge.shp",
                        gdf=source,
                    )
                ],
                base_ucs=None,
            )

    def test_build_prepared_novas_fontes_drops_non_polygon_geometries(self):
        source = gpd.GeoDataFrame(
            {
                "nome": ["Parque Municipal Polygon", "Parque Municipal Linha"],
                "categoria": ["Parque", "Parque"],
            },
            geometry=[
                self._poly(0, 0),
                LineString([(0, 0), (1, 1)]),
            ],
            crs="EPSG:4674",
        )

        prepared, metrics = build_prepared_novas_fontes_ucs(
            source_layers=[
                SourceLayer(
                    source_name="6-centrodametropole",
                    shp_path=self.tmp_dir / "mixed_geom.shp",
                    gdf=source,
                )
            ],
            base_ucs=None,
        )

        self.assertEqual(metrics["candidate_in"], 2)
        self.assertEqual(metrics["output_total"], 1)
        self.assertEqual(len(prepared), 1)
        self.assertIn(prepared.geometry.iloc[0].geom_type, {"Polygon", "MultiPolygon"})

    def test_discover_source_layers_ignores_generated_underscore_folders(self):
        root = self.tmp_dir / "NovasFontes"
        src_ok = root / "10-siga.meioambiente.go.gov.br"
        src_skip = root / "_normalizado_ucs_v4"
        src_ok.mkdir(parents=True, exist_ok=True)
        src_skip.mkdir(parents=True, exist_ok=True)

        gdf = gpd.GeoDataFrame(
            {"nome": ["Parque Teste"], "categoria": ["Parque"]},
            geometry=[self._poly(0, 0)],
            crs="EPSG:4674",
        )
        gdf.to_file(src_ok / "ok.shp", driver="ESRI Shapefile", encoding="UTF-8")
        gdf.to_file(src_skip / "skip.shp", driver="ESRI Shapefile", encoding="UTF-8")

        layers = discover_source_layers(root)
        self.assertEqual(len(layers), 1)
        self.assertEqual(layers[0].source_name, "10-siga.meioambiente.go.gov.br")


if __name__ == "__main__":
    unittest.main()
