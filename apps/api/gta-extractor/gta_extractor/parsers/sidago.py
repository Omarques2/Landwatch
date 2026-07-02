from __future__ import annotations

import re
import unicodedata
from itertools import product

from gta_extractor.dates import extract_sidago_emission_date
from gta_extractor.schema import GTAGroup
from gta_extractor.text_layout import group_words_into_lines, split_two_columns_by_anchors
from gta_extractor.text_utils import first, only_digits
from gta_extractor import NUMERIC_COLUMNS
from gta_extractor.validation import is_valid_document_number

from .common import (
    blank_record,
    extract_animal_table_from_text,
    extract_date,
    extract_finalidade,
    extract_numero_serie_header,
    extract_species,
    fill_people_by_sections,
    group_text,
    set_header,
    table_header_only_no_values,
)


def parse_sidago(group: GTAGroup) -> dict:
    text = group_text(group)
    data = blank_record(group.arquivo, "SIDAGO")
    warnings: list[str] = []
    if group.main_page_index is None and not group.numero_gta and not group.serie_gta:
        data["metodo_texto"] = "+".join(sorted({page.method for page in group.pages if page.method}))
        warnings.extend(["native_text_incomplete", "requires_ocr_or_visual_extraction"])
        if table_header_only_no_values(text):
            warnings.append("table_header_only_no_values")
        data["_warnings"] = list(dict.fromkeys(warnings))
        return data

    numero, serie, uf = extract_numero_serie_header(text)
    if not numero:
        numero = first(r"\bN[ºo]\s*([0-9]{5,9})", text) or first(r"\b([0-9]{5,7})\b", group.arquivo) or ""
    if not serie:
        serie = first(r"S[ée]rie\s+([A-Z0-9]{1,6})", text) or ""
    group.numero_gta = group.numero_gta or numero
    group.serie_gta = group.serie_gta or serie
    set_header(data, group, uf or "GO")
    data["data_emissao"] = extract_sidago_emission_date(text)
    data["especie"] = extract_species(text)
    data["finalidade"] = extract_finalidade(text)
    fill_people_by_sections(data, text)
    _fill_sidago_sorted_people(data, text)
    _fill_sidago_regions(data, group)
    _fill_sidago_loose_parties(data, text)
    warnings.extend(_fill_sidago_noisy_label_rows(data, group))
    warnings.extend(_fill_sidago_noisy_native(data, group))
    main_page = next((page for page in group.pages if page.page_index == group.main_page_index), None)
    table = _extract_sidago_table_by_words(group)
    if not table and main_page and main_page.method.startswith("ocr"):
        table = _extract_sidago_table_by_words(group) or extract_animal_table_from_text(text)
    elif not table and not any(w in warnings for w in ["native_noisy_labels", "native_noisy_parseable"]):
        table = extract_animal_table_from_text(text)
    if not table:
        table = {column: 0 for column in NUMERIC_COLUMNS}
    data.update(table)
    if table_header_only_no_values(text):
        warnings.append("table_header_only_no_values")
    if _requires_visual_table_extraction(data, group, text):
        warnings.extend(["table_values_not_in_text_layer", "requires_visual_table_extraction"])
    if warnings:
        data["_warnings"] = list(dict.fromkeys(warnings))
    return data


SIDAGO_TABLE_COLUMNS = [
    ("0_12_M", r"0\s*-?\s*12\s*M"),
    ("0_12_F", r"0\s*-?\s*12\s*F"),
    ("13_24_M", r"13\s*-?\s*24\s*M"),
    ("13_24_F", r"13\s*-?\s*24\s*F"),
    ("25_36_M", r"25\s*-?\s*36\s*M"),
    ("25_36_F", r"25\s*-?\s*36\s*F"),
    ("36+_M", r"(?:>|acima\s+de)?\s*36\s*M"),
    ("36+_F", r"(?:>|acima\s+de)?\s*36\s*F"),
    ("_total", r"Total"),
]


