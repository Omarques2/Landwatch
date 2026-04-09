import argparse
import re
import unicodedata
from collections import OrderedDict
from pathlib import Path
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile


def normalize_text(value: str | None) -> str:
    if not value:
        return ""
    normalized = unicodedata.normalize("NFD", str(value))
    without_accents = "".join(
        char
        for char in normalized
        if unicodedata.category(char) != "Mn"
    )
    return re.sub(r"\s+", " ", without_accents).strip().upper()


def title_text(value: str) -> str:
    if not value:
        return value
    return " ".join(part.capitalize() for part in value.split())


def normalize_categoria(value: str | None) -> str:
    normalized = normalize_text(value)
    replacements = {
        "AREA DE PROTECAO AMBIENTAL": "Área de Proteção Ambiental",
        "AREA DE RELEVANTE INTERESSE ECOLOGICO": "Área de Relevante Interesse Ecológico",
        "ESTACAO ECOLOGICA": "Estação Ecológica",
        "FLORESTA": "Floresta",
        "MONUMENTO NATURAL": "Monumento Natural",
        "PARQUE": "Parque",
        "REFUGIO DE VIDA SILVESTRE": "Refúgio de Vida Silvestre",
        "RESERVA BIOLOGICA": "Reserva Biológica",
        "RESERVA DE DESENVOLVIMENTO SUSTENTAVEL": "Reserva de Desenvolvimento Sustentável",
        "RESERVA EXTRATIVISTA": "Reserva Extrativista",
        "RESERVA PARTICULAR DO PATRIMONIO NATURAL": "Reserva Particular do Patrimônio Natural",
        "RESERVA DE FAUNA": "Reserva de Fauna",
    }
    return replacements.get(normalized, title_text(normalized))


def infer_uc_tipo_detalhado(
    nome_uc: str | None,
    categoria: str | None,
    esfera: str | None,
) -> str:
    nome_norm = normalize_text(nome_uc)
    categoria_base = normalize_categoria(categoria)
    esfera_norm = normalize_text(esfera)
    esfera_label = {
        "FEDERAL": "Federal",
        "ESTADUAL": "Estadual",
        "MUNICIPAL": "Municipal",
    }.get(esfera_norm, "")

    explicit_name_mappings = [
        (r"^PARQUE NATURAL MUNIC[IÍ]PAL\b", "Parque Natural Municipal"),
        (r"^PARQUE MUNICIPAL NATURAL\b", "Parque Municipal Natural"),
        (r"^PARQUE AMBIENTAL NATURAL MUNICIPAL\b", "Parque Ambiental Natural Municipal"),
    ]
    for pattern, label in explicit_name_mappings:
        if re.search(pattern, nome_norm):
            return label

    if categoria_base == "Reserva Particular do Patrimônio Natural":
        categoria_base = "RPPN"

    if esfera_label:
        return f"{categoria_base} {esfera_label}"
    return categoria_base


def load_rows(shp_path: Path, source_name: str) -> list[dict[str, str]]:
    import geopandas as gpd

    gdf = gpd.read_file(shp_path)
    rows: list[dict[str, str]] = []
    for row in gdf.itertuples(index=False):
        data = row._asdict()
        if "Cnuc" in data:
            nome_uc = data.get("NomeUC")
            categoria = sigla_to_categoria(data.get("SiglaCateg"))
            esfera = data.get("EsferaAdm")
            uc_uid = data.get("Cnuc")
        else:
            nome_uc = data.get("nome_uc")
            categoria = data.get("categoria")
            esfera = data.get("esfera")
            uc_uid = data.get("cd_cnuc")
        rows.append(
            {
                "source": source_name,
                "uc_uid": str(uc_uid or "").strip(),
                "nome_uc": str(nome_uc or "").strip(),
                "categoria": str(categoria or "").strip(),
                "esfera": str(esfera or "").strip(),
                "uc_tipo_detalhado": infer_uc_tipo_detalhado(nome_uc, categoria, esfera),
            }
        )
    return rows


def excel_column_name(index: int) -> str:
    name = ""
    current = index
    while current > 0:
        current, remainder = divmod(current - 1, 26)
        name = chr(65 + remainder) + name
    return name


def build_shared_strings(rows: list[dict[str, str]], headers: list[str]) -> tuple[dict[str, int], list[str]]:
    values = headers[:]
    for row in rows:
        for header in headers:
            values.append(str(row.get(header, "")))
    unique = list(OrderedDict.fromkeys(values))
    return {value: idx for idx, value in enumerate(unique)}, unique


def build_sheet_xml(rows: list[dict[str, str]], headers: list[str], string_index: dict[str, int]) -> str:
    xml_rows: list[str] = []

    def make_row(row_number: int, values: list[str]) -> str:
        cells: list[str] = []
        for col_number, value in enumerate(values, start=1):
            ref = f"{excel_column_name(col_number)}{row_number}"
            idx = string_index[str(value)]
            cells.append(f'<c r="{ref}" t="s"><v>{idx}</v></c>')
        return f'<row r="{row_number}">{"".join(cells)}</row>'

    xml_rows.append(make_row(1, headers))
    for row_number, row in enumerate(rows, start=2):
        values = [str(row.get(header, "")) for header in headers]
        xml_rows.append(make_row(row_number, values))

    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<sheetData>{"".join(xml_rows)}</sheetData>'
        "</worksheet>"
    )


def build_shared_strings_xml(strings: list[str]) -> str:
    items = "".join(f"<si><t>{escape(value)}</t></si>" for value in strings)
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        f'count="{len(strings)}" uniqueCount="{len(strings)}">'
        f"{items}</sst>"
    )


