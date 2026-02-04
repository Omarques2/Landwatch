from pathlib import Path
from typing import List

from .common import StorageClient, log_info


def cleanup_category(storage: StorageClient, category: str, retention_runs: int) -> None:
    manifest_prefix = f"manifests/{category}"
    manifest_paths = storage.list_paths(manifest_prefix)
    names = sorted([Path(p).name for p in manifest_paths if p.endswith('.json')])
    if len(names) <= retention_runs:
        return
    to_remove = names[:-retention_runs]
    for name in to_remove:
        run_id = Path(name).stem
        raw_prefix = f"raw/{category}/{run_id}"
        for path in storage.list_paths(raw_prefix):
            rel = path.replace(storage.blob_prefix + '/', '') if storage.mode == 'blob' else str(Path(path).relative_to(storage.local_root))
            storage.delete_path(rel)
        storage.delete_path(f"{manifest_prefix}/{name}")
        log_info(f"Limpeza: removido run {run_id} de {category}")