def _extract_sidago_table_by_words(group: GTAGroup) -> dict[str, int]:
    page = next((p for p in group.pages if p.page_index == group.main_page_index), group.pages[0] if group.pages else None)
    if not page or not page.words:
        return {}
    lines = group_words_into_lines(page.words, y_tolerance=8)
    header_idx = _find_sidago_table_header_line(lines)
    if header_idx is None:
        return {}
    header_words = lines[header_idx].words
    columns = _sidago_header_columns(header_words)
    if len(columns) < 5:
        return {}
    for value_line in lines[header_idx + 1 : header_idx + 6]:
        parsed = _parse_sidago_value_line(value_line.words, columns)
        if parsed is None:
            continue
        assigned, unresolved, observed, ambiguous_values = parsed
        assigned = _reconcile_noisy_sidago_values(assigned, unresolved, observed, ambiguous_values)
        if assigned is None:
            continue
        male = assigned["0_12_M"] + assigned["13_24_M"] + assigned["25_36_M"] + assigned["36+_M"]
        female = assigned["0_12_F"] + assigned["13_24_F"] + assigned["25_36_F"] + assigned["36+_F"]
        if observed is not None and observed != male + female:
            continue
        if observed is None and male + female <= 0:
            continue
        assigned["total_M"] = male
        assigned["total_F"] = female
        return assigned
    return {}


def _find_sidago_table_header_line(lines) -> int | None:
    for idx, line in enumerate(lines):
        if _looks_like_sidago_table_header(line.text):
            return idx
    return None


def _sidago_header_columns(words) -> list[tuple[str, float]]:
    cells = _merge_words_into_cells(words, gap_tolerance=14)
    if len(cells) == len(SIDAGO_TABLE_COLUMNS):
        normalized = [_table_token(cell["text"]) for cell in cells]
        if _looks_like_total_label(normalized[-1]) and sum(bool(token) for token in normalized) >= 7:
            return [(SIDAGO_TABLE_COLUMNS[idx][0], cells[idx]["x_center"]) for idx in range(len(cells))]

    columns: list[tuple[str, float]] = []
    for word in words:
        key = _sidago_header_key(word.text)
        if key:
            columns.append((key, (word.x0 + word.x1) / 2))
    deduped: dict[str, float] = {}
    for key, x_center in columns:
        deduped.setdefault(key, x_center)
    if len(deduped) == len(SIDAGO_TABLE_COLUMNS):
        return list(deduped.items())
    return []


def _looks_like_sidago_table_header(text: str) -> bool:
    compact = _table_token(text)
    hits = sum(token in compact for token in ["012m", "012f", "1324m", "1324f", "2536m", "2536f", "36m", "36f"])
    has_total = "tctal" in compact or "total" in compact or "t0tal" in compact or "tot" in compact or "t0t" in compact
    numbers = set(re.findall(r"\d+", compact))
    loose = {"12", "13", "24", "25", "36"}.issubset(numbers) and has_total
    return has_total and (hits >= 3 or loose)


def _sidago_header_key(text: str) -> str | None:
    token = _table_token(text)
    if token in {"total", "tctal", "t0tal"} or token.startswith("tot") or token.startswith("t0t"):
        return "_total"
    if re.search(r"(?:^|[^0-9])0?12m$", token):
        return "0_12_M"
    if re.search(r"(?:^|[^0-9])0?[r1l]?2f$", token) or ("2f" in token and "24f" not in token):
        return "0_12_F"
    if re.search(r"(?:1|l|i)?3?24m$", token) or "1324m" in token:
        return "13_24_M"
    if re.search(r"(?:1|l|i)?3?24f$", token) or "1324f" in token:
        return "13_24_F"
    if "2536m" in token:
        return "25_36_M"
    if "2536f" in token:
        return "25_36_F"
    if "36m" in token:
        return "36+_M"
    if "36f" in token:
        return "36+_F"
    return None


def _table_token(text: str) -> str:
    text = unicodedata.normalize("NFKD", (text or "").lower())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.translate(str.maketrans({"o": "0", "í": "i", "ì": "i", "ï": "i", "ã": "a", "â": "a", "ă": "a"}))
    return re.sub(r"[^0-9a-z>]+", "", text)


def _parse_sidago_value_line(words, columns: list[tuple[str, float]]) -> tuple[dict[str, int], set[str], int | None] | None:
    assigned = {column: 0 for column in NUMERIC_COLUMNS}
    clear_columns: set[str] = set()
    unresolved: set[str] = set()
    ambiguous_values: dict[str, int] = {}
    observed_total: int | None = None
    for cell in _merge_words_into_cells(words, gap_tolerance=10):
        x_center = cell["x_center"]
        key, x_column = min(columns, key=lambda item: abs(item[1] - x_center))
        if abs(x_column - x_center) > 42:
            continue
        value, is_noisy = _sidago_value_token(cell["text"])
        if value is None:
            continue
        if key == "_total":
            if not is_noisy:
                observed_total = value
            continue
        if is_noisy:
            if value == 0:
                assigned[key] = 0
                clear_columns.add(key)
            else:
                ambiguous_values[key] = value
                unresolved.add(key)
            continue
        assigned[key] = value
        clear_columns.add(key)
    unresolved -= clear_columns
    if len(clear_columns) + len(unresolved) < 3:
        return None
    return assigned, unresolved, observed_total, ambiguous_values