def write_rows_xlsx(rows: list[dict[str, str]], output_path: Path) -> None:
    headers = ["source", "uc_uid", "nome_uc", "categoria", "esfera", "uc_tipo_detalhado"]
    string_index, strings = build_shared_strings(rows, headers)
    sheet_xml = build_sheet_xml(rows, headers, string_index)
    shared_strings_xml = build_shared_strings_xml(strings)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output_path, "w", compression=ZIP_DEFLATED) as archive:
        archive.writestr(
            "[Content_Types].xml",
            (
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                '<Default Extension="xml" ContentType="application/xml"/>'
                '<Override PartName="/xl/workbook.xml" '
                'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
                '<Override PartName="/xl/worksheets/sheet1.xml" '
                'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
                '<Override PartName="/xl/sharedStrings.xml" '
                'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
                '<Override PartName="/xl/styles.xml" '
                'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
                '</Types>'
            ),
        )
        archive.writestr(
            "_rels/.rels",
            (
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                '<Relationship Id="rId1" '
                'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
                'Target="xl/workbook.xml"/>'
                '</Relationships>'
            ),
        )
        archive.writestr(
            "xl/workbook.xml",
            (
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
                'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
                '<sheets><sheet name="preview" sheetId="1" r:id="rId1"/></sheets>'
                '</workbook>'
            ),
        )
        archive.writestr(
            "xl/_rels/workbook.xml.rels",
            (
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                '<Relationship Id="rId1" '
                'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
                'Target="worksheets/sheet1.xml"/>'
                '<Relationship Id="rId2" '
                'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" '
                'Target="styles.xml"/>'
                '<Relationship Id="rId3" '
                'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" '
                'Target="sharedStrings.xml"/>'
                '</Relationships>'
            ),
        )
        archive.writestr(
            "xl/styles.xml",
            (
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
                '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>'
                '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>'
                '<borders count="1"><border/></borders>'
                '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
                '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>'
                '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
                '</styleSheet>'
            ),
        )
        archive.writestr("xl/worksheets/sheet1.xml", sheet_xml)
        archive.writestr("xl/sharedStrings.xml", shared_strings_xml)


def sigla_to_categoria(sigla: str | None) -> str:
    mapping = {
        "APA": "Área de Proteção Ambiental",
        "ARIE": "Área de Relevante Interesse Ecológico",
        "ESEC": "Estação Ecológica",
        "FLONA": "Floresta",
        "MONA": "Monumento Natural",
        "PARNA": "Parque",
        "REBIO": "Reserva Biológica",
        "RDS": "Reserva de Desenvolvimento Sustentável",
        "RESEX": "Reserva Extrativista",
        "RPPN": "Reserva Particular do Patrimônio Natural",
        "REVIS": "Refúgio de Vida Silvestre",
        "REFAU": "Reserva de Fauna",
    }
    return mapping.get(normalize_text(sigla), str(sigla or "").strip())


def collect_unmapped_examples(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    examples: list[dict[str, str]] = []
    seen: set[tuple[str, str, str]] = set()
    for row in rows:
        categoria_norm = normalize_categoria(row["categoria"])
        key = (categoria_norm, normalize_text(row["esfera"]), row["nome_uc"])
        if key in seen:
            continue
        seen.add(key)
        esfera_norm = normalize_text(row["esfera"])
        if esfera_norm not in {"FEDERAL", "ESTADUAL", "MUNICIPAL"}:
            examples.append(row)
        elif not categoria_norm:
            examples.append(row)
    return examples


def print_summary(rows: list[dict[str, str]]) -> None:
    totals: dict[str, int] = {}
    for row in rows:
        totals[row["uc_tipo_detalhado"]] = totals.get(row["uc_tipo_detalhado"], 0) + 1

    print("=== uc_tipo_detalhado ===")
    for label, total in sorted(totals.items(), key=lambda item: (-item[1], item[0])):
        print(f"{label}: {total}")

    print("\n=== samples ===")
    shown: set[str] = set()
    for row in rows:
        label = row["uc_tipo_detalhado"]
        if label in shown:
            continue
        shown.add(label)
        print(
            f"[{label}] source={row['source']} esfera={row['esfera']} "
            f"categoria={row['categoria']} nome={row['nome_uc']}"
        )

    examples = collect_unmapped_examples(rows)
    print("\n=== possible_edge_cases ===")
    if not examples:
        print("Nenhum edge case candidato nas regras atuais.")
        return
    for row in examples[:50]:
        print(
            f"source={row['source']} uid={row['uc_uid']} esfera={row['esfera']} "
            f"categoria={row['categoria']} uc_tipo_detalhado={row['uc_tipo_detalhado']} "
            f"nome={row['nome_uc']}"
        )
    if len(examples) > 50:
        print(f"... {len(examples) - 50} casos adicionais omitidos")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Simula o uc_tipo_detalhado para UCs em dois SHPs."
    )
    parser.add_argument("--federal-shp", required=True, help="Caminho do SHP federal atual.")
    parser.add_argument("--cnuc-shp", required=True, help="Caminho do SHP CNUC.")
    parser.add_argument(
        "--output-xlsx",
        default="uc_tipo_detalhado_preview.xlsx",
        help="Caminho do XLSX de saída.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    rows = []
    rows.extend(load_rows(Path(args.federal_shp), "federal"))
    rows.extend(load_rows(Path(args.cnuc_shp), "cnuc"))
    output_path = Path(args.output_xlsx)
    write_rows_xlsx(rows, output_path)
    print_summary(rows)
    print(f"\n=== xlsx ===\n{output_path.resolve()}")


if __name__ == "__main__":
    main()
