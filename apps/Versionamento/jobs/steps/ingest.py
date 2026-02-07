import os
import subprocess
import sys
from pathlib import Path
from typing import Iterable, List

from .common import DatasetArtifact, log_info, log_warn


def run_ingest(artifacts: Iterable[DatasetArtifact], snapshot_date: str) -> bool:
    artifacts = list(artifacts)
    if not artifacts:
        log_info("Nenhum artefato para ingestao.")
        return True

    ingest_script = Path(__file__).resolve().parents[2] / "bulk_ingest.py"
    if not ingest_script.exists():
        raise FileNotFoundError(f"bulk_ingest.py nao encontrado: {ingest_script}")

    ok_all = True
    python_exec = os.environ.get("LANDWATCH_PYTHON_EXECUTABLE") or sys.executable
    ran_any = False
    for art in artifacts:
        # Only pass primary inputs to bulk_ingest (.shp/.csv). Other sidecar files break ogr2ogr.
        primary = [p for p in art.files if p.suffix.lower() in (".shp", ".csv")]
        if not primary:
            continue
        ran_any = True
        files = [str(p) for p in primary]
        cmd = [
            python_exec,
            str(ingest_script),
            "--files",
            ",".join(files),
            "--snapshot-date",
            snapshot_date,
            "--skip-mv-refresh",
        ]
        log_info(f"Executando ingestao: {' '.join(cmd[:4])} ...")
        try:
            res = subprocess.run(cmd, check=False)
        except Exception as exc:
            log_warn(f"Ingestao falhou (dataset={art.dataset_code}, erro={exc})")
            ok_all = False
            continue
        if res.returncode != 0:
            log_warn(f"Ingestao falhou (dataset={art.dataset_code}, exit={res.returncode})")
            ok_all = False
    if ran_any:
        refresh_cmd = [
            python_exec,
            str(ingest_script),
            "--refresh-mvs-only",
        ]
        log_info("Atualizando MVs (uma vez ao final)...")
        try:
            res = subprocess.run(refresh_cmd, check=False)
            if res.returncode != 0:
                log_warn(f"Falha ao atualizar MVs (exit={res.returncode})")
                ok_all = False
        except Exception as exc:
            log_warn(f"Falha ao atualizar MVs: {exc}")
            ok_all = False
    return ok_all
