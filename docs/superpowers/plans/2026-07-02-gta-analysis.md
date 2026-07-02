# Análise por GTA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user upload a GTA (Guia de Trânsito Animal) PDF, extract its data with the existing Python notebook logic, match the origin supplier in Fabric, resolve or fill a CAR, and run the existing CAR-based analysis on that CAR.

**Architecture:** The notebook's `gta_extractor` package + extraction core are materialized into real Python files and invoked from NestJS as a subprocess. A new NestJS `gta` module exposes `POST /v1/analyses/gta/extract` (extract + match, discards PDF) and `POST /v1/analyses/gta` (background Fabric write + create a plain CAR analysis). Supplier updates/inserts reuse the existing Fabric Spark-notebook job, run fire-and-forget so the analysis never waits on them. The frontend adds a "Análise por GTA" mode to `NewAnalysisView.vue`.

**Tech Stack:** NestJS 11 (TypeScript), Python 3 + PyMuPDF (`fitz`) + poppler, Vue 3 (`NewAnalysisView.vue`), Microsoft Fabric Lakehouse (mssql + Spark notebook), Jest, Vitest.

---

## Design reference

Spec: `docs/superpowers/specs/2026-07-02-gta-analysis-design.md`. Read it before starting.

## Staging (context-safe checkpoints)

The plan is split into 5 stages. **Each stage ends with a green build/tests and a commit — it is safe to stop after any stage.** A fresh session can resume at the next stage using only this file.

- **Stage 1** — Python `gta_extractor` package + CLI (standalone, runs with `python3`).
- **Stage 2** — NestJS GTA module scaffold + extraction subprocess service.
- **Stage 3** — Fornecedor match service + `POST /v1/analyses/gta/extract`.
- **Stage 4** — Fabric `insert_fornecedor` action + background writes + `POST /v1/analyses/gta`.
- **Stage 5** — Frontend GTA mode UI.

## Key facts about the existing code (verified)

- **Upload pattern:** `apps/api/src/attachments/attachments.controller.ts:344-376` uses `@UseInterceptors(FileInterceptor('file'))` + `@UploadedFile() file: { buffer, originalname, mimetype, size }`. `multer` is installed.
- **Analysis create pattern:** `apps/api/src/analyses/analyses.controller.ts:29-62`. Actor via `this.actorContext.fromRequest(req, { orgMode: 'tenant' })`, guard `this.access.requireTenantFeature(actor, 'ANALYSIS_CREATE')`, then `this.analyses.createForActor(actor, { carKey, analysisDate? })` (`analyses.service.ts:410`). `CreateAnalysisInput = { carKey; documents?; analysisDate?; farmId?; farmName?; analysisKind? }`.
- **Fabric fornecedor repo:** `apps/api/src/fornecedores/fabric-lakehouse.repository.ts`. `listFornecedores(params)` filters by `cpfCnpj`, `codigoEstabelecimento`, etc (`buildFornecedorWhere` at ~:631). `updateFornecedorCar(id, car, requestedBy)` at :320. Table constants at :36-37.
- **Fabric Spark job:** `fabric-client.service.ts:127 runFornecedorCarUpdateJob(...)`, `buildExecutionData` at :288 emits `parameters: { action, id_fornecedor, car, requested_by }` for jobType `RunNotebook`.
- **CAR-update notebook source:** `docs/notebooks/fabric/update_fornecedor_car_lakehouse.ipynb` (parameter cell + Spark Delta upsert on `Fornecedores`).
- **CPF/CNPJ helpers:** `apps/api/src/common/validators/cpf-cnpj.ts` exports `isValidCpfCnpj`, `sanitizeDoc`.
- **Frontend radius mode:** `apps/web/src/views/NewAnalysisView.vue` — toggle `radiusMode` (button ~:8-22), `submitRadiusAnalysis()` (~:908-963) POSTs via `http` client (`apps/web/src/api/http.ts`) with `ApiEnvelope` (`apps/web/src/api/envelope.ts`). CAR format validator lives in `FornecedoresView.vue` (~:964).
- **Notebook extraction source:** `Extrair_dados_GTA.ipynb` — Cell 3 (`_MODULE_SOURCES` dict: the `gta_extractor` package as strings), Cell 4 (extraction core: `extract_pdf_no_ocr` + helpers). Field columns: `COMMON_COLUMNS` (dotted keys like `origem.nome`).

---

## File Structure

**Stage 1 — Python (new dir `apps/api/gta-extractor/`)**
- Create: `apps/api/gta-extractor/build_from_notebook.py` — generator that materializes the package + pipeline from the notebook.
- Generated: `apps/api/gta-extractor/gta_extractor/**` (schema, text_utils, dates, text_layout, preflight, page_classifier, page_text, header, grouping, validation, parsers/{common,adapec,gedave,sidago}, `pipeline.py`).
- Create: `apps/api/gta-extractor/extract_gta.py` — CLI: PDF path → JSON on stdout.
- Create: `apps/api/gta-extractor/requirements.txt`.
- Create: `apps/api/gta-extractor/test_extract_gta.py` — smoke/parity test.

**Stage 2 — NestJS module (new dir `apps/api/src/gta/`)**
- Create: `gta.module.ts`, `gta-extraction.service.ts`, `gta-extraction.service.spec.ts`.
- Create: `dto/gta.types.ts` (shared response/DTO types).
- Modify: `apps/api/src/app.module.ts` (register `GtaModule`).
- Modify: `apps/api/src/config/config.schema.ts` (add `GTA_EXTRACTOR_DIR`, `GTA_EXTRACT_TIMEOUT_MS`).

**Stage 3 — Match + extract endpoint**
- Create: `gta-match.service.ts`, `gta-match.service.spec.ts`.
- Create: `gta.controller.ts`, `gta.controller.spec.ts`.
- Create: `dto/generate-gta-analysis.dto.ts` (used in Stage 4, defined here as it is small).
- Modify: `gta.module.ts` (wire controller + services + `FornecedoresModule`/repo).

**Stage 4 — Fabric insert + generate**
- Modify: `docs/notebooks/fabric/update_fornecedor_car_lakehouse.ipynb` (add `insert_fornecedor`).
- Modify: `apps/api/src/fornecedores/fabric-client.service.ts` (`buildExecutionData` insert branch, `runFornecedorInsertJob`).
- Modify: `apps/api/src/fornecedores/fabric-lakehouse.repository.ts` (`insertFornecedor`).
- Create: `apps/api/src/gta/gta-analysis.service.ts`, `gta-analysis.service.spec.ts`.
- Modify: `gta.controller.ts` (add `POST /v1/analyses/gta`).

**Stage 5 — Frontend**
- Create: `apps/web/src/api/gta.ts` (typed client calls).
- Create: `apps/web/src/components/gta/GtaUploadPanel.vue`, `GtaReviewPanel.vue`.
- Modify: `apps/web/src/views/NewAnalysisView.vue` (toggle + wiring).
- Create: `apps/web/src/views/__tests__/gta-mode.spec.ts` (or co-located per repo convention).

---

# Stage 1 — Python `gta_extractor` package + CLI

**Outcome:** `python3 apps/api/gta-extractor/extract_gta.py some.pdf` prints one JSON object with the GTA fields. No NestJS involvement yet.

### Task 1.1: Generator that materializes the package from the notebook

**Files:**
- Create: `apps/api/gta-extractor/build_from_notebook.py`

- [ ] **Step 1: Write the generator**

```python
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
```

- [ ] **Step 2: Run the generator**

Run: `cd apps/api/gta-extractor && python3 build_from_notebook.py`
Expected: prints `wrote gta_extractor/...` for each module + `wrote gta_extractor/pipeline.py`. Files exist under `gta_extractor/`.

- [ ] **Step 3: Verify the package imports**

Run: `cd apps/api/gta-extractor && python3 -c "import gta_extractor, gta_extractor.pipeline; print('ok', hasattr(gta_extractor.pipeline, 'extract_pdf_no_ocr'))"`
Expected: `ok True`. (If `fitz` missing, first `pip install -r requirements.txt` — see Task 1.2.)

If the pipeline preamble references a name that `extract_pdf_no_ocr` uses but isn't imported, add that import to `PIPELINE_PREAMBLE` and re-run. The only expected names come from the package modules listed above.

- [ ] **Step 4: Commit**

```bash
git add apps/api/gta-extractor/build_from_notebook.py apps/api/gta-extractor/gta_extractor
git commit -m "feat(gta): materialize gta_extractor package from notebook"
```

### Task 1.2: requirements + CLI entrypoint

**Files:**
- Create: `apps/api/gta-extractor/requirements.txt`
- Create: `apps/api/gta-extractor/extract_gta.py`

- [ ] **Step 1: Write requirements.txt**

```
pymupdf==1.24.10
```
(poppler `pdftotext` is a system binary, not a pip dep — installed via the Dockerfile in Stage 2.)

- [ ] **Step 2: Write the CLI**

```python
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
```

- [ ] **Step 3: Install deps + smoke-run**

Run: `cd apps/api/gta-extractor && python3 -m pip install -r requirements.txt`
Then, if a sample GTA PDF is available (e.g. under `apps/api/storage/pdfs/`):
Run: `python3 extract_gta.py <sample.pdf>`
Expected: a single JSON line with `numeroGta`, `origem.cpfCnpj`, etc. If no sample PDF is on hand, skip to Task 1.3's synthetic test.