def _sidago_value_token(text: str) -> tuple[int | None, bool]:
    raw = (text or "").strip()
    normalized_zero = re.sub(r"^[\[(]?[oO][\])]?$", "0", raw)
    if re.fullmatch(r"\d{1,4}", normalized_zero):
        return int(normalized_zero), False
    digits = re.sub(r"[^0-9]", "", normalized_zero)
    if digits and len(raw) <= 8:
        return int(digits), True
    if _looks_like_zeroish_noise(raw):
        return 0, True
    return None, False


def _reconcile_noisy_sidago_values(
    assigned: dict[str, int],
    unresolved: set[str],
    observed_total: int | None,
    ambiguous_values: dict[str, int] | None = None,
) -> dict[str, int] | None:
    ambiguous_values = ambiguous_values or {}
    if observed_total is None:
        return assigned if not unresolved else None
    keys = ["0_12_M", "0_12_F", "13_24_M", "13_24_F", "25_36_M", "25_36_F", "36+_M", "36+_F"]
    known_total = sum(assigned[key] for key in keys)
    ambiguous_total = sum(ambiguous_values.values())
    missing = observed_total - known_total
    if not unresolved:
        if ambiguous_values and len(ambiguous_values) == 1:
            key = next(iter(ambiguous_values))
            if 0 <= missing <= 5000:
                result = assigned.copy()
                result[key] = missing
                return result
        return assigned if missing == 0 else None
    if len(unresolved) == 1 and 0 <= missing <= 5000:
        result = assigned.copy()
        key = next(iter(unresolved))
        result[key] = missing
        return result
    return None


def _merge_words_into_cells(words, gap_tolerance: float = 12) -> list[dict[str, float | str]]:
    cells: list[dict[str, float | str]] = []
    for word in sorted(words, key=lambda item: item.x0):
        text = (word.text or "").strip()
        if not text:
            continue
        if not cells:
            cells.append({"text": text, "x0": word.x0, "x1": word.x1})
            continue
        previous = cells[-1]
        gap = float(word.x0) - float(previous["x1"])
        if gap <= gap_tolerance:
            previous["text"] = f"{previous['text']} {text}".strip()
            previous["x1"] = word.x1
        else:
            cells.append({"text": text, "x0": word.x0, "x1": word.x1})
    for cell in cells:
        cell["x_center"] = (float(cell["x0"]) + float(cell["x1"])) / 2
    return cells


def _looks_like_total_label(value: str) -> bool:
    return value.startswith("tot") or value.startswith("t0t") or "total" in value or "tctal" in value


def _looks_like_zeroish_noise(text: str) -> bool:
    token = _table_token(text)
    return token in {"0", "00", "1", "i", ""} or (not re.search(r"\d", text or "") and len(token) <= 1)


def _fill_sidago_sorted_people(data: dict, text: str) -> None:
    for line in text.splitlines():
        match = re.search(
            r"Estabelecimento:\s*(.*?)\s+Marca do Rebanho:\s+Estabelecimento:\s*(.*)",
            line,
            flags=re.I,
        )
        if match:
            data["origem.estabelecimento"] = _clean(match.group(1))
            data["destino.estabelecimento"] = _clean(match.group(2))
            continue
        _two(line, data, "CPF/CNPJ", "cpf_cnpj", only_digits)
        _two(line, data, "Código Estabelecimento", "codigo_estabelecimento", _clean)
        _two(line, data, "Município", "municipio", _clean_city)
        _two(line, data, "Municipio", "municipio", _clean_city)

    _fill_sidago_names(data, text)


