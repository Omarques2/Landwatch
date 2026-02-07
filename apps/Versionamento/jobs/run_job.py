import os
import sys
import argparse
from pathlib import Path
from typing import Dict
import traceback

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

from steps.common import JobConfig, StorageClient, DatasetArtifact, now_run_id, log_info, log_warn, compute_fingerprint, cleanup_files
from steps.download_prodes import run as download_prodes
from steps.download_deter import run as download_deter
from steps.download_sicar import run as download_sicar
from steps.download_url import run as download_url
from steps.manifest import build_manifest, get_prev_fingerprint, load_latest_manifest, save_manifest
from steps.ingest import run_ingest
from steps.cleanup import cleanup_category


def build_config() -> JobConfig:
    work_dir = Path(os.environ.get("LANDWATCH_WORK_DIR", "work")).resolve()
    storage_mode = os.environ.get("LANDWATCH_STORAGE_MODE", "blob").strip().lower()
    blob_conn = os.environ.get("LANDWATCH_BLOB_CONNECTION_STRING", "").strip()
    blob_container = os.environ.get("LANDWATCH_BLOB_CONTAINER", "").strip()
    blob_prefix = os.environ.get("LANDWATCH_BLOB_PREFIX", "landwatch").strip()
    retention_runs = int(os.environ.get("LANDWATCH_RETENTION_RUNS", "2"))
    save_raw = os.environ.get("LANDWATCH_SAVE_RAW", "0").strip().lower() in ("1", "true", "yes")
    return JobConfig(
        work_dir=work_dir,
        storage_mode=storage_mode,
        blob_conn=blob_conn or None,
        blob_container=blob_container or None,
        blob_prefix=blob_prefix,
        retention_runs=retention_runs,
        save_raw=save_raw,
    )


def upload_artifacts(storage: StorageClient, run_id: str, artifacts, work_dir: Path):
    for art in artifacts:
        for file_path in art.files:
            try:
                rel = file_path.relative_to(work_dir)
            except ValueError:
                rel = Path(art.category) / file_path.name
            storage_path = f"raw/{run_id}/{rel.as_posix()}"
            storage.upload_file(file_path, storage_path)


def process_category(storage: StorageClient, run_id: str, category: str, artifacts, config: JobConfig) -> Dict[str, str]:
    if not artifacts:
        return {"status": "skipped", "reason": "no_artifacts"}

    prev_manifest = load_latest_manifest(storage, category)
    changed = []
    for art in artifacts:
        current_fp = compute_fingerprint(art.files)
        prev_fp = get_prev_fingerprint(prev_manifest, art.dataset_code)
        if not prev_fp or current_fp != prev_fp:
            changed.append(art)

    if config.save_raw:
        upload_artifacts(storage, run_id, artifacts, config.work_dir)

    status = "skipped"
    if changed:
        ok = run_ingest(changed, artifacts[0].snapshot_date)
        status = "ingested" if ok else "failed"
    else:
        status = "skipped"

    manifest = build_manifest(run_id, category, artifacts)
    manifest["status"] = status
    save_manifest(storage, category, run_id, manifest)

    if status == "ingested":
        cleanup_category(storage, category, retention_runs=config.retention_runs)

    if status in ("ingested", "skipped"):
        cleanup_files(artifacts)

    return {"status": status, "changed": str(len(changed))}


def load_existing_artifacts(work_dir: Path, category: str, snapshot_date: str):
    category_dir = work_dir / category
    if not category_dir.exists():
        return []
    artifacts = []
    for shp in category_dir.rglob("*.shp"):
        base = shp.with_suffix("")
        files = [p for p in base.parent.glob(base.name + ".*")]
        if not files:
            continue
        dataset_code = base.name.upper()
        artifacts.append(
            DatasetArtifact(
                category=category,
                dataset_code=dataset_code,
                files=files,
                snapshot_date=snapshot_date,
            )
        )
    return artifacts


def _parse_args():
    parser = argparse.ArgumentParser(description="LandWatch versionamento job runner")
    parser.add_argument(
        "--category",
        action="append",
        choices=["PRODES", "DETER", "SICAR", "URL"],
        help="Categoria a executar (pode repetir). Se omitido, executa todas.",
    )
    parser.add_argument(
        "--prodes-workspaces",
        help="Lista separada por virgula de workspaces PRODES (ex: prodes-mata-atlantica-nb)",
    )
    parser.add_argument(
        "--prodes-years",
        help="Lista separada por virgula de anos PRODES (ex: 2020,2021)",
    )
    return parser.parse_args()


def _filter_prodes_artifacts(artifacts, workspaces, years):
    if not workspaces:
        filtered = artifacts
    else:
        ws_prefixes = [w.strip().replace("-", "_").upper() for w in workspaces if w.strip()]
        if not ws_prefixes:
            filtered = artifacts
        else:
            filtered = [a for a in artifacts if any(a.dataset_code.startswith(p) for p in ws_prefixes)]
    if not years:
        return filtered
    year_suffixes = {str(y).strip() for y in years if str(y).strip()}
    if not year_suffixes:
        return filtered
    return [a for a in filtered if any(a.dataset_code.endswith(suf) for suf in year_suffixes)]