- [ ] **Step 4: Commit**

```bash
git add apps/api/gta-extractor/requirements.txt apps/api/gta-extractor/extract_gta.py
git commit -m "feat(gta): add extract_gta CLI entrypoint"
```

### Task 1.3: CLI failure-path test

**Files:**
- Create: `apps/api/gta-extractor/test_extract_gta.py`

- [ ] **Step 1: Write the test (failure paths — no PDF fixtures required)**

```python
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def _run(args):
    return subprocess.run(
        [sys.executable, str(HERE / "extract_gta.py"), *args],
        capture_output=True, text=True,
    )


def test_missing_arg_exits_2():
    result = _run([])
    assert result.returncode == 2
    assert "usage" in result.stderr.lower()


def test_missing_file_exits_2():
    result = _run([str(HERE / "does-not-exist.pdf")])
    assert result.returncode == 2
    assert "not found" in result.stderr.lower()
```

- [ ] **Step 2: Run the test**

Run: `cd apps/api/gta-extractor && python3 -m pytest test_extract_gta.py -v` (or `python3 -m unittest` if pytest absent; the asserts are plain).
Expected: 2 passed.

- [ ] **Step 3: Commit**

```bash
git add apps/api/gta-extractor/test_extract_gta.py
git commit -m "test(gta): extract_gta CLI failure paths"
```

> **Optional parity check (recommended if sample PDFs per system exist):** place ADAPEC/SIDAGO/GEDAVE sample PDFs under `apps/api/gta-extractor/samples/` and add a test asserting `numeroGta`/`origem.cpfCnpj` are non-null and `sistema` matches. Do not commit real GTAs with PII to the repo — keep samples local/gitignored.

**✅ Stage 1 checkpoint:** package materialized, CLI runs, tests green. Safe to stop.

---

# Stage 2 — NestJS GTA module + extraction subprocess service

**Outcome:** a `GtaExtractionService` that spawns `extract_gta.py` and returns a typed object. Unit-tested with a mocked subprocess. `nest build` passes.

### Task 2.1: Config + shared types

**Files:**
- Modify: `apps/api/src/config/config.schema.ts`
- Create: `apps/api/src/gta/dto/gta.types.ts`

- [ ] **Step 1: Add config keys**

Find where env vars are declared in `config.schema.ts` (follow the existing zod pattern) and add:

```typescript
// GTA extractor (Python subprocess)
GTA_EXTRACTOR_DIR: z.string().default('gta-extractor'),
GTA_EXTRACT_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
GTA_PYTHON_BIN: z.string().default('python3'),
```
(Path is resolved relative to the API package root at runtime; default `gta-extractor` → `apps/api/gta-extractor`.)

- [ ] **Step 2: Write shared types**

```typescript
// apps/api/src/gta/dto/gta.types.ts
export type GtaParty = {
  nome: string | null;
  cpfCnpj: string | null;
  estabelecimento: string | null;
  codigoEstabelecimento: string | null;
  municipio: string | null;
  uf: string | null;
};

export type GtaExtraction = {
  numeroGta: string | null;
  serieGta: string | null;
  ufGta: string | null;
  dataEmissao: string | null;
  sistema: string | null;
  origem: GtaParty;
  destino: GtaParty;
  status: 'ok' | 'warning' | 'needs_review' | 'failed';
  warnings: string[];
};

export type FornecedorCandidate = {
  idFornecedor: string;
  nome: string;
  cpfCnpj: string;
  codigoEstabelecimento: string | null;
  municipio: string | null;
  uf: string | null;
  car: string | null;
};

export type GtaMatchKind =
  | 'matched_with_car'
  | 'matched_no_car'
  | 'ambiguous'
  | 'none';

export type GtaMatch = {
  kind: GtaMatchKind;
  fornecedor: FornecedorCandidate | null;
  candidates: FornecedorCandidate[];
};

export type GtaExtractResponse = {
  gta: GtaExtraction;
  match: GtaMatch;
};
```

- [ ] **Step 3: Verify build**

Run: `cd apps/api && npx tsc --noEmit` (fast type check) — or `npm run build`.
Expected: no errors. (Per project note, `nest build` is the gate; tsc is a quick pre-check.)

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/config/config.schema.ts apps/api/src/gta/dto/gta.types.ts
git commit -m "feat(gta): config keys + shared GTA types"
```

### Task 2.2: Extraction subprocess service (TDD)

**Files:**
- Create: `apps/api/src/gta/gta-extraction.service.ts`
- Test: `apps/api/src/gta/gta-extraction.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/gta/gta-extraction.service.spec.ts
import { EventEmitter } from 'events';
import { GtaExtractionService } from './gta-extraction.service';

