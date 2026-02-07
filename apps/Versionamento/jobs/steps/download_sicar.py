import logging
import os
import shutil
import subprocess
import sys
import time
import zipfile
from datetime import datetime
from pathlib import Path
from typing import List

import pandas as pd

from .common import DatasetArtifact, ensure_dir, log_info, log_warn

SHAPE_EXTS = [".shp", ".shx", ".dbf", ".prj", ".cpg", ".qpj"]

DOCKER_INNER_SCRIPT = r'''
import os, time
from SICAR import Sicar, Polygon, State
from SICAR.drivers import Tesseract

states = {states}
polygon = Polygon.{polygon}

car = Sicar(driver=Tesseract)
MAX_RETRIES = {outer_retries}
RETRY_DELAY = 10

workspace = "/sicar/data"
for code, state_enum in states.items():
    out_folder = os.path.join(workspace, code)
    os.makedirs(out_folder, exist_ok=True)
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            car.download_state(
                state=state_enum,
                polygon=polygon,
                folder=out_folder,
                debug=True
            )
            print(f"[OK] {{code}}")
            break
        except Exception as e:
            print(f"[ERRO] {{code}} tent {{attempt}}: {{e}}")
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY)
'''


def _load_sicar_module():
    module_path = os.environ.get("LANDWATCH_SICAR_MODULE_PATH", "").strip()
    if module_path:
        p = Path(module_path).resolve()
        if p.exists():
            sys.path.insert(0, str(p))
    try:
        from SICAR.sicar import Sicar
        from SICAR.state import State
        from SICAR.polygon import Polygon
        from SICAR.exceptions import (
            UrlNotOkException,
            StateCodeNotValidException,
            FailedToDownloadCaptchaException,
            FailedToDownloadPolygonException,
            FailedToGetReleaseDateException,
        )
        from SICAR.drivers import Paddle, Tesseract
    except Exception as exc:
        raise RuntimeError("SICAR module not available. Set LANDWATCH_SICAR_MODULE_PATH or include SICAR in image.") from exc
    return Sicar, State, Polygon, Paddle, Tesseract, (
        UrlNotOkException,
        FailedToDownloadCaptchaException,
        FailedToDownloadPolygonException,
        StateCodeNotValidException,
        FailedToGetReleaseDateException,
    )

def _docker_enabled() -> bool:
    return os.environ.get("LANDWATCH_SICAR_USE_DOCKER", "1").strip().lower() in ("1", "true", "yes")

def _is_aca() -> bool:
    return any(
        os.environ.get(key)
        for key in (
            "CONTAINER_APP_NAME",
            "CONTAINER_APP_REVISION",
            "ACA_ENVIRONMENT",
            "KUBERNETES_SERVICE_HOST",
        )
    )


def _docker_pull(image: str) -> None:
    if os.environ.get("LANDWATCH_SICAR_DOCKER_PULL", "0").strip().lower() in ("1", "true", "yes"):
        subprocess.run(["docker", "pull", image], check=True)

def _ensure_tesseract() -> None:
    try:
        subprocess.run(["tesseract", "--version"], check=True, capture_output=True, text=True)
    except Exception as exc:
        raise RuntimeError("Tesseract nao encontrado no PATH. Instale tesseract-ocr ou use imagem Docker do job.") from exc


def _truncate_log(text: str, limit: int = 4000) -> str:
    if not text:
        return ""
    if len(text) <= limit:
        return text
    return text[:limit] + "\n... (truncado)"


