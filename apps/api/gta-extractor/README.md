# gta-extractor

Self-contained GTA (Guia de Trânsito Animal) PDF data extractor, invoked by the
API as a subprocess (`GtaExtractionService` → `python3 extract_gta.py <pdf>`).

## Source of truth

The `gta_extractor/` package is the **canonical source** and is maintained here
directly. It was originally derived, verbatim, from the reference notebook
`Extrair_dados_GTA.ipynb` (Fabric lakehouse batch pipeline), but the project no
longer depends on that notebook — edit these `.py` files directly.

Layout:
- `gta_extractor/` — extraction package (schema, text utils, dates, page
  classification, per-system parsers for ADAPEC / SIDAGO / GEDAVE, validation).
- `gta_extractor/pipeline.py` — `extract_pdf_no_ocr()` orchestration.
- `extract_gta.py` — CLI: takes a PDF path, prints one GTA as JSON on stdout,
  exits non-zero with a stderr message on failure.

## Contract

`python3 extract_gta.py <pdf_path>`
- Exit 0 + a single JSON object on stdout (see `_to_contract` in `extract_gta.py`).
- Exit 2 + a stderr message on hard failure (missing/empty PDF, no GTA found).
- Multi-GTA PDFs: only the first GTA is used; a `notice:` line is written to
  stderr.

Text-layer only — **no OCR**. `pdftotext -layout` (poppler) is used as a layout
fallback when available.

## Dependencies

`pip install -r requirements.txt` (PyMuPDF). Poppler (`poppler-utils`) is a
system package, installed in the API Dockerfile.

## Tests

`python3 -m pytest test_extract_gta.py -q` (CLI failure paths). Drop real GTA
sample PDFs under `samples/` (gitignored) for local end-to-end checks.
