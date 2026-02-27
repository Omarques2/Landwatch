import argparse
import csv
import datetime as dt
import json
import os
import re
import subprocess
import sys
import time
import random
from hashlib import sha1
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import shutil

import psycopg2
from dotenv import load_dotenv
from psycopg2 import sql
from urllib.parse import urlparse


# ============================================================
# Config e logging
# ============================================================
load_dotenv()

ROOT_DIR = os.environ.get("LANDWATCH_INGEST_ROOT_DIR", "Dados")
DEFAULT_SNAPSHOT_DATE = os.environ.get(
    "LANDWATCH_DEFAULT_SNAPSHOT_DATE",
    dt.date.today().isoformat(),
)
ENABLE_FINGERPRINT_SKIP = os.environ.get(
    "LANDWATCH_ENABLE_FINGERPRINT_SKIP", "1"
).strip().lower() not in ("0", "false", "no")

INGEST_SQL_PATH = os.environ.get("LANDWATCH_INGEST_SQL_PATH", "ingest.sql")
OGR2OGR_PATH = os.environ.get("LANDWATCH_OGR2OGR_PATH", "").strip()
OGR2OGR_ENCODING = os.environ.get("LANDWATCH_OGR2OGR_ENCODING", "LATIN1").strip()
GDAL_DATA = os.environ.get("LANDWATCH_GDAL_DATA", "").strip()
PROJ_LIB = os.environ.get("LANDWATCH_PROJ_LIB", "").strip()
OGR2OGR_TIMEOUT_SECONDS = int(os.environ.get("LANDWATCH_OGR2OGR_TIMEOUT_SECONDS", "0").strip() or "0")
OGR2OGR_PROGRESS_HEARTBEAT_SECONDS = int(
    os.environ.get("LANDWATCH_OGR2OGR_PROGRESS_HEARTBEAT_SECONDS", "60").strip() or "60"
)
OGR2OGR_GROUP_SIZE = int(os.environ.get("LANDWATCH_OGR2OGR_GROUP_SIZE", "65536").strip() or "65536")
OGR2OGR_GROUP_SIZE_LARGE = int(
    os.environ.get("LANDWATCH_OGR2OGR_GROUP_SIZE_LARGE", "20000").strip() or "20000"
)
OGR2OGR_GROUP_SIZE_XL = int(
    os.environ.get("LANDWATCH_OGR2OGR_GROUP_SIZE_XL", "10000").strip() or "10000"
)
OGR2OGR_GROUP_SIZE_MIN = int(
    os.environ.get("LANDWATCH_OGR2OGR_GROUP_SIZE_MIN", "2000").strip() or "2000"
)
OGR2OGR_LARGE_BYTES = int(
    os.environ.get("LANDWATCH_OGR2OGR_LARGE_BYTES", str(1024 * 1024 * 1024)).strip() or str(1024 * 1024 * 1024)
)
OGR2OGR_XL_BYTES = int(
    os.environ.get("LANDWATCH_OGR2OGR_XL_BYTES", str(2 * 1024 * 1024 * 1024)).strip() or str(2 * 1024 * 1024 * 1024)
)
OGR2OGR_USE_COPY = os.environ.get("LANDWATCH_OGR2OGR_USE_COPY", "1").strip().lower() not in (
    "0",
    "false",
    "no",
)
OGR2OGR_DISABLE_SPATIAL_INDEX = os.environ.get("LANDWATCH_OGR2OGR_DISABLE_SPATIAL_INDEX", "1").strip().lower() not in (
    "0",
    "false",
    "no",
)
OGR2OGR_SKIP_INVALID = os.environ.get("LANDWATCH_OGR2OGR_SKIP_INVALID", "1").strip().lower() not in (
    "0",
    "false",
    "no",
)
OGR2OGR_MAKEVALID = os.environ.get("LANDWATCH_OGR2OGR_MAKEVALID", "1").strip().lower() in (
    "1",
    "true",
    "yes",
)
OGR2OGR_ENABLE_METADATA = os.environ.get("LANDWATCH_OGR2OGR_ENABLE_METADATA", "0").strip().lower() in (
    "1",
    "true",
    "yes",
)
OGR2OGR_LOG_DIR = os.environ.get("LANDWATCH_OGR2OGR_LOG_DIR", "logs").strip()
OGR2OGR_NLT = os.environ.get("LANDWATCH_OGR2OGR_NLT", "GEOMETRY").strip()
OGR2OGR_STALL_SECONDS = int(
    os.environ.get("LANDWATCH_OGR2OGR_STALL_SECONDS", "900").strip() or "900"
)
OGR2OGR_MAX_RESTARTS = int(
    os.environ.get("LANDWATCH_OGR2OGR_MAX_RESTARTS", "2").strip() or "2"
)
LOG_LEVEL = os.environ.get("LANDWATCH_LOG_LEVEL", "INFO").strip().upper()
DB_MAX_RETRIES = int(os.environ.get("LANDWATCH_DB_MAX_RETRIES", "3").strip() or "3")
DB_RETRY_BASE_SECONDS = float(os.environ.get("LANDWATCH_DB_RETRY_BASE_SECONDS", "3").strip() or "3")
DB_RETRY_MAX_SECONDS = float(os.environ.get("LANDWATCH_DB_RETRY_MAX_SECONDS", "60").strip() or "60")
DB_RETRY_JITTER = float(os.environ.get("LANDWATCH_DB_RETRY_JITTER", "0.3").strip() or "0.3")
_LEVELS = {"DEBUG": 10, "INFO": 20, "WARN": 30, "ERROR": 40}


