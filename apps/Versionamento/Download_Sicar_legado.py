#!/usr/bin/env python3
"""
download_sicar.py

Orquestra um container Docker que roda o SICAR e depois
faz upload dos shapefiles baixados para o OneDrive.

Parâmetros:
  --path       Subpasta no OneDrive onde gravar (sempre upload).
  --group-id   ID do grupo OneDrive (upload).
"""
import argparse
import logging
import subprocess
import sys
import tempfile
import os
import zipfile
from pathlib import Path

from onedrive import OneDrive

'''
"MT": State.MT,
"SP": State.SP,
"GO": State.GO,
"TO": State.TO,
"MS": State.MS,
"MA": State.MA,
"PA": State.PA,
'''
INNER_SCRIPT = r'''
import os, time
from SICAR import Sicar, Polygon, State
from SICAR.drivers import Tesseract

states = {
    "MT": State.MT,
    "SP": State.SP,
    "GO": State.GO,
    "TO": State.TO,
    "MS": State.MS,
    "MA": State.MA,
    "PA": State.PA,
}
polygons = {
    "AREA_PROPERTY": Polygon.AREA_PROPERTY,
}

car = Sicar(driver=Tesseract)
MAX_RETRIES = 10
RETRY_DELAY = 10

workspace = "/sicar/data"
for code, state_enum in states.items():
    out_folder = os.path.join(workspace, code)
    os.makedirs(out_folder, exist_ok=True)
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            car.download_state(
                state=state_enum,
                polygon=polygons["AREA_PROPERTY"],
                folder=out_folder,
                debug=True
            )
            print(f"[OK] {code}")
            break
        except Exception as e:
            print(f"[ERRO] {code} tent {attempt}: {e}")
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY)
'''

def setup_logger():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[logging.StreamHandler(sys.stdout)]
    )

def pull_image():
    logging.info("docker pull urbanogilson/sicar:latest")
    subprocess.run(["docker", "pull", "urbanogilson/sicar:latest"], check=True)

def run_container(tmpdir: str):
    script_path = Path(tmpdir) / "inner_sicar.py"
    script_path.write_text(INNER_SCRIPT, encoding="utf-8")
    cmd = [
        "docker", "run", "-i", "--rm",
        "-v", f"{tmpdir}:/sicar/data",
        "urbanogilson/sicar:latest", "-"
    ]
    logging.info("Executando container: " + " ".join(cmd))
    with open(script_path, "rb") as f:
        subprocess.run(cmd, stdin=f, check=True)

def extract_and_cleanup(tmpdir: str):
    """
    Para cada subpasta de estado em tmpdir, extrai todo zip ali
    e deleta o .zip em seguida.
    """
    tmpdir = Path(tmpdir)
    for state_dir in tmpdir.iterdir():
        if not state_dir.is_dir():
            continue
        for z in state_dir.glob("*.zip"):
            logging.info(f"Extraindo {z.name} em {state_dir.name}")
            with zipfile.ZipFile(z, "r") as zf:
                zf.extractall(state_dir)
            z.unlink()  # remove o zip

def upload_folder(tmpdir: str, remote_base: str, group_id: str):
    """
    Faz upload de todo conteúdo de tmpdir para remote_base no OneDrive,
    gerando arquivos CAR_UF.ext (CAR_MT.shp, CAR_MT.dbf, etc.) diretamente
    em remote_base (sem subpastas por estado).
    """
    client = OneDrive()
    tmpdir = Path(tmpdir)

    for root, _, files in os.walk(tmpdir):
        for f in files:
            # só shapefile components
            if not any(f.lower().endswith(ext) for ext in (".shp", ".shx", ".dbf", ".prj", ".cpg", ".qpj")):
                continue

            local = Path(root) / f
            rel_parts = local.relative_to(tmpdir).parts

            # Primeiro nível da pasta é o código da UF (MT, SP, etc.)
            # Ex.: tmpdir/MT/AREA_IMOVEL_1.shp -> state_code = "MT"
            state_code = rel_parts[0] if len(rel_parts) > 1 else "XX"

            ext = local.suffix.lower()  # .shp, .dbf, etc.
            remote_name = f"CAR_{state_code}{ext}"  # ex.: CAR_MT.shp

            remote = f"{remote_base.rstrip('/')}/{remote_name}"
            data = local.read_bytes()
            client.upload_file(remote, data, group_id)
            logging.info(f"Enviado {remote}")

def main():
    parser = argparse.ArgumentParser(
        description="Baixa SICAR em Docker e envia ao OneDrive"
    )
    parser.add_argument(
        "--path", required=True,
        help="Subpasta no OneDrive onde gravar"
    )
    parser.add_argument(
        "--group-id", required=True,
        help="ID do grupo OneDrive"
    )
    args = parser.parse_args()

    setup_logger()

    with tempfile.TemporaryDirectory() as tmpdir:
        print(f'Path tmpdir - {tmpdir}')
        pull_image()
        run_container(tmpdir)

        # extrai zips e remove eles
        extract_and_cleanup(tmpdir)

        # upload para --path com padrão CAR_UF.ext (sem histórico)
        upload_folder(tmpdir, args.path, args.group_id)

    logging.info("Operação concluída.")

if __name__ == "__main__":
    main()

'''
Exemplo de uso:
python download_sicar.py \
  --path "Origins/LandWatch/Dados/SICAR" \
  --group-id "1dad0d77-03f3-49f3-a539-fc71b42b730b"
'''