def _fill_sidago_names(data: dict, text: str) -> None:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    for idx, line in enumerate(lines):
        if not re.search(r"Nome\s*:", line, flags=re.I):
            continue
        left = first(r"Nome\s*:?\s*(.*?)(?:\s{2,}|$)", line) or ""
        right = ""
        if "Nome:" in line[line.find("Nome:") + 5 :]:
            parts = re.split(r"Nome\s*:", line, flags=re.I)
            left = parts[1].strip()
            right = parts[2].strip()
        elif idx + 1 < len(lines):
            next_line = lines[idx + 1]
            if re.search(r"Nome\s*:", next_line, flags=re.I):
                pieces = re.split(r"Nome\s*:", next_line, flags=re.I)
                left = f"{left} {pieces[0].strip()}".strip()
                right = pieces[1].strip()
        if left:
            data["origem.nome"] = _clean(left)
        if right:
            data["destino.nome"] = _clean(right)
        if left or right:
            return


def _two(line: str, data: dict, label: str, field: str, cleaner) -> None:
    match = re.search(rf"{label}\s*:\s*(.*?)\s{{2,}}{label}\s*:\s*(.*)", line, flags=re.I)
    if not match:
        return
    left = cleaner(match.group(1))
    right = cleaner(match.group(2))
    if field == "municipio":
        _set_city_uf(data, "origem", left)
        _set_city_uf(data, "destino", right)
    else:
        data[f"origem.{field}"] = left
        data[f"destino.{field}"] = right


def _set_city_uf(data: dict, prefix: str, value: str) -> None:
    city, uf = clean_noisy_municipio_uf(value)
    if city and uf:
        data[f"{prefix}.municipio"] = city
        data[f"{prefix}.uf"] = uf
    else:
        data[f"{prefix}.municipio"] = city or _clean(value)


def _clean_city(value: str) -> str:
    city, uf = clean_noisy_municipio_uf(value)
    return f"{city}/{uf}" if city and uf else city


def clean_noisy_municipio_uf(value: str) -> tuple[str, str]:
    value = _clean(value).replace("Hêlena", "Helena").replace("hêlena", "helena").replace("Hęlena", "Helena").replace("ę", "e").replace("Ę", "E")
    match = re.search(r"/\s*([A-Z0-9]{2})", value, flags=re.I)
    if not match:
        return value, ""
    city = _clean(value[: match.start()])
    uf = match.group(1).upper().translate(str.maketrans({"0": "O", "6": "G"}))
    if re.fullmatch(r"[A-Z]{2}", uf):
        return city, uf
    return value, ""


def _clean(value: str) -> str:
    value = re.sub(r"\bMarca(?:\s+do(?:\s+Rebanho)?)?\b.*$", "", value, flags=re.I)
    return re.sub(r"\s+", " ", value).strip(" .:-")


def _fill_sidago_loose_parties(data: dict, text: str) -> None:
    if data["origem.estabelecimento"] and data["destino.estabelecimento"]:
        return
    labels = re.split(r"\bDESTINO\b", text, maxsplit=1, flags=re.I)
    if len(labels) != 2:
        return
    origem, destino = labels
    if not data["origem.cpf_cnpj"]:
        data["origem.cpf_cnpj"] = repair_noisy_document_number(first(r"CPF/?CNPJ\s*:?\s*([0-9A-Za-z.\-/|]{11,22})", origem) or "")
    if not data["destino.cpf_cnpj"]:
        data["destino.cpf_cnpj"] = repair_noisy_document_number(first(r"CPF/?CNPJ\s*:?\s*([0-9A-Za-z.\-/|]{11,22})", destino) or "")


def _fill_sidago_regions(data: dict, group: GTAGroup) -> None:
    page = next((p for p in group.pages if p.page_index == group.main_page_index), group.pages[0] if group.pages else None)
    if not page or not page.words:
        return
    words = page.words
    y_start = min((w.y0 for w in words if re.search(r"ORIGEM|DESTINO", w.text, flags=re.I)), default=0)
    y_end = min((w.y0 for w in words if re.search(r"ANIMAIS|TRANSPORTADOS", w.text, flags=re.I) and w.y0 > y_start), default=10_000)
    region_words = [w for w in words if y_start < w.y0 < y_end]
    if not region_words:
        return
    left_words, right_words = split_two_columns_by_anchors(region_words)
    left = _words_to_lines(left_words)
    right = _words_to_lines(right_words)
    _parse_region_party(data, "origem", left)
    _parse_region_party(data, "destino", right)


def _words_to_lines(words) -> str:
    return "\n".join(line.text for line in group_words_into_lines(list(words)))


