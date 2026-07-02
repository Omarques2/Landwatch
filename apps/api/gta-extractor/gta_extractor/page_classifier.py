from __future__ import annotations

import re

from gta_extractor.header import extract_header_candidates
from gta_extractor.text_utils import normalize


def extract_numero_serie(text: str, filename: str = "") -> tuple[str | None, str | None]:
    header = extract_header_candidates(text, filename)
    return header.numero, header.serie


def _first(patterns: list[str], text: str) -> str:
    for pattern in patterns:
        match = re.search(pattern, text or "", re.I)
        if match:
            return match.group(1).strip().upper()
    return ""


def detect_system(text: str, filename: str = "") -> str | None:
    n = normalize(text)
    name = filename.upper()
    if "gedave" in n or "_SP" in name:
        return "GEDAVE"
    if "adapec" in n or "sidato" in n or "_TO" in name:
        return "ADAPEC"
    if "agrodefesa" in n or "sidago" in n or "_GO" in name or name.endswith("_1.PDF"):
        return "SIDAGO"
    return None


def classify_page_type(text: str, filename: str = "") -> str:
    n = normalize(text)
    header = extract_header_candidates(text, filename)
    numero, serie = header.numero, header.serie
    has_gta = "guia de transito animal" in n or "e-gta" in n or ("transito animal" in n and "numero" in n)
    has_origin_dest = ("origem" in n or "procedencia" in n) and "destino" in n
    has_table = "animais transportados" in n or "estratificacao" in n or "0-12" in n or "13-24" in n or "0 - 2 meses" in n
    has_sidago_sections = ("origem" in n and "destino" in n and "animais transportados" in n)
    has_species_finality = "finalidade" in n and "especie" in n
    has_footer = "documento impresso" in n or "identificador de validacao" in n or "autenticidade" in n
    has_barcode_hint = "codigo de barras" in n or "qr" in n or has_footer
    has_strong_noisy_gta = _has_strong_gta_structure(text, filename)

    if has_gta and (numero or serie or has_origin_dest or has_table):
        return "gta_main"
    if has_strong_noisy_gta:
        return "gta_main"
    if numero and serie and (has_sidago_sections or (has_origin_dest and has_species_finality and has_table)):
        return "gta_main"
    if "danfe" in n or "nf-e" in n or "nota fiscal" in n:
        return "nota_fiscal"
    if "peso liquido" in n or "quant animais" in n or "romaneio" in n or "r$/@" in n:
        return "romaneio_peso"
    if numero and serie and has_barcode_hint and not has_origin_dest:
        return "gta_continuation"
    if has_barcode_hint and not has_origin_dest and not has_table:
        return "barcode_only"
    return "unknown"


def _has_strong_gta_structure(text: str, filename: str = "") -> bool:
    n = normalize(text)
    header = extract_header_candidates(text, filename)
    if not (header.numero and header.serie):
        return False

    has_pipe_header = bool(re.search(r"\b[0-9OIlSgü]{3,12}\s*\|\s*[A-Z]{1,4}\b", text or "", flags=re.I))
    has_gta_identity = (
        header.source == "pipe"
        or has_pipe_header
        or "guia de transito animal" in n
        or "transito animal" in n
        or "gta emitido eletronicamente" in n
    )
    if not has_gta_identity:
        return False

    signals = 0
    signals += int(bool(re.search(r"\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b|\b\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}\b", text or "")))
    signals += int(bool(re.search(r"/\s*GO\b|\bGO\b", text or "", flags=re.I)))
    signals += int("rodoviario" in n or "rodoviario" in n)
    signals += int(any(word in n for word in ["engorda", "recria", "abate", "reproducao"]))
    signals += int("bovino" in n or "bovina" in n)
    signals += int("data/hora emissao" in n or "dataihora emissao" in n or "emissao" in n)
    signals += int(any(token in n for token in ["0-12", "13-24", "25-36", "animais transportados"]))
    signals += int("dare:" in n or "gta emitido eletronicamente pela agrodefesa" in n)
    return signals >= 3
