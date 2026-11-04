import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

if "geopandas" not in sys.modules:
    class _GeoDataFrame:
        def __init__(self, features=None):
            self.features = list(features or [])

        @property
        def empty(self):
            return not self.features

        @classmethod
        def from_features(cls, features):
            return cls(features)

    geopandas_stub = types.ModuleType("geopandas")
    geopandas_stub.GeoDataFrame = _GeoDataFrame
    sys.modules["geopandas"] = geopandas_stub

from steps import download_prodes


class FakeResponse:
    def __init__(self, count, start=0, matched=None):
        self._features = [
            {"properties": {"year": 2020, "uuid": f"u{start + i}"}} for i in range(count)
        ]
        self._matched = matched

    def json(self):
        data = {"features": self._features}
        if self._matched is not None:
            data["numberMatched"] = self._matched
        return data


class FetchLayerTest(unittest.TestCase):
    def test_sorts_by_fid_so_pages_do_not_overlap(self):
        with patch.object(
            download_prodes,
            "request_with_retry",
            side_effect=[FakeResponse(1)],
        ) as request:
            download_prodes.fetch_layer("ws", "layer", 2020, page_size=3)

        params = request.call_args.args[1]
        self.assertEqual(params["sortBy"], "fid A")

    def test_raises_when_pages_repeat_features_instead_of_ingesting_a_partial_year(self):
        responses = [FakeResponse(3, matched=4), FakeResponse(1, start=2)]
        with patch.object(download_prodes, "request_with_retry", side_effect=responses):
            with self.assertRaises(RuntimeError):
                download_prodes.fetch_layer("ws", "layer", 2020, page_size=3)

    def test_accepts_a_complete_year_matching_the_server_count(self):
        responses = [FakeResponse(3, matched=4), FakeResponse(1, start=3)]
        with patch.object(download_prodes, "request_with_retry", side_effect=responses):
            gdf = download_prodes.fetch_layer("ws", "layer", 2020, page_size=3)

        self.assertEqual(len(gdf.features), 4)

    def test_stops_after_a_short_page_without_an_extra_request(self):
        responses = [FakeResponse(3), FakeResponse(1, start=3)]
        with patch.object(
            download_prodes,
            "request_with_retry",
            side_effect=responses,
        ) as request:
            gdf = download_prodes.fetch_layer("ws", "layer", 2020, page_size=3)

        self.assertEqual(len(gdf.features), 4)
        self.assertEqual(request.call_count, 2)

    def test_raises_instead_of_returning_a_partial_year_when_a_page_fails(self):
        with patch.object(
            download_prodes,
            "request_with_retry",
            side_effect=[FakeResponse(3), None],
        ):
            with self.assertRaises(RuntimeError):
                download_prodes.fetch_layer("ws", "layer", 2020, page_size=3)


class RunTest(unittest.TestCase):
    def test_skips_only_the_failed_year_and_keeps_the_others(self):
        def fake_fetch(_ws, _layer, year, _page_size):
            if year == 2021:
                raise RuntimeError("page failed")
            return sys.modules["geopandas"].GeoDataFrame([{"year": year}])

        with tempfile.TemporaryDirectory(prefix="prodes_run_test_") as tmp, patch.object(
            download_prodes, "fetch_layer", side_effect=fake_fetch
        ), patch.object(
            download_prodes,
            "save_shapefile",
            side_effect=lambda _gdf, out_dir, name: Path(out_dir) / f"{name}.shp",
        ):
            artifacts = download_prodes.run(
                Path(tmp),
                "2026-10-30",
                workspaces=["prodes-pampa-nb"],
                years=[2020, 2021, 2022],
            )

        self.assertEqual(
            [art.dataset_code for art in artifacts],
            ["PRODES_PAMPA_NB_2020", "PRODES_PAMPA_NB_2022"],
        )


if __name__ == "__main__":
    unittest.main()