def _parse_region_party(data: dict, prefix: str, section: str) -> None:
    lines = [line.strip() for line in section.splitlines() if line.strip()]
    text = "\n".join(lines)
    data[f"{prefix}.estabelecimento"] = _value_multiline(lines, "Estabelecimento", ["Código", "Inscrição", "Nome", "CPF", "Município"]) or data[f"{prefix}.estabelecimento"]
    data[f"{prefix}.codigo_estabelecimento"] = _value_multiline(lines, "Código Estabelecimento", ["Inscrição", "Nome", "CPF", "Município"]) or data[f"{prefix}.codigo_estabelecimento"]
    data[f"{prefix}.nome"] = _value_multiline(lines, "Nome", ["CPF", "Município", "Código", "Inscrição"]) or data[f"{prefix}.nome"]
    cpf = first(r"CPF/?CNPJ\s*:?\s*([0-9A-Za-z.\-/|]{11,22})", text)
    if cpf:
        data[f"{prefix}.cpf_cnpj"] = repair_noisy_document_number(cpf)
    municipio = _value_multiline(lines, "Município", ["Marca", "Código", "Inscrição", "Nome", "CPF"])
    if municipio:
        _set_city_uf(data, prefix, municipio)


def _value_multiline(lines: list[str], label: str, stop_labels: list[str]) -> str:
    for idx, line in enumerate(lines):
        match = re.search(rf"{label}\s*:?\s*(.*)", line, flags=re.I)
        if not match:
            continue
        first_value = match.group(1).strip()
        marker_tail = ""
        marker = re.search(r"\bMarca\s+do(?:\s+Rebanho)?\b", first_value, flags=re.I)
        if marker:
            marker_tail = first_value[marker.end() :].strip(" :")
            first_value = first_value[: marker.start()].strip()
        parts = [first_value]
        for extra in lines[idx + 1 : idx + 3]:
            if any(re.search(rf"^{stop}", extra, flags=re.I) for stop in stop_labels):
                break
            if re.search(r":", extra):
                break
            cleaned_extra = extra.strip()
            if marker_tail and cleaned_extra.lower().startswith(marker_tail.lower()):
                continue
            parts.append(cleaned_extra)
        return _clean(" ".join(part for part in parts if part))
    return ""


def _fill_sidago_noisy_native(data: dict, group: GTAGroup) -> list[str]:
    if all(
        data.get(key)
        for key in [
            "origem.estabelecimento",
            "destino.estabelecimento",
            "origem.nome",
            "destino.nome",
        ]
    ):
        return []
    page = next((p for p in group.pages if p.page_index == group.main_page_index), group.pages[0] if group.pages else None)
    if not page or not page.words:
        return []
    text = page.chosen_text or ""
    if not _looks_like_noisy_sidago_page(text):
        return []
    if re.search(r"Estabelecimento|Êstabelecimento|Esi[aâ]bel|Est[aâ]b[eê]l", text, flags=re.I):
        return []

    pairs = _noisy_party_row_pairs(page.words)
    if len(pairs) < 5:
        return []

    _set_if_empty(data, "origem.estabelecimento", _clean(pairs[0][0]))
    _set_if_empty(data, "destino.estabelecimento", _clean(pairs[0][1]))
    _set_if_empty(data, "origem.codigo_estabelecimento", only_digits(pairs[1][0]))
    _set_if_empty(data, "destino.codigo_estabelecimento", only_digits(pairs[1][1]))
    _set_if_empty(data, "origem.nome", _clean(pairs[3][0]))
    _set_if_empty(data, "destino.nome", _clean(pairs[3][1]))
    _set_if_empty(data, "origem.cpf_cnpj", only_digits(pairs[4][0]))
    _set_if_empty(data, "destino.cpf_cnpj", only_digits(pairs[4][1]))
    if len(pairs) >= 6:
        origem_city = _clean_city(pairs[5][0])
        destino_city = _clean_city(pairs[5][1])
        if origem_city and not data["origem.municipio"]:
            _set_city_uf(data, "origem", origem_city)
        if destino_city and not data["destino.municipio"]:
            _set_city_uf(data, "destino", destino_city)

    if not data["finalidade"]:
        finalidade = _extract_noisy_finalidade(text)
        if finalidade:
            data["finalidade"] = finalidade
    if not data["especie"] and re.search(r"\bBovinos?\b", text, flags=re.I):
        data["especie"] = "Bovino"
    if not data["data_emissao"]:
        data["data_emissao"] = _extract_noisy_footer_date(page)
    return ["native_noisy_parseable"]