def _should_log(level: str) -> bool:
    return _LEVELS.get(level, 20) >= 0 and _LEVELS.get(LOG_LEVEL, 20) <= _LEVELS.get(level, 20)


def log_debug(msg: str):
    if _should_log("DEBUG"):
        print(f"[DEBUG] {msg}")


def log_info(msg: str):
    if _should_log("INFO"):
        print(f"[INFO] {msg}")


def log_warn(msg: str):
    if _should_log("WARN"):
        print(f"[WARN] {msg}")


def log_error(msg: str):
    if _should_log("ERROR"):
        print(f"[ERROR] {msg}")


def _retry_delay(attempt: int) -> float:
    if attempt <= 0:
        attempt = 1
    base = DB_RETRY_BASE_SECONDS * (2 ** (attempt - 1))
    delay = min(base, DB_RETRY_MAX_SECONDS)
    jitter = delay * DB_RETRY_JITTER
    if jitter <= 0:
        return delay
    return max(0.0, delay + random.uniform(-jitter, jitter))


def _is_transient_db_error(exc: Exception) -> bool:
    if isinstance(exc, (psycopg2.OperationalError, psycopg2.InterfaceError)):
        return True
    msg = str(exc).lower()
    transient_markers = [
        "connection timed out",
        "could not connect",
        "server closed the connection",
        "connection already closed",
        "terminating connection",
        "software caused connection abort",
        "ssl syscall error",
        "connection reset by peer",
        "could not receive data",
        "timeout expired",
    ]
    return any(marker in msg for marker in transient_markers)

def _format_bytes(num: int) -> str:
    units = ["B", "KB", "MB", "GB", "TB"]
    size = float(num)
    for u in units:
        if size < 1024 or u == units[-1]:
            return f"{size:.2f}{u}"
        size /= 1024
    return f"{size:.2f}TB"


def _ogr_has_postgres_driver(exe: str) -> bool:
    try:
        res = subprocess.run([exe, "--formats"], capture_output=True, text=True)
    except Exception:
        return False
    if res.returncode != 0:
        return False
    return "PostgreSQL -vector-" in res.stdout


class Ogr2OgrStalledError(RuntimeError):
    pass


def choose_ogr_group_size(file_size_bytes: int) -> int:
    if file_size_bytes <= 0:
        return OGR2OGR_GROUP_SIZE
    if file_size_bytes >= OGR2OGR_XL_BYTES:
        return OGR2OGR_GROUP_SIZE_XL
    if file_size_bytes >= OGR2OGR_LARGE_BYTES:
        return OGR2OGR_GROUP_SIZE_LARGE
    return OGR2OGR_GROUP_SIZE


