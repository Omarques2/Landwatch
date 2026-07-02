from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal


PageType = Literal[
    "gta_main",
    "gta_continuation",
    "nota_fiscal",
    "romaneio_peso",
    "barcode_only",
    "unknown",
]


@dataclass(slots=True)
class WordBox:
    text: str
    x0: float
    y0: float
    x1: float
    y1: float
    confidence: float | None = None


@dataclass(slots=True)
class BlockBox:
    text: str
    x0: float
    y0: float
    x1: float
    y1: float
    block_type: int | None = None


@dataclass(slots=True)
class PageExtraction:
    arquivo: str
    page_index: int
    page_count: int
    native_text: str
    native_text_quality: float
    needs_ocr: bool
    ocr_text: str | None
    chosen_text: str
    words: list[WordBox]
    method: str
    page_type: PageType
    sistema: str | None
    numero_gta_candidate: str | None
    serie_candidate: str | None
    warnings: list[str] = field(default_factory=list)
    native_text_raw: str = ""
    native_text_sorted: str = ""
    blocks: list[BlockBox] = field(default_factory=list)
    uf_candidate: str | None = None
    ocr_confidence: float | None = None
    ocr_error: str | None = None
    ocr_attempted: bool = False
    ocr_success: bool = False
    ocr_psm: int | None = None
    ocr_rotation: int | None = None
    text_method_final: str = ""
    native_text_poppler_layout: str = ""
    native_text_source_candidates: dict[str, float] = field(default_factory=dict)
    chosen_native_text_source: str = "pymupdf_sorted"
    text_extraction_status: str = ""
    text_extraction_warnings: list[str] = field(default_factory=list)


@dataclass(slots=True)
class GTAGroup:
    arquivo: str
    record_index: int
    pages: list[PageExtraction]
    main_page_index: int | None
    sistema: str | None
    numero_gta: str | None
    serie_gta: str | None
    status: Literal["ok", "warning", "needs_review", "failed"] = "ok"


@dataclass(slots=True)
class ExtractionRecord:
    data: dict
    status: str
    warnings: list[str]
    source_file: str
    page_start: int | None
    page_end: int | None
    record_index: int
    confidence: dict[str, float] = field(default_factory=dict)
