#!/usr/bin/env python3
"""Extract a single GTA's data from a PDF and print it as JSON on stdout.

Usage:  python3 extract_gta.py /path/to/file.pdf
Exit 0 + JSON on success. Exit 2 + stderr message on hard failure.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from gta_extractor.pipeline import extract_pdf_no_ocr


# Maps the flat COMMON_COLUMNS keys (dotted) to the JSON contract.
def _to_contract(data: dict, status: str, warnings: list[str]) -> dict:
    def g(key: str):
        value = data.get(key)
        if value is None:
            return None
        text = str(value).strip()
        return text or None

    return {
        "numeroGta": g("numero_gta"),
        "serieGta": g("serie_gta"),
        "ufGta": g("uf_gta"),
        "dataEmissao": g("data_emissao"),
        "sistema": g("sistema"),
        "origem": {
            "nome": g("origem.nome"),
            "cpfCnpj": g("origem.cpf_cnpj"),
            "estabelecimento": g("origem.estabelecimento"),
            "codigoEstabelecimento": g("origem.codigo_estabelecimento"),
            "municipio": g("origem.municipio"),
            "uf": g("origem.uf"),
        },
        "destino": {
            "nome": g("destino.nome"),
            "cpfCnpj": g("destino.cpf_cnpj"),
            "estabelecimento": g("destino.estabelecimento"),
            "codigoEstabelecimento": g("destino.codigo_estabelecimento"),
            "municipio": g("destino.municipio"),
            "uf": g("destino.uf"),
        },
        "status": status,
        "warnings": warnings or [],
    }


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: extract_gta.py <pdf_path>", file=sys.stderr)
        return 2
    pdf_path = Path(argv[1])
    if not pdf_path.exists():
        print(f"file not found: {pdf_path}", file=sys.stderr)
        return 2

    records, _pages = extract_pdf_no_ocr(pdf_path)
    if not records:
        print("no GTA found in PDF", file=sys.stderr)
        return 2

    # Take the first GTA (multi-GTA PDFs are out of scope for this phase).
    record = records[0]
    if getattr(record, "status", None) == "failed":
        warnings = list(getattr(record, "warnings", []) or [])
        print(f"extraction failed: {','.join(warnings) or 'unknown'}", file=sys.stderr)
        return 2

    contract = _to_contract(record.data, record.status, list(record.warnings or []))
    print(json.dumps(contract, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
