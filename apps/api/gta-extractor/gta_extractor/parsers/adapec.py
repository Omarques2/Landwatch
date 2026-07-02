from __future__ import annotations

import re

from gta_extractor.dates import extract_adapec_emission_date
from gta_extractor.schema import GTAGroup
from gta_extractor.text_utils import first, only_digits

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
)
from .sidago import _fill_sidago_regions, _fill_sidago_sorted_people


def parse_adapec(group: GTAGroup) -> dict:
    text = group_text(group)
    data = blank_record(group.arquivo, "ADAPEC")
    numero, serie, uf = extract_numero_serie_header(text)
    group.numero_gta = group.numero_gta or numero
    group.serie_gta = group.serie_gta or serie
    set_header(data, group, uf or "TO")
    data["data_emissao"] = extract_adapec_emission_date(text)
    data["especie"] = _extract_adapec_species(text) or extract_species(text)
    data["finalidade"] = extract_finalidade(text)
    fill_people_by_sections(data, text)
    if "ORIGEM" in text and "ANIMAIS TRANSPORTADOS" in text:
        _fill_sidago_sorted_people(data, text)
        _fill_sidago_regions(data, group)
    _fill_adapec_two_column_people(data, text)
    data.update(_extract_adapec_stratification(text) or extract_animal_table_from_text(text))

    if not data["numero_gta"]:
        data["numero_gta"] = first(r"\b([0-9]{5,7})\b", group.arquivo) or ""
    if not data["serie_gta"]:
        data["serie_gta"] = first(r"_([A-Z])_TO\.pdf$", group.arquivo) or ""
    return data


def _extract_adapec_species(text: str) -> str:
    if re.search(r"\bBovinos?\b|\bBov[ií]deos\b", text, flags=re.I):
        return "Bovino"
    return ""


def _fill_adapec_two_column_people(data: dict, text: str) -> None:
    pairs = {
        "CPF/CNPJ": ("cpf_cnpj", only_digits),
        "Nome": ("nome", _clean),
        "Estabelecimento": ("estabelecimento", _clean),
        "Código PGA": ("codigo_estabelecimento", _clean),
        "Municipio - UF": ("municipio_uf", _clean),
        "Município - UF": ("municipio_uf", _clean),
    }
    for line in text.splitlines():
        for label, (field, cleaner) in pairs.items():
            pattern = rf"{label}\s*:\s*(.*?)\s{{2,}}{label}\s*:\s*(.*)"
            match = re.search(pattern, line, flags=re.I)
            if not match:
                continue
            left = cleaner(match.group(1))
            right = cleaner(match.group(2))
            if field == "municipio_uf":
                _set_city_uf(data, "origem", left)
                _set_city_uf(data, "destino", right)
            else:
                data[f"origem.{field}"] = left
                data[f"destino.{field}"] = right


def _extract_adapec_stratification(text: str) -> dict[str, int]:
    counts = {k: 0 for k in ["0_12_M", "0_12_F", "13_24_M", "13_24_F", "25_36_M", "25_36_F", "36+_M", "36+_F", "total_M", "total_F"]}
    found = False
    for line in text.splitlines():
        if not re.search(r"Bov[ií]deos|Bovideos|Bovinos?", line, flags=re.I):
            continue
        match = re.search(
            r"(0\s*a\s*12|0\s*-\s*12|at[eé]\s*12|13\s*a\s*24|13\s*-\s*24|25\s*a\s*36|25\s*-\s*36|mais\s+de\s+36|acima\s+de\s+36|maior\s+que\s+36|>\s*36)"
            r"(?:\s+Meses?)?.*?\b(Macho|F[eê]mea|Femea|M|F)\b\s+(\d{1,5})",
            line,
            flags=re.I,
        )
        if not match:
            continue
        bucket = _range_bucket(match.group(1))
        sex = "M" if match.group(2).upper().startswith("M") else "F"
        value = int(match.group(3))
        counts[f"{bucket}_{sex}"] += value
        found = True
    counts["total_M"] = counts["0_12_M"] + counts["13_24_M"] + counts["25_36_M"] + counts["36+_M"]
    counts["total_F"] = counts["0_12_F"] + counts["13_24_F"] + counts["25_36_F"] + counts["36+_F"]
    return counts if found else {}


def _range_bucket(value: str) -> str:
    normalized = value.lower()
    if "13" in normalized:
        return "13_24"
    if "25" in normalized:
        return "25_36"
    if "36" in normalized and any(token in normalized for token in ["acima", "mais", "maior", ">"]):
        return "36+"
    return "0_12"


def _set_city_uf(data: dict, prefix: str, value: str) -> None:
    parts = [part.strip() for part in re.split(r"\s+-\s+", value) if part.strip()]
    if parts:
        data[f"{prefix}.municipio"] = parts[0].title()
    if len(parts) > 1:
        data[f"{prefix}.uf"] = parts[-1].upper()


def _clean(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip(" .:-")
