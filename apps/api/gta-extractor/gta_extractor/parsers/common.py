from __future__ import annotations

import re
from typing import Iterable

from gta_extractor import COMMON_COLUMNS, NUMERIC_COLUMNS
from gta_extractor.schema import GTAGroup, WordBox
from gta_extractor.text_utils import first, normalize, only_digits, split_city_uf


TABLE_COLUMNS = [
    "0_12_M",
    "0_12_F",
    "13_24_M",
    "13_24_F",
    "25_36_M",
    "25_36_F",
    "36+_M",
    "36+_F",
]


def blank_record(arquivo: str, sistema: str | None = None) -> dict:
    data = {column: "" for column in COMMON_COLUMNS}
    data["arquivo"] = arquivo
    data["sistema"] = sistema or ""
    data["metodo_texto"] = ""
    for column in NUMERIC_COLUMNS:
        data[column] = 0
    return data


def group_text(group: GTAGroup) -> str:
    return "\n".join(page.chosen_text or "" for page in group.pages)


def main_text(group: GTAGroup) -> str:
    for page in group.pages:
        if page.page_index == group.main_page_index:
            return page.chosen_text or ""
    return group.pages[0].chosen_text if group.pages else ""


def group_words(group: GTAGroup) -> list[WordBox]:
    words: list[WordBox] = []
    for page in group.pages:
        words.extend(page.words)
    return words


def set_header(data: dict, group: GTAGroup, uf: str | None = None) -> None:
    data["numero_gta"] = group.numero_gta or data.get("numero_gta") or ""
    data["serie_gta"] = group.serie_gta or data.get("serie_gta") or ""
    page_uf = next((page.uf_candidate for page in group.pages if page.uf_candidate), None)
    data["uf_gta"] = uf or page_uf or data.get("uf_gta") or ""
    methods = sorted({page.method for page in group.pages if page.method})
    data["metodo_texto"] = "+".join(methods)


def extract_date(text: str) -> str:
    return first(r"(\d{2}/\d{2}/\d{4})", text) or ""


def extract_species(text: str) -> str:
    value = first(r"Esp[eé]cie\s*:?\s*([A-ZÇÃÕÁÉÍÓÚÂÊÔ /-]{3,40})", text)
    if not value:
        return ""
    value = re.split(r"\n|Finalidade|Sexo|Ra[çc]a", value, 1, flags=re.I)[0].strip()
    return " ".join(value.split())


def extract_finalidade(text: str) -> str:
    value = first(r"Finalidade\s*:?\s*([A-ZÇÃÕÁÉÍÓÚÂÊÔ /-]{3,60})", text)
    if not value:
        return ""
    value = re.split(r"\n|Meio de Transporte|Animais|Vacina", value, 1, flags=re.I)[0].strip()
    return " ".join(value.split())


def extract_numero_serie_header(text: str) -> tuple[str, str, str]:
    numero = first(r"N[úu]mero\s*:?\s*([0-9]{3,12})", text) or first(r"\bGTA\s*:?\s*([0-9]{3,12})", text) or ""
    serie = first(r"S[ée]rie\s*:?\s*([A-Z0-9]{1,6})", text) or ""
    uf = first(r"\bUF\s*:?\s*([A-Z]{2})\b", text) or ""
    return numero, serie, uf


def parse_city_uf_line(value: str) -> tuple[str, str]:
    value = re.sub(r"\s+", " ", value).strip(" :-")
    return split_city_uf(value)


def fill_people_by_sections(data: dict, text: str) -> None:
    upper = text
    origem = _section_between(upper, [r"I\s*[-–]\s*ORIGEM", r"\bORIGEM\b", r"\bPROCED[ÊE]NCIA\b"], [r"II\s*[-–]\s*DESTINO", r"\bDESTINO\b"])
    destino = _section_between(upper, [r"II\s*[-–]\s*DESTINO", r"\bDESTINO\b"], [r"III\s*[-–]", r"\bANIMAIS\b", r"\bESP[EÉ]CIE\b"])
    if not origem.strip() and destino:
        origem, destino = _split_two_party_blocks(destino)
    if not origem.strip() and not destino.strip():
        return
    _fill_party(data, "origem", origem)
    _fill_party(data, "destino", destino)


