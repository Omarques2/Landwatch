import os
import json
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, List

from .common import DatasetArtifact, log_info, log_warn


@dataclass
class IngestResult:
    successes: List[str] = field(default_factory=list)
    success_versions: List[int] = field(default_factory=list)
    failures: Dict[str, str] = field(default_factory=dict)
    skipped: List[str] = field(default_factory=list)

    @property
    def ran_any(self) -> bool:
        return bool(self.successes or self.failures)

    @property
    def ok(self) -> bool:
        return bool(self.successes) and not self.failures


def run_pmtiles_build(dataset_codes: List[str]) -> bool:
    if not dataset_codes:
        return True
    build_enabled = os.environ.get("LANDWATCH_PMTILES_BUILD_ENABLED", "0").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )
    if not build_enabled:
        return True

    script = Path(__file__).resolve().parents[2] / "build_pmtiles.py"
    if not script.exists():
        raise FileNotFoundError(f"build_pmtiles.py nao encontrado: {script}")

    python_exec = os.environ.get("LANDWATCH_PYTHON_EXECUTABLE") or sys.executable
    cmd = [
        python_exec,
        str(script),
        "--dataset-codes",
        ",".join(sorted(set(dataset_codes))),
    ]
    log_info(f"Publicando PMTiles: {' '.join(cmd[:4])} ...")
    try:
        res = subprocess.run(cmd, check=False)
    except Exception as exc:
        log_warn(f"Build PMTiles falhou ({exc})")
        return False
    if res.returncode != 0:
        log_warn(f"Build PMTiles falhou (exit={res.returncode})")
        return False
    return True


def _ingest_script() -> Path:
    ingest_script = Path(__file__).resolve().parents[2] / "bulk_ingest.py"
    if not ingest_script.exists():
        raise FileNotFoundError(f"bulk_ingest.py nao encontrado: {ingest_script}")
    return ingest_script


def run_ingest_only(artifacts: Iterable[DatasetArtifact], snapshot_date: str) -> IngestResult:
    artifacts = list(artifacts)
    result = IngestResult()
    if not artifacts:
        log_info("Nenhum artefato para ingestao.")
        return result

    ingest_script = _ingest_script()
    python_exec = os.environ.get("LANDWATCH_PYTHON_EXECUTABLE") or sys.executable
    for art in artifacts:
        # Only pass primary inputs to bulk_ingest (.shp/.csv). Other sidecar files break ogr2ogr.
        primary = [p for p in art.files if p.suffix.lower() in (".shp", ".csv")]
        if not primary:
            result.skipped.append(art.dataset_code)
            continue
        files = [str(p) for p in primary]
        result_dir = Path(tempfile.mkdtemp(prefix="landwatch-ingest-result-"))
        result_json = result_dir / f"{art.dataset_code}.json"
        cmd = [
            python_exec,
            str(ingest_script),
            "--files",
            ",".join(files),
            "--snapshot-date",
            art.snapshot_date or snapshot_date,
            "--skip-mv-refresh",
            "--result-json",
            str(result_json),
        ]
        log_info(f"Executando ingestao: {' '.join(cmd[:4])} ...")
        try:
            res = subprocess.run(cmd, check=False)
        except Exception as exc:
            log_warn(f"Ingestao falhou (dataset={art.dataset_code}, erro={exc})")
            result.failures[art.dataset_code] = str(exc)
            shutil.rmtree(result_dir, ignore_errors=True)
            continue
        if res.returncode != 0:
            log_warn(f"Ingestao falhou (dataset={art.dataset_code}, exit={res.returncode})")
            result.failures[art.dataset_code] = f"exit={res.returncode}"
            shutil.rmtree(result_dir, ignore_errors=True)
            continue
        try:
            payload = json.loads(result_json.read_text(encoding="utf-8"))
            for item in payload.get("datasets", []):
                version_id = item.get("version_id")
                if version_id is not None:
                    result.success_versions.append(int(version_id))
        except Exception as exc:
            log_warn(f"Resultado da ingestao sem version_id (dataset={art.dataset_code}, erro={exc})")
        result.successes.append(art.dataset_code)
        shutil.rmtree(result_dir, ignore_errors=True)
    return result


def refresh_mvs_once(dataset_codes: List[str] | None = None, version_ids: List[int] | None = None) -> bool:
    ingest_script = _ingest_script()
    python_exec = os.environ.get("LANDWATCH_PYTHON_EXECUTABLE") or sys.executable
    refresh_cmd = [
        python_exec,
        str(ingest_script),
        "--refresh-mvs-only",
    ]
    codes = sorted({str(code).strip() for code in (dataset_codes or []) if str(code).strip()})
    if codes:
        refresh_cmd.extend(["--tile-cache-dataset-codes", ",".join(codes)])
    versions = sorted({int(version_id) for version_id in (version_ids or []) if version_id})
    if versions:
        refresh_cmd.extend(["--cache-version-ids", ",".join(str(version_id) for version_id in versions)])
    log_info("Atualizando MVs (uma vez ao final do job)...")
    try:
        res = subprocess.run(refresh_cmd, check=False)
        if res.returncode != 0:
            log_warn(f"Falha ao atualizar MVs (exit={res.returncode})")
            return False
    except Exception as exc:
        log_warn(f"Falha ao atualizar MVs: {exc}")
        return False
    return True


def run_ingest(artifacts: Iterable[DatasetArtifact], snapshot_date: str) -> bool:
    result = run_ingest_only(artifacts, snapshot_date)
    if not result.ran_any:
        return True
    if not result.ok:
        return False
    if not refresh_mvs_once(result.successes, result.success_versions):
        return False
    return run_pmtiles_build(result.successes)
