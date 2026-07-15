# Tier Sub-project B — Documento/Lote UX + GTA Implementation Plan

> **For agentic workers (Codex):** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]`. CONTRACT — follow in order, don't touch files outside each task. Spec: `docs/superpowers/specs/2026-07-06-tier-documento-gta-ux-design.md`. Assumes sub-project A (TanStack Query `queries.ts`) is merged.

**Goal:** Documents get a preset+free-text type (combobox) and a clear upload button; GTA becomes a PDF-backed, extraction-filled, editable, de-duplicated entity with its own tab and inline "+" create; add a searchable combobox and inline "+" farm creation for origem.

**Architecture:** Backend — Prisma migration adds `tier_documento.nome` + enum `OUTRO`, restructures `tier_gta` (PDF + extracted fields + `raw_extraction`), and the Tier GTA module reuses `GtaExtractionService` (exported by `GtaModule`). Frontend — a new `Combobox.vue`, GTA tab/view + create-from-PDF modal, doc combobox + upload icon, inline farm-create in the origem section. New mutations/queries added to `features/tier/queries.ts` and `api.ts`.

**Tech Stack:** NestJS 11, Prisma 7 (hand-written SQL migration), `@azure/storage-blob`, `extract_gta.py` (existing), Vue 3.5, `@tanstack/vue-query`, Tailwind, vitest/jest.

## Constraints
- No local DB. Gate api = `npm run prisma:generate && npm run lint:check && npm run test && npm run build`; web = `npm run lint && npm run typecheck && npm run build` (+ `npm run test` for combobox). Migration applied on staging via `prisma migrate deploy`.
- Reuse the blob-client pattern from `apps/api/src/tier/documentos/documentos.service.ts`; reuse `GtaExtractionService` from `apps/api/src/gta` (exported by `GtaModule`). Do NOT modify the existing `apps/api/src/gta` module.
- One task = one commit. No Claude co-author trailer.

## File structure
**API:** modify `prisma/schema.prisma`; new migration; modify `src/tier/documentos/{dto/create-documento.dto,documentos.service}.ts`; rewrite `src/tier/gtas/{gtas.service,gtas.controller,gtas.module,dto/create-gta.dto,gtas.service.spec}.ts`.
**Web:** create `src/components/ui/Combobox.vue` (+ `Combobox.spec.ts`), export from `components/ui/index.ts`; create `src/views/tier/GtasView.vue`; modify `router/index.ts`, `views/tier/TierNav.vue`, `views/tier/TierDetailView.vue`, `features/tier/api.ts`, `features/tier/types.ts`, `features/tier/queries.ts`.

---

### Task 1: Prisma models + migration (documento nome, enum OUTRO, tier_gta restructure)

**Files:** Modify `apps/api/prisma/schema.prisma`; Create `apps/api/prisma/migrations/<ts>_tier_b_documento_gta/migration.sql`

- [ ] **Step 1: schema.prisma — `TierDocTipo` add `OUTRO`** (place before `@@map`):
```prisma
enum TierDocTipo {
  INSCRICAO_ESTADUAL
  PROCURACAO
  CONTRATO_COMODATO
  DOC_PESSOAL
  PARECER_TECNICO
  DECLARACAO_M049
  NF
  OUTRO

