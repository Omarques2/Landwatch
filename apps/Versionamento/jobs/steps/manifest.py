import json
from pathlib import Path
from typing import Iterable, List, Optional

from .common import DatasetArtifact, StorageClient, compute_fingerprint, log_info


def build_manifest(run_id: str, category: str, artifacts: Iterable[DatasetArtifact]) -> dict:
    datasets = []
    for art in artifacts:
        fp = compute_fingerprint(art.files)
        datasets.append(
            {
                "dataset_code": art.dataset_code,
                "snapshot_date": art.snapshot_date,
                "files": [p.name for p in art.files],
                "fingerprint": fp,
                "extra": art.extra or {},
            }
        )
    return {
        "run_id": run_id,
        "category": category,
        "datasets": datasets,
    }


def load_latest_manifest(storage: StorageClient, category: str) -> Optional[dict]:
    prefix = f"manifests/{category}"
    paths = storage.list_paths(prefix)
    if not paths:
        return None
    # pick latest by filename sort
    names = sorted([Path(p).name for p in paths if p.endswith('.json')])
    if not names:
        return None
    latest = names[-1]
    payload = storage.read_text(f"{prefix}/{latest}")
    if not payload:
        return None
    return json.loads(payload)


def get_prev_fingerprint(prev_manifest: Optional[dict], dataset_code: str) -> Optional[str]:
    if not prev_manifest:
        return None
    if prev_manifest.get("status") == "failed":
        return None
    for ds in prev_manifest.get("datasets", []):
        if ds.get("dataset_code") == dataset_code:
            return ds.get("fingerprint")
    return None


def save_manifest(storage: StorageClient, category: str, run_id: str, manifest: dict) -> None:
    payload = json.dumps(manifest, ensure_ascii=False, indent=2)
    storage.write_text(f"manifests/{category}/{run_id}.json", payload)
    log_info(f"Manifest salvo: manifests/{category}/{run_id}.json")
