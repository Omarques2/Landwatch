import os
import time
import datetime
import tempfile
from pathlib import Path
from typing import List
from urllib.parse import quote

import requests
import geopandas as gpd

from .common import DatasetArtifact, ensure_dir, log_info, log_warn

DEFAULT_PAGE_SIZE = 50000
TIMEOUT = 60
MAX_RETRIES = 3
RETRY_BACKOFF = 5.0

LAYERS = {
    "deter-amz:deter_amz": "https://terrabrasilis.dpi.inpe.br/geoserver/deter-amz/ows",
    "deter-cerrado-nb:deter_cerrado": "https://terrabrasilis.dpi.inpe.br/geoserver/deter-cerrado-nb/ows",
}

EXTENSIONS = ("shp", "shx", "dbf", "prj", "cpg", "qpj")

session = requests.Session()


def get_with_retry(url_base: str, params: dict, layer_name: str, idx: int):
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            r = session.get(url_base, params=params, timeout=TIMEOUT)
            r.raise_for_status()
            return r
        except requests.exceptions.RequestException as e:
            log_warn(f"{layer_name} (idx={idx}) tentativa {attempt}/{MAX_RETRIES} falhou: {e}")
            if attempt < MAX_RETRIES:
                sleep_sec = RETRY_BACKOFF * attempt
                time.sleep(sleep_sec)
            else:
                return None


def export_shp(gdf: gpd.GeoDataFrame, prefix: str, target_dir: Path) -> List[Path]:
    if gdf is None or gdf.empty:
        raise ValueError("GeoDataFrame vazio")
    ensure_dir(target_dir)
    with tempfile.TemporaryDirectory() as tmp:
        tmp_base = Path(tmp) / prefix
        shp_path = f"{tmp_base}.shp"
        if gdf.crs is None:
            gdf = gdf.set_crs("EPSG:4674", inplace=False)
        gdf.to_file(shp_path)
        out_files = []
        for ext in EXTENSIONS:
            src = tmp_base.with_suffix(f".{ext}")
            if not src.exists():
                continue
            dest = target_dir / f"{prefix}.{ext}"
            dest.write_bytes(src.read_bytes())
            out_files.append(dest)
        return out_files


def run(work_dir: Path, snapshot_date: str) -> List[DatasetArtifact]:
    page_size = int(os.environ.get("DETER_PAGE_SIZE", DEFAULT_PAGE_SIZE))
    all_years = os.environ.get("DETER_ALL_YEARS", "1").strip().lower() not in ("0", "false", "no")
    dias = int(os.environ.get("DETER_DIAS", "7"))

    out_root = work_dir / "DETER"
    artifacts: List[DatasetArtifact] = []

    if all_years:
        for layer_name, url_base in LAYERS.items():
            all_feats = []
            idx = 0
            while True:
                params = {
                    "service": "WFS",
                    "version": "2.0.0",
                    "request": "GetFeature",
                    "typeNames": layer_name,
                    "outputFormat": "application/json",
                    "count": page_size,
                    "startIndex": idx,
                    "sortBy": "view_date A",
                }
                r = get_with_retry(url_base, params, layer_name, idx)
                if r is None:
                    break
                feats = r.json().get("features", [])
                if not feats:
                    break
                all_feats.extend(feats)
                idx += len(feats)
                log_info(f"{layer_name}: {idx} registros carregados...")

            if not all_feats:
                log_warn(f"{layer_name}: sem feicoes")
                continue

            gdf = gpd.GeoDataFrame.from_features(all_feats)
            prefix = f"{layer_name.split(':', 1)[0]}_ALLYEARS"
            target_dir = out_root
            files = export_shp(gdf, prefix, target_dir)
            artifacts.append(
                DatasetArtifact(
                    category="DETER",
                    dataset_code=prefix.upper(),
                    files=files,
                    snapshot_date=snapshot_date,
                    extra={"layer": layer_name},
                )
            )
    else:
        hoje = datetime.date.today()
        inicio = hoje - datetime.timedelta(days=dias)
        for layer_name, url_base in LAYERS.items():
            filtro = quote(f"view_date >= '{inicio}'")
            url_wfs = (
                f"{url_base}?service=WFS&version=1.0.0&request=GetFeature"
                f"&typeName={layer_name}"
                f"&outputFormat=application/json"
                f"&CQL_FILTER={filtro}"
            )
            gdf = gpd.read_file(url_wfs)
            if gdf.empty:
                log_info(f"{layer_name}: sem dados no periodo")
                continue
            prefix = f"{layer_name.split(':', 1)[0]}_{hoje}"
            files = export_shp(gdf, prefix, out_root)
            artifacts.append(
                DatasetArtifact(
                    category="DETER",
                    dataset_code=prefix.upper(),
                    files=files,
                    snapshot_date=snapshot_date,
                    extra={"layer": layer_name},
                )
            )

    return artifacts