def _section_between(text: str, starts: list[str], ends: list[str]) -> str:
    start_match = None
    for pattern in starts:
        found = re.search(pattern, text, flags=re.I)
        if found and (start_match is None or found.start() < start_match.start()):
            start_match = found
    if not start_match:
        return ""
    tail = text[start_match.end() :]
    end_pos = len(tail)
    for pattern in ends:
        found = re.search(pattern, tail, flags=re.I)
        if found:
            end_pos = min(end_pos, found.start())
    return tail[:end_pos]


def _fill_party(data: dict, prefix: str, section: str) -> None:
    estabelecimento = first(r"Estabelecimento\s*:?\s*(.+?)(?:\n|C[oó]digo|Nome|CPF|Munic[ií]pio|$)", section)
    codigo = first(r"C[oó]digo\s+Estabelecimento\s*:?\s*(.+?)(?:\n|Nome|CPF|Munic[ií]pio|$)", section)
    nome = first(r"Nome\s*:?\s*(.+?)(?:\n|CPF|CNPJ|Munic[ií]pio|$)", section)
    cpf = first(r"CPF/?CNPJ\s*:?\s*([0-9.\-/ ]{11,22})", section) or first(r"CNPJ\s*:?\s*([0-9.\-/ ]{11,22})", section)
    municipio = first(r"Munic[ií]pio\s*:?\s*(.+?)(?:\n|UF|Marca|Observa|$)", section)
    uf = first(r"\bUF\s*:?\s*([A-Z]{2})\b", section)
    if estabelecimento:
        data[f"{prefix}.estabelecimento"] = clean_value(estabelecimento)
    if codigo:
        data[f"{prefix}.codigo_estabelecimento"] = clean_value(codigo)
    if nome:
        data[f"{prefix}.nome"] = clean_value(nome)
    if cpf:
        data[f"{prefix}.cpf_cnpj"] = only_digits(cpf)
    if municipio:
        city, detected_uf = parse_city_uf_line(municipio)
        data[f"{prefix}.municipio"] = city
        data[f"{prefix}.uf"] = uf or detected_uf
    elif uf:
        data[f"{prefix}.uf"] = uf


def _split_two_party_blocks(section: str) -> tuple[str, str]:
    matches = list(re.finditer(r"(?m)^(?!C[oó]digo\s)Estabelecimento\s*:", section, flags=re.I))
    if len(matches) < 2:
        return "", section
    first_start = matches[0].start()
    second_start = matches[1].start()
    return section[first_start:second_start], section[second_start:]


def clean_value(value: str) -> str:
    value = re.sub(r"\s+", " ", value).strip(" :-")
    return value


def extract_animal_table_from_text(text: str) -> dict[str, int]:
    counts = {column: 0 for column in NUMERIC_COLUMNS}
    normalized = normalize(text)
    has_table = (
        all(token in normalized for token in ["0 - 12", "13 - 24", "25 - 36"])
        or all(token in normalized for token in ["0-12", "13-24", "25-36"])
        or ("animais transportados" in normalized and "total" in normalized)
    )
    if not has_table:
        return counts

    section = _animal_section(text)
    values = _table_values_after_header(section)
    if not values:
        return counts
    for column, value in zip(TABLE_COLUMNS, values[:8]):
        counts[column] = value
    if len(values) >= 9:
        total = values[8]
        male_sum = counts["0_12_M"] + counts["13_24_M"] + counts["25_36_M"] + counts["36+_M"]
        female_sum = counts["0_12_F"] + counts["13_24_F"] + counts["25_36_F"] + counts["36+_F"]
        if male_sum + female_sum == total:
            counts["total_M"] = male_sum
            counts["total_F"] = female_sum
        else:
            counts["total_M"] = male_sum
            counts["total_F"] = female_sum
    else:
        counts["total_M"] = counts["0_12_M"] + counts["13_24_M"] + counts["25_36_M"] + counts["36+_M"]
        counts["total_F"] = counts["0_12_F"] + counts["13_24_F"] + counts["25_36_F"] + counts["36+_F"]
    return counts