  @@map("tier_doc_tipo")
  @@schema("app")
}
```

- [ ] **Step 2: `TierDocumento` — add `nome`** (after `tipo`): `nome String?`

- [ ] **Step 3: Replace the `TierGta` model** with the restructured version (drop `origemFazendaId`,`qtd`,`sexo`; add fields). Also remove the `gtasOrigem TierGta[]` back-relation on `TierFazenda` (no longer referenced):
```prisma
model TierGta {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  numero         String
  serie          String?
  uf             String?
  dataEmissao    DateTime? @map("data_emissao") @db.Date
  sistema        String?
  origemNome     String?  @map("origem_nome")
  origemCpfCnpj  String?  @map("origem_cpf_cnpj")
  origemEstabelecimento String? @map("origem_estabelecimento")
  origemCar      String?  @map("origem_car")
  origemMunicipio String? @map("origem_municipio")
  origemUf       String?  @map("origem_uf")
  rawExtraction  Json?    @map("raw_extraction")
  blobProvider   String?  @map("blob_provider")
  blobContainer  String?  @map("blob_container")
  blobPath       String?  @map("blob_path")
  mime           String?
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  lotes TierLoteGta[]

  @@index([numero])
  @@map("tier_gta")
  @@schema("app")
}
```
Then in `model TierFazenda`, delete the line `gtasOrigem TierGta[]`.

- [ ] **Step 4: Generate.** Run `cd apps/api && npm run prisma:generate`. Expected: PASS (no relation errors).

- [ ] **Step 5: Migration SQL** (timestamp > latest folder). Content:
```sql
-- Tier B: documento nome + tipo OUTRO; restructure tier_gta.
ALTER TABLE app.tier_documento ADD COLUMN IF NOT EXISTS nome text;
ALTER TYPE app.tier_doc_tipo ADD VALUE IF NOT EXISTS 'OUTRO';

ALTER TABLE app.tier_gta DROP CONSTRAINT IF EXISTS tier_gta_origem_fazenda_id_fkey;
ALTER TABLE app.tier_gta DROP COLUMN IF EXISTS origem_fazenda_id;
ALTER TABLE app.tier_gta DROP COLUMN IF EXISTS qtd;
ALTER TABLE app.tier_gta DROP COLUMN IF EXISTS sexo;