jest.mock('child_process', () => ({ spawn: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { spawn } = require('child_process') as { spawn: jest.Mock };

function fakeProc(opts: { stdout?: string; stderr?: string; code: number }) {
  const proc: any = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = jest.fn();
  setImmediate(() => {
    if (opts.stdout) proc.stdout.emit('data', Buffer.from(opts.stdout));
    if (opts.stderr) proc.stderr.emit('data', Buffer.from(opts.stderr));
    proc.emit('close', opts.code);
  });
  return proc;
}

const config = { get: (k: string) =>
  ({ GTA_EXTRACTOR_DIR: '/x', GTA_EXTRACT_TIMEOUT_MS: 30000, GTA_PYTHON_BIN: 'python3' } as any)[k] };

describe('GtaExtractionService', () => {
  beforeEach(() => spawn.mockReset());

  it('parses stdout JSON into a GtaExtraction', async () => {
    const payload = JSON.stringify({
      numeroGta: '012345', serieGta: 'A', ufGta: 'TO', dataEmissao: '15/06/2023',
      sistema: 'ADAPEC',
      origem: { nome: 'JOAO', cpfCnpj: '12345678901', estabelecimento: 'FAZ',
        codigoEstabelecimento: 'X1', municipio: 'Palmas', uf: 'TO' },
      destino: { nome: null, cpfCnpj: null, estabelecimento: null,
        codigoEstabelecimento: null, municipio: null, uf: null },
      status: 'ok', warnings: [],
    });
    spawn.mockReturnValue(fakeProc({ stdout: payload, code: 0 }));
    const svc = new GtaExtractionService(config as any);
    const out = await svc.extract(Buffer.from('%PDF-1.4'), 'g.pdf');
    expect(out.numeroGta).toBe('012345');
    expect(out.origem.cpfCnpj).toBe('12345678901');
  });

  it('throws a 422-style error when the subprocess exits non-zero', async () => {
    spawn.mockReturnValue(fakeProc({ stderr: 'no GTA found in PDF', code: 2 }));
    const svc = new GtaExtractionService(config as any);
    await expect(svc.extract(Buffer.from('x'), 'g.pdf')).rejects.toMatchObject({
      response: { code: 'GTA_EXTRACTION_FAILED' },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest gta-extraction.service -i`
Expected: FAIL — `Cannot find module './gta-extraction.service'`.

- [ ] **Step 3: Write the service**

```typescript
// apps/api/src/gta/gta-extraction.service.ts
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { GtaExtraction } from './dto/gta.types';

@Injectable()
export class GtaExtractionService {
  private readonly logger = new Logger(GtaExtractionService.name);

  constructor(private readonly config: ConfigService) {}

  private extractorDir(): string {
    const configured = this.config.get<string>('GTA_EXTRACTOR_DIR') ?? 'gta-extractor';
    return path.isAbsolute(configured)
      ? configured
      : path.resolve(process.cwd(), configured);
  }

  /** Writes the buffer to a temp file, runs extract_gta.py, returns parsed JSON. */
  async extract(buffer: Buffer, originalName: string): Promise<GtaExtraction> {
    const dir = this.extractorDir();
    const script = path.join(dir, 'extract_gta.py');
    const python = this.config.get<string>('GTA_PYTHON_BIN') ?? 'python3';
    const timeoutMs = this.config.get<number>('GTA_EXTRACT_TIMEOUT_MS') ?? 30000;

    const tmp = path.join(
      os.tmpdir(),
      `gta-${Date.now()}-${Math.round(process.hrtime()[1])}.pdf`,
    );
    await fs.writeFile(tmp, buffer);
    try {
      const json = await this.run(python, [script, tmp], dir, timeoutMs, originalName);
      return JSON.parse(json) as GtaExtraction;
    } catch (error) {
      if (error instanceof UnprocessableEntityException) throw error;
      this.logger.warn(
        `GTA extraction failed for ${originalName}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new UnprocessableEntityException({
        code: 'GTA_EXTRACTION_FAILED',
        message: 'Não foi possível extrair os dados desta GTA.',
      });
    } finally {
      await fs.rm(tmp, { force: true }).catch(() => undefined);
    }
  }

  private run(
    python: string,
    args: string[],
    cwd: string,
    timeoutMs: number,
    originalName: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(python, args, { cwd });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        proc.kill('SIGKILL');
        reject(
          new UnprocessableEntityException({
            code: 'GTA_EXTRACTION_TIMEOUT',
            message: 'A extração da GTA excedeu o tempo limite.',
          }),
        );
      }, timeoutMs);

      proc.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
      proc.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
      proc.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      proc.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0 && stdout.trim()) {
          resolve(stdout.trim());
          return;
        }
        this.logger.warn(
          `extract_gta.py exit=${code} file=${originalName} stderr=${stderr.trim()}`,
        );
        reject(
          new UnprocessableEntityException({
            code: 'GTA_EXTRACTION_FAILED',
            message: 'Não foi possível extrair os dados desta GTA.',
          }),
        );
      });
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest gta-extraction.service -i`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/gta/gta-extraction.service.ts apps/api/src/gta/gta-extraction.service.spec.ts
git commit -m "feat(gta): extraction subprocess service"
```

### Task 2.3: Module scaffold + registration

**Files:**
- Create: `apps/api/src/gta/gta.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write the module**

```typescript
// apps/api/src/gta/gta.module.ts
import { Module } from '@nestjs/common';
import { GtaExtractionService } from './gta-extraction.service';

@Module({
  providers: [GtaExtractionService],
  exports: [GtaExtractionService],
})
export class GtaModule {}
```

- [ ] **Step 2: Register in app.module.ts**

Add `import { GtaModule } from './gta/gta.module';` and add `GtaModule` to the `imports: [...]` array (place it near `AnalysesModule`).

- [ ] **Step 3: Verify build**

Run: `cd apps/api && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/gta/gta.module.ts apps/api/src/app.module.ts
git commit -m "feat(gta): register GtaModule"
```

### Task 2.4: Dockerfile — Python + poppler in the API image

**Files:**
- Modify: `apps/api/Dockerfile` (locate the runtime stage)

- [ ] **Step 1: Add runtime deps + extractor deps**

In the final runtime stage of `apps/api/Dockerfile`, before the app starts, add (Debian-based images):

```dockerfile
# GTA extraction runtime (Python + poppler for pdftotext fallback)
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip poppler-utils \
  && rm -rf /var/lib/apt/lists/*
COPY apps/api/gta-extractor/requirements.txt /app/gta-extractor/requirements.txt
RUN python3 -m pip install --no-cache-dir --break-system-packages \
  -r /app/gta-extractor/requirements.txt
COPY apps/api/gta-extractor /app/gta-extractor
```
Adjust `COPY` source/target paths to match the Dockerfile's existing build context and `WORKDIR`. Ensure `GTA_EXTRACTOR_DIR` resolves to the copied `gta-extractor` dir (set env `GTA_EXTRACTOR_DIR=/app/gta-extractor` if `WORKDIR` differs).

- [ ] **Step 2: Verify the image builds (if Docker available)**

Run: `docker build -f apps/api/Dockerfile -t landwatch-api-gta-check .`
Expected: build succeeds; `python3` and `pdftotext` present. If Docker isn't available locally, note this as a CI/deploy verification step.

- [ ] **Step 3: Commit**

```bash
git add apps/api/Dockerfile
git commit -m "build(api): bundle python + poppler for GTA extraction"
```

**✅ Stage 2 checkpoint:** extraction service unit-tested, module registered, image builds. Safe to stop.

---

# Stage 3 — Fornecedor match service + extract endpoint

**Outcome:** `POST /v1/analyses/gta/extract` accepts a PDF, returns `{ gta, match }`. PDF discarded.

### Task 3.1: Fornecedor match service (TDD)

**Files:**
- Create: `apps/api/src/gta/gta-match.service.ts`
- Test: `apps/api/src/gta/gta-match.service.spec.ts`

Uses the existing `FabricLakehouseRepository.listFornecedores`. Match by digits-only `cpf_cnpj`; tiebreak by `codigoEstabelecimento`.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/gta/gta-match.service.spec.ts
import { GtaMatchService } from './gta-match.service';
import type { GtaExtraction } from './dto/gta.types';

const baseGta = (over: Partial<GtaExtraction['origem']> = {}): GtaExtraction => ({
  numeroGta: '1', serieGta: 'A', ufGta: 'GO', dataEmissao: '01/01/2024', sistema: 'SIDAGO',
  origem: { nome: 'X', cpfCnpj: '01279969156', estabelecimento: 'FAZ',
    codigoEstabelecimento: '52016601239', municipio: 'Novo Brasil', uf: 'GO', ...over },
  destino: { nome: null, cpfCnpj: null, estabelecimento: null,
    codigoEstabelecimento: null, municipio: null, uf: null },
  status: 'ok', warnings: [],
});

function repoReturning(rows: any[]) {
  return { listFornecedores: jest.fn().mockResolvedValue({ page: 1, pageSize: 100, total: rows.length, rows }) } as any;
}

describe('GtaMatchService', () => {
  it('kind=none when no rows', async () => {
    const svc = new GtaMatchService(repoReturning([]));
    const m = await svc.match(baseGta());
    expect(m.kind).toBe('none');
    expect(m.fornecedor).toBeNull();
  });

  it('kind=matched_with_car when 1 row has CAR', async () => {
    const svc = new GtaMatchService(repoReturning([
      { idFornecedor: 'f1', nome: 'X', cpfCnpj: '01279969156', codigoEstabelecimento: '52016601239', municipio: 'Novo Brasil', uf: 'GO', car: 'GO-1234567-ABC' },
    ]));
    const m = await svc.match(baseGta());
    expect(m.kind).toBe('matched_with_car');
    expect(m.fornecedor?.car).toBe('GO-1234567-ABC');
  });

  it('kind=matched_no_car when 1 row without CAR', async () => {
    const svc = new GtaMatchService(repoReturning([
      { idFornecedor: 'f1', nome: 'X', cpfCnpj: '01279969156', codigoEstabelecimento: '52016601239', municipio: 'Novo Brasil', uf: 'GO', car: '' },
    ]));
    const m = await svc.match(baseGta());
    expect(m.kind).toBe('matched_no_car');
  });

  it('tiebreaks on codigoEstabelecimento when several share the CPF', async () => {
    const svc = new GtaMatchService(repoReturning([
      { idFornecedor: 'f1', nome: 'X', cpfCnpj: '01279969156', codigoEstabelecimento: '999', municipio: 'A', uf: 'GO', car: '' },
      { idFornecedor: 'f2', nome: 'X', cpfCnpj: '01279969156', codigoEstabelecimento: '52016601239', municipio: 'Novo Brasil', uf: 'GO', car: 'GO-1-Z' },
    ]));
    const m = await svc.match(baseGta());
    expect(m.kind).toBe('matched_with_car');
    expect(m.fornecedor?.idFornecedor).toBe('f2');
  });

  it('kind=ambiguous when several share the CPF and none matches the codigo', async () => {
    const svc = new GtaMatchService(repoReturning([
      { idFornecedor: 'f1', nome: 'X', cpfCnpj: '01279969156', codigoEstabelecimento: '111', municipio: 'A', uf: 'GO', car: '' },
      { idFornecedor: 'f2', nome: 'X', cpfCnpj: '01279969156', codigoEstabelecimento: '222', municipio: 'B', uf: 'GO', car: '' },
    ]));
    const m = await svc.match(baseGta());
    expect(m.kind).toBe('ambiguous');
    expect(m.candidates).toHaveLength(2);
  });

  it('kind=none when GTA has no cpfCnpj', async () => {
    const listFornecedores = jest.fn();
    const svc = new GtaMatchService({ listFornecedores } as any);
    const m = await svc.match(baseGta({ cpfCnpj: null }));
    expect(m.kind).toBe('none');
    expect(listFornecedores).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest gta-match.service -i`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the service**

```typescript
// apps/api/src/gta/gta-match.service.ts
import { Injectable } from '@nestjs/common';
import { FabricLakehouseRepository } from '../fornecedores/fabric-lakehouse.repository';
import { sanitizeDoc } from '../common/validators/cpf-cnpj';
import type { FornecedorCandidate, GtaExtraction, GtaMatch } from './dto/gta.types';

@Injectable()
export class GtaMatchService {
  constructor(private readonly repo: FabricLakehouseRepository) {}

  async match(gta: GtaExtraction): Promise<GtaMatch> {
    const cpf = sanitizeDoc(gta.origem.cpfCnpj ?? '');
    if (!cpf) {
      return { kind: 'none', fornecedor: null, candidates: [] };
    }

    const result = await this.repo.listFornecedores({
      page: 1,
      pageSize: 100,
      sortBy: 'nome',
      sortDir: 'asc',
      includeZeroPendencias: true,
      filters: { cpfCnpj: cpf },
    });

    // Keep only exact CPF/CNPJ matches (repo filter is LIKE-based).
    const rows: FornecedorCandidate[] = (result.rows as any[])
      .filter((r) => sanitizeDoc(String(r.cpfCnpj ?? '')) === cpf)
      .map((r) => ({
        idFornecedor: String(r.idFornecedor),
        nome: String(r.nome ?? ''),
        cpfCnpj: String(r.cpfCnpj ?? ''),
        codigoEstabelecimento: r.codigoEstabelecimento ? String(r.codigoEstabelecimento) : null,
        municipio: r.municipio ? String(r.municipio) : null,
        uf: r.uf ? String(r.uf) : null,
        car: r.car ? String(r.car) : null,
      }));

    if (rows.length === 0) {
      return { kind: 'none', fornecedor: null, candidates: [] };
    }

    let chosen: FornecedorCandidate | null = null;
    if (rows.length === 1) {
      chosen = rows[0];
    } else {
      const code = (gta.origem.codigoEstabelecimento ?? '').trim();
      const byCode = code
        ? rows.filter((r) => (r.codigoEstabelecimento ?? '').trim() === code)
        : [];
      if (byCode.length === 1) {
        chosen = byCode[0];
      } else {
        return { kind: 'ambiguous', fornecedor: null, candidates: rows };
      }
    }

    const hasCar = !!(chosen.car && chosen.car.trim());
    return {
      kind: hasCar ? 'matched_with_car' : 'matched_no_car',
      fornecedor: chosen,
      candidates: [],
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest gta-match.service -i`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/gta/gta-match.service.ts apps/api/src/gta/gta-match.service.spec.ts
git commit -m "feat(gta): fornecedor match service"
```

### Task 3.2: Extract endpoint + controller (TDD)

**Files:**
- Create: `apps/api/src/gta/gta.controller.ts`
- Test: `apps/api/src/gta/gta.controller.spec.ts`
- Modify: `apps/api/src/gta/gta.module.ts`

- [ ] **Step 1: Write the failing controller test**

```typescript
// apps/api/src/gta/gta.controller.spec.ts
import { BadRequestException } from '@nestjs/common';
import { GtaController } from './gta.controller';

const actor = { userId: 'u1', orgId: 'o1' };
const actorContext = { fromRequest: jest.fn().mockResolvedValue(actor) };
const access = { requireTenantFeature: jest.fn().mockResolvedValue(undefined) };

const gtaExtraction = { extract: jest.fn() };
const gtaMatch = { match: jest.fn() };

function makeController() {
  return new GtaController(
    actorContext as any, access as any, gtaExtraction as any, gtaMatch as any,
    { generate: jest.fn() } as any, // gtaAnalysis, added in Stage 4
  );
}

const req = { user: { sub: 'u1' }, headers: {} } as any;

describe('GtaController.extract', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects non-PDF files', async () => {
    const c = makeController();
    await expect(
      c.extract(req, { buffer: Buffer.from('x'), originalname: 'a.png', mimetype: 'image/png', size: 3 } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects files over 50MB', async () => {
    const c = makeController();
    await expect(
      c.extract(req, { buffer: Buffer.alloc(1), originalname: 'a.pdf', mimetype: 'application/pdf', size: 51 * 1024 * 1024 } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns { gta, match } for a valid PDF', async () => {
    const gta = { numeroGta: '1', origem: { cpfCnpj: '01279969156' } };
    const match = { kind: 'none', fornecedor: null, candidates: [] };
    gtaExtraction.extract.mockResolvedValue(gta);
    gtaMatch.match.mockResolvedValue(match);
    const c = makeController();
    const out = await c.extract(req, {
      buffer: Buffer.from('%PDF-1.4'), originalname: 'a.pdf', mimetype: 'application/pdf', size: 8,
    } as any);
    expect(access.requireTenantFeature).toHaveBeenCalledWith(actor, 'ANALYSIS_CREATE');
    expect(out).toEqual({ gta, match });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest gta.controller -i`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the controller**

```typescript
// apps/api/src/gta/gta.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AuthedRequest } from '../auth/authed-request.type';
import { AccessService } from '../auth/access.service';
import { ActorContextService } from '../auth/actor-context.service';
import { GtaExtractionService } from './gta-extraction.service';
import { GtaMatchService } from './gta-match.service';
import { GtaAnalysisService } from './gta-analysis.service';
import { GenerateGtaAnalysisDto } from './dto/generate-gta-analysis.dto';
import type { GtaExtractResponse } from './dto/gta.types';

type UploadedPdf = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size?: number;
};

const MAX_PDF_BYTES = 50 * 1024 * 1024;

@Controller('v1/analyses/gta')
export class GtaController {
  constructor(
    private readonly actorContext: ActorContextService,
    private readonly access: AccessService,
    private readonly extraction: GtaExtractionService,
    private readonly matcher: GtaMatchService,
    private readonly analysis: GtaAnalysisService,
  ) {}

  private async requireCreator(req: AuthedRequest) {
    if (!req.user) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Missing user claims',
      });
    }
    const actor = await this.actorContext.fromRequest(req, { orgMode: 'tenant' });
    await this.access.requireTenantFeature(actor, 'ANALYSIS_CREATE');
    return actor;
  }

  @Post('extract')
  @UseInterceptors(FileInterceptor('file'))
  async extract(
    @Req() req: AuthedRequest,
    @UploadedFile() file: UploadedPdf,
  ): Promise<GtaExtractResponse> {
    await this.requireCreator(req);
    if (!file || !file.buffer) {
      throw new BadRequestException({ code: 'FILE_REQUIRED', message: 'Envie um arquivo PDF.' });
    }
    const isPdf =
      file.mimetype === 'application/pdf' ||
      file.originalname.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      throw new BadRequestException({ code: 'INVALID_FILE_TYPE', message: 'Apenas arquivos PDF são aceitos.' });
    }
    if ((file.size ?? file.buffer.length) > MAX_PDF_BYTES) {
      throw new BadRequestException({ code: 'FILE_TOO_LARGE', message: 'O arquivo excede 50MB.' });
    }

    const gta = await this.extraction.extract(file.buffer, file.originalname);
    const match = await this.matcher.match(gta);
    return { gta, match };
  }

  @Post()
  async generate(
    @Req() req: AuthedRequest,
    @Body() dto: GenerateGtaAnalysisDto,
  ) {
    const actor = await this.requireCreator(req);
    return this.analysis.generate(actor, dto);
  }
}
```

- [ ] **Step 4: Create the generate DTO (used by the `@Post()` handler)**

```typescript
// apps/api/src/gta/dto/generate-gta-analysis.dto.ts
import {
  IsIn, IsISO8601, IsObject, IsOptional, IsString, Length, Matches,
} from 'class-validator';

// UF-1234567-<32 hex/alnum>. Mirrors the frontend/FornecedoresView CAR format.
const CAR_REGEX = /^[A-Z]{2}-\d{7}-[A-Z0-9]{32}$/;

export class GtaOrigemDto {
  @IsOptional() @IsString() nome?: string | null;
  @IsOptional() @IsString() cpfCnpj?: string | null;
  @IsOptional() @IsString() estabelecimento?: string | null;
  @IsOptional() @IsString() codigoEstabelecimento?: string | null;
  @IsOptional() @IsString() municipio?: string | null;
  @IsOptional() @IsString() uf?: string | null;
}

export class GenerateGtaAnalysisDto {
  @Matches(CAR_REGEX, { message: 'CAR inválido' })
  carKey!: string;

  @IsIn(['matched_with_car', 'matched_no_car', 'none'])
  matchKind!: 'matched_with_car' | 'matched_no_car' | 'none';

  @IsOptional() @IsString() @Length(1, 128)
  fornecedorId?: string;

  @IsOptional() @IsISO8601()
  analysisDate?: string;

  @IsOptional() @IsObject()
  origem?: GtaOrigemDto;
}
```

- [ ] **Step 5: Wire the controller into the module (extraction + match only for now)**

`GtaAnalysisService` arrives in Stage 4. To keep Stage 3 building and the controller test green, add a **temporary stub** provider now and replace it in Stage 4:

```typescript
// apps/api/src/gta/gta.module.ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FornecedoresModule } from '../fornecedores/fornecedores.module';
import { GtaController } from './gta.controller';
import { GtaExtractionService } from './gta-extraction.service';
import { GtaMatchService } from './gta-match.service';
import { GtaAnalysisService } from './gta-analysis.service';

@Module({
  imports: [AuthModule, FornecedoresModule],
  controllers: [GtaController],
  providers: [GtaExtractionService, GtaMatchService, GtaAnalysisService],
  exports: [GtaExtractionService],
})
export class GtaModule {}
```

Create a minimal `gta-analysis.service.ts` stub so the module compiles (fleshed out in Stage 4):

```typescript
// apps/api/src/gta/gta-analysis.service.ts  (STUB — completed in Stage 4)
import { Injectable, NotImplementedException } from '@nestjs/common';
import type { GenerateGtaAnalysisDto } from './dto/generate-gta-analysis.dto';

@Injectable()
export class GtaAnalysisService {
  async generate(_actor: unknown, _dto: GenerateGtaAnalysisDto): Promise<{ analysisId: string }> {
    throw new NotImplementedException('GTA analysis generation not implemented yet');
  }
}
```

Confirm `FornecedoresModule` **exports** `FabricLakehouseRepository` (needed by `GtaMatchService`). If it doesn't, add it to that module's `exports`. Confirm `AuthModule` exports `ActorContextService` + `AccessService`; if analyses/attachments import them from a different providing module, mirror that import here instead.

- [ ] **Step 6: Run tests + build**

Run: `cd apps/api && npx jest gta.controller -i && npm run build`
Expected: controller tests pass; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/gta/gta.controller.ts apps/api/src/gta/gta.controller.spec.ts apps/api/src/gta/gta.module.ts apps/api/src/gta/gta-analysis.service.ts apps/api/src/gta/dto/generate-gta-analysis.dto.ts
git commit -m "feat(gta): extract endpoint + match wiring"
```

**✅ Stage 3 checkpoint:** `POST /v1/analyses/gta/extract` works end-to-end (extract + match); generate is stubbed. Safe to stop.

---

# Stage 4 — Fabric insert action + background writes + generate endpoint

**Outcome:** `POST /v1/analyses/gta` creates a plain CAR analysis; background Fabric write (update CAR or insert fornecedor) fires without blocking.

### Task 4.1: Notebook `insert_fornecedor` action

**Files:**
- Modify: `docs/notebooks/fabric/update_fornecedor_car_lakehouse.ipynb`

- [ ] **Step 1: Extend the parameter cell**

In the parameter cell (Cell 1), add the insert params (keep existing ones):

```python
# Parameter cell
action = "update_fornecedor_car"   # or "insert_fornecedor"
id_fornecedor = ""
car = ""
requested_by = ""

# insert_fornecedor params
cpf_cnpj = ""
nome = ""
estabelecimento = ""
codigo_estabelecimento = ""
municipio = ""
uf = ""

# Optional controls
target_table = "Fornecedores"
target_schema = "dbo"
dry_run = False
```

- [ ] **Step 2: Add the insert branch in the logic cell**

In Cell 2, relax the action guard and add an insert path. Replace the `if action and action != "update_fornecedor_car":` guard with:

```python
VALID_ACTIONS = {"update_fornecedor_car", "insert_fornecedor"}
if action and action not in VALID_ACTIONS:
    raise ValueError(f"Invalid action: {action}")
```

Then, after `target_identifier` is resolved (reuse the existing resolution block), branch:

```python
import uuid

if action == "insert_fornecedor":
    cpf_cnpj_v = _clean(cpf_cnpj)
    car_v = _clean(car).upper()
    if not cpf_cnpj_v:
        raise ValueError("Parameter cpf_cnpj is required for insert_fornecedor")
    if not car_v:
        raise ValueError("Parameter car is required for insert_fornecedor")

    new_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    new_row = spark.createDataFrame(
        [(
            new_id, cpf_cnpj_v, _clean(nome), _clean(estabelecimento),
            _clean(codigo_estabelecimento), _clean(municipio), _clean(uf).upper(),
            car_v, now, now,
        )],
        schema=[
            "id_fornecedor", "cpf_cnpj", "nome", "estabelecimento",
            "codigo_estabelecimento", "municipio", "uf", "car",
            "created_at", "updated_at",
        ],
    )
    if not dry_run:
        new_row.write.format("delta").mode("append").saveAsTable(target_identifier)
    print(json.dumps({"action": action, "id_fornecedor": new_id, "dry_run": dry_run}))
else:
    # ... existing update_fornecedor_car logic unchanged ...
    pass
```

Keep the existing update logic in the `else` branch (do not duplicate — wrap the current update code under `else:`). Align the DataFrame columns with the actual `Fornecedores` Delta schema (add `latitude`/`longitude` as `None` if the table requires them).

- [ ] **Step 3: Note the manual deploy**

Add a markdown cell at the top documenting: *"Deployed manually to Fabric workspace `FABRIC_WORKSPACE_ID`. After editing, re-publish this notebook so the API's `insert_fornecedor` calls resolve."* This notebook is not deployed by the repo's pipeline.

- [ ] **Step 4: Commit**

```bash
git add docs/notebooks/fabric/update_fornecedor_car_lakehouse.ipynb
git commit -m "feat(fabric): add insert_fornecedor action to CAR notebook"
```

### Task 4.2: API — insert job execution data + repository method

**Files:**
- Modify: `apps/api/src/fornecedores/fabric-client.service.ts`
- Modify: `apps/api/src/fornecedores/fabric-lakehouse.repository.ts`
- Test: `apps/api/src/fornecedores/fabric-lakehouse.repository.spec.ts` (extend)

- [ ] **Step 1: Add an insert payload type + buildExecutionData branch**

In `fabric-client.service.ts`, add an overload/param for the insert action. Add a new method mirroring `runFornecedorCarUpdateJob`:

```typescript
async runFornecedorInsertJob(payload: {
  cpfCnpj: string;
  nome: string;
  estabelecimento: string | null;
  codigoEstabelecimento: string | null;
  municipio: string | null;
  uf: string | null;
  car: string;
  requestedBy?: string | null;
}): Promise<{ jobId: string | null; status: 'ACCEPTED' | 'COMPLETED' }> {
  // Reuse the same job-invocation code path as runFornecedorCarUpdateJob,
  // but pass buildInsertExecutionData(jobType, payload) as the body.
  // (Refactor the shared POST-to-/jobs/{jobType}/instances + poll code into a
  // private helper `runNotebookJob(executionData)` used by both methods.)
}
```

And the execution-data builder:

```typescript
private buildInsertExecutionData(
  jobType: string,
  payload: {
    cpfCnpj: string; nome: string; estabelecimento: string | null;
    codigoEstabelecimento: string | null; municipio: string | null;
    uf: string | null; car: string; requestedBy?: string | null;
  },
): { executionData: Record<string, unknown> } {
  const normalizedType = jobType.trim().toLowerCase();
  const str = (v: string | null | undefined) => ({ value: v ?? '', type: 'string' });
  if (normalizedType === 'runnotebook') {
    return {
      executionData: {
        parameters: {
          action: { value: 'insert_fornecedor', type: 'string' },
          cpf_cnpj: str(payload.cpfCnpj),
          nome: str(payload.nome),
          estabelecimento: str(payload.estabelecimento),
          codigo_estabelecimento: str(payload.codigoEstabelecimento),
          municipio: str(payload.municipio),
          uf: str(payload.uf),
          car: str(payload.car),
          requested_by: str(payload.requestedBy ?? ''),
        },
      },
    };
  }
  return {
    executionData: {
      action: 'insert_fornecedor',
      cpfCnpj: payload.cpfCnpj, nome: payload.nome,
      estabelecimento: payload.estabelecimento,
      codigoEstabelecimento: payload.codigoEstabelecimento,
      municipio: payload.municipio, uf: payload.uf, car: payload.car,
      requestedBy: payload.requestedBy ?? null,
    },
  };
}
```

Refactor: extract the shared job-run mechanics (build URL, POST, poll) currently inside `runFornecedorCarUpdateJob` (`:127`+) into a private `runNotebookJob(executionData)` and have both `runFornecedorCarUpdateJob` and `runFornecedorInsertJob` call it.

- [ ] **Step 2: Add repository `insertFornecedor`**

In `fabric-lakehouse.repository.ts`, add:

```typescript
async insertFornecedor(payload: {
  cpfCnpj: string; nome: string; estabelecimento: string | null;
  codigoEstabelecimento: string | null; municipio: string | null;
  uf: string | null; car: string; requestedBy?: string | null;
}): Promise<{ jobId: string | null; status: 'ACCEPTED' | 'COMPLETED' }> {
  return this.fabric.runFornecedorInsertJob(payload);
}
```

- [ ] **Step 3: Extend the repository spec (assert the notebook params)**

Add a test asserting `buildInsertExecutionData('RunNotebook', …)` produces `parameters.action.value === 'insert_fornecedor'` and includes `cpf_cnpj`, `car`. (If `buildInsertExecutionData` is private, test via the public `runFornecedorInsertJob` with a mocked HTTP client, mirroring the existing update-job test structure.)

- [ ] **Step 4: Run tests + build**

Run: `cd apps/api && npx jest fabric-lakehouse -i && npm run build`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/fornecedores/fabric-client.service.ts apps/api/src/fornecedores/fabric-lakehouse.repository.ts apps/api/src/fornecedores/fabric-lakehouse.repository.spec.ts
git commit -m "feat(fornecedores): fabric insert_fornecedor job + repo method"
```

### Task 4.3: `GtaAnalysisService.generate` (TDD, replaces the stub)

**Files:**
- Modify: `apps/api/src/gta/gta-analysis.service.ts` (replace stub)
- Test: `apps/api/src/gta/gta-analysis.service.spec.ts`
- Modify: `apps/api/src/gta/gta.module.ts` (import `AnalysesModule`)

The service: create a plain CAR analysis via the existing `AnalysesService.createForActor`, and fire the Fabric write in the background (no await on verification).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/gta/gta-analysis.service.spec.ts
import { GtaAnalysisService } from './gta-analysis.service';

const flush = () => new Promise((r) => setImmediate(r));

function makeDeps() {
  const analyses = { createForActor: jest.fn().mockResolvedValue({ id: 'an1' }) };
  const repo = {
    updateFornecedorCar: jest.fn().mockResolvedValue({}),
    insertFornecedor: jest.fn().mockResolvedValue({}),
  };
  return { analyses, repo };
}
const actor = { userId: 'u1', orgId: 'o1' };

describe('GtaAnalysisService.generate', () => {
  it('matched_with_car: no fabric write, creates CAR analysis', async () => {
    const { analyses, repo } = makeDeps();
    const svc = new GtaAnalysisService(analyses as any, repo as any);
    const out = await svc.generate(actor as any, {
      carKey: 'GO-1234567-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', matchKind: 'matched_with_car',
    } as any);
    expect(out).toEqual({ analysisId: 'an1' });
    expect(analyses.createForActor).toHaveBeenCalledWith(actor, { carKey: expect.any(String), analysisDate: undefined });
    await flush();
    expect(repo.updateFornecedorCar).not.toHaveBeenCalled();
    expect(repo.insertFornecedor).not.toHaveBeenCalled();
  });

  it('matched_no_car: fires background updateFornecedorCar, returns immediately', async () => {
    const { analyses, repo } = makeDeps();
    const svc = new GtaAnalysisService(analyses as any, repo as any);
    await svc.generate(actor as any, {
      carKey: 'GO-1234567-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', matchKind: 'matched_no_car', fornecedorId: 'f1',
    } as any);
    await flush();
    expect(repo.updateFornecedorCar).toHaveBeenCalledWith('f1', expect.any(String), 'u1');
  });

  it('none: fires background insertFornecedor with origem + car', async () => {
    const { analyses, repo } = makeDeps();
    const svc = new GtaAnalysisService(analyses as any, repo as any);
    await svc.generate(actor as any, {
      carKey: 'GO-1234567-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', matchKind: 'none',
      origem: { cpfCnpj: '01279969156', nome: 'X', estabelecimento: 'FAZ', codigoEstabelecimento: '52016601239', municipio: 'Novo Brasil', uf: 'GO' },
    } as any);
    await flush();
    expect(repo.insertFornecedor).toHaveBeenCalledWith(expect.objectContaining({ cpfCnpj: '01279969156', car: expect.any(String) }));
  });

  it('a failing background write does not reject generate()', async () => {
    const { analyses, repo } = makeDeps();
    repo.updateFornecedorCar.mockRejectedValue(new Error('fabric down'));
    const svc = new GtaAnalysisService(analyses as any, repo as any);
    await expect(svc.generate(actor as any, {
      carKey: 'GO-1234567-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', matchKind: 'matched_no_car', fornecedorId: 'f1',
    } as any)).resolves.toEqual({ analysisId: 'an1' });
    await flush();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest gta-analysis.service -i`
Expected: FAIL — stub throws `NotImplementedException`.

- [ ] **Step 3: Write the service**

```typescript
// apps/api/src/gta/gta-analysis.service.ts
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AnalysesService } from '../analyses/analyses.service';
import { FabricLakehouseRepository } from '../fornecedores/fabric-lakehouse.repository';
import type { GenerateGtaAnalysisDto } from './dto/generate-gta-analysis.dto';

type Actor = { userId: string; orgId: string | null; isPlatformAdmin?: boolean };

@Injectable()
export class GtaAnalysisService {
  private readonly logger = new Logger(GtaAnalysisService.name);

  constructor(
    private readonly analyses: AnalysesService,
    private readonly repo: FabricLakehouseRepository,
  ) {}

  async generate(actor: Actor, dto: GenerateGtaAnalysisDto): Promise<{ analysisId: string }> {
    const carKey = dto.carKey.trim().toUpperCase();

    // Fire the Fabric write in the background — the analysis only needs the CAR
    // string, never the fornecedor row, so it must not wait on Fabric.
    this.kickBackgroundWrite(actor, dto, carKey);

    const analysis = await this.analyses.createForActor(actor as any, {
      carKey,
      analysisDate: dto.analysisDate,
    });
    return { analysisId: analysis.id };
  }

  private kickBackgroundWrite(actor: Actor, dto: GenerateGtaAnalysisDto, carKey: string): void {
    const run = async () => {
      if (dto.matchKind === 'matched_no_car') {
        if (!dto.fornecedorId) return;
        await this.repo.updateFornecedorCar(dto.fornecedorId, carKey, actor.userId);
      } else if (dto.matchKind === 'none') {
        const o = dto.origem ?? {};
        if (!o.cpfCnpj) {
          this.logger.warn('GTA insert skipped: no cpfCnpj in origem');
          return;
        }
        await this.repo.insertFornecedor({
          cpfCnpj: o.cpfCnpj,
          nome: o.nome ?? '',
          estabelecimento: o.estabelecimento ?? null,
          codigoEstabelecimento: o.codigoEstabelecimento ?? null,
          municipio: o.municipio ?? null,
          uf: o.uf ?? null,
          car: carKey,
          requestedBy: actor.userId,
        });
      }
      // matched_with_car: nothing to write (CAR immutable).
    };
    // Detach: never let a Fabric failure affect the analysis response.
    void run().catch((error) => {
      this.logger.warn(
        `GTA background fabric write failed (matchKind=${dto.matchKind}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }
}
```

Note: if `matchKind === 'none'` and `origem.cpfCnpj` is missing, we skip the insert but still create the analysis (guard above). Consider whether the DTO should require `origem.cpfCnpj` when `matchKind === 'none'`; if so, add a validation check in the controller and a `BadRequestException`.

- [ ] **Step 4: Import AnalysesModule in GtaModule**

```typescript
// apps/api/src/gta/gta.module.ts — add AnalysesModule to imports
import { AnalysesModule } from '../analyses/analyses.module';
// imports: [AuthModule, FornecedoresModule, AnalysesModule]
```

Confirm `AnalysesModule` exports `AnalysesService`; if not, add it to that module's `exports`.

- [ ] **Step 5: Run tests + build**

Run: `cd apps/api && npx jest gta-analysis.service gta.controller -i && npm run build`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/gta/gta-analysis.service.ts apps/api/src/gta/gta-analysis.service.spec.ts apps/api/src/gta/gta.module.ts
git commit -m "feat(gta): generate CAR analysis with background fabric write"
```

**✅ Stage 4 checkpoint:** full backend works — extract, match, generate, background writes. Safe to stop. (Fabric writes are no-ops in dev where `FABRIC_CAR_UPDATE_MODE=disabled`.)

---

# Stage 5 — Frontend GTA mode

**Outcome:** a "Análise por GTA" toggle in `NewAnalysisView.vue` → upload → loading → review panel → "Gerar Análise" → redirect to `/analyses/{id}`.

### Task 5.1: Typed API client

**Files:**
- Create: `apps/web/src/api/gta.ts`

- [ ] **Step 1: Write the client**

```typescript
// apps/web/src/api/gta.ts
import { http } from './http';
import type { ApiEnvelope } from './envelope';

export type GtaParty = {
  nome: string | null; cpfCnpj: string | null; estabelecimento: string | null;
  codigoEstabelecimento: string | null; municipio: string | null; uf: string | null;
};
export type GtaExtraction = {
  numeroGta: string | null; serieGta: string | null; ufGta: string | null;
  dataEmissao: string | null; sistema: string | null;
  origem: GtaParty; destino: GtaParty;
  status: 'ok' | 'warning' | 'needs_review' | 'failed'; warnings: string[];
};
export type FornecedorCandidate = {
  idFornecedor: string; nome: string; cpfCnpj: string;
  codigoEstabelecimento: string | null; municipio: string | null; uf: string | null;
  car: string | null;
};
export type GtaMatchKind = 'matched_with_car' | 'matched_no_car' | 'ambiguous' | 'none';
export type GtaMatch = { kind: GtaMatchKind; fornecedor: FornecedorCandidate | null; candidates: FornecedorCandidate[] };
export type GtaExtractResponse = { gta: GtaExtraction; match: GtaMatch };

export async function extractGta(file: File): Promise<GtaExtractResponse> {
  const form = new FormData();
  form.append('file', file);
  const res = await http.post<ApiEnvelope<GtaExtractResponse>>(
    '/v1/analyses/gta/extract', form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return res.data.data;
}

export async function generateGtaAnalysis(payload: {
  carKey: string;
  matchKind: 'matched_with_car' | 'matched_no_car' | 'none';
  fornecedorId?: string;
  analysisDate?: string;
  origem?: GtaParty;
}): Promise<{ analysisId: string }> {
  const res = await http.post<ApiEnvelope<{ analysisId: string }>>('/v1/analyses/gta', payload);
  return res.data.data;
}
```
Verify the `http` import shape matches `apps/web/src/api/http.ts` (default vs named export) and adjust. Match how other clients unwrap `ApiEnvelope`.

- [ ] **Step 2: Type-check**

Run: `cd apps/web && npx vue-tsc --noEmit` (or the repo's typecheck script).
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/api/gta.ts
git commit -m "feat(web): GTA analysis API client"
```

### Task 5.2: Upload panel component

**Files:**
- Create: `apps/web/src/components/gta/GtaUploadPanel.vue`

- [ ] **Step 1: Write the component**

```vue
<!-- apps/web/src/components/gta/GtaUploadPanel.vue -->
<template>
  <div>
    <div
      class="gta-dropzone"
      data-testid="gta-dropzone"
      :class="{ 'is-dragover': dragOver, 'is-loading': loading }"
      @dragover.prevent="dragOver = true"
      @dragleave.prevent="dragOver = false"
      @drop.prevent="onDrop"
      @click="!loading && fileInput?.click()"
    >
      <input
        ref="fileInput" type="file" accept="application/pdf,.pdf"
        class="gta-file-input" data-testid="gta-file-input"
        @change="onPick"
      />
      <div v-if="loading" class="gta-loading" data-testid="gta-loading">
        <span class="spinner" /> Extraindo dados da GTA…
      </div>
      <div v-else class="gta-hint">
        <p class="gta-title">Escolha um arquivo ou arraste e solte aqui</p>
        <p class="gta-sub">Apenas PDF, até 50MB</p>
        <button type="button" class="gta-browse">Selecionar arquivo</button>
      </div>
    </div>
    <p v-if="error" class="gta-error" data-testid="gta-error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const MAX_BYTES = 50 * 1024 * 1024;
const props = defineProps<{ loading: boolean; error: string | null }>();
const emit = defineEmits<{ (e: 'file', file: File): void; (e: 'invalid', message: string): void }>();

const fileInput = ref<HTMLInputElement | null>(null);
const dragOver = ref(false);

function validateAndEmit(file: File | undefined) {
  if (!file) return;
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) { emit('invalid', 'Apenas arquivos PDF são aceitos.'); return; }
  if (file.size > MAX_BYTES) { emit('invalid', 'O arquivo excede 50MB.'); return; }
  emit('file', file);
}
function onPick(e: Event) {
  validateAndEmit((e.target as HTMLInputElement).files?.[0]);
  (e.target as HTMLInputElement).value = '';
}
function onDrop(e: DragEvent) {
  dragOver.value = false;
  validateAndEmit(e.dataTransfer?.files?.[0]);
}
</script>

<style scoped>
.gta-dropzone { border: 2px dashed #cfd4dc; border-radius: 12px; padding: 40px; text-align: center; cursor: pointer; }
.gta-dropzone.is-dragover { border-color: #2563eb; background: #f5f8ff; }
.gta-dropzone.is-loading { cursor: default; opacity: .8; }
.gta-file-input { display: none; }
.gta-title { font-weight: 600; font-size: 1.05rem; }
.gta-sub { color: #98a2b3; margin-top: 4px; }
.gta-browse { margin-top: 16px; padding: 8px 18px; border: 1px solid #cfd4dc; border-radius: 8px; background: #fff; }
.gta-error { color: #b42318; margin-top: 8px; }
.gta-loading { display: flex; gap: 10px; align-items: center; justify-content: center; }
.spinner { width: 16px; height: 16px; border: 2px solid #cfd4dc; border-top-color: #2563eb; border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
```
Match the app's existing button/border tokens — reuse classes from `NewAnalysisView.vue`/`FornecedoresView.vue` rather than the inline styles above where equivalents exist.

- [ ] **Step 2: Type-check + commit**

Run: `cd apps/web && npx vue-tsc --noEmit`
```bash
git add apps/web/src/components/gta/GtaUploadPanel.vue
git commit -m "feat(web): GTA upload dropzone component"
```

### Task 5.3: Review panel component (fields + CAR + candidate picker)

**Files:**
- Create: `apps/web/src/components/gta/GtaReviewPanel.vue`

- [ ] **Step 1: Write the component**

```vue
<!-- apps/web/src/components/gta/GtaReviewPanel.vue -->
<template>
  <div class="gta-review" data-testid="gta-review">
    <div v-if="gta.status !== 'ok'" class="gta-warn" data-testid="gta-warn">
      Extração com avisos: {{ gta.warnings.join(', ') || 'revise os dados' }}
    </div>

    <!-- Row 1: Número-Série-UF | CAR -->
    <div class="gta-row">
      <label class="gta-field">
        <span>Número-Série-UF</span>
        <input :value="numeroSerieUf" readonly data-testid="gta-numero" />
      </label>
      <label class="gta-field">
        <span>CAR</span>
        <input
          v-model="carModel"
          :readonly="carLocked"
          :class="{ invalid: carTouched && !carValid }"
          data-testid="gta-car"
          placeholder="UF-1234567-XXXXXXXX…"
          @blur="carTouched = true"
        />
        <small v-if="carLocked" class="gta-lock">CAR do fornecedor (não editável)</small>
        <small v-else-if="carTouched && !carValid" class="gta-err">CAR inválido</small>
      </label>
    </div>

    <label class="gta-field">
      <span>Data de emissão</span>
      <input :value="gta.dataEmissao ?? '—'" readonly data-testid="gta-data" />
    </label>

    <fieldset class="gta-origem">
      <legend>Origem</legend>
      <div class="gta-grid">
        <label><span>Nome</span><input :value="gta.origem.nome ?? '—'" readonly /></label>
        <label><span>CPF/CNPJ</span><input :value="gta.origem.cpfCnpj ?? '—'" readonly /></label>
        <label><span>Estabelecimento</span><input :value="gta.origem.estabelecimento ?? '—'" readonly /></label>
        <label><span>Código Estab.</span><input :value="gta.origem.codigoEstabelecimento ?? '—'" readonly /></label>
        <label><span>Município-UF</span><input :value="municipioUf" readonly /></label>
      </div>
    </fieldset>

    <div v-if="match.kind === 'ambiguous'" class="gta-candidates" data-testid="gta-candidates">
      <p>Vários fornecedores encontrados. Selecione o correto:</p>
      <label v-for="c in match.candidates" :key="c.idFornecedor" class="gta-candidate">
        <input type="radio" :value="c.idFornecedor" v-model="selectedCandidateId" />
        {{ c.nome }} — {{ c.codigoEstabelecimento ?? 's/ código' }} — {{ c.municipio ?? '' }}/{{ c.uf ?? '' }}
        <em v-if="c.car">(CAR: {{ c.car }})</em>
      </label>
    </div>

    <button
      type="button" class="gta-generate" data-testid="gta-generate"
      :disabled="!canGenerate" @click="onGenerate"
    >Gerar Análise</button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { GtaExtraction, GtaMatch, FornecedorCandidate } from '../../api/gta';

const CAR_REGEX = /^[A-Z]{2}-\d{7}-[A-Z0-9]{32}$/;

const props = defineProps<{ gta: GtaExtraction; match: GtaMatch; submitting: boolean }>();
const emit = defineEmits<{
  (e: 'generate', payload: {
    carKey: string;
    matchKind: 'matched_with_car' | 'matched_no_car' | 'none';
    fornecedorId?: string;
  }): void;
}>();

const carTouched = ref(false);
const selectedCandidateId = ref<string | null>(props.match.fornecedor?.idFornecedor ?? null);

const selectedCandidate = computed<FornecedorCandidate | null>(() => {
  if (props.match.kind === 'ambiguous') {
    return props.match.candidates.find((c) => c.idFornecedor === selectedCandidateId.value) ?? null;
  }
  return props.match.fornecedor;
});

// CAR is locked only when a matched fornecedor already has a CAR.
const carLocked = computed(() => !!(selectedCandidate.value?.car && selectedCandidate.value.car.trim()));

const carModel = ref(props.match.fornecedor?.car ?? '');
watch(selectedCandidate, (c) => { carModel.value = c?.car ?? ''; carTouched.value = false; });

const carValid = computed(() => CAR_REGEX.test(carModel.value.trim().toUpperCase()));

const numeroSerieUf = computed(() =>
  [props.gta.numeroGta, props.gta.serieGta, props.gta.ufGta].filter(Boolean).join('-') || '—');
const municipioUf = computed(() =>
  [props.gta.origem.municipio, props.gta.origem.uf].filter(Boolean).join('-') || '—');

// Derive the matchKind sent to the backend from the *current* selection.
const effectiveMatchKind = computed<'matched_with_car' | 'matched_no_car' | 'none'>(() => {
  const c = selectedCandidate.value;
  if (!c) return 'none';
  return c.car && c.car.trim() ? 'matched_with_car' : 'matched_no_car';
});

const canGenerate = computed(() => {
  if (props.submitting) return false;
  if (props.match.kind === 'ambiguous' && !selectedCandidateId.value) return false;
  return carValid.value;
});

function onGenerate() {
  carTouched.value = true;
  if (!canGenerate.value) return;
  emit('generate', {
    carKey: carModel.value.trim().toUpperCase(),
    matchKind: effectiveMatchKind.value,
    fornecedorId: selectedCandidate.value?.idFornecedor,
  });
}
</script>

<style scoped>
.gta-row { display: flex; gap: 16px; }
.gta-field { display: flex; flex-direction: column; flex: 1; gap: 4px; margin-bottom: 12px; }
.gta-field input { padding: 8px 10px; border: 1px solid #cfd4dc; border-radius: 8px; }
.gta-field input.invalid { border-color: #b42318; }
.gta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.gta-warn { background: #fef3c7; color: #92400e; padding: 8px 12px; border-radius: 8px; margin-bottom: 12px; }
.gta-generate { margin-top: 16px; padding: 10px 20px; border: none; border-radius: 8px; background: #2563eb; color: #fff; font-weight: 600; }
.gta-generate:disabled { opacity: .5; cursor: not-allowed; }
.gta-lock { color: #98a2b3; } .gta-err { color: #b42318; }
.gta-candidate { display: block; margin: 6px 0; }
</style>
```

- [ ] **Step 2: Type-check + commit**

Run: `cd apps/web && npx vue-tsc --noEmit`
```bash
git add apps/web/src/components/gta/GtaReviewPanel.vue
git commit -m "feat(web): GTA review panel with CAR + candidate picker"
```

### Task 5.4: Wire GTA mode into NewAnalysisView

**Files:**
- Modify: `apps/web/src/views/NewAnalysisView.vue`

- [ ] **Step 1: Add the toggle button**

Next to the existing radius-mode toggle (near line 8-22), add:

```html
<button
  type="button" class="mode-toggle" data-testid="gta-mode-toggle"
  :class="{ active: gtaMode }" @click="enterGtaMode"
>
  <!-- reuse an icon component already imported in this view (e.g. FileText) -->
  Análise por GTA
</button>
```

- [ ] **Step 2: Add the GTA section markup**

In the template, add a block shown when `gtaMode` is true (mirror how `radiusMode` gates its section):

```html
<section v-if="gtaMode" class="gta-section" data-testid="gta-section">
  <GtaUploadPanel
    v-if="!gtaResult"
    :loading="gtaLoading" :error="gtaError"
    @file="onGtaFile" @invalid="onGtaInvalid"
  />
  <GtaReviewPanel
    v-else
    :gta="gtaResult.gta" :match="gtaResult.match" :submitting="gtaSubmitting"
    @generate="onGtaGenerate"
  />
  <button v-if="gtaResult" type="button" class="link" data-testid="gta-reset" @click="resetGta">
    Enviar outra GTA
  </button>
</section>
```

- [ ] **Step 3: Add the script logic**

In `<script setup>`, add:

```typescript
import GtaUploadPanel from '../components/gta/GtaUploadPanel.vue';
import GtaReviewPanel from '../components/gta/GtaReviewPanel.vue';
import { extractGta, generateGtaAnalysis, type GtaExtractResponse } from '../api/gta';
// useRouter is already used in this view for the radius redirect; reuse that router instance.

const gtaMode = ref(false);
const gtaLoading = ref(false);
const gtaSubmitting = ref(false);
const gtaError = ref<string | null>(null);
const gtaResult = ref<GtaExtractResponse | null>(null);

function enterGtaMode() {
  gtaMode.value = true;
  radiusMode.value = false; // keep modes mutually exclusive
  resetGta();
}
function resetGta() {
  gtaResult.value = null;
  gtaError.value = null;
  gtaLoading.value = false;
}
function onGtaInvalid(message: string) { gtaError.value = message; }

async function onGtaFile(file: File) {
  gtaError.value = null;
  gtaLoading.value = true;
  try {
    gtaResult.value = await extractGta(file);
  } catch (e: any) {
    gtaError.value = e?.response?.data?.error?.message ?? 'Falha ao extrair a GTA.';
  } finally {
    gtaLoading.value = false;
  }
}

async function onGtaGenerate(payload: {
  carKey: string; matchKind: 'matched_with_car' | 'matched_no_car' | 'none'; fornecedorId?: string;
}) {
  if (!gtaResult.value) return;
  gtaSubmitting.value = true;
  try {
    const { analysisId } = await generateGtaAnalysis({
      ...payload,
      origem: gtaResult.value.gta.origem,
    });
    router.push(`/analyses/${analysisId}`); // match the radius redirect style
  } catch (e: any) {
    gtaError.value = e?.response?.data?.error?.message ?? 'Falha ao gerar a análise.';
  } finally {
    gtaSubmitting.value = false;
  }
}
```
Adjust: if the radius toggle sets `radiusMode` and CAR mode is the default, make the three modes mutually exclusive using whatever pattern the view already uses. Reuse the existing `router` instance and redirect path used by `submitRadiusAnalysis`.

- [ ] **Step 4: Type-check + build**

Run: `cd apps/web && npx vue-tsc --noEmit && npm run build`
Expected: no errors, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/views/NewAnalysisView.vue
git commit -m "feat(web): wire Análise por GTA mode into NewAnalysisView"
```

### Task 5.5: Frontend component test

**Files:**
- Create: `apps/web/src/components/gta/__tests__/GtaReviewPanel.spec.ts` (match the repo's test dir convention)

- [ ] **Step 1: Write the test**

```typescript
import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import GtaReviewPanel from '../GtaReviewPanel.vue';

const gta: any = {
  numeroGta: '012345', serieGta: 'A', ufGta: 'GO', dataEmissao: '01/01/2024', sistema: 'SIDAGO',
  origem: { nome: 'X', cpfCnpj: '01279969156', estabelecimento: 'FAZ', codigoEstabelecimento: '52016601239', municipio: 'Novo Brasil', uf: 'GO' },
  destino: {}, status: 'ok', warnings: [],
};

it('locks CAR when matched fornecedor has a CAR', () => {
  const match: any = { kind: 'matched_with_car', fornecedor: { idFornecedor: 'f1', nome: 'X', cpfCnpj: '01279969156', codigoEstabelecimento: '52016601239', municipio: 'Novo Brasil', uf: 'GO', car: 'GO-1234567-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }, candidates: [] };
  const w = mount(GtaReviewPanel, { props: { gta, match, submitting: false } });
  expect(w.get('[data-testid="gta-car"]').attributes('readonly')).toBeDefined();
  expect((w.get('[data-testid="gta-car"]').element as HTMLInputElement).value).toContain('GO-1234567-');
});

it('disables generate until a valid CAR is entered (no match)', async () => {
  const match: any = { kind: 'none', fornecedor: null, candidates: [] };
  const w = mount(GtaReviewPanel, { props: { gta, match, submitting: false } });
  const btn = w.get('[data-testid="gta-generate"]');
  expect((btn.element as HTMLButtonElement).disabled).toBe(true);
  await w.get('[data-testid="gta-car"]').setValue('GO-1234567-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  expect((btn.element as HTMLButtonElement).disabled).toBe(false);
});

it('emits generate with the selected candidate', async () => {
  const match: any = { kind: 'ambiguous', fornecedor: null, candidates: [
    { idFornecedor: 'f1', nome: 'A', cpfCnpj: '01279969156', codigoEstabelecimento: '111', municipio: 'A', uf: 'GO', car: 'GO-1234567-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
    { idFornecedor: 'f2', nome: 'B', cpfCnpj: '01279969156', codigoEstabelecimento: '222', municipio: 'B', uf: 'GO', car: null },
  ] };
  const w = mount(GtaReviewPanel, { props: { gta, match, submitting: false } });
  await w.findAll('input[type="radio"]')[0].setValue();
  await w.get('[data-testid="gta-generate"]').trigger('click');
  expect(w.emitted('generate')?.[0]?.[0]).toMatchObject({ matchKind: 'matched_with_car', fornecedorId: 'f1' });
});
```

- [ ] **Step 2: Run the test**

Run: `cd apps/web && npx vitest run GtaReviewPanel`
Expected: 3 passed. (If the repo uses a different runner/config, match it.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/gta/__tests__/GtaReviewPanel.spec.ts
git commit -m "test(web): GtaReviewPanel behavior"
```

**✅ Stage 5 checkpoint:** full feature works end-to-end. Manual smoke: toggle GTA mode → upload a GTA PDF → review fields → generate → land on the analysis detail page.

---

## Post-implementation

- **Manual Fabric deploy:** publish the updated `update_fornecedor_car_lakehouse.ipynb` to workspace `FABRIC_WORKSPACE_ID`, and confirm staging env has `FABRIC_CAR_UPDATE_MODE=spark_job` + `FABRIC_CAR_UPDATE_ITEM_ID` set. Until then, `insert_fornecedor`/CAR-update are no-ops.
- **Env:** set `GTA_EXTRACTOR_DIR` in staging if `WORKDIR` ≠ repo layout; `GTA_EXTRACT_TIMEOUT_MS` optional.
- **No local Postgres/Fabric:** full e2e can't run locally; the gate is `nest build` (API) + `vue-tsc`/`vite build` (web) + the unit tests above.
- **Phase 2 (deferred):** dedupe the GTA against a base and persist the PDF in Fabric when new.

---

## Self-Review

**Spec coverage:**
- Extraction (Python subprocess, verbatim) → Stage 1 + 2.2 + 2.4. ✓
- Extract+match endpoint, PDF discarded → 3.2 (`finally` rm in service) + 3.1. ✓
- cpf_cnpj match, tiebreak, 4 kinds → 3.1. ✓
- Plain CAR analysis, no provenance → 4.3 (`createForActor({carKey, analysisDate})`). ✓
- Background writes (update / insert), never block → 4.3 (`kickBackgroundWrite`, detached). ✓
- Immutable CAR when found → 5.3 (`carLocked`) + backend `matched_with_car` writes nothing. ✓
- Insert on no-match → 4.1 (notebook) + 4.2 (job/repo) + 4.3. ✓
- First-GTA-only → 1.2 (`records[0]`). ✓
- Candidate picker, switchable → 5.3 (`selectedCandidateId`, re-derives CAR/kind on change). ✓
- Always require Gerar Análise click → 5.3 (no auto-submit; button gated by `canGenerate`). ✓
- Upload UI (PDF-only, 50MB, big dropzone, loading) → 5.2. ✓
- Fields layout (Número-Série-UF | CAR row, data_emissao, origem block) → 5.3. ✓

**Placeholder scan:** the Stage 4.2 `runFornecedorInsertJob` body references a shared `runNotebookJob` helper to be factored from existing code — this is a concrete refactor instruction, not a placeholder, but the implementer must read `runFornecedorCarUpdateJob` (`fabric-client.service.ts:127`) to extract it. Flagged, acceptable.

**Type consistency:** `GtaExtraction`/`GtaMatch`/`FornecedorCandidate`/`GtaMatchKind` defined once in `dto/gta.types.ts` (backend) and mirrored in `api/gta.ts` (frontend); `matchKind` union `matched_with_car|matched_no_car|none` consistent across DTO, service, controller, and frontend emit. CAR regex identical in DTO and `GtaReviewPanel`. `createForActor({carKey, analysisDate})` matches `CreateAnalysisInput`. ✓
