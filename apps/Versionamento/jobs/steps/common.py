import hashlib
import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, List, Optional


def now_run_id() -> str:
    return datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')


def log_info(msg: str) -> None:
    print(f"[INFO] {msg}")


def log_warn(msg: str) -> None:
    print(f"[WARN] {msg}")


def log_error(msg: str) -> None:
    print(f"[ERROR] {msg}")


@dataclass
class DatasetArtifact:
    category: str
    dataset_code: str
    files: List[Path]
    snapshot_date: str
    extra: Optional[dict] = None


@dataclass
class JobConfig:
    work_dir: Path
    storage_mode: str
    blob_conn: Optional[str]
    blob_container: Optional[str]
    blob_prefix: str
    retention_runs: int
    save_raw: bool


class StorageClient:
    def __init__(self, mode: str, local_root: Optional[Path] = None, blob_conn: Optional[str] = None,
                 blob_container: Optional[str] = None, blob_prefix: str = 'landwatch/raw'):
        self.mode = mode
        self.local_root = local_root
        self.blob_conn = blob_conn
        self.blob_container = blob_container
        self.blob_prefix = blob_prefix.strip('/')
        if mode == 'blob':
            try:
                from azure.storage.blob import BlobServiceClient
            except Exception as exc:
                raise RuntimeError('azure-storage-blob is required for blob mode') from exc
            if not blob_conn or not blob_container:
                raise RuntimeError('Blob connection string and container are required')
            self._client = BlobServiceClient.from_connection_string(blob_conn)
            self._container = self._client.get_container_client(blob_container)
            try:
                self._container.get_container_properties()
            except Exception:
                self._container.create_container()
        else:
            self._client = None
            self._container = None
            if not local_root:
                raise RuntimeError('local_root is required for local mode')
            local_root.mkdir(parents=True, exist_ok=True)

    def _blob_path(self, path: str) -> str:
        return f"{self.blob_prefix}/{path.strip('/')}"

    def upload_file(self, local_path: Path, rel_path: str) -> str:
        if self.mode == 'local':
            target = self.local_root / rel_path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(local_path.read_bytes())
            return str(target)
        blob_name = self._blob_path(rel_path)
        with local_path.open('rb') as f:
            self._container.upload_blob(blob_name, f, overwrite=True)
        return blob_name

    def write_text(self, rel_path: str, text: str) -> str:
        if self.mode == 'local':
            target = self.local_root / rel_path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(text, encoding='utf-8')
            return str(target)
        blob_name = self._blob_path(rel_path)
        self._container.upload_blob(blob_name, text.encode('utf-8'), overwrite=True)
        return blob_name

    def list_paths(self, prefix: str) -> List[str]:
        if self.mode == 'local':
            base = (self.local_root / prefix).resolve()
            if not base.exists():
                return []
            return [str(p) for p in base.rglob('*') if p.is_file()]
        blob_prefix = self._blob_path(prefix)
        return [b.name for b in self._container.list_blobs(name_starts_with=blob_prefix)]

    def read_text(self, rel_path: str) -> Optional[str]:
        if self.mode == 'local':
            target = self.local_root / rel_path
            if not target.exists():
                return None
            return target.read_text(encoding='utf-8')
        blob_name = self._blob_path(rel_path)
        try:
            blob = self._container.get_blob_client(blob_name)
            return blob.download_blob().readall().decode('utf-8')
        except Exception:
            return None

    def delete_path(self, rel_path: str) -> None:
        if self.mode == 'local':
            target = self.local_root / rel_path
            if target.exists():
                target.unlink()
            return
        blob_name = self._blob_path(rel_path)
        try:
            self._container.delete_blob(blob_name)
        except Exception:
            pass


def sha1_file(path: Path, chunk_bytes: int = 8 * 1024 * 1024) -> str:
    h = hashlib.sha1()
    with path.open('rb') as f:
        while True:
            b = f.read(chunk_bytes)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def compute_fingerprint(paths: Iterable[Path]) -> str:
    manifest = {}
    for p in sorted(paths, key=lambda x: x.name.lower()):
        if not p.exists():
            continue
        manifest[p.name] = {'sha1': sha1_file(p), 'size': int(p.stat().st_size)}
    payload = json.dumps(manifest, sort_keys=True, ensure_ascii=False)
    return hashlib.sha1(payload.encode('utf-8')).hexdigest()


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding='utf-8'))


def save_json(path: Path, payload: dict) -> None:
    ensure_dir(path.parent)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')


def cleanup_files(artifacts: Iterable[DatasetArtifact]) -> None:
    for art in artifacts:
        for file_path in art.files:
            try:
                if file_path.exists():
                    file_path.unlink()
            except Exception:
                pass
        try:
            if art.files:
                parent = art.files[0].parent
                if parent.exists() and not any(parent.iterdir()):
                    parent.rmdir()
        except Exception:
            pass
