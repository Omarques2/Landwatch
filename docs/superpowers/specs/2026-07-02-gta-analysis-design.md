# Análise por GTA — Design

**Date:** 2026-07-02
**Status:** Approved for planning
**Author:** Otávio Marques (+ Claude)

## Summary

Add a new analysis mode, **"Análise por GTA"**, sibling to the existing "Análise por Raio".
The user uploads a GTA (Guia de Trânsito Animal) PDF; the API extracts its data, tries to
match the **origin supplier** (fornecedor de origem) in the Fabric `fornecedores` table,
resolves a CAR, and runs the existing CAR-based analysis on that CAR.

The GTA analysis is, at its core, a **plain CAR analysis** — the GTA is only the mechanism
for discovering which CAR to analyze. No GTA-specific provenance is stored on the analysis
in this phase.

## Goals

- Reuse the existing GTA PDF extraction logic (`Extrair_dados_GTA.ipynb`) **without rewriting
  it**, to preserve extraction quality.
- Match the GTA origin supplier to a `fornecedores` row and reuse its CAR.
- Let the user fill in a CAR when none is found, and persist it back to Fabric.
- Reuse the existing analysis pipeline, fornecedor repository, and CAR-update Spark job.

## Non-Goals (this phase)

- Multi-GTA-per-PDF handling (we take the first GTA only).
- Storing/persisting the uploaded PDF (discarded after extraction).
- GTA provenance on the Analysis record (analysis is a plain CAR analysis).
- Deduplicating GTAs against an existing base (deferred to phase 2).
- Any OCR (the notebook is text-layer only; unchanged here).

---

## Confirmed decisions

| # | Decision |
|---|----------|
| Extraction runtime | **Python subprocess** invoked from the NestJS API container (reuse notebook logic verbatim). |
| Fornecedor match | Exact on `cpf_cnpj` (digits-only), tiebreak `codigo_estabelecimento`. |
| Analysis record | **Plain CAR analysis** (`subjectType: CAR`), no GTA provenance. |
| No-match + user CAR | **Insert** a new fornecedor into Fabric with extracted data + CAR (background). |
| Matched + no CAR + user CAR | **Update** the fornecedor's CAR in Fabric (background, fire-and-forget). |
| Matched + has CAR | Use CAR as-is; **immutable** in the UI. |
| Multiple GTAs in one PDF | Take the **first main GTA** (simplest; no error). |
| Ambiguous match (>1) | Show a **candidate picker**; user may switch candidate any number of times before generating. |
| Uploaded PDF | **Discard** after extraction (phase 2: store in Fabric if GTA is new). |
| Generate trigger | **Always** require an explicit "Gerar Análise" click — never auto-generate, even when a CAR is already found. |

---

## Architecture

### Existing pieces reused (no change needed)

- **CAR analysis pipeline** — `POST /v1/analyses` → `AnalysesService.createForActor({ carKey, … })`
  → `AnalysisRunnerService` runs the SICAR spatial query. The analysis only needs the CAR
  *string* (validated against the Landwatch/SICAR status service), **not** the Fabric fornecedor
  row. This is why the Fabric write can be fully asynchronous.
  - `apps/api/src/analyses/analyses.controller.ts`, `analyses.service.ts`, `analysis-runner.service.ts`
- **Fornecedor repository (Fabric)** — `FabricLakehouseRepository` with `listFornecedores`
  (filterable by `cpfCnpj`, `codigoEstabelecimento`, etc.) and `updateFornecedorCar`.
  - `apps/api/src/fornecedores/fabric-lakehouse.repository.ts`, `fabric-client.service.ts`
- **CAR update Spark job** — `FabricClientService.runFornecedorCarUpdateJob` invokes a Fabric
  notebook (`RunNotebook`, item = `FABRIC_CAR_UPDATE_ITEM_ID`) with params
  `action=update_fornecedor_car, id_fornecedor, car, requested_by`.
  Notebook source: `docs/notebooks/fabric/update_fornecedor_car_lakehouse.ipynb`.