def run_all(config: JobConfig, snapshot_date: str, categories=None, prodes_workspaces=None, prodes_years=None):
    config.work_dir.mkdir(parents=True, exist_ok=True)
    storage = StorageClient(
        mode=config.storage_mode,
        local_root=Path(os.environ.get("LANDWATCH_LOCAL_ROOT", "storage")).resolve(),
        blob_conn=config.blob_conn,
        blob_container=config.blob_container,
        blob_prefix=config.blob_prefix,
    )
    run_id = now_run_id()

    results = {}
    def should_run(category: str) -> bool:
        return not categories or category in categories
    if should_run("PRODES"):
        try:
            log_info("Download PRODES...")
            prev_manifest = load_latest_manifest(storage, "PRODES")
            reuse = prev_manifest and prev_manifest.get("status") == "failed"
            artifacts = []
            if reuse:
                artifacts = load_existing_artifacts(config.work_dir, "PRODES", snapshot_date)
                artifacts = _filter_prodes_artifacts(artifacts, prodes_workspaces, prodes_years)
                if artifacts:
                    log_info("PRODES: reutilizando arquivos baixados (manifest failed).")
            if not artifacts:
                artifacts = download_prodes(
                    config.work_dir,
                    snapshot_date,
                    workspaces=prodes_workspaces,
                    years=prodes_years,
                )
            results["PRODES"] = process_category(storage, run_id, "PRODES", artifacts, config)
        except Exception as exc:
            log_warn(f"PRODES falhou ({type(exc).__name__}): {exc}")
            log_warn(traceback.format_exc())
            results["PRODES"] = {"status": "failed"}

    if should_run("DETER"):
        try:
            log_info("Download DETER...")
            prev_manifest = load_latest_manifest(storage, "DETER")
            reuse = prev_manifest and prev_manifest.get("status") == "failed"
            artifacts = []
            if reuse:
                artifacts = load_existing_artifacts(config.work_dir, "DETER", snapshot_date)
                if artifacts:
                    log_info("DETER: reutilizando arquivos baixados (manifest failed).")
            if not artifacts:
                artifacts = download_deter(config.work_dir, snapshot_date)
            results["DETER"] = process_category(storage, run_id, "DETER", artifacts, config)
        except Exception as exc:
            log_warn(f"DETER falhou ({type(exc).__name__}): {exc}")
            log_warn(traceback.format_exc())
            results["DETER"] = {"status": "failed"}

    if should_run("SICAR"):
        try:
            log_info("Download SICAR...")
            prev_manifest = load_latest_manifest(storage, "SICAR")
            reuse = prev_manifest and prev_manifest.get("status") == "failed"
            artifacts = []
            if reuse:
                artifacts = load_existing_artifacts(config.work_dir, "SICAR", snapshot_date)
                if artifacts:
                    log_info("SICAR: reutilizando arquivos baixados (manifest failed).")
            if not artifacts:
                artifacts = download_sicar(config.work_dir, snapshot_date)
            results["SICAR"] = process_category(storage, run_id, "SICAR", artifacts, config)
        except Exception as exc:
            log_warn(f"SICAR falhou ({type(exc).__name__}): {exc}")
            log_warn(traceback.format_exc())
            results["SICAR"] = {"status": "failed"}

    if should_run("URL"):
        try:
            log_info("Download URLs...")
            prev_manifest = load_latest_manifest(storage, "URL")
            reuse = prev_manifest and prev_manifest.get("status") == "failed"
            artifacts = []
            if reuse:
                artifacts = load_existing_artifacts(config.work_dir, "URL", snapshot_date)
                if artifacts:
                    log_info("URL: reutilizando arquivos baixados (manifest failed).")
            if not artifacts:
                artifacts = download_url(config.work_dir, snapshot_date)
            results["URL"] = process_category(storage, run_id, "URL", artifacts, config)
        except Exception as exc:
            log_warn(f"URL falhou ({type(exc).__name__}): {exc}")
            log_warn(traceback.format_exc())
            results["URL"] = {"status": "failed"}

    log_info(f"Resumo: {results}")


if __name__ == "__main__":
    args = _parse_args()
    categories = args.category or None
    prodes_workspaces = None
    if args.prodes_workspaces:
        prodes_workspaces = [w.strip() for w in args.prodes_workspaces.split(",") if w.strip()]
    prodes_years = None
    if args.prodes_years:
        prodes_years = [int(y.strip()) for y in args.prodes_years.split(",") if y.strip()]

    config = build_config()
    snapshot_date = os.environ.get("LANDWATCH_DEFAULT_SNAPSHOT_DATE") or None
    if not snapshot_date:
        from datetime import date
        snapshot_date = date.today().isoformat()
    run_all(
        config,
        snapshot_date,
        categories=categories,
        prodes_workspaces=prodes_workspaces,
        prodes_years=prodes_years,
    )
