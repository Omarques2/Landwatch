from __future__ import annotations

import re
from dataclasses import dataclass

from gta_extractor.schema import WordBox
from gta_extractor.text_utils import normalize


@dataclass(slots=True)
class HeaderCandidate:
    numero: str | None
    serie: str | None
    uf: str | None
    confidence: float
    source: str
    warnings: list[str]


def extract_header_candidates(text: str, filename: str = "", words: list[WordBox] | None = None) -> HeaderCandidate:
    del words
    pipe = _from_pipe(text)
    label = _from_label(text)
    table = _from_table_header(text)
    content = _choose_content_header(pipe, label, table)
    file_candidate = _from_filename(filename)
    warnings: list[str] = []

    if content and file_candidate and _mismatch(content, file_candidate):
        warnings.append("header_filename_mismatch")
    chosen = content or file_candidate
    if not chosen:
        return HeaderCandidate(None, None, None, 0.0, "missing", [])
    source = _source_for_content(content, pipe, label, table) if content else "filename"
    confidence = 0.95 if content else 0.75
    return HeaderCandidate(chosen[0], chosen[1], chosen[2], confidence, source, warnings)


def _choose_content_header(
    pipe: tuple[str | None, str | None, str | None] | None,
    label: tuple[str | None, str | None, str | None] | None,
    table: tuple[str | None, str | None, str | None] | None,
) -> tuple[str | None, str | None, str | None] | None:
    if pipe and (not label or _label_series_suspicious(label, pipe)):
        return pipe
    return label or table or pipe


def _source_for_content(content, pipe, label, table) -> str:
    if pipe and content == pipe:
        return "pipe"
    if label and content == label:
        return "label"
    if table and content == table:
        return "table"
    return "content"


def _label_series_suspicious(label, pipe) -> bool:
    label_serie = label[1] or ""
    pipe_serie = pipe[1] or ""
    if pipe_serie and label_serie and label_serie != pipe_serie:
        if len(label_serie) == 1 and pipe_serie.startswith(label_serie):
            return True
        if re.search(r"[^A-Z0-9]", label_serie):
            return True
    return False


def _from_label(text: str) -> tuple[str | None, str | None, str | None] | None:
    numero = _first([r"N[úu]mero\s*:?\s*([0-9]{3,12})", r"\bNumero\s*:?\s*([0-9]{3,12})", r"htr[úu]meno\s*:?\s*[üu]?([0-9Sg]{3,12})"], text)
    serie = _first([r"S[ée]rie\s*:?\s*([A-Z0-9]{1,6})", r"\bSerie\s*:?\s*([A-Z0-9]{1,6})"], text)
    uf = _first([r"\bUF\s*:?\s*([A-Z]{2})\b"], text)
    if numero and serie:
        return numero, serie, uf
    return None


def _from_table_header(text: str) -> tuple[str | None, str | None, str | None] | None:
    n = normalize(text)
    if "uf" not in n or "serie" not in n or not ("numero" in n or "número" in text.lower()):
        return None
    for line in text.splitlines():
        match = re.search(r"\b([A-Z]{2})\s*\|?\s*([A-Z0-9]{1,4})\s*\|?\s*([0-9]{3,12})\b", line)
        if match:
            return match.group(3), match.group(2), match.group(1)
    compact = re.sub(r"[|]+", " ", text)
    match = re.search(r"\b([A-Z]{2})\s+([A-Z0-9]{1,4})\s+([0-9]{3,12})\b", compact)
    if match:
        return match.group(3), match.group(2), match.group(1)
    return None


def _from_pipe(text: str) -> tuple[str | None, str | None, str | None] | None:
    match = re.search(r"\b([0-9OIlSgü]{3,12})\s*\|\s*([A-Z0-9]{1,6})\b", text, flags=re.I)
    if match:
        numero = _clean_noisy_digits(match.group(1))
        return numero, match.group(2).upper(), None
    return None


def _clean_noisy_digits(value: str) -> str:
    table = str.maketrans({"O": "0", "o": "0", "I": "1", "l": "1", "S": "5", "s": "5", "g": "9", "ü": "0"})
    return value.translate(table)


def _from_filename(filename: str) -> tuple[str | None, str | None, str | None] | None:
    name = filename.upper()
    match = re.search(r"([0-9]{3,12})_([A-Z0-9]{1,4})_([A-Z]{2})\.PDF$", name)
    if match:
        return match.group(1), match.group(2), match.group(3)
    match = re.search(r"([0-9]{3,12})_([A-Z]{2})\.PDF$", name)
    if match:
        return match.group(1), None, match.group(2)
    return None


def _first(patterns: list[str], text: str) -> str | None:
    for pattern in patterns:
        match = re.search(pattern, text or "", flags=re.I | re.S)
        if match:
            return match.group(1).strip().upper()
    return None


def _mismatch(a: tuple[str | None, str | None, str | None], b: tuple[str | None, str | None, str | None]) -> bool:
    return any(left and right and left != right for left, right in zip(a, b))