- **Frontend NewAnalysisView** radius-mode toggle + submit pattern.
  - `apps/web/src/views/NewAnalysisView.vue`
- **CAR format validator** (`UF-1234567-XXXXXXXX…`) already used in `FornecedoresView.vue`.

### New pieces

1. Python `gta_extractor` package + CLI (extracted from the notebook).
2. NestJS GTA module: extraction subprocess wrapper, extract+match endpoint, generate endpoint.
3. Fabric notebook `insert_fornecedor` action + API `buildExecutionData` support.
4. Frontend GTA mode UI (upload, review panel, candidate picker, generate).

---

## Component 1 — Extraction engine (Python subprocess)

**Source of truth:** `Extrair_dados_GTA.ipynb`, Cell 3 `_MODULE_SOURCES` — a complete
`gta_extractor` package embedded as strings:
`gta_extractor/{__init__, schema, text_utils, dates, page_classifier, page_text, header,
grouping, validation, parsers/{common, adapec, sidago, gedave}}`.

Plan:

- **Extract verbatim** into real files, e.g. `apps/api/gta-extractor/gta_extractor/…`. No logic
  changes — quality is preserved by construction. (A small script can regenerate these files
  from the notebook to prove parity.)
- **CLI entrypoint** `apps/api/gta-extractor/extract_gta.py`:
  - Input: a PDF path (argv).
  - Runs `extract_pdf_no_ocr()` (the notebook's Cell 4 function).
  - Selects the **first `gta_main`** record.
  - Prints a single JSON object to **stdout**:
    ```json
    {
      "numeroGta": "...", "serieGta": "...", "ufGta": "...",
      "dataEmissao": "DD/MM/YYYY",
      "sistema": "ADAPEC|SIDAGO|GEDAVE",
      "origem": { "nome","cpfCnpj","estabelecimento","codigoEstabelecimento","municipio","uf" },
      "destino": { ... },
      "status": "ok|warning|needs_review",
      "warnings": ["..."]
    }
    ```
  - Non-zero exit + stderr message on hard failure (unreadable PDF, no GTA found).
- **Dependencies** added to the API Dockerfile:
  - `python3`, `pip install pymupdf` (fitz).
  - `poppler-utils` (`pdftotext -layout`) for the notebook's layout fallback.
- **NestJS wrapper** (`GtaExtractionService`):
  - `child_process.spawn('python3', [extractGtaPath, tmpPdfPath])`.
  - ~30s timeout; capture stdout/stderr; parse JSON; map to a typed DTO.
  - Translate subprocess failure into a clean 422 with a user-facing message.

**Tradeoff (accepted):** the API image now bundles Python + native libs (larger image, two
runtimes). This is the only option that guarantees extraction parity with the notebook.

---

## Component 2 — Extraction + match endpoint

`POST /v1/analyses/gta/extract`

- Multipart upload, **PDF only**, **≤ 50 MB**, guarded by `ANALYSIS_CREATE`.
- Save to a temp file (reuse the `storage/pdfs` pattern), run `GtaExtractionService`, then
  `GtaMatchService` (Component 3). Delete the temp file in a `finally`.
- Response envelope:
  ```jsonc
  {
    "gta": {
      "numeroGta","serieGta","ufGta","dataEmissao","sistema",
      "origem": { "nome","cpfCnpj","estabelecimento","codigoEstabelecimento","municipio","uf" },
      "status": "ok|warning|needs_review", "warnings": [...]
    },
    "match": {
      "kind": "matched_with_car | matched_no_car | ambiguous | none",
      "fornecedor": { "idFornecedor","nome","cpfCnpj","car" } | null,
      "candidates": [ { "idFornecedor","nome","cpfCnpj","codigoEstabelecimento","municipio","uf","car" } ]
    }
  }
  ```
- **No analysis is created here.** The endpoint only feeds the review UI. PDF is discarded.

---

## Component 3 — Fornecedor matching (`GtaMatchService`)

Against Fabric `fornecedores`, via the existing repository filters:

1. Normalize `origem.cpfCnpj` to digits-only.
2. Query by exact `cpf_cnpj`. When several rows share the CPF/CNPJ, tiebreak on
   `codigo_estabelecimento` equality.
3. Resolve `match.kind`:
   - **1 hit, car non-empty** → `matched_with_car` (CAR locked in UI).
   - **1 hit, car empty** → `matched_no_car` (CAR editable).
   - **>1 hit** → `ambiguous`; return `candidates` (user picks; picker can be changed repeatedly).
   - **0 hits** → `none`; user fills CAR, insert on submit.

---

## Component 4 — Generate analysis endpoint

`POST /v1/analyses/gta`

Request:
```jsonc
{
  "carKey": "UF-1234567-…",        // resolved or user-entered CAR
  "name": "…",                      // analysis name (2–200)
  "analysisDate": "YYYY-MM-DD"?,    // optional, same semantics as radius/CAR
  "matchKind": "matched_with_car | matched_no_car | none",
  "fornecedorId": "…"?,             // present when matched
  "origem": { … }?                  // extracted origin, required when matchKind = none (for insert)
}
```

Behavior by `matchKind` — **Fabric write is background / fire-and-forget**, analysis runs
immediately on `carKey`:

| matchKind | Fabric write (background) | Analysis |
|-----------|---------------------------|----------|
| `matched_with_car` | none (CAR immutable) | create CAR analysis with existing CAR |
| `matched_no_car` | `update_fornecedor_car` job (do **not** await verify/poll) | create CAR analysis with user CAR |
| `none` | `insert_fornecedor` job with extracted origem + CAR | create CAR analysis with user CAR |

- The analysis is created via the **existing** `AnalysesService.createForActor({ carKey, name,
  analysisDate })` → `subjectType: CAR`. No new `subjectType`, no GTA provenance stored.
- Background write: kick `runFornecedorCarUpdateJob` (or the new insert variant) without
  awaiting the 15s verification; log failures. The analysis does not depend on it completing.
- Response: `{ analysisId }` — frontend redirects to `/analyses/{id}` exactly like radius.

**Validation note:** the CAR must exist in the Landwatch/SICAR status service (the existing
CAR-analysis validation). If invalid, return the same error the CAR path already returns.

---

## Component 5 — Fabric notebook: `insert_fornecedor` action

Fabric cannot do direct SQL DML on the lakehouse; writes go through the Spark notebook.
Extend `docs/notebooks/fabric/update_fornecedor_car_lakehouse.ipynb`:

- Accept `action == "insert_fornecedor"` in addition to `update_fornecedor_car`.
- New params: `cpf_cnpj, nome, estabelecimento, codigo_estabelecimento, municipio, uf, car`.
- Generate `id_fornecedor` (uuid4) and `created_at`/`updated_at` timestamps.
- Delta `INSERT` into the `Fornecedores` table.
- API side: `FabricClientService.buildExecutionData` gains a matching parameter set for the
  insert action; `FabricLakehouseRepository` gains `insertFornecedor(...)`.

**Deploy note:** the updated notebook must be published to Fabric manually (workspace
`FABRIC_WORKSPACE_ID`). This is outside the repo's automated deploy and will be called out in
the plan as a manual step. Locally `FABRIC_CAR_UPDATE_MODE=disabled`, so background writes are
no-ops in dev.

---

## Component 6 — Frontend (GTA mode)

In `apps/web/src/views/NewAnalysisView.vue`, mirror the radius-mode structure:

- **Toggle button "Análise por GTA"** next to "Análise de Raio" → `gtaMode` ref.
- **Upload dropzone** (large, per the mockup): "Choose a file or drag & drop it here", **PDF
  only**, up to 50 MB. On file selection → `POST /v1/analyses/gta/extract` → **loading spinner**.
- **Review panel** (after extraction):
  - **Row 1:** `Número-Série-UF`  |  **CAR**
    - `matched_with_car` → CAR read-only.
    - `matched_no_car` / `none` / `ambiguous` → CAR editable input, validated with the existing
      `UF-1234567-XXXXXXXX…` regex.
  - `data_emissao`
  - **Origem block:** nome, CPF/CNPJ, estabelecimento, código_estabelecimento, município-UF.
  - **Warning banner** when `gta.status != "ok"` (show `warnings`).
  - **Candidate picker** when `match.kind == "ambiguous"`: selecting a candidate fills the CAR
    (and supplier fields); user may switch selection freely before generating.
- **"Gerar Análise" button** (always required, even when a CAR is already found) →
  `POST /v1/analyses/gta` with the resolved fields → redirect to `/analyses/{id}`.
- API calls via the existing `http` client + `ApiEnvelope`.

---

## Data flow (happy path, no match found)

```
User picks PDF
  → POST /v1/analyses/gta/extract (multipart)
      → save temp PDF
      → python3 extract_gta.py  → JSON (numero/serie/uf, origem, …)
      → GtaMatchService: query fornecedores by cpf_cnpj → kind = "none"
      → delete temp PDF
      → 200 { gta, match:{kind:"none"} }
  → UI shows fields, CAR empty + editable
User enters CAR, clicks "Gerar Análise"
  → POST /v1/analyses/gta { carKey, name, matchKind:"none", origem }
      → background: insert_fornecedor Spark job (fire-and-forget)
      → AnalysesService.createForActor({ carKey, name })  (subjectType CAR)
      → 201 { analysisId }
  → redirect /analyses/{analysisId}   (existing detail view / runner)
```

---

## Error handling

- **Not a PDF / > 50 MB** → 400 before extraction.
- **Extraction failure** (unreadable, no GTA) → 422 with a clear message; UI shows an error in
  the dropzone area, lets the user try another file.
- **Low-quality extraction** (`status = needs_review`) → still returns fields + warning banner;
  user can correct CAR and proceed.
- **Invalid CAR** on generate → same 4xx as the existing CAR path.
- **Fabric write failure** (background) → logged, does **not** block or fail the analysis.
- **Fabric disabled in dev** → background write is a no-op; extraction + analysis still work.

---

## Testing

- **Python extractor:** a parity check that the extracted package reproduces the notebook's
  output on sample PDFs (ADAPEC / SIDAGO / GEDAVE). Unit tests per parser if feasible.
- **GtaExtractionService:** subprocess wrapper — success JSON, timeout, non-zero exit, malformed
  JSON. Mock `child_process`.
- **GtaMatchService:** the four `kind` outcomes (with/without CAR, ambiguous, none). Mock the
  Fabric repository.
- **Generate endpoint:** the three `matchKind` branches trigger the correct background write and
  always create a CAR analysis; background write is not awaited.
- **Frontend:** mode toggle, upload → loading → panel, CAR lock vs editable, candidate switching,
  generate → redirect. Follow the radius-mode test IDs pattern.
- Note: no local Postgres/Fabric — full e2e can't run locally; gate is `nest build`.

---

## Open risks

- **Extraction parity when moving notebook → files.** Mitigation: extract verbatim + a
  regeneration/parity script; test against sample PDFs per system.
- **Image size / build** from bundling Python + PyMuPDF + poppler into the API image.
- **Manual Fabric notebook deploy** for the `insert_fornecedor` action — easy to forget; called
  out explicitly in the plan.
- **First-GTA-only** silently ignores extra GTAs in a multi-GTA PDF — acceptable per decision,
  but worth a small log/notice.