ALTER TABLE app.tier_gta ADD COLUMN IF NOT EXISTS serie text;
ALTER TABLE app.tier_gta ADD COLUMN IF NOT EXISTS uf text;
ALTER TABLE app.tier_gta ADD COLUMN IF NOT EXISTS sistema text;
ALTER TABLE app.tier_gta ADD COLUMN IF NOT EXISTS origem_nome text;
ALTER TABLE app.tier_gta ADD COLUMN IF NOT EXISTS origem_cpf_cnpj text;
ALTER TABLE app.tier_gta ADD COLUMN IF NOT EXISTS origem_estabelecimento text;
ALTER TABLE app.tier_gta ADD COLUMN IF NOT EXISTS origem_car text;
ALTER TABLE app.tier_gta ADD COLUMN IF NOT EXISTS origem_municipio text;
ALTER TABLE app.tier_gta ADD COLUMN IF NOT EXISTS origem_uf text;
ALTER TABLE app.tier_gta ADD COLUMN IF NOT EXISTS raw_extraction jsonb;
ALTER TABLE app.tier_gta ADD COLUMN IF NOT EXISTS blob_provider text;
ALTER TABLE app.tier_gta ADD COLUMN IF NOT EXISTS blob_container text;
ALTER TABLE app.tier_gta ADD COLUMN IF NOT EXISTS blob_path text;
ALTER TABLE app.tier_gta ADD COLUMN IF NOT EXISTS mime text;
```
- [ ] **Step 6: Commit.** `git add apps/api/prisma && git commit -m "feat(tier): migration for documento nome + gta restructure"`

---

### Task 2: Documento `nome` (backend)

**Files:** Modify `apps/api/src/tier/documentos/dto/create-documento.dto.ts`, `documentos.service.ts`

- [ ] **Step 1: DTO** — add to `CreateDocumentoDto`: `@IsOptional() @IsString() @Length(1, 200) nome?: string;` and allow `OUTRO` in the `TIPOS` array.
- [ ] **Step 2: Service** — in `upload()`, after the MIME check: `if (dto.tipo === "OUTRO" && !dto.nome?.trim()) throw new BadRequestException({ code: "TIER_DOC_NOME_REQUIRED", message: "Informe o nome do documento" });` and persist `nome: dto.nome ?? null` in `tierDocumento.create`.
- [ ] **Step 3: Test** — add a jest case: uploading `tipo=OUTRO` without `nome` rejects with `TIER_DOC_NOME_REQUIRED` (mock `uploadToBlob`).
- [ ] **Step 4: Gate + commit.** `npm run lint:check && npm run test -- tier/documentos && npm run build` → `git commit -m "feat(tier): documento free-text nome + OUTRO"`

---

### Task 3: GTA module — extraction + dedup + editable + PDF

**Files:** rewrite `apps/api/src/tier/gtas/{dto/create-gta.dto,gtas.service,gtas.controller,gtas.module,gtas.service.spec}.ts`

- [ ] **Step 1: DTO** `dto/create-gta.dto.ts` — the edited-fields payload (all optional except numero):
```ts
import { IsDateString, IsOptional, IsString, Length } from "class-validator";
export class SaveGtaDto {
  @IsString() @Length(1, 60) numero!: string;
  @IsOptional() @IsString() serie?: string;
  @IsOptional() @IsString() uf?: string;
  @IsOptional() @IsDateString() dataEmissao?: string;
  @IsOptional() @IsString() sistema?: string;
  @IsOptional() @IsString() origemNome?: string;
  @IsOptional() @IsString() origemCpfCnpj?: string;
  @IsOptional() @IsString() origemEstabelecimento?: string;
  @IsOptional() @IsString() origemCar?: string;
  @IsOptional() @IsString() origemMunicipio?: string;
  @IsOptional() @IsString() origemUf?: string;
}
```

- [ ] **Step 2: Service** `gtas.service.ts` — inject `GtaExtractionService` (from `GtaModule`) + `PrismaService`. Methods:
  - `list(search?)`, `get(id)`, `delete(id)` — as before (delegate `tierGta`).
  - `async extract(file)` → returns `this.gtaExtraction.extract(file.buffer, file.originalname)` mapped to the flat GTA fields (numero=numeroGta, serie=serieGta, uf=ufGta, dataEmissao, sistema, origem* from `extraction.origem`) — no persist.
  - `async create(dto: SaveGtaDto, file?)`:
    - Dedup: `const existing = await prisma.tierGta.findFirst({ where: { numero: dto.numero, serie: dto.serie ?? null, uf: dto.uf ?? null } });` if found, return `{ ...existing, _deduped: true }`.
    - Else: if `file`, upload to blob (reuse the exact blob-client pattern from `documentos.service.ts`; container `process.env.TIER_BLOB_CONTAINER ?? process.env.ATTACHMENTS_BLOB_CONTAINER ?? "attachments"`; path `gta/${safe(dto.numero)}/${Date.now()}-${safeName}`; MIME must be `application/pdf`). Then `prisma.tierGta.create` with the dto fields + blob fields + `rawExtraction` (pass extraction JSON if provided via a hidden field, else null).
  - `async update(id, dto)` → `prisma.tierGta.update` with provided fields.
- [ ] **Step 3: Controller** `gtas.controller.ts` (`@Controller('v1/tier/gtas')`, `requireTier` on each):
  - `POST /extract` `@UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50*1024*1024 } }))` → `service.extract(file)`.
  - `POST /` `@UseInterceptors(FileInterceptor('file', {...}))` with `@Body() dto: SaveGtaDto` → `service.create(dto, file)`.
  - `GET /`, `GET /:id`, `PUT /:id` (`@Body() dto`), `DELETE /:id`.
- [ ] **Step 4: Module** — `imports: [GtaModule]` (from `../../gta/gta.module`), controllers/providers as before.
- [ ] **Step 5: Spec** (`gtas.service.spec.ts`, jest, mock Prisma + `GtaExtractionService`):
  - `create` returns existing (`_deduped`) when `findFirst` matches `(numero,serie,uf)`.
  - `create` maps extracted origem fields into columns.
  - `extract` maps `numeroGta→numero`, `serieGta→serie`, `origem.nome→origemNome`.
- [ ] **Step 6: Gate + commit.** `npm run lint:check && npm run test -- tier/gtas && npm run build` → `git commit -m "feat(tier): gta extraction, dedup, editable + pdf"`

---

### Task 4: Combobox component (web)

**Files:** Create `apps/web/src/components/ui/Combobox.vue`, `Combobox.spec.ts`; Modify `components/ui/index.ts`

- [ ] **Step 1: Failing test** `Combobox.spec.ts` for the pure filter helper. Export a `filterOptions(options, term)` from the component's `<script>` via a separate `combobox-filter.ts` util and test it:
  - Create `apps/web/src/components/ui/combobox-filter.ts`: `export function filterOptions(o: {value:string;label:string}[], term:string){ const t=term.trim().toLowerCase(); return t? o.filter(x=>x.label.toLowerCase().includes(t)) : o; }`
  - Test: filters by label case-insensitively; empty term returns all.
- [ ] **Step 2: Component** `Combobox.vue` — props `modelValue: string`, `options: {value;label}[]`, `placeholder?`, `allowFreeText?: boolean`; a text `<input>` bound to an internal `query` ref showing the selected label; a dropdown `<ul>` of `filterOptions(options, query)`; clicking an option emits `update:modelValue` with its value and sets the input to its label; with `allowFreeText`, on blur/enter emit the raw typed text as the value. Close on outside-click/escape; keyboard focus visible. Tailwind styling consistent with `Input.vue`.
- [ ] **Step 3: Export** — add `export { default as Combobox } from "./Combobox.vue";` to `components/ui/index.ts`.
- [ ] **Step 4: Gate + commit.** `npm run test -- combobox && npm run lint && npm run typecheck && npm run build` → `git commit -m "feat(tier-web): searchable combobox component"`

---

### Task 5: web api + types + queries for GTA extract/create

**Files:** Modify `apps/web/src/features/tier/{types,api,queries}.ts`

- [ ] **Step 1: types** — replace `Gta` interface fields to match the new columns (`numero, serie, uf, dataEmissao, sistema, origemNome, origemCpfCnpj, origemEstabelecimento, origemCar, origemMunicipio, origemUf, blobPath, mime`); add `GtaExtractionResult` type mirroring the `/extract` mapped response.
- [ ] **Step 2: api.ts** — add `extractGta(form: FormData)` (`POST /v1/tier/gtas/extract`), change `createGta` to accept `FormData` (multipart, PDF + fields), keep `updateGta(id, body)`, `listGtas`, `deleteGta`.
- [ ] **Step 3: queries.ts** — `useExtractGta` (plain mutation, no invalidate), keep `useCreateGta` (invalidate `["tier","gtas"]`), `useUpdateGta`, `useDeleteGta`.
- [ ] **Step 4: Gate + commit.** `npm run typecheck && npm run lint && npm run build` → `git commit -m "feat(tier-web): gta extract/create api + hooks"`

---

### Task 6: GTA tab (web)

**Files:** Create `apps/web/src/views/tier/GtasView.vue`; Modify `router/index.ts`, `views/tier/TierNav.vue`

- [ ] **Step 1: Route** — add `{ path: "tier/gtas", component: () => import("../views/tier/GtasView.vue"), meta: { title: "Tier — GTAs", feature: "TIER" } }` (before `tier/:id`).
- [ ] **Step 2: TierNav** — add tab `{ label: "GTAs", to: "/tier/gtas", match: (p) => p.startsWith("/tier/gtas") }` (between Frigoríficos and Abates) and add `/tier/gtas` to the `SUB` array.
- [ ] **Step 3: GtasView** — `<TierNav />` + list table (numero, serie, uf, dataEmissao, origem) with delete; "Cadastrar GTA" modal: file input (PDF) → on select call `useExtractGta` → prefill an editable form (all fields) → "Salvar" calls `useCreateGta` with FormData (PDF + edited fields). If create returns `_deduped`, toast "GTA já cadastrada — reutilizando".
- [ ] **Step 4: Gate + commit.** web gate → `git commit -m "feat(tier-web): gta tab with pdf extraction"`

---

### Task 7: Lote GTA searchable select + "+" (web)

**Files:** Modify `apps/web/src/views/tier/TierDetailView.vue`

- [ ] **Step 1:** Replace the GTA `<UiSelect>` in each lote with `<UiCombobox :options="gtaOptions" v-model="gtaPick[lote.id]" placeholder="Buscar GTA…" />` where `gtaOptions = computed(() => allGtas.value.map(g => ({ value: g.id, label: `${g.numero}${g.serie ? "/"+g.serie : ""}` })))`. Keep the "Vincular" button (`linkGta`).
- [ ] **Step 2:** Add a "+" button next to it opening a **GTA create modal** (reuse the same extract→prefill→create flow as GtasView; extract the modal into a shared component `apps/web/src/views/tier/GtaCreateModal.vue` used by both GtasView and here). On create success, `linkGta(lote.id)` with the new GTA id.
- [ ] **Step 3:** Gate + commit `feat(tier-web): searchable gta select + inline create in lote`.

---

### Task 8: Documento combobox + upload icon; "+" fazenda origem (web)

**Files:** Modify `apps/web/src/views/tier/TierDetailView.vue`; reuse `api.createFazenda`

- [ ] **Step 1: Doc type combobox** — replace the doc `<UiSelect>` with `<UiCombobox :options="DOC_TIPOS" v-model="docTipo[lote.id]" allow-free-text placeholder="Tipo do documento…" />` where `DOC_TIPOS` is the preset list `[{value:"DECLARACAO_M049",label:"M049"},…,{value:"OUTRO",label:"Outro"}]`. When the chosen value is not a known enum key, send `tipo="OUTRO"` + `nome=<typed>`; else `tipo=<value>`, `nome=<label>`. Update `onFile` to append `nome`.
- [ ] **Step 2: Upload icon** — replace the bare `<input type="file">` with a styled `UiButton` (icon `UploadCloud` from `lucide-vue-next`) that triggers a hidden `<input ref>`; show the picked filename.
- [ ] **Step 3: "+" fazenda origem** — next to the origem `<UiCombobox>` (also swap origem select to combobox using `fazendaOptions`), add a "+" opening a quick-create modal (`nome` required, `municipio`, `uf`) → `api.createFazenda` (via a `useCreateFazenda` call or direct) → invalidate fazendas → `addLoteOrigem(lote.id, novaFazenda.id)`.
- [ ] **Step 4:** Gate + commit `feat(tier-web): doc combobox + upload icon + inline origem farm`.

---

## Self-review
- **Spec coverage:** doc nome+OUTRO+combobox (T1,T2,T8) ✓; upload icon (T8) ✓; GTA restructure+extract+dedup+editable+PDF (T1,T3,T5) ✓; GTA tab (T6) ✓; lote GTA searchable + "+" (T7) ✓; combobox component (T4) ✓; inline origem farm (T8) ✓.
- **Placeholder scan:** core code (migration, DTO, service dedup/extract, combobox filter) is concrete; UI wiring tasks give exact props/handlers. GtaCreateModal shared component avoids duplicated modal logic (T6/T7).
- **Type consistency:** `SaveGtaDto` fields ↔ `TierGta` columns ↔ web `Gta` type ↔ `extract` mapping all use the same names (numero/serie/uf/sistema/origem*). `tier_doc_tipo` `OUTRO` used in DTO + UI.
- **Limitations:** migration `ADD VALUE 'OUTRO'` PG12+ caveat; `tier_gta` restructure is destructive (empty on staging); `extract_gta.py` runtime required (already present); GTA environmental analysis/match still out of scope.