def next_ogr_group_size(current: int) -> int:
    if current <= 0:
        return OGR2OGR_GROUP_SIZE_MIN
    reduced = max(current // 2, OGR2OGR_GROUP_SIZE_MIN)
    return reduced


def resolve_ogr2ogr() -> Optional[str]:
    candidates: List[str] = []
    if OGR2OGR_PATH:
        candidates.append(OGR2OGR_PATH)
    found = shutil.which("ogr2ogr")
    if found:
        candidates.append(found)

    # QGIS common paths
    candidates.extend([
        r"C:\Program Files\QGIS 3.40.13\bin\ogr2ogr.exe",
        r"C:\Program Files\QGIS\bin\ogr2ogr.exe",
        r"C:\OSGeo4W\bin\ogr2ogr.exe",
    ])

    for exe in candidates:
        if not exe:
            continue
        if _ogr_has_postgres_driver(exe):
            log_info(f"Usando ogr2ogr: {exe}")
            return exe

    if candidates:
        log_error("ogr2ogr encontrado, mas sem driver PostgreSQL. Configure LANDWATCH_OGR2OGR_PATH para o ogr2ogr do QGIS/OSGeo4W.")
    else:
        log_error("ogr2ogr não encontrado. Configure LANDWATCH_OGR2OGR_PATH ou instale QGIS/OSGeo4W.")
    return None


# ============================================================
# Conexao
# ============================================================
def _parse_database_url(url: str) -> Dict[str, str]:
    parsed = urlparse(url)
    return {
        "user": parsed.username or "",
        "password": parsed.password or "",
        "host": parsed.hostname or "",
        "port": str(parsed.port or 5432),
        "dbname": (parsed.path or "").lstrip("/") or "",
    }


def get_db_params() -> Dict[str, str]:
    url = os.environ.get("DATABASE_URL", "").strip()
    if url:
        return _parse_database_url(url)

    return {
        "user": os.environ.get("PGUSER", "sigfarm"),
        "password": os.environ.get("PGPASSWORD", ""),
        "host": os.environ.get("PGHOST", ""),
        "port": os.environ.get("PGPORT", "5432"),
        "dbname": os.environ.get("PGDATABASE", "landwatch"),
    }


def get_conn():
    params = get_db_params()
    conn = psycopg2.connect(
        user=params["user"],
        password=params["password"],
        host=params["host"],
        port=params["port"],
        dbname=params["dbname"],
        sslmode="require",
    )
    # Evita "set_session cannot be used inside a transaction"
    # Configura search_path fora de transação.
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute("SET search_path TO landwatch, public")
    conn.autocommit = False
    return conn


def _pg_conn_str_for_ogr2ogr() -> str:
    p = get_db_params()
    return (
        f"PG:host={p['host']} port={p['port']} dbname={p['dbname']} "
        f"user={p['user']} password={p['password']} sslmode=require"
    )

def _mask_pg_conn_str(conn_str: str) -> str:
    return re.sub(r"password=\\S+", "password=******", conn_str)

def _build_skip_log_path(shp_path: Path) -> Optional[Path]:
    if not OGR2OGR_LOG_DIR:
        return None
    safe_stem = re.sub(r"[^A-Za-z0-9._-]+", "_", shp_path.stem)
    filename = f"ogr2ogr_skipinvalid_{safe_stem}.txt"
    return Path(OGR2OGR_LOG_DIR) / filename


# ============================================================
# Fingerprint
# ============================================================
def _sha1_file(path: Path, chunk_bytes: int = 8 * 1024 * 1024) -> str:
    h = sha1()
    with path.open("rb") as f:
        while True:
            b = f.read(chunk_bytes)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def _shapefile_component_paths(shp_path: Path) -> List[Path]:
    stem = shp_path.stem
    parent = shp_path.parent
    exts = [
        ".shp", ".shx", ".dbf", ".prj", ".cpg",
        ".qix", ".fix", ".sbn", ".sbx", ".shp.xml",
    ]
    paths: List[Path] = []
    for ext in exts:
        p = parent / f"{stem}{ext}"
        if p.exists() and p.is_file():
            paths.append(p)
    if shp_path not in paths and shp_path.exists():
        paths.insert(0, shp_path)
    return sorted(set(paths), key=lambda x: x.name.lower())


def compute_source_fingerprint(path: Path) -> str:
    if path.suffix.lower() == ".shp":
        files = _shapefile_component_paths(path)
    else:
        files = [path]

    manifest = {}
    for fp in files:
        manifest[fp.name] = {"sha1": _sha1_file(fp), "size": int(fp.stat().st_size)}

    manifest_json = json.dumps(manifest, sort_keys=True, ensure_ascii=False)
    return sha1(manifest_json.encode("utf-8")).hexdigest()


# ============================================================
# Helpers DB
# ============================================================
def exec_sql(conn, query: str, params: Optional[dict] = None):
    with conn.cursor() as cur:
        cur.execute(query, params)


def fetch_one(conn, query: str, params: Optional[dict] = None):
    with conn.cursor() as cur:
        cur.execute(query, params)
        return cur.fetchone()


def fetch_all(conn, query: str, params: Optional[dict] = None):
    with conn.cursor() as cur:
        cur.execute(query, params)
        return cur.fetchall()


def get_or_create_category(conn, code: str) -> int:
    row = fetch_one(
        conn,
        "SELECT category_id FROM landwatch.lw_category WHERE code = %s",
        (code,),
    )
    if row:
        return int(row[0])

    exec_sql(
        conn,
        """
        INSERT INTO landwatch.lw_category(code, description, default_srid)
        VALUES (%s, %s, 4674)
        """,
        (code, code),
    )
    row = fetch_one(
        conn,
        "SELECT category_id FROM landwatch.lw_category WHERE code = %s",
        (code,),
    )
    return int(row[0])


def get_or_create_dataset(
    conn,
    dataset_code: str,
    category_code: str,
    is_spatial: bool,
) -> int:
    row = fetch_one(
        conn,
        "SELECT dataset_id FROM landwatch.lw_dataset WHERE code = %s",
        (dataset_code,),
    )
    if row:
        return int(row[0])

    cat_id = get_or_create_category(conn, category_code)
    exec_sql(
        conn,
        """
        INSERT INTO landwatch.lw_dataset
          (category_id, code, description, is_spatial, default_srid)
        VALUES
          (%s, %s, %s, %s, 4674)
        """,
        (cat_id, dataset_code, dataset_code, is_spatial),
    )
    row = fetch_one(
        conn,
        "SELECT dataset_id FROM landwatch.lw_dataset WHERE code = %s",
        (dataset_code,),
    )
    return int(row[0])


def load_dataset_config(conn, dataset_id: int) -> dict:
    row = fetch_one(
        conn,
        """
        SELECT
          d.dataset_id,
          d.code,
          d.is_spatial,
          COALESCE(d.default_srid, c.default_srid, 4674) AS srid,
          COALESCE(d.natural_id_col, c.natural_id_col) AS natural_id_col,
          d.csv_delimiter,
          d.csv_encoding,
          d.csv_doc_col,
          d.csv_date_closed_col,
          d.csv_geom_col
        FROM landwatch.lw_dataset d
        JOIN landwatch.lw_category c ON c.category_id = d.category_id
        WHERE d.dataset_id = %s
        """,
        (dataset_id,),
    )
    if not row:
        raise RuntimeError(f"Dataset {dataset_id} não encontrado.")

    keys = [
        "dataset_id", "code", "is_spatial", "srid", "natural_id_col",
        "csv_delimiter", "csv_encoding", "csv_doc_col", "csv_date_closed_col", "csv_geom_col",
    ]
    return dict(zip(keys, row))


def get_last_good_fingerprint(conn, dataset_id: int) -> Optional[str]:
    row = fetch_one(
        conn,
        """
        SELECT source_fingerprint
        FROM landwatch.lw_dataset_version
        WHERE dataset_id = %s
          AND status IN ('COMPLETED', 'SKIPPED_NO_CHANGES')
          AND source_fingerprint IS NOT NULL
        ORDER BY loaded_at DESC, version_id DESC
        LIMIT 1
        """,
        (dataset_id,),
    )
    return str(row[0]) if row and row[0] else None


def start_dataset_version(
    conn,
    dataset_id: int,
    dataset_code: str,
    snapshot_date: str,
    source_path: str,
    source_fingerprint: Optional[str],
) -> int:
    version_label = f"{dataset_code}_{snapshot_date}"
    row = fetch_one(
        conn,
        """
        SELECT version_id
        FROM landwatch.lw_dataset_version
        WHERE dataset_id = %s AND version_label = %s
        """,
        (dataset_id, version_label),
    )
    if row:
        exec_sql(
            conn,
            """
            UPDATE landwatch.lw_dataset_version
            SET status = 'RUNNING',
                error_message = NULL,
                source_path = %s,
                snapshot_date = %s,
                loaded_at = now(),
                source_fingerprint = %s
            WHERE version_id = %s
            """,
            (source_path, snapshot_date, source_fingerprint, row[0]),
        )
        return int(row[0])

    exec_sql(
        conn,
        """
        INSERT INTO landwatch.lw_dataset_version
          (dataset_id, version_label, snapshot_date, status, source_path, source_fingerprint)
        VALUES
          (%s, %s, %s, 'RUNNING', %s, %s)
        """,
        (dataset_id, version_label, snapshot_date, source_path, source_fingerprint),
    )
    row = fetch_one(
        conn,
        """
        SELECT version_id
        FROM landwatch.lw_dataset_version
        WHERE dataset_id = %s AND version_label = %s
        """,
        (dataset_id, version_label),
    )
    return int(row[0])


def finish_dataset_version(conn, version_id: int, status: str, error_message: Optional[str]):
    exec_sql(
        conn,
        """
        UPDATE landwatch.lw_dataset_version
        SET status = %s, error_message = %s
        WHERE version_id = %s
        """,
        (status, error_message, version_id),
    )


# ============================================================
# Staging helpers
# ============================================================
def drop_table(conn, full_table: str):
    exec_sql(conn, f"DROP TABLE IF EXISTS {full_table}")


def _read_csv_header(csv_path: Path, encoding: str, delimiter: str) -> List[str]:
    with csv_path.open("r", encoding=encoding, errors="replace", newline="") as f:
        reader = csv.reader(f, delimiter=delimiter)
        return next(reader)


def create_stg_raw_csv(conn, csv_path: Path, delimiter: str, encoding: str) -> Tuple[str, List[str]]:
    table = "landwatch.stg_raw"
    drop_table(conn, table)

    header = _read_csv_header(csv_path, encoding, delimiter)
    cols = []
    seen = set()
    for c in header:
        name = c.strip()
        if not name:
            name = f"col_{len(cols)+1}"
        base = name
        i = 2
        while name in seen:
            name = f"{base}_{i}"
            i += 1
        seen.add(name)
        cols.append(name)
    col_idents = [sql.Identifier(c) for c in cols]

    with conn.cursor() as cur:
        cur.execute("CREATE UNLOGGED TABLE landwatch.stg_raw ()")
        for col in col_idents:
            cur.execute(
                sql.SQL("ALTER TABLE landwatch.stg_raw ADD COLUMN {} TEXT").format(col)
            )

    with conn.cursor() as cur, csv_path.open("rb") as f:
        cur.execute(sql.SQL("SET client_encoding TO {}").format(sql.Literal(encoding)))
        copy_sql = sql.SQL(
            "COPY landwatch.stg_raw FROM STDIN WITH (FORMAT csv, DELIMITER {}, HEADER true)"
        ).format(
            sql.Literal(delimiter),
        )
        cur.copy_expert(copy_sql, f)

    return table, cols


def _build_ogr_cmd(shp_path: Path, group_size: int, use_makevalid: bool) -> List[str]:
    ogr2ogr = resolve_ogr2ogr()
    if not ogr2ogr:
        raise RuntimeError("ogr2ogr com driver PostgreSQL não encontrado no PATH.")
    conn_str = _pg_conn_str_for_ogr2ogr()
    ogr_cmd = [
        ogr2ogr,
        "-overwrite",
        "-f",
        "PostgreSQL",
        conn_str,
        str(shp_path),
        "-nln",
        "landwatch.stg_raw",
        "-lco",
        "GEOMETRY_NAME=geom",
        "-lco",
        "FID=row_id",
        "-progress",
        "-oo",
        f"ENCODING={OGR2OGR_ENCODING}",
        "-nlt",
        OGR2OGR_NLT,
    ]
    if OGR2OGR_USE_COPY:
        ogr_cmd.extend(["--config", "PG_USE_COPY", "YES"])
    if not OGR2OGR_ENABLE_METADATA:
        ogr_cmd.extend(["--config", "OGR_PG_ENABLE_METADATA", "NO"])
    if OGR2OGR_DISABLE_SPATIAL_INDEX:
        ogr_cmd.extend(["-lco", "SPATIAL_INDEX=NONE"])
    ogr_cmd.extend(["-lco", "PRECISION=NO"])

    if use_makevalid:
        ogr_cmd.append("-makevalid")
    if OGR2OGR_SKIP_INVALID:
        ogr_cmd.append("-skipinvalid")
    if group_size > 0:
        ogr_cmd.extend(["-gt", str(group_size)])
    return ogr_cmd


def create_stg_raw_shp(conn, shp_path: Path, file_size_bytes: int):
    drop_table(conn, "landwatch.stg_raw")
    conn.commit()
    ogr_env = os.environ.copy()
    if GDAL_DATA:
        ogr_env["GDAL_DATA"] = GDAL_DATA
    if PROJ_LIB:
        ogr_env["PROJ_LIB"] = PROJ_LIB
    log_debug(f"OGR encoding (shp)= {OGR2OGR_ENCODING}")
    group_size = choose_ogr_group_size(file_size_bytes)
    if group_size > 0:
        log_debug(f"OGR group size (-gt)= {group_size}")
    log_debug(f"OGR use_copy= {OGR2OGR_USE_COPY}")
    log_debug(f"OGR disable_spatial_index= {OGR2OGR_DISABLE_SPATIAL_INDEX}")
    log_debug(f"OGR enable_metadata= {OGR2OGR_ENABLE_METADATA}")
    log_debug(f"OGR skip_invalid= {OGR2OGR_SKIP_INVALID}")
    log_debug(f"OGR makevalid= {OGR2OGR_MAKEVALID}")
    log_debug(f"OGR nlt= {OGR2OGR_NLT}")
    log_debug("OGR precision= NO")
    if OGR2OGR_TIMEOUT_SECONDS:
        log_debug(f"OGR timeout= {OGR2OGR_TIMEOUT_SECONDS}s")
    max_restarts = max(0, OGR2OGR_MAX_RESTARTS)
    attempt = 0
    current_group_size = group_size
    use_makevalid = OGR2OGR_MAKEVALID

    while True:
        ogr_cmd = _build_ogr_cmd(shp_path, current_group_size, use_makevalid)
        log_info("Executando ogr2ogr para staging SHP...")
        log_debug(f"ogr2ogr cmd: {' '.join([_mask_pg_conn_str(p) for p in ogr_cmd])}")
        try:
            _run_ogr2ogr_streaming(
                ogr_cmd,
                ogr_env,
                timeout_seconds=OGR2OGR_TIMEOUT_SECONDS,
                skip_log_path=_build_skip_log_path(shp_path),
                stall_seconds=OGR2OGR_STALL_SECONDS,
            )
            break
        except Ogr2OgrStalledError as e:
            attempt += 1
            if attempt > max_restarts:
                raise
            log_warn(
                f"ogr2ogr travou ({e}). Reiniciando com -gt menor (tentativa {attempt}/{max_restarts})."
            )
            current_group_size = next_ogr_group_size(current_group_size)
            log_info(f"Novo group size (-gt)= {current_group_size}")
        except Exception:
            raise


def _stream_lines(prefix: str, stream, on_line):
    for raw in iter(stream.readline, ""):
        line = raw.rstrip()
        if line:
            on_line(f"{prefix}{line}")
    stream.close()


def _run_ogr2ogr_streaming(
    ogr_cmd: List[str],
    ogr_env: dict,
    timeout_seconds: int = 0,
    skip_log_path: Optional[Path] = None,
    stall_seconds: int = 0,
):
    start = time.time()
    last_output = time.time()
    skipped_lines: List[str] = []
    skipped_count = 0
    warning_counts: Dict[str, int] = {}
    warning_total = 0

    def _is_benign_ogr_warning(line: str) -> bool:
        text = line.lower()
        return (
            "does not support layer creation option encoding" in text
            or "lacks super user privilege" in text
            or "ogr_system_tables_event_trigger_for_metadata" in text
        )

    def _log_line(msg: str):
        nonlocal last_output
        nonlocal skipped_count
        nonlocal warning_total
        last_output = time.time()
        if "ERROR" in msg or "Error" in msg or "FATAL" in msg:
            log_error(msg)
            return
        if "Warning 1:" in msg:
            warning_total += 1
            m = re.search(r"Warning 1:\\s*(.*)", msg)
            if m:
                text = m.group(1)
                text = re.sub(r" at or near point .*", "", text).strip()
                warning_counts[text] = warning_counts.get(text, 0) + 1
            return
        if _is_skipinvalid_line(msg):
            skipped_count += 1
            if skip_log_path:
                skipped_lines.append(msg)
            return
        if _is_benign_ogr_warning(msg):
            return
        log_debug(msg)

    proc = subprocess.Popen(
        ogr_cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=ogr_env,
        bufsize=1,
    )

    import threading
    t_out = threading.Thread(target=_stream_lines, args=("[ogr2ogr] ", proc.stdout, _log_line), daemon=True)
    t_err = threading.Thread(target=_stream_lines, args=("[ogr2ogr] ", proc.stderr, _log_line), daemon=True)
    t_out.start()
    t_err.start()

    while True:
        ret = proc.poll()
        now = time.time()
        if ret is not None:
            break
        if OGR2OGR_PROGRESS_HEARTBEAT_SECONDS > 0 and now - last_output >= OGR2OGR_PROGRESS_HEARTBEAT_SECONDS:
            log_debug(
                f"ogr2ogr em execução há {int(now - start)}s sem novas mensagens."
            )
            last_output = now
        if stall_seconds and now - last_output >= stall_seconds:
            proc.kill()
            raise Ogr2OgrStalledError(
                f"{int(now - start)}s sem output (stall >= {stall_seconds}s)"
            )
        if timeout_seconds and now - start > timeout_seconds:
            proc.kill()
            raise RuntimeError(f"ogr2ogr excedeu timeout de {timeout_seconds}s.")
        time.sleep(1)

    t_out.join(timeout=2)
    t_err.join(timeout=2)

    if ret != 0:
        raise RuntimeError(f"Falha no ogr2ogr. Exit code: {ret}")
    log_info(f"ogr2ogr finalizado em {int(time.time() - start)}s.")
    if warning_total:
        items = sorted(warning_counts.items(), key=lambda x: (-x[1], x[0]))
        summary = ", ".join([f"{k}={v}" for k, v in items])
        log_warn(f"ogr2ogr warnings: {warning_total} ({summary})")
    if skipped_count:
        log_warn(f"ogr2ogr skipinvalid: {skipped_count} features ignoradas.")
        if skip_log_path:
            skip_log_path.parent.mkdir(parents=True, exist_ok=True)
            with skip_log_path.open("w", encoding="utf-8") as f:
                f.write(f"Skipped features: {skipped_count}\n")
                for line in skipped_lines:
                    f.write(line + "\n")
            log_info(f"ogr2ogr skipinvalid log: {skip_log_path}")


def _is_skipinvalid_line(line: str) -> bool:
    text = line.lower()
    return (
        "skipping feature" in text
        or "skipped feature" in text
        or "invalid geometry" in text
        or "geometry has invalid" in text
    )


def create_stg_payload_from_raw_csv(conn, geom_col: Optional[str]):
    drop_table(conn, "landwatch.stg_payload")
    geom_select = "NULL::text AS geom_wkt"
    if geom_col:
        geom_select = f"t.{sql.Identifier(geom_col).as_string(conn)} AS geom_wkt"

    query = f"""
        CREATE UNLOGGED TABLE landwatch.stg_payload AS
        SELECT
          row_number() OVER ()::bigint AS row_id,
          to_jsonb(t) AS payload,
          {geom_select},
          NULL::text AS feature_key_override
        FROM landwatch.stg_raw t
    """
    exec_sql(conn, query)


def create_stg_payload_from_raw_shp(conn, natural_id_col: Optional[str]):
    drop_table(conn, "landwatch.stg_payload")
    feature_expr = "NULL::text AS feature_key_override"
    if natural_id_col:
        col = resolve_stg_column(conn, natural_id_col)
        if col:
            feature_expr = f"t.{sql.Identifier(col).as_string(conn)}::text AS feature_key_override"
        else:
            log_warn(f"natural_id_col '{natural_id_col}' não encontrado em stg_raw; usando hash completo.")
    query = """
        CREATE UNLOGGED TABLE landwatch.stg_payload AS
        SELECT
          row_number() OVER ()::bigint AS row_id,
          to_jsonb(t) - 'geom' AS payload,
          ST_AsText(t.geom) AS geom_wkt,
          {feature_expr}
        FROM landwatch.stg_raw t
    """.format(feature_expr=feature_expr)
    exec_sql(conn, query)


def resolve_stg_column(conn, preferred: str) -> Optional[str]:
    rows = fetch_all(
        conn,
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'landwatch'
          AND table_name = 'stg_raw'
        """,
    )
    cols = {r[0] for r in rows}
    if preferred in cols:
        return preferred
    low = preferred.lower()
    if low in cols:
        return low
    up = preferred.upper()
    if up in cols:
        return up
    return None


# ============================================================
# Ingest SQL runner
# ============================================================
def _sql_literal(val: str) -> str:
    return "'" + val.replace("'", "''") + "'"


def build_doc_date_sql(doc_col: Optional[str], date_col: Optional[str]) -> str:
    stmts = []
    if doc_col:
        stmts.append(
            "UPDATE __stg_norm "
            f"SET doc_normalized = regexp_replace(attr_json->>{_sql_literal(doc_col)}, '\\D', '', 'g')"
        )
    if date_col:
        stmts.append(
            "UPDATE __stg_norm "
            f"""
            SET date_closed = CASE
              WHEN (attr_json->>{_sql_literal(date_col)}) ~ '^\\d{{4}}-\\d{{2}}-\\d{{2}}'
              THEN (attr_json->>{_sql_literal(date_col)})::timestamp::date
              ELSE NULL
            END
            """
        )
    if not stmts:
        return "-- no doc/date"
    return ";\n".join(stmts) + ";"


def build_geom_sql(srid: int, is_spatial: bool) -> str:
    if not is_spatial:
        return "UPDATE __stg_norm SET geom = NULL, geom_hash = NULL;"
    return f"""
        CREATE OR REPLACE FUNCTION pg_temp.safe_geom_from_wkt(wkt text, srid int)
        RETURNS geometry
        LANGUAGE plpgsql
        AS $$
        BEGIN
            IF wkt IS NULL OR wkt = '' THEN
                RETURN NULL;
            END IF;
            RETURN ST_SetSRID(ST_GeomFromText(wkt), srid);
        EXCEPTION WHEN others THEN
            RETURN NULL;
        END;
        $$;

        UPDATE __stg_norm
        SET geom = pg_temp.safe_geom_from_wkt(geom_wkt, {int(srid)})
        WHERE geom_wkt IS NOT NULL AND geom_wkt <> '';

        UPDATE __stg_norm
        SET geom = ST_MakeValid(geom)
        WHERE geom IS NOT NULL AND NOT ST_IsValid(geom);

        UPDATE __stg_norm
        SET geom_hash = md5(encode(ST_AsBinary(geom), 'hex'))
        WHERE geom IS NOT NULL;
    """


def run_ingest_sql(conn, dataset_id: int, version_id: int, snapshot_date: str, doc_col: Optional[str],
                   date_col: Optional[str], is_spatial: bool, srid: int):
    with open(INGEST_SQL_PATH, "r", encoding="utf-8") as f:
        template = f.read()

    replacements = {
        "{{STG_TABLE}}": "landwatch.stg_payload",
        "{{DOC_DATE_SQL}}": build_doc_date_sql(doc_col, date_col),
        "{{GEOM_SQL}}": build_geom_sql(srid, is_spatial),
    }
    for k, v in replacements.items():
        template = template.replace(k, v)

    template = (
        template.replace(":dataset_id", "%(dataset_id)s")
        .replace(":version_id", "%(version_id)s")
        .replace(":snapshot_date", "%(snapshot_date)s")
    )

    params = {
        "dataset_id": dataset_id,
        "version_id": version_id,
        "snapshot_date": snapshot_date,
    }

    # remove comentarios simples e executar em bloco
    lines = []
    for line in template.splitlines():
        if line.strip().startswith("--"):
            continue
        lines.append(line)
    sql_clean = "\n".join(lines)

    with conn.cursor() as cur:
        cur.execute(sql_clean, params)


# ============================================================
# Descoberta de arquivos e regras de CSV
# ============================================================
def derive_category_code(root_dir: Path, file_path: Path) -> str:
    return file_path.relative_to(root_dir).parts[0].upper()


def derive_dataset_code(path: Path) -> str:
    return path.stem.strip().upper()


def infer_csv_rules(dataset_code: str) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    code = dataset_code.upper()
    if code == "CADASTRO DE EMPREGADORES" or code == "CADASTRO_DE_EMPREGADORES":
        return "CNPJ/CPF", None, None
    if code == "LISTA EMBARGOS IBAMA" or code == "LISTA_EMBARGOS_IBAMA":
        return "CPF_CNPJ_EMBARGADO", "DAT_DESEMBARGO", "GEOM_AREA_EMBARGADA"
    return None, None, None


# ============================================================
# Execução por arquivo
# ============================================================
def process_csv(conn, dataset_id: int, dataset_code: str, csv_path: Path, snapshot_date: str, version_id: int):
    cfg = load_dataset_config(conn, dataset_id)
    delimiter = cfg.get("csv_delimiter") or ";"
    encoding = cfg.get("csv_encoding") or "latin1"
    doc_col = cfg.get("csv_doc_col")
    date_col = cfg.get("csv_date_closed_col")
    geom_col = cfg.get("csv_geom_col")

    if not doc_col and not date_col and not geom_col:
        doc_col, date_col, geom_col = infer_csv_rules(dataset_code)
        if doc_col or date_col or geom_col:
            exec_sql(
                conn,
                """
                UPDATE landwatch.lw_dataset
                SET csv_doc_col = COALESCE(csv_doc_col, %s),
                    csv_date_closed_col = COALESCE(csv_date_closed_col, %s),
                    csv_geom_col = COALESCE(csv_geom_col, %s)
                WHERE dataset_id = %s
                """,
                (doc_col, date_col, geom_col, dataset_id),
            )

    log_debug(f"CSV delimiter='{delimiter}' encoding='{encoding}'")
    log_debug(f"CSV doc_col='{doc_col}' date_col='{date_col}' geom_col='{geom_col}'")

    create_stg_raw_csv(conn, csv_path, delimiter, encoding)
    create_stg_payload_from_raw_csv(conn, geom_col)

    sql_start = time.time()
    run_ingest_sql(
        conn,
        dataset_id=dataset_id,
        version_id=version_id,
        snapshot_date=snapshot_date,
        doc_col=doc_col,
        date_col=date_col,
        is_spatial=bool(geom_col),
        srid=int(cfg["srid"]),
    )
    log_info(f"Ingestao SQL (CSV) finalizada em {int(time.time() - sql_start)}s.")


def process_shp(conn, dataset_id: int, dataset_code: str, shp_path: Path, snapshot_date: str, version_id: int):
    cfg = load_dataset_config(conn, dataset_id)
    srid = int(cfg["srid"])
    natural_id_col = cfg.get("natural_id_col")
    log_info(f"SHP SRID={srid}")
    parts = _shapefile_component_paths(shp_path)
    total_size = sum(p.stat().st_size for p in parts if p.exists())
    log_info(f"SHP arquivos={len(parts)} tamanho_total={_format_bytes(total_size)}")
    log_info(f"natural_id_col='{natural_id_col}'")

    create_stg_raw_shp(conn, shp_path, total_size)
    if not natural_id_col:
        log_warn("natural_id_col não definido para dataset; feature_key será hash completo.")
    create_stg_payload_from_raw_shp(conn, natural_id_col)

    sql_start = time.time()
    run_ingest_sql(
        conn,
        dataset_id=dataset_id,
        version_id=version_id,
        snapshot_date=snapshot_date,
        doc_col=None,
        date_col=None,
        is_spatial=True,
        srid=srid,
    )
    log_info(f"Ingestao SQL (SHP) finalizada em {int(time.time() - sql_start)}s.")


# ============================================================
# Main
# ============================================================
def _parse_args():
    raw_args = sys.argv[1:]
    if any(arg.strip() == "\\" for arg in raw_args):
        raise SystemExit(
            "Erro de sintaxe no comando: '\\' foi passado como argumento. "
            "No Bash, use '\\' no fim da linha sem espaços após ele, "
            "ou execute o comando em uma única linha."
        )

    parser = argparse.ArgumentParser(description="LandWatch bulk ingest")
    parser.add_argument("--root", help="Diretório raiz de ingestão")
    parser.add_argument("--category", help="Categoria(s) separadas por vírgula")
    parser.add_argument("--dataset", help="Dataset code(s) separados por vírgula")
    parser.add_argument("--files", help="Lista de arquivos separados por vírgula")
    parser.add_argument("--snapshot-date", help="Snapshot date (YYYY-MM-DD)")
    parser.add_argument(
        "--skip-mv-refresh",
        action="store_true",
        help="Nao atualiza materialized views ao final da execucao",
    )
    parser.add_argument(
        "--refresh-mvs-only",
        action="store_true",
        help="Apenas atualiza materialized views e sai",
    )
    return parser.parse_args()


def _split_csv(value: Optional[str]) -> List[str]:
    if not value:
        return []
    return [v.strip() for v in value.split(",") if v.strip()]


def _refresh_mvs():
    mv_views = [
        "landwatch.mv_feature_geom_active",
        "landwatch.mv_feature_active_attrs_light",
        "landwatch.mv_sicar_meta_active",
        "landwatch.mv_indigena_phase_active",
        "landwatch.mv_ucs_sigla_active",
    ]
    for view in mv_views:
        try:
            attempt = 0
            while True:
                try:
                    attempt += 1
                    with get_conn() as conn:
                        conn.autocommit = True
                        exec_sql(conn, f"REFRESH MATERIALIZED VIEW {view}")
                        log_info(f"MV atualizada: {view}")
                    break
                except Exception as e:
                    if _is_transient_db_error(e) and attempt <= DB_MAX_RETRIES:
                        delay = _retry_delay(attempt)
                        log_warn(
                            f"Falha ao atualizar MV (DB). Tentando novamente em {delay:.1f}s "
                            f"(tentativa {attempt}/{DB_MAX_RETRIES})."
                        )
                        time.sleep(delay)
                        continue
                    raise
        except Exception as e:
            log_warn(f"Falha ao atualizar MV {view}: {e}")


def main():
    args = _parse_args()
    job_start = time.time()
    if args.refresh_mvs_only:
        _refresh_mvs()
        log_info("bulk_ingest finalizado (refresh MVs only).")
        return
    snapshot_date_override = args.snapshot_date or None
    root = Path(args.root or ROOT_DIR)
    if not root.exists():
        raise FileNotFoundError(f"Diretório raiz não encontrado: {root}")

    category_filter = {c.upper() for c in _split_csv(args.category)}
    dataset_filter = {d.upper() for d in _split_csv(args.dataset)}

    file_paths: List[Path] = []
    if args.files:
        file_paths = [Path(p.strip()) for p in _split_csv(args.files)]
    else:
        shp_paths = sorted(root.rglob("*.shp"))
        csv_paths = sorted(root.rglob("*.csv"))
        file_paths = shp_paths + csv_paths

    if not file_paths:
        log_warn(f"Nenhum .shp ou .csv encontrado abaixo de {root}")
        return

    if category_filter:
        file_paths = [p for p in file_paths if derive_category_code(root, p) in category_filter]
    if dataset_filter:
        file_paths = [p for p in file_paths if derive_dataset_code(p) in dataset_filter]

    log_info(f"ROOT_DIR={root}")
    log_info(f"FILES={len(file_paths)}")

    for file_path in file_paths:
        dataset_start = time.time()
        if args.category:
            category_code = _split_csv(args.category)[0].upper()
        else:
            try:
                category_code = derive_category_code(root, file_path)
            except Exception:
                category_code = file_path.parent.name.upper()
        dataset_code = derive_dataset_code(file_path)
        snapshot_date = snapshot_date_override or DEFAULT_SNAPSHOT_DATE

        log_info("-" * 80)
        log_info(f"Arquivo: {file_path}")
        log_info(f"Categoria: {category_code} | Dataset: {dataset_code} | Snapshot: {snapshot_date}")

        version_id = None
        try:
            attempt = 0
            while True:
                try:
                    attempt += 1
                    with get_conn() as conn:
                        conn.autocommit = False
                        dataset_id = get_or_create_dataset(
                            conn,
                            dataset_code=dataset_code,
                            category_code=category_code,
                            is_spatial=(file_path.suffix.lower() == ".shp"),
                        )

                        src_fp = None
                        if ENABLE_FINGERPRINT_SKIP:
                            try:
                                src_fp = compute_source_fingerprint(file_path)
                                last_fp = get_last_good_fingerprint(conn, dataset_id)
                                log_info(f"Fingerprint: {src_fp} | last: {last_fp}")
                                if last_fp and src_fp == last_fp:
                                    version_id = start_dataset_version(
                                        conn,
                                        dataset_id,
                                        dataset_code,
                                        snapshot_date,
                                        str(file_path),
                                        src_fp,
                                    )
                                    finish_dataset_version(conn, version_id, "SKIPPED_NO_CHANGES", None)
                                    conn.commit()
                                    log_info("SKIP: Sem mudanças detectadas.")
                                    break
                            except Exception as e:
                                log_warn(f"Fingerprint falhou (seguindo sem skip): {e}")

                        version_id = start_dataset_version(
                            conn,
                            dataset_id,
                            dataset_code,
                            snapshot_date,
                            str(file_path),
                            src_fp,
                        )

                        if file_path.suffix.lower() == ".csv":
                            process_csv(conn, dataset_id, dataset_code, file_path, snapshot_date, version_id)
                        else:
                            process_shp(conn, dataset_id, dataset_code, file_path, snapshot_date, version_id)

                        finish_dataset_version(conn, version_id, "COMPLETED", None)
                        conn.commit()
                        log_info("OK: Ingestão concluída.")
                        log_info(f"Tempo total do dataset: {int(time.time() - dataset_start)}s.")
                    break
                except Exception as e:
                    if _is_transient_db_error(e) and attempt <= DB_MAX_RETRIES:
                        delay = _retry_delay(attempt)
                        log_warn(
                            f"Falha de conexão no DB ({e}). Tentando novamente em {delay:.1f}s "
                            f"(tentativa {attempt}/{DB_MAX_RETRIES})."
                        )
                        time.sleep(delay)
                        continue
                    raise

        except Exception as e:
            log_error(f"Falha na ingestão de {file_path}: {e}")
            try:
                with get_conn() as conn_err:
                    conn_err.autocommit = True
                    if version_id:
                        finish_dataset_version(conn_err, version_id, "FAILED", str(e))
            except Exception as e2:
                log_error(f"Falha ao registrar FAILED: {e2}")

    if args.skip_mv_refresh:
        log_info("MV refresh ignorado (flag --skip-mv-refresh).")
    else:
        _refresh_mvs()

    log_info(f"bulk_ingest finalizado em {int(time.time() - job_start)}s.")


if __name__ == "__main__":
    main()