def table_header_only_no_values(text: str) -> bool:
    normalized = normalize(text)
    if not (
        all(token in normalized for token in ["0 - 12", "13 - 24", "25 - 36"])
        or all(token in normalized for token in ["0-12", "13-24", "25-36"])
    ):
        return False
    section = _animal_section(text)
    return (_find_table_header_line(section.splitlines()) is not None or _looks_like_table_header_block(section)) and not _table_values_after_header(section)


def _animal_section(text: str) -> str:
    start = re.search(r"0\s*-?\s*12\s*M", text, flags=re.I)
    if not start:
        start = re.search(r"ANIMAIS\s+TRANSPORTADOS", text, flags=re.I)
    if not start:
        return text
    tail = text[start.start() :]
    end = re.search(r"Vacina|Atestado|Observa|Meio de Transporte|Produto", tail, flags=re.I)
    return tail[: end.start()] if end else tail


def _table_values_after_header(section: str) -> list[int]:
    lines = [line for line in section.splitlines() if line.strip()]
    span = _find_table_header_span(lines)
    if span is None:
        return []
    _header_start, header_end = span
    candidate_lines = []
    header_tail = _tail_after_total(lines[header_end])
    if header_tail:
        candidate_lines.append(header_tail)
    candidate_lines.extend(lines[header_end + 1 : header_end + 8])
    for line in candidate_lines:
        if _looks_like_table_header(line):
            continue
        numbers = [int(n) for n in re.findall(r"\b\d{1,4}\b", line)]
        if len(numbers) < 8:
            continue
        values = _last_plausible_table_values(numbers)
        if values:
            return values
    return []


def _find_table_header_line(lines: list[str]) -> int | None:
    span = _find_table_header_span(lines)
    return span[0] if span else None


def _find_table_header_span(lines: list[str]) -> tuple[int, int] | None:
    for idx in range(len(lines)):
        joined = ""
        for end in range(idx, min(len(lines), idx + 8)):
            joined = f"{joined} {lines[end]}"
            if _looks_like_table_header(joined):
                return idx, end
    return None


def _looks_like_table_header_block(text: str) -> bool:
    normalized = normalize(text)
    tokens = ["0 - 12", "13 - 24", "25 - 36", "> 36", "total"]
    return sum(token in normalized for token in tokens) >= 4


def _looks_like_table_header(line: str) -> bool:
    compact = normalize(line)
    compact_no_space = re.sub(r"\s+", "", compact)
    hits = sum(
        token in compact or token in compact_no_space
        for token in ["0 - 12", "0-12", "13 - 24", "13-24", "25 - 36", "25-36", "> 36", ">36", "total"]
    )
    numbers = set(re.findall(r"\d+", compact))
    loose_hits = {"12", "13", "24", "25", "36"}.issubset(numbers) and "total" in compact
    return hits >= 4 or loose_hits


def _tail_after_total(line: str) -> str:
    match = re.search(r"total", line, flags=re.I)
    return line[match.end() :] if match else ""


def _last_plausible_table_values(numbers: Iterable[int]) -> list[int]:
    nums = list(numbers)
    for idx in range(len(nums) - 9, -1, -1):
        candidate = nums[idx : idx + 9]
        if max(candidate) <= 5000 and sum(candidate[:8]) == candidate[8]:
            return candidate
    if len(nums) >= 9:
        candidate = nums[-9:]
        if max(candidate) <= 5000:
            return candidate
    return []
