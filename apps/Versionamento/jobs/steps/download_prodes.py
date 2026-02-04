import os
import time
import logging
from pathlib import Path
from typing import List

import requests
import geopandas as gpd

from .common import DatasetArtifact, ensure_dir, log_info, log_warn

DEFAULT_PAGE_SIZE = 50000
TIMEOUT = 60
MAX_RETRIES = 3
RETRY_BACKOFF = 5.0

LAYERS = [
    ("prodes-amazon-nb", "yearly_deforestation_biome"),
    ("prodes-pampa-nb", "yearly_deforestation"),
    ("prodes-pantanal-nb", "yearly_deforestation"),
    ("prodes-caatinga-nb", "yearly_deforestation"),
    ("prodes-mata-atlantica-nb", "yearly_deforestation"),
    ("prodes-cerrado-nb", "yearly_deforestation"),
    ("prodes-legal-amz", "yearly_deforestation"),
]

MIN_YEAR_BY_WS = {
    "prodes-amazon-nb": 2008,
    "prodes-legal-amz": 2008,
    "prodes-caatinga-nb": 2020,
    "prodes-cerrado-nb": 2020,
    "prodes-mata-atlantica-nb": 2020,
    "prodes-pampa-nb": 2020,
    "prodes-pantanal-nb": 2020,
}

session = requests.Session()


def request_with_retry(url: str, params: dict, workspace: str, layer: str, year: int, index: int):
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = session.get(url, params=params, timeout=TIMEOUT)
            resp.raise_for_status()
            return resp
        except requests.exceptions.RequestException as e:
            log_warn(
                f"{workspace}:{layer} ano={year} idx={index} – tentativa {attempt}/{MAX_RETRIES} falhou: {e}"
            )
            if attempt < MAX_RETRIES:
                wait = RETRY_BACKOFF * attempt
                time.sleep(wait)
            else:
                log_warn(
                    f"{workspace}:{layer} ano={year} idx={index} – excedeu tentativas."
                )
                return None


def get_year_range(workspace: str, layer: str) -> tuple[int, int]:
    url = f"https://terrabrasilis.dpi.inpe.br/geoserver/{workspace}/wfs"

    def fetch(order: str) -> int:
        params = {
            "service": "WFS",
            "version": "2.0.0",
            "request": "GetFeature",
            "typeNames": f"{workspace}:{layer}",
            "outputFormat": "application/json",
            "count": 1,
            "startIndex": 0,
            "sortBy": f"year {order}",
        }
        r = request_with_retry(url, params, workspace, layer, year=-1, index=0)
        if r is None:
            raise RuntimeError(f"Não foi possível obter ano ({order}) de {workspace}:{layer}")
        feats = r.json().get("features", [])
        if not feats:
            raise ValueError(f"Nenhum dado em {workspace}:{layer}")
        return feats[0]["properties"]["year"]

    return fetch("A"), fetch("D")


def fetch_layer(workspace: str, layer: str, year: int, page_size: int) -> gpd.GeoDataFrame:
    url = f"https://terrabrasilis.dpi.inpe.br/geoserver/{workspace}/wfs"
    all_feats = []
    index = 0

    while True:
        params = {
            "service": "WFS",
            "version": "2.0.0",
            "request": "GetFeature",
            "typeNames": f"{workspace}:{layer}",
            "outputFormat": "application/json",
            "count": page_size,
            "startIndex": index,
            "CQL_FILTER": f"year={year}",
            "sortBy": "year A",
        }

        resp = request_with_retry(url, params, workspace, layer, year, index)
        if resp is None:
            break
        feats = resp.json().get("features", [])
        if not feats:
            break
        all_feats.extend(feats)
        index += len(feats)
        log_info(f"{workspace}:{layer} — {index} registros carregados para ano {year}")

    if not all_feats:
        return gpd.GeoDataFrame()
    return gpd.GeoDataFrame.from_features(all_feats)


def save_shapefile(gdf: gpd.GeoDataFrame, out_dir: Path, name: str) -> Path:
    if gdf.empty:
        raise ValueError("GeoDataFrame vazio")
    if gdf.crs is None:
        gdf = gdf.set_crs("EPSG:4674", inplace=False)
    ensure_dir(out_dir)
    shp_path = out_dir / f"{name}.shp"
    gdf.to_file(shp_path)
    return shp_path


def run(work_dir: Path, snapshot_date: str) -> List[DatasetArtifact]:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    page_size = int(os.environ.get("PRODES_PAGE_SIZE", DEFAULT_PAGE_SIZE))
    all_years = os.environ.get("PRODES_ALL_YEARS", "1").strip().lower() not in ("0", "false", "no")

    out_root = work_dir / "PRODES"
    artifacts: List[DatasetArtifact] = []

    for ws, layer in LAYERS:
        try:
            if all_years:
                y_min, y_max = get_year_range(ws, layer)
                start = max(y_min, MIN_YEAR_BY_WS.get(ws, y_min))
                years = range(start, y_max + 1)
            else:
                years = [get_year_range(ws, layer)[1]]

            for year in years:
                log_info(f"Processando {ws}:{layer} ano={year}")
                gdf = fetch_layer(ws, layer, year, page_size)
                if gdf.empty:
                    log_warn(f"GeoDataFrame vazio para {ws}:{layer} ano={year}")
                    continue

                ws_folder = ws.replace("-", "_")
                out_dir = out_root / ws_folder
                name = f"{ws_folder}_{year}"
                shp_path = save_shapefile(gdf, out_dir, name)
                files = sorted(shp_path.parent.glob(f"{name}.*"))
                artifacts.append(
                    DatasetArtifact(
                        category="PRODES",
                        dataset_code=name.upper(),
                        files=files,
                        snapshot_date=snapshot_date,
                        extra={"workspace": ws, "layer": layer, "year": year},
                    )
                )
        except Exception as exc:
            log_warn(f"Erro em {ws}:{layer}: {exc}")
    return artifacts
