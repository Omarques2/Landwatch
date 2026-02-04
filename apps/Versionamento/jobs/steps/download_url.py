import io
import json
import os
import re
import time
import zipfile
from pathlib import Path
from typing import List
from urllib.parse import urlparse, unquote

import requests
import urllib3
from requests.exceptions import HTTPError, RequestException

from .common import DatasetArtifact, ensure_dir, load_json, log_info, log_warn

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

DEFAULT_DOWNLOADS = [
    {
        "url": "https://certificacao.incra.gov.br/csv_shp/zip/%C3%81reas%20de%20Quilombolas.zip",
        "path": "QUILOMBOLAS",
        "filename": "Terras_Quilombolas",
    },
    {
        "url": "https://pamgia.ibama.gov.br/geoservicos/arquivos/adm_embargo_ibama_a.shp.zip",
        "path": "EMBARGOS_IBAMA",
        "filename": "Embargos_Ibama",
    },
    {
        "url": "https://geoserver.funai.gov.br/geoserver/Funai/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=Funai%3Atis_amazonia_legal_poligonais&maxFeatures=10000&outputFormat=SHAPE-ZIP",
        "path": "INDIGENAS",
        "filename": "Terras_Indigenas",
    },
    {
        "url": "https://www.gov.br/icmbio/pt-br/assuntos/dados_geoespaciais/mapa-tematico-e-dados-geoestatisticos-das-unidades-de-conservacao-federais/copy_of_Limites_UCs_fed_112025.zip",
        "path": "UCS",
        "filename": "Unidades_Conservacao",
    },
    {
        "url": "https://www.gov.br/icmbio/pt-br/assuntos/dados_geoespaciais/mapa-tematico-e-dados-geoestatisticos-das-unidades-de-conservacao-federais/embargos_icmbio_shp.zip",
        "path": "EMBARGOS_ICMBIO",
        "filename": "Embargos_ICMBIO",
    },
    {
        "url": "https://geoftp.ibge.gov.br/informacoes_ambientais/estudos_ambientais/biomas/vetores/Biomas_250mil.zip",
        "path": "BIOMAS",
        "filename": "Biomas",
    },
    {
        "url": "https://monitoramento.semas.pa.gov.br/ldi/regioesdesmatamento/baixartodosshapefile?tipoShape=MANUAL",
        "path": "LDI_MANUAL",
        "filename": "LDI_Semas_Manual",
    },
    {
        "url": "https://monitoramento.semas.pa.gov.br/ldi/regioesdesmatamento/baixartodosshapefile?tipoShape=AUTOMATIZADO",
        "path": "LDI_AUTOMATIZADO",
        "filename": "LDI_Semas_Automatizado",
    },
    {
        "url": "https://monitoramento.semas.pa.gov.br/ldi/regioesdesmatamento/baixartodosshapefile?tipoShape=SEMSOBREPOSICAO",
        "path": "LDI_SEMSOBREPOSICAO",
        "filename": "LDI_Semas_SemSobreposicao",
    },
    {
        "url": "https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/areas-de-atuacao/cadastro_de_empregadores.csv",
        "path": "CADASTRO_EMPREGADORES",
        "filename": "Cadastro_de_Empregadores",
    },
    {
        "url": "https://dadosabertos.ibama.gov.br/dados/SIFISC/termo_embargo/termo_embargo/termo_embargo_csv.zip",
        "path": "LISTA_EMBARGOS_IBAMA",
        "filename": "Lista_Embargos_Ibama",
    },
]


def get_filename(resp, url: str, suffix: str) -> str:
    cd = resp.headers.get('content-disposition', '')
    m = re.findall(r'filename="?([^";]+)"?', cd)
    if m:
        return m[0]
    return unquote(Path(urlparse(url).path).name) or f"download{suffix}"


def download_content(url: str, max_retries: int = 3, backoff: int = 5):
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0 Safari/537.36"
        ),
        "Accept": "*/*",
        "Connection": "keep-alive",
    }

    for attempt in range(1, max_retries + 1):
        try:
            r = requests.get(
                url,
                stream=True,
                verify=False,
                headers=headers,
                timeout=120,
            )
            status = r.status_code
            if status == 403:
                if attempt < max_retries:
                    time.sleep(backoff)
                    continue
                return None, None

            try:
                r.raise_for_status()
            except HTTPError:
                if attempt < max_retries:
                    time.sleep(backoff)
                    continue
                raise

            return r, r.content

        except RequestException:
            if attempt < max_retries:
                time.sleep(backoff)
            else:
                raise

    return None, None


def load_downloads(path: Path) -> List[dict]:
    if path.exists():
        return load_json(path)
    return DEFAULT_DOWNLOADS


def process_download_item(item: dict, out_root: Path) -> List[Path]:
    url = item["url"]
    rel_path = item["path"]
    base_name = item.get("filename")

    out_dir = out_root / rel_path
    ensure_dir(out_dir)

    resp, data = download_content(url)
    if resp is None or data is None:
        log_warn(f"Falha ao baixar {url}")
        return []

    content_type = resp.headers.get("content-type", "").lower()
    is_zip = "zip" in content_type or url.lower().endswith(".zip")

    saved: List[Path] = []
    if is_zip:
        zf = zipfile.ZipFile(io.BytesIO(data))
        for member in zf.namelist():
            if member.endswith("/"):
                continue
            member_path = Path(member)
            ext = member_path.suffix
            if base_name:
                filename = f"{base_name}{ext}" if ext else base_name
            else:
                filename = member_path.name
            target_path = out_dir / filename
            target_path.parent.mkdir(parents=True, exist_ok=True)
            blob = zf.read(member)
            target_path.write_bytes(blob)
            saved.append(target_path)
    else:
        original_name = get_filename(resp, url, "")
        ext = Path(original_name).suffix
        if base_name:
            filename = f"{base_name}{ext}" if ext else base_name
        else:
            filename = original_name
        target_path = out_dir / filename
        target_path.write_bytes(data)
        saved.append(target_path)

    return saved


def run(work_dir: Path, snapshot_date: str) -> List[DatasetArtifact]:
    env_path = os.environ.get("LANDWATCH_DOWNLOAD_URLS", "").strip()
    downloads_path = Path(env_path) if env_path else None
    if not downloads_path or downloads_path.is_dir() or not downloads_path.exists():
        downloads_path = Path(__file__).resolve().parents[2] / "Download_urls.json"

    downloads = load_downloads(downloads_path)
    out_root = work_dir / "URL"
    artifacts: List[DatasetArtifact] = []

    for item in downloads:
        try:
            saved = process_download_item(item, out_root)
            if not saved:
                continue
            dataset_code = item.get("filename") or Path(item["url"]).stem
            category = item.get("path", "URL")
            artifacts.append(
                DatasetArtifact(
                    category=category.upper(),
                    dataset_code=str(dataset_code).upper(),
                    files=saved,
                    snapshot_date=snapshot_date,
                    extra={"url": item.get("url")},
                )
            )
        except Exception as exc:
            log_warn(f"Falha ao processar {item.get('url')}: {exc}")

    return artifacts
