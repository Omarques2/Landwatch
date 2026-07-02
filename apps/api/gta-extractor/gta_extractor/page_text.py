from __future__ import annotations

import re
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

import fitz
from PIL import Image, ImageFilter, ImageOps

from gta_extractor.schema import BlockBox, WordBox
from gta_extractor.text_utils import normalize

EXPECTED_TOKENS = [
    "guia de transito animal",
    "e-gta",
    "numero",
    "serie",
    "origem",
    "procedencia",
    "destino",
    "cpf",
    "cnpj",
    "municipio",
    "especie",
    "finalidade",
    "estratificacao",
    "animais transportados",
]


def native_text_quality(text: str) -> float:
    if not text:
        return 0.0
    cid_ratio = text.count("(cid:") / max(len(text), 1)
    printable_ratio = sum(ch.isprintable() or ch.isspace() for ch in text) / max(len(text), 1)
    normalized = normalize(text)
    token_hits = sum(tok in normalized for tok in EXPECTED_TOKENS)
    hit_score = token_hits / len(EXPECTED_TOKENS)
    quality = (printable_ratio * 0.45) + (hit_score * 0.45) + ((1 - min(cid_ratio * 20, 1)) * 0.10)
    return max(0.0, min(1.0, quality))


def is_bad_native_text(text_raw: str, text_sorted: str | None = None) -> bool:
    text = text_sorted if text_sorted is not None else text_raw
    stripped = (text or "").strip()
    if len(stripped) < 80:
        return True
    merged = f"{text_raw or ''}\n{text or ''}"
    cid_ratio = merged.count("(cid:") / max(len(merged), 1)
    printable_ratio = sum(ch.isprintable() or ch.isspace() for ch in text) / max(len(text), 1)
    hits = sum(tok in normalize(merged) for tok in EXPECTED_TOKENS)
    return cid_ratio > 0.01 or printable_ratio < 0.85 or hits < 2


def extract_native_page(page) -> tuple[str, str, list[WordBox], list[BlockBox]]:
    raw_text = page.get_text("text") or ""
    sorted_text = page.get_text("text", sort=True) or raw_text
    words: list[WordBox] = []
    for item in page.get_text("words") or []:
        x0, y0, x1, y1, word = item[:5]
        words.append(WordBox(str(word), float(x0), float(y0), float(x1), float(y1), None))
    blocks: list[BlockBox] = []
    for item in page.get_text("blocks") or []:
        x0, y0, x1, y1, text, *rest = item
        block_type = int(rest[1]) if len(rest) > 1 and isinstance(rest[1], int) else None
        blocks.append(BlockBox(str(text), float(x0), float(y0), float(x1), float(y1), block_type))
    return raw_text, sorted_text, words, blocks


def extract_poppler_layout_page(pdf_path: str | Path, page_number: int) -> tuple[str, str | None]:
    cmd = shutil.which("pdftotext")
    if not cmd:
        return "", "poppler_unavailable"
    try:
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "page.txt"
            result = subprocess.run(
                [cmd, "-layout", "-f", str(page_number), "-l", str(page_number), str(pdf_path), str(output)],
                capture_output=True,
                text=True,
                timeout=30,
                check=False,
            )
            if result.returncode != 0:
                return "", (result.stderr or result.stdout or f"pdftotext_exit_{result.returncode}").strip()
            return output.read_text(encoding="utf-8", errors="replace"), None
    except Exception as exc:
        return "", f"poppler_error:{type(exc).__name__}:{exc}"


def choose_native_text_candidate(candidates: dict[str, str], filename: str = "") -> tuple[str, str, dict[str, float]]:
    scores = {name: _native_candidate_score(text, filename) for name, text in candidates.items() if text is not None}
    if not scores:
        return "", "missing", {}
    best = max(scores, key=scores.get)
    return candidates.get(best, "") or "", best, scores


def normalize_noisy_native_labels(text: str) -> str:
    replacements = [
        (r"CPF\s*/?\s*GNPJ|CPFICNPJ|CFFICNPJ|CPF\s*/?\s*CNPY|CPF\s*/?\s*GNPY", "CPF/CNPJ"),
        (r"Estab[eê]lecimento|Esi[aâ]bel[eê]cimento|Est[aâ]b[eê]l[eê]cim[eê]nto", "Estabelecimento"),
        (r"C[oó]digo\s+Esi[aâ]bel[eê]cimento|C[oó]digo\s+Est[aâ]b[eê]l[eê]cim[eê]nto", "Código Estabelecimento"),
        (r"\blnscri[cç][aã]o\b|\blnscrição\b", "Inscrição"),
        (r"\bNom[eê]\b", "Nome"),
        (r"\bMunicipio\b|\bMunic[ií]pio\b", "Município"),
        (r"Engo[ÍIíi]d[aâ]|EngoIda", "Engorda"),
        (r"Tot[aâ]l|Tctal", "Total"),
        (r"Data[ilr]Hora|DatalHora|DataiHora|DatarHora", "Data/Hora"),
        (r"Esp[eê]cie", "Espécie"),
        (r"Final[ií]dade|Fin[aâ]lidade", "Finalidade"),
    ]
    output = text or ""
    for pattern, repl in replacements:
        output = re.sub(pattern, repl, output, flags=re.I)
    return output


def _native_candidate_score(text: str, filename: str = "") -> float:
    from gta_extractor.header import extract_header_candidates

    n = normalize(text)
    header = extract_header_candidates(text, filename)
    score = 0.0
    score += 8 if header.numero and header.serie else 0
    score += 4 if ("origem" in n or "procedencia" in n) and "destino" in n else 0
    score += 3 if "cpf" in n or "cnpj" in n else 0
    score += 2 if "municipio" in n else 0
    score += 3 if "data/hora emissao" in n or "data emissao" in n else 0
    score += 3 if "especie" in n and "finalidade" in n else 0
    score += 2 if _has_real_table_value_line(text) else 0
    score -= min(8, len(re.findall(r"[§�]|[A-Za-z][0-9][A-Za-z]", text or "")) * 0.2)
    return score


def _has_real_table_value_line(text: str) -> bool:
    lines = (text or "").splitlines()
    for idx, line in enumerate(lines):
        compact = normalize(line)
        if sum(token in compact for token in ["0 - 12", "13 - 24", "25 - 36", "total"]) < 2:
            continue
        for candidate in lines[idx + 1 : idx + 5]:
            numbers = re.findall(r"\b\d{1,4}\b", candidate)
            if len(numbers) >= 8 and not re.search(r"\d+\s*[-–]\s*\d+", candidate):
                return True
    return False


def render_page(page, zoom: float = 200 / 72) -> Image.Image:
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    image = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    image = ImageOps.grayscale(image)
    image = ImageOps.autocontrast(image)
    image = image.filter(ImageFilter.SHARPEN)
    return image



def ocr_page(*_args, **_kwargs):
    return "", [], 0.0, "ocr_ignored_by_notebook"


def ocr_attempt_plan(include_rotations: bool = True, psms: tuple[int, ...] = (6, 4, 3, 11)) -> list[tuple[int, int]]:
    return [(psm, 0) for psm in psms]