def _fill_sidago_noisy_label_rows(data: dict, group: GTAGroup) -> list[str]:
    page = next((p for p in group.pages if p.page_index == group.main_page_index), group.pages[0] if group.pages else None)
    if not page or not page.words or not _looks_like_noisy_sidago_page(page.chosen_text or ""):
        return []
    lines = group_words_into_lines(page.words, y_tolerance=5)
    split_x = _right_anchor_split_x(page.words) or _infer_noisy_split_x(lines)
    if split_x is None:
        return []

    changed = False
    force = _has_noisy_label_markers(f"{page.native_text_raw}\n{page.native_text_sorted}")
    if not force:
        return []
    y_end = min((line.y_center for line in lines if re.search(r"ANIMAIS|TRANSPORTADOS", line.text, flags=re.I)), default=10_000)
    for line in lines:
        if line.y_center > y_end:
            break
        left, right = _split_line_words(line.words, split_x)
        line_norm = _labelish_normalize(line.text)
        if "codigo" in line_norm and ("estabelecimento" in line_norm or "esiabelecimento" in line_norm or "estabeiecimento" in line_norm):
            changed |= _set_party_value(data, "origem.codigo_estabelecimento", _clean_noisy_digits(_clean_label_value(left, "codigo")), force)
            changed |= _set_party_value(data, "destino.codigo_estabelecimento", _clean_noisy_digits(_clean_label_value(right, "codigo")), force)
        elif "estabelecimento" in line_norm or "esiabelecimento" in line_norm or "estabeiecimento" in line_norm:
            changed |= _set_party_value(data, "origem.estabelecimento", _clean_label_value(left, "estabelecimento"), force)
            changed |= _set_party_value(data, "destino.estabelecimento", _clean_label_value(right, "estabelecimento"), force)
        elif re.search(r"\bnome\b", line_norm):
            changed |= _set_party_value(data, "origem.nome", _clean_person_name(_clean_label_value(left, "nome")), force)
            changed |= _set_party_value(data, "destino.nome", _clean_person_name(_clean_label_value(right, "nome")), force)
        elif "cpf" in line_norm or "cnpj" in line_norm or "cff" in line_norm:
            changed |= _set_party_value(data, "origem.cpf_cnpj", _clean_document_digits(_clean_label_value(left, "cpf")), force)
            changed |= _set_party_value(data, "destino.cpf_cnpj", _clean_document_digits(_clean_label_value(right, "cpf")), force)
        elif "municipio" in line_norm or "municpio" in line_norm:
            origem = _clean_label_value(left, "municipio")
            destino = _clean_label_value(right, "municipio")
            if origem and (force or not data["origem.municipio"] or _looks_like_noisy_value(data["origem.municipio"])):
                _set_city_uf(data, "origem", origem)
                changed = True
            if destino and (force or not data["destino.municipio"] or _looks_like_noisy_value(data["destino.municipio"])):
                _set_city_uf(data, "destino", destino)
                changed = True
    if not data["data_emissao"]:
        date = _extract_noisy_emission_date_from_text(page.chosen_text or "")
        if date:
            data["data_emissao"] = date
            changed = True
    if not data["finalidade"]:
        finalidade = _extract_noisy_finalidade(page.chosen_text or "")
        if finalidade:
            data["finalidade"] = finalidade
            changed = True
    if not data["especie"] and re.search(r"\bBovinos?\b", page.chosen_text or "", flags=re.I):
        data["especie"] = "Bovino"
        changed = True
    return ["native_noisy_labels"] if changed else []


def _right_anchor_split_x(words) -> float | None:
    hits = [word.x0 for word in words if re.search(r"DESTINO", word.text, flags=re.I)]
    return min(hits) - 15 if hits else None


def _labelish_normalize(value: str) -> str:
    from gta_extractor.text_utils import normalize

    return normalize(value).replace("ê", "e").replace("â", "a")


