#!/usr/bin/env python3
"""Materialize the gta_extractor package + extraction pipeline from the notebook.

Reads Extrair_dados_GTA.ipynb (repo root), extracts:
  * Cell 3 `_MODULE_SOURCES` dict -> one .py file per module (verbatim).
  * Cell 4 extraction-core functions -> gta_extractor/pipeline.py (verbatim),
    with a fixed import preamble pointing at the package.

Run from anywhere:  python3 apps/api/gta-extractor/build_from_notebook.py
Idempotent: overwrites generated files. Do not hand-edit generated files;
re-run this script if the notebook changes.
"""
from __future__ import annotations

import ast
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent.parent.parent  # apps/api/gta-extractor -> repo root
NOTEBOOK = REPO_ROOT / "Extrair_dados_GTA.ipynb"
PKG_DIR = HERE / "gta_extractor"

# Cell-4 functions that make up the extraction core we reuse (in order).
PIPELINE_FUNCS = [
    "extract_pdf_no_ocr",
    "_parser_for_group",
    "_parse_group",
    "_make_record",
    "_default_confidence",
    "_should_emit_group_record",
    "_has_textual_identity",
]

# Verbatim from Cell 4's import header (only the parts pipeline funcs need).
PIPELINE_PREAMBLE = '''\
from __future__ import annotations

from dataclasses import asdict
from pathlib import Path
import re

import fitz

from gta_extractor import COMMON_COLUMNS, NUMERIC_COLUMNS
from gta_extractor.preflight import inspect_pdf
from gta_extractor.page_text import (
    choose_native_text_candidate,
    extract_native_page,
    extract_poppler_layout_page,
    is_bad_native_text,
    native_text_quality,
    normalize_noisy_native_labels,
)
from gta_extractor.header import extract_header_candidates
from gta_extractor.page_classifier import classify_page_type, detect_system
from gta_extractor.grouping import group_pages_into_gtas
from gta_extractor.parsers import parse_adapec, parse_gedave, parse_sidago
from gta_extractor.parsers.common import blank_record
from gta_extractor.schema import ExtractionRecord, GTAGroup, PageExtraction
from gta_extractor.validation import safe_business_key, validate_record

'''


def _load_cell_source(nb: dict, index: int) -> str:
    return "".join(nb["cells"][index]["source"])


def _module_sources(cell3: str) -> dict[str, str]:
    tree = ast.parse(cell3)
    out: dict[str, str] = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Subscript):
            target = node.targets[0]
            try:
                name = ast.literal_eval(target.slice)
                value = ast.literal_eval(node.value)
            except Exception:
                continue
            if isinstance(name, str) and name.startswith("gta_extractor"):
                out[name] = value
    return out


def _module_path(module_name: str) -> Path:
    parts = module_name.split(".")
    if module_name == "gta_extractor":
        return PKG_DIR / "__init__.py"
    if parts[-1] == "parsers":  # gta_extractor.parsers package
        return PKG_DIR / "parsers" / "__init__.py"
    if len(parts) == 3:  # gta_extractor.parsers.<name>
        return PKG_DIR / "parsers" / f"{parts[2]}.py"
    return PKG_DIR / f"{parts[1]}.py"


def _extract_pipeline(cell4: str) -> str:
    tree = ast.parse(cell4)
    wanted = {name: None for name in PIPELINE_FUNCS}
    lines = cell4.splitlines(keepends=True)
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef,)) and node.name in wanted:
            start = node.lineno - 1
            end = node.end_lineno
            wanted[node.name] = "".join(lines[start:end])
    missing = [n for n, v in wanted.items() if v is None]
    if missing:
        raise SystemExit(f"pipeline functions not found in Cell 4: {missing}")
    body = "\n\n".join(wanted[name] for name in PIPELINE_FUNCS)
    return PIPELINE_PREAMBLE + body + "\n"


def main() -> None:
    nb = json.loads(NOTEBOOK.read_text(encoding="utf-8"))
    cell3 = _load_cell_source(nb, 2)
    cell4 = _load_cell_source(nb, 3)

    sources = _module_sources(cell3)
    if "gta_extractor" not in sources:
        raise SystemExit("Could not find gta_extractor module sources in Cell 3")

    (PKG_DIR / "parsers").mkdir(parents=True, exist_ok=True)
    for module_name, source in sources.items():
        path = _module_path(module_name)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(source if source.endswith("\n") else source + "\n", encoding="utf-8")
        print(f"wrote {path.relative_to(HERE)}")

    pipeline_path = PKG_DIR / "pipeline.py"
    pipeline_path.write_text(_extract_pipeline(cell4), encoding="utf-8")
    print(f"wrote {pipeline_path.relative_to(HERE)}")


if __name__ == "__main__":
    main()