def _run_docker(output_root: Path, states: list[str], polygon: str, outer_retries: int, image: str) -> None:
    state_map = ", ".join([f'"{s}": State.{s}' for s in states])
    inner = DOCKER_INNER_SCRIPT.format(states="{" + state_map + "}", polygon=polygon, outer_retries=outer_retries)
    script_path = output_root / "_inner_sicar.py"
    script_path.write_text(inner, encoding="utf-8")

    cmd = [
        "docker", "run", "-i", "--rm",
        "-v", f"{output_root.as_posix()}:/sicar/data",
        image, "-"
    ]
    log_info(f"Executando container SICAR: {' '.join(cmd)}")
    with script_path.open("rb") as f:
        res = subprocess.run(
            cmd,
            stdin=f,
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
    if res.returncode != 0:
        stdout = _truncate_log(res.stdout or "")
        stderr = _truncate_log(res.stderr or "")
        if stdout:
            log_warn(f"[SICAR Docker stdout]\n{stdout}")
        if stderr:
            log_warn(f"[SICAR Docker stderr]\n{stderr}")
        raise RuntimeError(f"SICAR Docker falhou (exit={res.returncode}). Veja stdout/stderr acima.")
    if res.stderr:
        log_warn(f"[SICAR Docker stderr]\n{_truncate_log(res.stderr)}")
    try:
        script_path.unlink()
    except Exception:
        pass


def _has_partial_sicar_outputs(output_root: Path) -> bool:
    if list(output_root.glob("CAR_*.shp")):
        return True
    for state_dir in output_root.iterdir():
        if state_dir.is_dir() and list(state_dir.glob("*.zip")):
            return True
    return False


def _extract_and_flatten(output_root: Path) -> None:
    for state_dir in output_root.iterdir():
        if not state_dir.is_dir():
            continue
        for z in state_dir.glob("*.zip"):
            log_info(f"Extraindo {z.name} em {state_dir.name}")
            with zipfile.ZipFile(z, "r") as zf:
                zf.extractall(state_dir)
            z.unlink()

        # move first shapefile set to output_root as CAR_UF.*
        for ext in SHAPE_EXTS:
            candidates = sorted(state_dir.glob(f"*{ext}"))
            if not candidates:
                continue
            src = candidates[0]
            dst = output_root / f"CAR_{state_dir.name}{ext}"
            if dst.exists():
                dst.unlink()
            shutil.move(str(src), str(dst))

        try:
            shutil.rmtree(state_dir)
        except Exception:
            pass


def download_state_with_retries(
    car,
    uf: str,
    polygon,
    base_folder: Path,
    inner_tries: int,
    outer_retries: int,
    debug: bool,
    err_types,
):
    uf = uf.upper()
    uf_dir = base_folder / f"_tmp_{uf}"
    ensure_dir(uf_dir)
    last_error = None

    for attempt in range(1, outer_retries + 1):
        try:
            res = car.download_state(
                state=uf,
                polygon=polygon,
                folder=str(uf_dir),
                tries=inner_tries,
                debug=debug,
            )
            if res:
                return res
        except err_types as e:
            last_error = e
        except Exception as e:
            last_error = e
    log_warn(f"[{uf}] falha após {outer_retries} tentativas. Último erro: {last_error}")
    return False


def run(work_dir: Path, snapshot_date: str) -> List[DatasetArtifact]:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    output_root = work_dir / "SICAR"
    ensure_dir(output_root)

    test_states_raw = os.environ.get("SICAR_TEST_STATES", "").strip()
    if test_states_raw:
        states_to_download = [s.strip().upper() for s in test_states_raw.split(',') if s.strip()]
    else:
        states_to_download = []

    polygon_name = "AREA_PROPERTY"
    tries_per_state = int(os.environ.get("SICAR_TRIES_PER_STATE", "25"))
    outer_retries = int(os.environ.get("SICAR_OUTER_RETRIES", "3"))

    use_docker = _docker_enabled()
    image = os.environ.get("LANDWATCH_SICAR_DOCKER_IMAGE", "urbanogilson/sicar:latest").strip()

    if use_docker and _is_aca():
        log_warn("ACA detectado: desabilitando modo Docker interno do SICAR.")
        use_docker = False

    if use_docker:
        if not states_to_download:
            states_to_download = [
                "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS",
                "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC",
                "SE", "SP", "TO",
            ]
        log_info(f"SICAR (Docker) UFs: {', '.join(states_to_download)}")
        _docker_pull(image)
        docker_attempts = int(os.environ.get("SICAR_DOCKER_RETRIES", "2"))
        docker_retry_seconds = int(os.environ.get("SICAR_DOCKER_RETRY_SECONDS", "20"))
        last_error = None
        for attempt in range(1, docker_attempts + 1):
            try:
                _run_docker(output_root, states_to_download, polygon_name, outer_retries, image)
                last_error = None
                break
            except Exception as exc:
                last_error = exc
                log_warn(f"SICAR Docker falhou na tentativa {attempt}/{docker_attempts}: {exc}")
                if attempt < docker_attempts:
                    time.sleep(docker_retry_seconds)

        if last_error:
            if _has_partial_sicar_outputs(output_root):
                log_warn("SICAR Docker falhou, mas foram encontrados arquivos baixados localmente. Continuando com o que houver.")
            else:
                raise last_error
        _extract_and_flatten(output_root)
        release_dates = {}
        run_utc = datetime.utcnow().isoformat()
    else:
        Sicar, State, Polygon, Paddle, Tesseract, err_types = _load_sicar_module()
        if not states_to_download:
            states_to_download = [s.value for s in State]
        log_info(f"SICAR (Python) UFs: {', '.join(states_to_download)}")
        polygon = Polygon.AREA_PROPERTY
        _ensure_tesseract()
        driver = Tesseract
        car = Sicar(driver=driver)
        try:
            release_dates = car.get_release_dates()
        except err_types[-1]:
            release_dates = {}
        run_utc = datetime.utcnow().isoformat()

    results = []

    for uf in states_to_download:
        if use_docker:
            ok = bool(list(output_root.glob(f"CAR_{uf}.*")))
        else:
            log_info(f"Iniciando download SICAR para UF={uf}")
            zip_path = download_state_with_retries(
                car=car,
                uf=uf,
                polygon=polygon,
                base_folder=output_root,
                inner_tries=tries_per_state,
                outer_retries=outer_retries,
                debug=True,
                err_types=err_types[:-1],
            )
            ok = bool(zip_path)

            if ok:
                tmp_dir = output_root / f"_tmp_{uf}"
                if tmp_dir.exists():
                    for zpath in tmp_dir.glob("*.zip"):
                        with zipfile.ZipFile(zpath, "r") as zf:
                            zf.extractall(tmp_dir)
                        zpath.unlink()
                    for ext in SHAPE_EXTS:
                        candidates = sorted(tmp_dir.glob(f"*{ext}"))
                        if not candidates:
                            continue
                        src = candidates[0]
                        dst = output_root / f"CAR_{uf}{ext}"
                        if dst.exists():
                            dst.unlink()
                        shutil.move(str(src), str(dst))
                    try:
                        shutil.rmtree(tmp_dir)
                    except Exception:
                        pass
        results.append({"uf": uf, "ok": ok})

    artifacts: List[DatasetArtifact] = []
    for item in results:
        uf = item["uf"]
        if not item["ok"]:
            continue
        files = sorted(output_root.glob(f"CAR_{uf}.*"))
        if not files:
            continue
        artifacts.append(
            DatasetArtifact(
                category="SICAR",
                dataset_code=f"CAR_{uf}",
                files=files,
                snapshot_date=snapshot_date,
                extra={
                    "uf": uf,
                    "polygon": polygon_name if use_docker else polygon.name,
                    "release_date_sicar": release_dates.get(State(uf), None) if (not use_docker and release_dates) else None,
                    "run_datetime_utc": run_utc,
                },
            )
        )

    if artifacts:
        rows = [
            {
                "uf": a.extra.get("uf"),
                "polygon": a.extra.get("polygon"),
                "ok": True,
                "file_root": a.dataset_code,
                "release_date_sicar": a.extra.get("release_date_sicar"),
                "run_datetime_utc": run_utc,
                "output_dir": str(output_root),
            }
            for a in artifacts
        ]
        df_manifest = pd.DataFrame(rows)
        df_manifest.to_parquet(output_root / "SICAR_manifest.parquet", index=False)

    ok_states = [r["uf"] for r in results if r["ok"]]
    fail_states = [r["uf"] for r in results if not r["ok"]]
    if ok_states:
        log_info(f"SICAR UFs baixadas: {', '.join(ok_states)}")
    if fail_states:
        log_warn(f"SICAR UFs com falha: {', '.join(fail_states)}")

    return artifacts