def _clean_label_value(value: str, label: str) -> str:
    value = re.sub(r"\bMarc\w*(?:\s+do)?(?:\s+Rebanho)?\b.*$", "", value or "", flags=re.I)
    value = re.sub(r"^[^:;]{0,45}[:;]\s*", "", value).strip()
    value = re.sub(rf"^{label}\s*:?\s*", "", value, flags=re.I)
    value = re.sub(r"\s+", " ", value).strip(" .:-;,")
    value = re.sub(r"I\\4EROI-A|I/4EROI-A|MEROI-A|MERoLA", "MEROLA", value, flags=re.I)
    value = re.sub(r"JO§E", "JOSE", value, flags=re.I)
    value = re.sub(r"FERRETRA", "FERREIRA", value, flags=re.I)
    value = re.sub(r"RtBEtRO", "RIBEIRO", value, flags=re.I)
    value = re.sub(r"CorumbaÍba", "Corumbaíba", value, flags=re.I)
    value = re.sub(r"Hęlena", "Helena", value, flags=re.I)
    return _clean(value)


def _clean_person_name(value: str) -> str:
    return re.sub(r"\s+\b[Iil]\b$", "", value or "").strip()


def _clean_noisy_digits(value: str) -> str:
    text = (value or "").translate(str.maketrans({"O": "0", "o": "0", "I": "1", "l": "1", "S": "5", "s": "5", "B": "8", "ü": "0"}))
    return only_digits(text)


def _clean_document_digits(value: str) -> str:
    repaired = repair_noisy_document_number(value)
    if repaired:
        return repaired
    digits = _clean_noisy_digits(value)
    if len(digits) == 15 and digits[8] == "1":
        candidate = digits[:8] + digits[9:]
        if len(candidate) == 14:
            return candidate
    return digits


def repair_noisy_document_number(raw_text: str, expected_type: str | None = None) -> str:
    raw_text = raw_text or ""
    ambiguous = {
        "A": ("0", "4", "8"),
        "B": ("8",),
        "S": ("5",),
        "s": ("5",),
        "O": ("0",),
        "o": ("0",),
        "ü": ("0",),
        "I": ("1",),
        "l": ("1",),
        "|": ("1",),
        "G": ("6", "9"),
        "Z": ("2",),
    }
    chars: list[tuple[str, tuple[str, ...]]] = []
    for char in raw_text:
        if char.isdigit():
            chars.append((char, (char,)))
        elif char in ambiguous:
            chars.append((char, ambiguous[char]))
    if not chars:
        return ""
    target_lengths = {"cpf": {11}, "cnpj": {14}}.get((expected_type or "").lower(), {11, 14})
    if len(chars) not in target_lengths:
        digits = only_digits(raw_text)
        return digits if is_valid_document_number(digits) else ""
    combinations = 1
    for _original, options in chars:
        combinations *= len(options)
        if combinations > 4096:
            digits = only_digits(raw_text)
            return digits if is_valid_document_number(digits) else ""
    candidates: list[tuple[int, str]] = []
    originals = [original for original, _options in chars]
    for values in product(*(options for _original, options in chars)):
        candidate = "".join(values)
        if not is_valid_document_number(candidate):
            continue
        substitutions = sum(1 for original, value in zip(originals, values) if original != value)
        candidates.append((substitutions, candidate))
    if candidates:
        candidates.sort(key=lambda item: (item[0], item[1]))
        return candidates[0][1]
    digits = only_digits(raw_text)
    return digits if is_valid_document_number(digits) else ""


def _set_party_value(data: dict, key: str, value: str, force: bool = False) -> bool:
    value = _clean(value)
    if not value:
        return False
    current = str(data.get(key, "") or "")
    if force or not current or _looks_like_noisy_value(current):
        data[key] = value
        return True
    return False


def _looks_like_noisy_value(value: str) -> bool:
    digits = only_digits(value or "")
    stripped = (value or "").replace(" ", "")
    return bool(
        re.search(r"Est[aâ]b|Esi[aâ]b|CPF|CNPJ|Munic|C[oó]digo|\\4|§|ê|â", value or "", flags=re.I)
        or (digits and len(digits) >= 6 and len(digits) >= len(stripped) * 0.65)
    )


def _has_noisy_label_markers(text: str) -> bool:
    return bool(
        re.search(
            r"CPF/GNPJ|CPFICNPJ|CFFICNPJ|Nomê|Engo[ÍIíi]d|Data[ir]Hora|Estabê|Esiâ|Totâl|Tctal|MEROI-A|JO§E|RtBEtRO|FERRETRA",
            text or "",
            flags=re.I,
        )
    )


