import os
import sys
import logging
from pathlib import Path

try:
    from dotenv import load_dotenv
except Exception:
    load_dotenv = None

root = Path(__file__).resolve().parents[1]
if str(root) not in sys.path:
    sys.path.insert(0, str(root))

if load_dotenv:
    env_path = root / ".env"
    if env_path.exists():
        load_dotenv(env_path)

from steps.common import DatasetArtifact, ensure_dir, log_info, log_warn
from steps.download_prodes import (
    DEFAULT_PAGE_SIZE,
    MIN_YEAR_BY_WS,
    fetch_layer,
    get_year_range,
    save_shapefile,
)


WORKSPACE = "prodes-mata-atlantica-nb"
LAYER = "yearly_deforestation"


def run(work_dir: Path, snapshot_date: str) -> list[DatasetArtifact]:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    page_size = int(os.environ.get("PRODES_PAGE_SIZE", DEFAULT_PAGE_SIZE))
    all_years = os.environ.get("PRODES_ALL_YEARS", "1").strip().lower() not in ("0", "false", "no")

    out_root = work_dir / "PRODES"
    artifacts: list[DatasetArtifact] = []

    if all_years:
        y_min, y_max = get_year_range(WORKSPACE, LAYER)
        start = max(y_min, MIN_YEAR_BY_WS.get(WORKSPACE, y_min))
        years = range(start, y_max + 1)
    else:
        years = [get_year_range(WORKSPACE, LAYER)[1]]

    for year in years:
        log_info(f"Processando {WORKSPACE}:{LAYER} ano={year}")
        gdf = fetch_layer(WORKSPACE, LAYER, year, page_size)
        if gdf.empty:
            log_warn(f"GeoDataFrame vazio para {WORKSPACE}:{LAYER} ano={year}")
            continue

        ws_folder = WORKSPACE.replace("-", "_")
        out_dir = out_root / ws_folder
        name = f"{ws_folder}_{year}"
        ensure_dir(out_dir)
        shp_path = save_shapefile(gdf, out_dir, name)
        files = sorted(shp_path.parent.glob(f"{name}.*"))
        artifacts.append(
            DatasetArtifact(
                category="PRODES",
                dataset_code=name.upper(),
                files=files,
                snapshot_date=snapshot_date,
                extra={"workspace": WORKSPACE, "layer": LAYER, "year": year},
            )
        )

    return artifacts


if __name__ == "__main__":
    work_dir = Path(os.environ.get("LANDWATCH_WORK_DIR", "work")).resolve()
    work_dir.mkdir(parents=True, exist_ok=True)
    snapshot_date = os.environ.get("LANDWATCH_DEFAULT_SNAPSHOT_DATE") or None
    if not snapshot_date:
        from datetime import date

        snapshot_date = date.today().isoformat()

    artifacts = run(work_dir, snapshot_date)
    log_info(f"Concluído. SHPs gerados: {len(artifacts)}")
