from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import fitz


@dataclass
class PDFPreflight:
    path: Path
    file_name: str
    exists: bool
    size_bytes: int
    page_count: int
    error: str | None = None


def inspect_pdf(path: str | Path) -> PDFPreflight:
    pdf_path = Path(path)
    if not pdf_path.exists():
        return PDFPreflight(pdf_path, pdf_path.name, False, 0, 0, "missing_file")
    size = pdf_path.stat().st_size
    if size == 0:
        return PDFPreflight(pdf_path, pdf_path.name, True, size, 0, "empty_file")
    try:
        with fitz.open(pdf_path) as doc:
            return PDFPreflight(pdf_path, pdf_path.name, True, size, doc.page_count, None)
    except Exception as exc:  # pragma: no cover - depends on malformed PDFs
        return PDFPreflight(pdf_path, pdf_path.name, True, size, 0, f"open_error:{type(exc).__name__}")
