# Tier — Documento/Lote UX + GTA (Sub-project B) — Design

**Status:** approved (design), pending spec review
**Part of:** Tier module enhancements — A (cache/optimistic) → **B (this)** → C (Crédito) → D (Cobranças). Assumes A's TanStack Query layer exists (mutations here become query hooks in `queries.ts`).

## Problem

The Lote documents/GTA/origem UX is rough:
- Document `tipo` is a fixed enum — cannot record a custom document name.
- The file upload is a bare `<input type="file">` (plain text, not obviously an upload).
- GTA is a select-only field with no way to register a new GTA, no PDF, no extracted data.
- Fazendas de origem select has no way to create a farm inline.
- All dropdowns are native `<select>` — no type-to-search.

## Goal

Make document handling flexible (preset + custom names, clear upload affordance), turn GTA into a reusable PDF-backed record auto-filled by extraction (editable, de-duplicated) with its own tab, and add type-to-search comboboxes plus inline farm creation for origem.

## Scope decisions (agreed)

- Document `tipo`: **enum + free `nome`** (option a). Add enum value `OUTRO`.
- GTA stays an entity; **extraction only** in the Tier (no environmental analysis); extracted fields are **editable** (extraction can fail/miss fields); dedup by **(numero, serie, uf)**.
- Searchable dropdown: **custom lightweight combobox** (no new dependency).
- Everything stays in sub-project B (GTA not split out).

## Components

### 1. Documento tipo — model + UI
- **Migration:** `ALTER TABLE app.tier_documento ADD COLUMN nome text;` and `ALTER TYPE app.tier_doc_tipo ADD VALUE IF NOT EXISTS 'OUTRO';`
- **DTO:** `CreateDocumentoDto` gains optional `nome` (string, 1–200). When `tipo = OUTRO`, `nome` is required (validate in service).
- **UI (TierDetailView lote docs):** a `Combobox` of preset types (label ↔ enum) plus an "Outro" choice that reveals a free-text `nome` input. On preset selection, `nome` defaults to the preset label. Display uses `nome ?? tipoLabel(tipo)`.
- **Upload affordance:** replace the bare `<input type="file">` with a styled `UiButton` showing a `UploadCloud` (lucide) icon + "Enviar arquivo"; the real `<input type="file">` is visually hidden and triggered by the button (ref click). Selected filename shown next to it.

### 2. GTA — extraction + editable + dedup + tab
- **`tier_gta` restructure (migration).** Target columns:
  - `id`, `numero text`, `serie text?`, `uf text?`, `data_emissao date?`, `sistema text?`
  - origem: `origem_nome text?`, `origem_cpf_cnpj text?`, `origem_estabelecimento text?`, `origem_car text?`, `origem_municipio text?`, `origem_uf text?`
  - `raw_extraction jsonb?` (full extractor payload), `blob_provider text?`, `blob_container text?`, `blob_path text?`, `mime text?`
  - `created_at`, `updated_at`
  - Drop the old `origem_fazenda_id`, `qtd`, `sexo` (unused). `LoteGta` join table is unchanged (N:N reuse across lotes is the point).
  - Dedup: application-level check on `(numero, serie, uf)` before insert (treat null serie/uf as empty string for the comparison); a matching triple returns the existing GTA instead of creating a duplicate.
- **Reuse extraction:** import `GtaModule` (already exports `GtaExtractionService`) into the Tier GTA module. `GtaExtractionService.extract(buffer, originalName)` runs `extract_gta.py` and returns `{ numeroGta, serieGta, ufGta, dataEmissao, sistema, origem{...}, destino{...}, warnings }`. Map extractor fields → `tier_gta` columns.
- **Endpoints (`v1/tier/gtas`):**
  - `POST /extract` (multipart `file`) → run extraction, return mapped fields **without persisting** (for modal prefill). Reuse the `MAX_PDF_BYTES` file-size limit pattern from `apps/api/src/gta/gta.controller.ts`.
  - `POST /` (multipart `file` optional + edited fields body) → dedup by `(numero,serie,uf)`; if found return existing; else upload PDF to blob + create with fields + `raw_extraction`.
  - `PUT /:id` → edit any stored field (correct extraction mistakes).
  - `GET /`, `GET /:id`, `DELETE /:id` retained. Lote link/unlink (`POST|DELETE /v1/tier/lotes/:loteId/gtas/:gtaId`) retained.
- **GTA tab:** new route `tier/gtas` + entry in `TierNav.vue` (`Tiers · Proprietários · Fazendas · Frigoríficos · GTAs · Abates`) + `GtasView.vue` (list + "Cadastrar GTA" modal: upload PDF → prefill editable form → save). Blob PDF stored under `gta/<id>/...`, reusing the attachments/documentos blob-client pattern.

### 3. Combobox component
- `apps/web/src/components/ui/Combobox.vue` — props `modelValue`, `options: { value: string; label: string }[]`, `placeholder`, optional `allowFreeText`. Text input filters `options` by label (case-insensitive); click/enter selects; emits `update:modelValue`. Keyboard accessible; closes on blur/escape. Exported from `components/ui/index.ts`.
- Used for: document tipo (with `allowFreeText` for "Outro"), GTA select in the lote, fazenda-origem select.

### 4. Inline "+" fazenda on origem
- In the lote origem section, a "+" button next to the origem combobox opens a quick-create modal (`nome` required, `municipio`, `uf` optional) that calls `createFazenda`, then adds the new farm as an origem of the lote (`addLoteOrigem`) and selects it. No CARs in the quick-create (added later via Fazendas tab).

## Data flow
- Doc upload: view → (A) mutation hook → `uploadDocumento` (FormData incl. `nome`) → blob + row → invalidate lote query.
- GTA create: modal uploads PDF → `POST /extract` prefills form → user edits → `POST /` (dedup) → invalidate GTA list + lote.
- Comboboxes read from cached queries (A); selecting drives the same link/add mutations.

## Error handling
- Extraction failure (`extract_gta.py` non-zero / unreadable PDF): endpoint returns a clear error; modal keeps the form empty/editable so the user can fill manually. Surface via toast.
- Dedup hit on create: return existing GTA with an info toast ("GTA já cadastrada — reutilizando").
- `OUTRO` without `nome`: 400 with a field message.

## Testing
- API unit tests (jest, mocked Prisma + mocked `GtaExtractionService`): dedup returns existing on matching triple; create maps extracted→columns; `OUTRO` requires `nome`.
- Web gate: `npm run lint && typecheck && build`. Combobox gets a light vitest (filter logic).
- No live DB locally; migration applied on staging via `prisma migrate deploy`.

## Migration notes / limitations
- `tier_gta` restructure drops `origem_fazenda_id`/`qtd`/`sexo` — **destructive** but tables are empty on staging. Applied via `prisma migrate deploy`.
- `ALTER TYPE ... ADD VALUE 'OUTRO'` — same PG12+ caveat as the initial module migration.
- `extract_gta.py` must be present in the API runtime (`GTA_EXTRACTOR_DIR`) — already required by the existing `v1/analyses/gta` endpoint, so no new infra.
- Out of scope: GTA environmental analysis/match (origem CAR vs LandWatch); Crédito tab (C); Cobranças (D).