def _looks_like_noisy_sidago_page(text: str) -> bool:
    has_pipe_or_label = bool(
        re.search(r"\b[0-9OIlSgü]{3,12}\s*\|\s*[A-Z0-9]{1,6}\b", text or "", flags=re.I)
        or re.search(r"N[úu]mero\s*:?\s*[0-9OIlSgü]{3,12}.*?S[ée]rie\s*:?\s*[A-Z0-9]{1,6}", text or "", flags=re.I | re.S)
    )
    return bool(
        has_pipe_or_label
        and (
            re.search(r"GTA\s+EMITIDO\s+ELETRONICAMENTE\s+PELA\s+AGRODEFESA", text or "", flags=re.I)
            or re.search(r"tr[aâ]n[s§]ito\s+animal|transito\s+animal", text or "", flags=re.I)
        )
    )


def _noisy_party_row_pairs(words) -> list[tuple[str, str]]:
    lines = group_words_into_lines(list(words), y_tolerance=5)
    split_x = _infer_noisy_split_x(lines)
    if split_x is None:
        return []

    pairs: list[tuple[str, str]] = []
    for line in lines:
        if line.y_center < 70:
            continue
        if pairs and re.search(r"\b(Rodovi[aá]rio|Finalidade|Engorda|Recria|Abate|Bovinos?)\b", line.text, flags=re.I):
            break
        if re.search(r"Nota Fiscal|PRODUTOR|GTA EMITIDO|Dare:|Antirr[aá]bica|Brucelose", line.text, flags=re.I):
            continue
        left, right = _split_line_words(line.words, split_x)
        if left and right:
            pairs.append((_clean(left), _clean(right)))
        if len(pairs) >= 6:
            break
    return pairs


def _infer_noisy_split_x(lines) -> float | None:
    best_gap = 0.0
    best_split: float | None = None
    for line in lines:
        if line.y_center < 70:
            continue
        if re.search(r"Nota Fiscal|PRODUTOR|GTA EMITIDO|Dare:|Antirr[aá]bica|Brucelose", line.text, flags=re.I):
            continue
        ordered = sorted(line.words, key=lambda word: word.x0)
        if len(ordered) < 2:
            continue
        for left, right in zip(ordered, ordered[1:]):
            gap = right.x0 - left.x1
            if gap > best_gap:
                best_gap = gap
                best_split = (left.x1 + right.x0) / 2
    return best_split if best_gap >= 80 else None


def _split_line_words(words, split_x: float) -> tuple[str, str]:
    left = [word.text for word in sorted(words, key=lambda item: item.x0) if (word.x0 + word.x1) / 2 < split_x]
    right = [word.text for word in sorted(words, key=lambda item: item.x0) if (word.x0 + word.x1) / 2 >= split_x]
    return " ".join(left).strip(), " ".join(right).strip()


def _set_if_empty(data: dict, key: str, value: str) -> None:
    value = _clean(value)
    if value and not data.get(key):
        data[key] = value


def _extract_noisy_finalidade(text: str) -> str:
    match = re.search(r"\b(Engorda|Recria|Abate|Reprodu[cç][aã]o)\b", text or "", flags=re.I)
    return match.group(1).capitalize() if match else ""


def _extract_noisy_footer_date(page) -> str:
    lines = group_words_into_lines(page.words, y_tolerance=5)
    pipe_indexes = [idx for idx, line in enumerate(lines) if re.search(r"\b[0-9OIlSgü]{3,12}\s*\|\s*[A-Z0-9]{1,6}\b", line.text, flags=re.I)]
    search_lines = []
    for idx in pipe_indexes:
        search_lines.extend(lines[max(0, idx - 2) : min(len(lines), idx + 4)])
    if not search_lines:
        search_lines = lines[-8:]
    for line in search_lines:
        match = re.search(r"(\d{2}/\d{2}/\d{4})", line.text)
        if match:
            return match.group(1)
    return ""


def _extract_noisy_emission_date_from_text(text: str) -> str:
    from gta_extractor.dates import extract_sidago_noisy_emission_date

    return extract_sidago_noisy_emission_date(text)


def _requires_visual_table_extraction(data: dict, group: GTAGroup, text: str) -> bool:
    if not _looks_like_noisy_sidago_page(text):
        return table_header_only_no_values(text)
    total = sum(int(data.get(column, 0) or 0) for column in NUMERIC_COLUMNS)
    if total > 0:
        return False
    return any(
        re.search(pattern, text or "", flags=re.I)
        for pattern in [
            r"Dare\s*:",
            r"GTA\s+EMITIDO\s+ELETRONICAMENTE",
            r"0\s+0\s+0\s+0\s+0",
            r"13\s*-?\s*24",
        ]
    )
