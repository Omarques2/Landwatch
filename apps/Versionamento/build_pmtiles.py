import argparse
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple
from urllib.parse import urlparse

import psycopg2
from dotenv import load_dotenv


load_dotenv()


def log_info(message: str) -> None:
    print(f"[INFO] {message}")


def log_warn(message: str) -> None:
    print(f"[WARN] {message}")


def log_error(message: str) -> None:
    print(f"[ERROR] {message}")


def env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def assert_identifier(value: str, name: str) -> str:
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", value):
        raise ValueError(f"{name} is invalid: {value!r}")
    return value


def parse_database_url(url: str) -> Dict[str, str]:
    parsed = urlparse(url)
    return {
        "user": parsed.username or "",
        "password": parsed.password or "",
        "host": parsed.hostname or "",
        "port": str(parsed.port or 5432),
        "dbname": (parsed.path or "").lstrip("/") or "",
        "sslmode": parsed.query.partition("sslmode=")[2].split("&")[0] or None,
    }


def get_db_params() -> Dict[str, str]:
    url = os.environ.get("DATABASE_URL", "").strip()
    if url:
        params = parse_database_url(url)
        return {k: v for k, v in params.items() if v}
    return {
        "user": os.environ.get("PGUSER", ""),
        "password": os.environ.get("PGPASSWORD", ""),
        "host": os.environ.get("PGHOST", ""),
        "port": os.environ.get("PGPORT", "5432"),
        "dbname": os.environ.get("PGDATABASE", ""),
    }


def resolve_executable(explicit_env: str, fallback_name: str) -> Optional[str]:
    explicit = os.environ.get(explicit_env, "").strip()
    if explicit:
        return explicit if Path(explicit).exists() else None
    return shutil.which(fallback_name)


def ensure_blob_client():
    try:
        from azure.storage.blob import BlobServiceClient  # type: ignore
    except Exception as exc:  # pragma: no cover - import guard
        raise RuntimeError("azure-storage-blob is required") from exc

    connection_string = (
        os.environ.get("LANDWATCH_PMTILES_BLOB_CONNECTION_STRING", "").strip()
        or os.environ.get("LANDWATCH_BLOB_CONNECTION_STRING", "").strip()
    )
    container_name = (
        os.environ.get("LANDWATCH_PMTILES_BLOB_CONTAINER", "").strip()
        or os.environ.get("LANDWATCH_BLOB_CONTAINER", "").strip()
    )
    prefix = os.environ.get("LANDWATCH_PMTILES_BLOB_PREFIX", "pmtiles").strip().strip("/")
    if not connection_string or not container_name:
        raise RuntimeError(
            "LANDWATCH_PMTILES_BLOB_CONNECTION_STRING and LANDWATCH_PMTILES_BLOB_CONTAINER are required",
        )
    service = BlobServiceClient.from_connection_string(connection_string)
    container = service.get_container_client(container_name)
    try:
        container.get_container_properties()
    except Exception:
        container.create_container()
    return container, prefix


def normalize_dataset_codes(raw_values: Sequence[str]) -> List[str]:
    result = sorted({value.strip().upper() for value in raw_values if value and value.strip()})
    if not result:
        raise ValueError("At least one dataset code is required")
    return result


