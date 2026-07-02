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

def extract_pdf_no_ocr(path: str | Path) -> tuple[list[ExtractionRecord], list[PageExtraction]]:
    pdf_path = Path(path)
    preflight = inspect_pdf(pdf_path)
    if preflight.error:
        data = blank_record(preflight.file_name, "ERRO")
        warning = "empty_pdf" if preflight.error == "empty_file" else preflight.error
        return [_make_record(data, "failed", [warning], preflight.file_name, None, None, 1)], []

    pages: list[PageExtraction] = []
    with fitz.open(pdf_path) as doc:
        for page_index, page in enumerate(doc, start=1):
            native_raw, native_sorted, native_words, native_blocks = extract_native_page(page)
            poppler_text, poppler_error = extract_poppler_layout_page(pdf_path, page_index)
            chosen_native, chosen_native_source, native_scores = choose_native_text_candidate(
                {
                    "pymupdf_sorted": native_sorted or native_raw,
                    "poppler_layout": poppler_text,
                    "pymupdf_raw": native_raw,
                },
                pdf_path.name,
            )
            native_text = normalize_noisy_native_labels(chosen_native or native_sorted or native_raw)
            quality = native_text_quality(native_text)
            needs_ocr = is_bad_native_text(native_raw, native_text)
            warnings: list[str] = []
            if poppler_error:
                warnings.append(poppler_error)
            if needs_ocr:
                warnings.extend(["native_text_bad_no_ocr", "ocr_ignored_by_notebook"])
            header = extract_header_candidates(native_text, pdf_path.name, native_words)
            warnings.extend(header.warnings)
            page_type = classify_page_type(native_text, pdf_path.name)
            pages.append(
                PageExtraction(
                    arquivo=pdf_path.name,
                    page_index=page_index,
                    page_count=doc.page_count,
                    native_text=native_text,
                    native_text_quality=quality,
                    needs_ocr=needs_ocr,
                    ocr_text=None,
                    chosen_text=native_text,
                    words=native_words,
                    method="native_no_ocr" if needs_ocr else "native",
                    page_type=page_type,
                    sistema=detect_system(native_text, pdf_path.name),
                    numero_gta_candidate=header.numero,
                    serie_candidate=header.serie,
                    warnings=warnings,
                    native_text_raw=native_raw,
                    native_text_sorted=native_sorted,
                    blocks=native_blocks,
                    uf_candidate=header.uf,
                    ocr_confidence=None,
                    ocr_error="ocr_ignored_by_notebook" if needs_ocr else None,
                    ocr_attempted=False,
                    ocr_success=False,
                    text_method_final="native_no_ocr" if needs_ocr else "native",
                    native_text_poppler_layout=poppler_text,
                    native_text_source_candidates=native_scores,
                    chosen_native_text_source=chosen_native_source,
                    text_extraction_status="native_bad_ocr_ignored" if needs_ocr else "native_good",
                    text_extraction_warnings=[w for w in warnings if w.startswith(("poppler_", "native_text", "ocr_"))],
                )
            )

    groups = group_pages_into_gtas(pages)
    groups = [group for group in groups if _should_emit_group_record(group)]
    return [_parse_group(group) for group in groups], pages


def _parser_for_group(group: GTAGroup):
    system = group.sistema or ""
    if system == "SIDAGO":
        return parse_sidago
    if system == "GEDAVE":
        return parse_gedave
    if system == "ADAPEC":
        return parse_adapec
    return parse_adapec if "_TO" in group.arquivo.upper() else parse_sidago


def _parse_group(group: GTAGroup) -> ExtractionRecord:
    parser = _parser_for_group(group)
    data = parser(group)
    parser_warnings = list(data.pop("_warnings", []) or [])
    page_warnings = [
        warning
        for page in group.pages
        for warning in page.warnings
        if warning not in {"poppler_unavailable"}
        and not (warning == "header_filename_mismatch" and page.page_count > 1 and page.numero_gta_candidate)
    ]
    status, validation_warnings = validate_record(data)
    if group.status == "needs_review" and status == "ok":
        status = "needs_review"
    warnings = list(dict.fromkeys(parser_warnings + page_warnings + validation_warnings))
    if group.pages and group.pages[0].page_count > 1:
        warnings = [warning for warning in warnings if warning != "header_filename_mismatch"]
    if "requires_visual_table_extraction" in warnings and _has_textual_identity(data):
        warnings = [warning for warning in warnings if warning not in OCR_SCOPE_WARNINGS]
    if not validation_warnings and warnings and set(warnings).issubset(NON_BLOCKING_RECORD_WARNINGS):
        warnings = []
    if any(w in warnings for w in ["requires_visual_table_extraction", "requires_ocr_or_visual_extraction", "native_text_bad_no_ocr"]):
        status = "needs_review"
    if status == "ok" and warnings:
        status = "warning"
    page_start = min((page.page_index for page in group.pages), default=None)
    page_end = max((page.page_index for page in group.pages), default=None)
    return _make_record(data, status, warnings, group.arquivo, page_start, page_end, group.record_index, _default_confidence(data, warnings))


def _make_record(data: dict, status: str, warnings: list[str], source_file: str, page_start, page_end, record_index: int, confidence: dict | None = None) -> ExtractionRecord:
    clean = {column: data.get(column, "") for column in COMMON_COLUMNS}
    return ExtractionRecord(clean, status, warnings, source_file, page_start, page_end, record_index, confidence or {})


def _default_confidence(data: dict, warnings: list[str] | None = None) -> dict[str, float]:
    warnings = warnings or []
    noisy = any(w in warnings for w in ["native_noisy_labels", "native_noisy_parseable", "native_text_bad_no_ocr"])
    filename_like = any(w.startswith("missing:") for w in warnings)
    out = {}
    for field, value in data.items():
        if value not in ("", None, 0):
            out[field] = 0.80 if field in {"numero_gta", "serie_gta", "uf_gta"} and filename_like else (0.70 if noisy else 0.90)
    return out


def _should_emit_group_record(group: GTAGroup) -> bool:
    return bool(group.main_page_index is not None or group.numero_gta or group.serie_gta)


def _has_textual_identity(data: dict) -> bool:
    required = ["numero_gta", "serie_gta", "uf_gta", "data_emissao", "especie", "finalidade"]
    return all(str(data.get(k, "") or "").strip() for k in required)

