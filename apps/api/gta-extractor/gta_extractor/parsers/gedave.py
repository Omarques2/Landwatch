from __future__ import annotations

import re

from gta_extractor.dates import extract_gedave_emission_date
from gta_extractor.schema import GTAGroup
from gta_extractor.text_utils import only_digits

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


def parse_gedave(group: GTAGroup) -> dict:
    text = group_text(group)
    data = blank_record(group.arquivo, "GEDAVE")
    numero, serie, uf = extract_numero_serie_header(text)
    group.numero_gta = group.numero_gta or numero
    group.serie_gta = group.serie_gta or serie
    set_header(data, group, uf or "SP")
    data["data_emissao"] = extract_gedave_emission_date(text)
    data["especie"] = _extract_gedave_species(text) or extract_species(text)
    data["finalidade"] = extract_finalidade(text)
    fill_people_by_sections(data, text)
    _fill_gedave_two_column_people(data, text)
    data.update(_extract_gedave_table(text) or extract_animal_table_from_text(text))
    return data


def _extract_gedave_species(text: str) -> str:
    if re.search(r"\bBOV[IÍ]DEOS\b|\bBovinos?\b", text, flags=re.I):
        return "Bovino"
    return ""


def _extract_gedave_table(text: str) -> dict[str, int]:
    counts = {k: 0 for k in ["0_12_M", "0_12_F", "13_24_M", "13_24_F", "25_36_M", "25_36_F", "36+_M", "36+_F", "total_M", "total_F"]}
    if not re.search(r"0\s*-\s*2\s+meses", text, flags=re.I):
        return {}
    lines = text.splitlines()
    for idx, line in enumerate(lines):
        if re.search(r"\bM\s+F\s+M\s+F", line):
            for value_line in lines[idx + 1 : idx + 5]:
                values = [int(n) for n in re.findall(r"\b\d{1,5}\b", value_line)]
                if len(values) >= 14:
                    counts["0_12_M"] = values[0] + values[2] + values[4]
                    counts["0_12_F"] = values[1] + values[3] + values[5]
                    counts["13_24_M"] = values[6]
                    counts["13_24_F"] = values[7]
                    counts["25_36_M"] = values[8]
                    counts["25_36_F"] = values[9]
                    counts["36+_M"] = values[10]
                    counts["36+_F"] = values[11]
                    counts["total_M"] = values[12]
                    counts["total_F"] = values[13]
                    return counts
    return {}


def _fill_gedave_two_column_people(data: dict, text: str) -> None:
    for line in text.splitlines():
        _two(line, data, "CPF/CNPJ", "cpf_cnpj", only_digits)
        _two(line, data, "Nome", "nome", _clean)
        _two(line, data, "Estabelecimento", "estabelecimento", _clean)
        _two(line, data, "Código do Estabelecimento", "codigo_estabelecimento", _clean)
    match = re.search(r"Munic[ií]pio:\s*(.*?)\s+UF:\s*([A-Z]{2})\s+Munic[ií]pio:\s*(.*?)\s+UF:\s*([A-Z]{2})", text, flags=re.I | re.S)
    if match:
        data["origem.municipio"] = _clean(match.group(1))
        data["origem.uf"] = match.group(2).upper()
        data["destino.municipio"] = _clean(match.group(3))
        data["destino.uf"] = match.group(4).upper()


def _two(line: str, data: dict, label: str, field: str, cleaner) -> None:
    match = re.search(rf"{label}\s*:\s*(.*?)\s{{2,}}{label}\s*:\s*(.*)", line, flags=re.I)
    if match:
        data[f"origem.{field}"] = cleaner(match.group(1))
        data[f"destino.{field}"] = cleaner(match.group(2))


def _clean(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip(" .:-")