def run_command(args: Sequence[str], cwd: Optional[Path] = None) -> str:
    completed = subprocess.run(
        list(args),
        cwd=str(cwd) if cwd else None,
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        stderr = completed.stderr.strip() or completed.stdout.strip()
        raise RuntimeError(f"Command failed ({' '.join(args)}): {stderr}")
    return completed.stdout


def parse_pmtiles_header(header_json: str) -> Dict[str, Any]:
    payload = json.loads(header_json)
    return {
        "minzoom": payload.get("min_zoom", payload.get("minZoom")),
        "maxzoom": payload.get("max_zoom", payload.get("maxZoom")),
        "bounds_west": payload.get("min_lon", payload.get("minLon")),
        "bounds_south": payload.get("min_lat", payload.get("minLat")),
        "bounds_east": payload.get("max_lon", payload.get("maxLon")),
        "bounds_north": payload.get("max_lat", payload.get("maxLat")),
        "center_lng": payload.get("center_lon", payload.get("centerLon")),
        "center_lat": payload.get("center_lat", payload.get("centerLat")),
        "center_zoom": payload.get("center_zoom", payload.get("centerZoom")),
    }


def read_pmtiles_header(pmtiles_exe: str, pmtiles_path: Path) -> Dict[str, Any]:
    attempts = [
        [pmtiles_exe, "show", str(pmtiles_path), "--header-json"],
        [pmtiles_exe, "show", "--header-json", str(pmtiles_path)],
    ]
    last_error: Exception | None = None
    for args in attempts:
        try:
            return parse_pmtiles_header(run_command(args))
        except Exception as exc:  # pragma: no cover - defensive CLI compatibility
            last_error = exc
    if last_error:
        raise last_error
    raise RuntimeError("Unable to read PMTiles header")


def coerce_int(value: Any, default: Optional[int] = None) -> Optional[int]:
    if value is None:
        return default
    try:
        return int(value)
    except Exception:
        return default


def coerce_float(value: Any, default: Optional[float] = None) -> Optional[float]:
    if value is None:
        return default
    try:
        return float(value)
    except Exception:
        return default


def build_blob_path(prefix: str, dataset_code: str, version_id: int) -> str:
    parts = [part for part in (prefix, dataset_code, str(version_id), f"{dataset_code}.pmtiles") if part]
    return "/".join(parts)


def fetch_dataset_metadata(cur, schema: str, dataset_code: str) -> Optional[Dict[str, Any]]:
    cur.execute(
        f"""
        WITH feature_counts AS (
          SELECT dataset_id, COUNT(*)::bigint AS feature_count
          FROM "{schema}"."mv_feature_active_attrs_light"
          GROUP BY dataset_id
        ),
        latest_version AS (
          SELECT DISTINCT ON (v.dataset_id)
            v.dataset_id,
            v.version_id,
            v.snapshot_date
          FROM "{schema}"."lw_dataset_version" v
          WHERE v.status IN ('COMPLETED', 'SKIPPED_NO_CHANGES')
          ORDER BY v.dataset_id, v.snapshot_date DESC, v.loaded_at DESC, v.version_id DESC
        )
        SELECT
          d.dataset_id,
          d.code AS dataset_code,
          c.code AS category_code,
          lv.version_id AS version_id,
          v.snapshot_date,
          COALESCE(fc.feature_count, 0)::bigint AS feature_count
        FROM "{schema}"."lw_dataset" d
        JOIN "{schema}"."lw_category" c
          ON c.category_id = d.category_id
        JOIN latest_version lv
          ON lv.dataset_id = d.dataset_id
        JOIN "{schema}"."lw_dataset_version" v
          ON v.version_id = lv.version_id
        LEFT JOIN feature_counts fc
          ON fc.dataset_id = d.dataset_id
        WHERE d.code = %s
        LIMIT 1
        """,
        (dataset_code,),
    )
    row = cur.fetchone()
    if not row:
        return None
    return {
        "dataset_id": int(row[0]),
        "dataset_code": str(row[1]),
        "category_code": str(row[2]),
        "version_id": int(row[3]),
        "snapshot_date": row[4],
        "feature_count": int(row[5]),
    }


def fetch_exportable_feature_count(cur, schema: str, dataset_code: str) -> int:
    cur.execute(
        f"""
        WITH features AS (
          SELECT "{schema}".safe_transform_to_4326(g.geom) AS geom_4326
          FROM "{schema}"."mv_feature_active_attrs_light" l
          JOIN "{schema}"."lw_dataset" d
            ON d.dataset_id = l.dataset_id
          JOIN "{schema}"."mv_feature_geom_active" g
            ON g.dataset_id = l.dataset_id
           AND g.feature_id = l.feature_id
          WHERE d.code = %s
        )
        SELECT COUNT(*)::bigint
        FROM features
        WHERE geom_4326 IS NOT NULL
        """,
        (dataset_code,),
    )
    row = cur.fetchone()
    return int(row[0] if row else 0)


def export_dataset_geojsonseq(cur, schema: str, dataset_code: str, output_path: Path) -> None:
    copy_sql = cur.mogrify(
        f"""
        COPY (
          WITH features AS (
            SELECT
              d.dataset_id,
              d.code AS dataset_code,
              c.code AS category_code,
              l.feature_id,
              l.feature_key,
              t.natural_id,
              COALESCE(
                NULLIF(t.display_name, ''),
                NULLIF(l.feature_key, ''),
                d.code
              ) AS display_name,
              "{schema}".safe_transform_to_4326(g.geom) AS geom_4326
            FROM "{schema}"."mv_feature_active_attrs_light" l
            JOIN "{schema}"."lw_dataset" d
              ON d.dataset_id = l.dataset_id
            JOIN "{schema}"."lw_category" c
              ON c.category_id = d.category_id
            JOIN "{schema}"."mv_feature_geom_active" g
              ON g.dataset_id = l.dataset_id
             AND g.feature_id = l.feature_id
            LEFT JOIN "{schema}"."mv_feature_tooltip_active" t
              ON t.dataset_id = l.dataset_id
             AND t.feature_id = l.feature_id
            WHERE d.code = %s
          )
          SELECT json_build_object(
            'type', 'Feature',
            'id', dataset_id::text || ':' || feature_id::text,
            'properties', json_build_object(
              'dataset_code', dataset_code,
              'category_code', category_code,
              'feature_id', feature_id::text,
              'feature_key', feature_key,
              'natural_id', natural_id,
              'display_name', display_name,
              'feature_uid', dataset_id::text || ':' || feature_id::text
            ),
            'geometry', public.ST_AsGeoJSON(geom_4326)::json
          )::text
          FROM features
          WHERE geom_4326 IS NOT NULL
          ORDER BY feature_id
        ) TO STDOUT
        """,
        (dataset_code,),
    ).decode("utf-8")
    with output_path.open("w", encoding="utf-8", newline="\n") as handle:
        cur.copy_expert(copy_sql, handle)


def build_mbtiles(
    tippecanoe_exe: str,
    geojsonseq_path: Path,
    mbtiles_path: Path,
    layer_name: str,
) -> None:
    run_command(
        [
            tippecanoe_exe,
            "--force",
            "--read-parallel",
            "--detect-shared-borders",
            "--drop-densest-as-needed",
            "--extend-zooms-if-still-dropping",
            "--minimum-zoom=0",
            "--maximum-zoom=14",
            f"--layer={layer_name}",
            f"--output={mbtiles_path}",
            str(geojsonseq_path),
        ],
    )


def convert_pmtiles(pmtiles_exe: str, mbtiles_path: Path, pmtiles_path: Path) -> None:
    run_command([pmtiles_exe, "convert", str(mbtiles_path), str(pmtiles_path)])
    run_command([pmtiles_exe, "verify", str(pmtiles_path)])


def upload_pmtiles(container, blob_path: str, local_path: Path) -> Tuple[str, int]:
    with local_path.open("rb") as handle:
        container.upload_blob(blob_path, handle, overwrite=True)
    blob = container.get_blob_client(blob_path)
    props = blob.get_blob_properties()
    size = int(getattr(props, "size", 0) or 0)
    etag = str(getattr(props, "etag", "") or "")
    return etag, size


def deactivate_and_insert_asset(
    conn,
    schema: str,
    metadata: Dict[str, Any],
    blob_container: str,
    blob_path: str,
    blob_etag: str,
    blob_size_bytes: int,
    feature_count: int,
    header: Dict[str, Any],
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            f'DELETE FROM "{schema}"."lw_dataset_pmtiles_asset" WHERE blob_path = %s',
            (blob_path,),
        )
        cur.execute(
            f'UPDATE "{schema}"."lw_dataset_pmtiles_asset" SET is_active = FALSE, updated_at = now() WHERE dataset_id = %s AND is_active = TRUE',
            (metadata["dataset_id"],),
        )
        cur.execute(
            f"""
            INSERT INTO "{schema}"."lw_dataset_pmtiles_asset" (
              dataset_id,
              version_id,
              snapshot_date,
              source_layer,
              blob_container,
              blob_path,
              blob_etag,
              blob_size_bytes,
              feature_count,
              minzoom,
              maxzoom,
              bounds_west,
              bounds_south,
              bounds_east,
              bounds_north,
              center_lng,
              center_lat,
              center_zoom,
              is_active
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE)
            """,
            (
                metadata["dataset_id"],
                metadata["version_id"],
                metadata["snapshot_date"],
                "attachments_features",
                blob_container,
                blob_path,
                blob_etag,
                blob_size_bytes,
                feature_count,
                coerce_int(header["minzoom"], 0),
                coerce_int(header["maxzoom"], 14),
                coerce_float(header["bounds_west"], -74.5),
                coerce_float(header["bounds_south"], -34.8),
                coerce_float(header["bounds_east"], -32.0),
                coerce_float(header["bounds_north"], 6.5),
                coerce_float(header["center_lng"]),
                coerce_float(header["center_lat"]),
                coerce_int(header["center_zoom"]),
            ),
        )
    conn.commit()


def cleanup_asset_retention(conn, schema: str, dataset_id: int, container) -> None:
    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT asset_id, blob_path
            FROM "{schema}"."lw_dataset_pmtiles_asset"
            WHERE dataset_id = %s
            ORDER BY CASE WHEN is_active THEN 0 ELSE 1 END, created_at DESC, asset_id DESC
            """,
            (dataset_id,),
        )
        rows = cur.fetchall()
        stale = rows[2:]
        if not stale:
            conn.commit()
            return
        stale_ids = [int(row[0]) for row in stale]
        stale_paths = [str(row[1]) for row in stale]
        cur.execute(
            f'DELETE FROM "{schema}"."lw_dataset_pmtiles_asset" WHERE asset_id = ANY(%s)',
            (stale_ids,),
        )
    conn.commit()
    for path in stale_paths:
        try:
            container.delete_blob(path)
        except Exception:
            log_warn(f"Could not delete stale PMTiles blob: {path}")


def build_dataset_pmtiles(
    conn,
    schema: str,
    dataset_code: str,
    tippecanoe_exe: str,
    pmtiles_exe: str,
    container,
    blob_prefix: str,
) -> None:
    with conn.cursor() as cur:
        metadata = fetch_dataset_metadata(cur, schema, dataset_code)
        if not metadata:
            raise RuntimeError(f"Dataset not found: {dataset_code}")
        exportable_count = fetch_exportable_feature_count(cur, schema, dataset_code)
    if exportable_count <= 0:
        log_warn(f"Skipping {dataset_code}: no exportable active features")
        return

    blob_path = build_blob_path(blob_prefix, dataset_code, metadata["version_id"])
    log_info(
        f"Building PMTiles for {dataset_code} (version_id={metadata['version_id']}, features={exportable_count})",
    )

    with tempfile.TemporaryDirectory(prefix=f"pmtiles-{dataset_code.lower()}-") as temp_dir:
        temp_root = Path(temp_dir)
        geojsonseq_path = temp_root / f"{dataset_code}.geojsonseq"
        mbtiles_path = temp_root / f"{dataset_code}.mbtiles"
        pmtiles_path = temp_root / f"{dataset_code}.pmtiles"

        with conn.cursor() as cur:
            export_dataset_geojsonseq(cur, schema, dataset_code, geojsonseq_path)

        build_mbtiles(tippecanoe_exe, geojsonseq_path, mbtiles_path, "attachments_features")
        convert_pmtiles(pmtiles_exe, mbtiles_path, pmtiles_path)

        header = read_pmtiles_header(pmtiles_exe, pmtiles_path)
        blob_etag, blob_size_bytes = upload_pmtiles(container, blob_path, pmtiles_path)
        deactivate_and_insert_asset(
            conn,
            schema,
            metadata,
            container.container_name,
            blob_path,
            blob_etag,
            blob_size_bytes,
            exportable_count,
            header,
        )
        cleanup_asset_retention(conn, schema, metadata["dataset_id"], container)
        log_info(
            f"Published {dataset_code} to {blob_path} ({blob_size_bytes} bytes, etag={blob_etag})",
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build and publish dataset PMTiles archives")
    parser.add_argument(
        "--dataset-codes",
        required=True,
        help="Comma-separated dataset codes",
    )
    return parser.parse_args()


def main() -> int:
    if not env_bool("LANDWATCH_PMTILES_BUILD_ENABLED", False):
        log_info("LANDWATCH_PMTILES_BUILD_ENABLED is false; skipping PMTiles build.")
        return 0

    args = parse_args()
    dataset_codes = normalize_dataset_codes(args.dataset_codes.split(","))
    schema = assert_identifier(os.environ.get("LANDWATCH_SCHEMA", "landwatch"), "LANDWATCH_SCHEMA")
    tippecanoe_exe = resolve_executable("LANDWATCH_TIPPECANOE_PATH", "tippecanoe")
    pmtiles_exe = resolve_executable("LANDWATCH_PMTILES_CLI_PATH", "pmtiles") or shutil.which(
        "go-pmtiles"
    )
    if not tippecanoe_exe:
        raise RuntimeError("tippecanoe executable not found")
    if not pmtiles_exe:
        raise RuntimeError("pmtiles executable not found (tried pmtiles and go-pmtiles)")

    container, blob_prefix = ensure_blob_client()
    conn = psycopg2.connect(**get_db_params())
    try:
        for dataset_code in dataset_codes:
            build_dataset_pmtiles(
                conn,
                schema,
                dataset_code,
                tippecanoe_exe,
                pmtiles_exe,
                container,
                blob_prefix,
            )
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        log_error(str(exc))
        raise
