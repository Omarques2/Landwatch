# Tier Module Implementation Plan

> **For agentic workers (Codex):** This plan is a CONTRACT. Implement it task-by-task, in order. Do NOT invent scope, do NOT change conventions, do NOT touch files outside the "Files" list of the task you are on. Steps use checkbox (`- [ ]`) syntax. If something in the plan appears wrong or blocked, STOP and report — do not improvise a different design. Read Section 0 (context), Section 1 (guardrails) and Section 2 (conventions) in full before writing any code.

**Goal:** Add a self-contained "Tier" module (cattle-traceability control) to the LandWatch monorepo — a new sidebar tab in the Vue web app backed by new NestJS + Prisma resources — that replaces the current Excel-and-folders workflow with structured CRUD, document upload to Azure Blob, and computed credit/saldo, communicating with existing LandWatch data (environmental analysis by CAR number).

**Architecture:** New Prisma models in the existing `app` Postgres schema (table prefix `tier_`), exposed by new Nest feature modules under `apps/api/src/tier/`, following the exact patterns of the existing `cars`/`fornecedores` modules (versioned `v1/tier/*` controllers, global auth guard + `ActorContext`/`AccessService` tenant gating, envelope responses, class-validator DTOs). Files are uploaded to Azure Blob reusing the `attachments.service.ts` pattern. Frontend adds one sidebar tab and a set of Vue views using the shared `http` axios client. Environmental analysis is NOT stored — Tier `Car` rows hold the CAR number string and are joined to the external `landwatch` schema by `feature_key` via raw SQL, reusing the existing join pattern.

**Tech Stack:** NestJS 11, Prisma 7 (pg adapter, hand-written SQL migrations), PostgreSQL (schema `app` for our tables, external schema `landwatch` read-only), Azure Blob (`@azure/storage-blob`), Vue 3 `<script setup>`, Vue Router 4, Vite 7, Tailwind 4, shadcn-vue, axios. Zod env validation. Jest (api unit tests, mocked Prisma), Vitest (web).

---

## Section 0 — Project context (READ FIRST)

### 0.1 What the Tier is (domain)

A **frigorífico** (meatpacking company, e.g. Grupo Minerva) buys cattle and must prove the animals come from farms that are environmentally compliant. Sigfarm provides this compliance service. Today the control is kept in Excel spreadsheets + shared folders (see repo root `Tier/11. Frigorífico_Tier_Couro/`, which is **reference data only, not code**). This module moves that control into LandWatch.

**Why inside LandWatch:** the operator already uses LandWatch for the environmental analysis (deforestation / embargo intersections per farm), farm data, and CAR numbers, and there is already a connection to the Fabric data tables. Keeping the Tier control in the same app removes double-entry. **But it is a separate application area** — the Tier farm registry is NOT the LandWatch farm registry; they are distinct cadastros that merely communicate. Do not merge them.

**Why Postgres + Blob (not Fabric):** the Fabric connection is too slow and partly notebook-bound. Structured transactional data goes to Postgres; files go to Azure Blob.

### 0.2 Glossary (use these exact terms in code/UI)

| Term | Meaning |
|------|---------|
| **Proprietario** | Single registry of a person/company. Owns animals and/or farms. Replaces the old "cliente vs proprietário" split. |
| **Fazenda** | An operational establishment (a confinamento/destination or an origem/supplier farm). Has one optional owner (`proprietario_dono`). |
| **Car** | A CAR (rural environmental registry) parcel. A Fazenda has **1:N** CARs — leased/owned areas each with their own CAR. The CAR number is the join key to LandWatch analysis. |
| **Frigorifico** | The abate (slaughter) unit. Optionally belongs to a **GrupoFrigorifico** (e.g. Grupo Minerva → Minerva Barretos, Minerva Araguaína). A small standalone frigorífico has no group. |
| **Tier** | The core record: a set of animals of ONE proprietário at ONE fazenda. Holds `qtd_animais`, an all-or-nothing approval `status`, and a **frozen snapshot** of the owner's contract values. |
| **Lote** | Child of a Tier. Only a bucket to organize documents (M049, NF, GTA). Has an **editable name** (often fictitious). Has NO animal quantity — animals belong to the Tier. |
| **Abate** | A slaughter event. Optionally references which Tier(s) it consumed, with a quantity per tier (`AbateTier` ledger). If no tier is known, the link is null and the abate does not affect credit. |
| **Contrato** | Two per-animal commission values on the Proprietario: `contrato_valor_animal` (default R$1.50, charged per animal regardless of approval) and `contrato_valor_adicional_aprovado` (extra per approved animal). Copied into each Tier at creation; editable per tier; never auto-updates. |

### 0.3 Data model (authoritative)

Entities and relationships (all Prisma-owned tables live in schema `app`, prefix `tier_`):

```
Proprietario (1) ──< Fazenda.proprietario_dono           (owner, optional)
Fazenda (1) ──────< Car                                   (1:N — leased/owned areas)
GrupoFrigorifico (1) ──< Frigorifico                      (optional group)
Tier ── proprietario_id (required) ── fazenda_id (required) ── frigorifico_id (optional)
Tier (1) ─────────< Lote                                  (Lote = doc bucket)
Lote (1) ─────────< Documento (escopo=LOTE)               (also PROPRIETARIO/FAZENDA/CAR/TIER/FRIGORIFICO)
Lote ──< LoteGta >── Gta                                  (N:N)
Lote (1) ─────────< LoteOrigem ── fazenda_origem          (supplier farms)
Abate ──< AbateTier >── Tier                              (N:N with qtd_consumida; tier_id nullable)
```

Computed (NO tables — SQL aggregation on read):
- `saldo(tier)` = `tier.qtd_animais − Σ AbateTier.qtd_consumida (tier approved)`
- `credito(proprietario)` = `Σ qtd_animais of APROVADO tiers − Σ abatido` = Aprovados − Abatidos
- `receita(tier)` = `qtd_animais × contrato_valor_animal + (status=APROVADO ? qtd_animais × contrato_valor_adicional_aprovado : 0)`

The full visual spec was reviewed and approved; this plan is its implementation.

---

## Section 1 — Hard constraints & guardrails (LIMITATIONS)

**These are non-negotiable. Violating any of them is a plan failure.**

1. **No local database.** There is NO local Postgres; only remote staging Azure. You CANNOT run `prisma migrate dev`, `db:reset`, `db:seed:test`, or any e2e that hits a DB. **Migrations are written BY HAND** as raw SQL following the existing style (Section 4). Your only local DB-related gate is `npm run prisma:generate` (validates schema.prisma, needs no DB) and `npm run build`.
2. **Local verification gate = build + lint + unit tests only.** For every api task the definition of done is: `npm run prisma:generate` succeeds, `npm run lint:check` passes, `npm run test` passes, `npm run build` (`nest build`) passes — all in `apps/api`. For web: `npm run lint`, `npm run test`, `npm run typecheck`, `npm run build` in `apps/web`. Do not claim anything works against a live DB.
3. **Unit tests mock Prisma.** Service tests use a mocked `PrismaService` (jest). Do NOT write tests that require a real connection. Follow the existing `*.spec.ts` style in `apps/api/src/`.
4. **Do NOT modify shared infrastructure.** Off-limits unless a task explicitly says so: `prisma/schema.prisma` datasource/generator blocks, `PrismaService`/`PrismaModule`, `app.module.ts` (except adding `TierModule` to the imports array — that one line only), `main.ts`, auth guards/services, `EnvelopeInterceptor`, `config.schema.ts` (except adding the documented Tier env keys), the `attachments` module. Reuse them; don't refactor them.
5. **Stay in schema `app`.** All new tables use the existing `app` Postgres schema with the `tier_` table-name prefix. Do NOT add a new Postgres schema, do NOT change `schemas = [...]` in the datasource, do NOT touch `search_path` logic. (A dedicated `tier` schema was considered and rejected to avoid touching `PrismaService`.)
6. **Environmental analysis is a reference, never a file.** `tier_car` stores the CAR number string only. Never store analysis PDFs/geojson. Read LandWatch analysis via raw SQL against the `landwatch` schema, reusing the `cars.service.ts` pattern (Section 5, Task B7). Any interpolated schema/identifier MUST go through the existing `assertIdentifier()` guard; all values are bound params.
7. **Follow existing conventions exactly** (Section 2). Versioned controllers `v1/tier/...`, envelope responses (return arrays/objects or `{page,pageSize,total,rows}`), class-validator DTOs with the global ValidationPipe settings, tenant gating via `ActorContext` + `AccessService.requireTenantFeature(actor, 'TIER')`. Do not introduce new libraries, a new HTTP client, a new state manager, or a new component kit.
8. **Scope freeze.** Build ONLY the entities and endpoints in this plan. No "nice to have" fields, no extra endpoints, no auth changes, no new roles. If the plan doesn't mention it, don't build it. The Excel files and old folders are NOT to be imported/parsed by this module (a future migration script is out of scope).
9. **Money as integers-of-cents or Prisma Decimal.** Use Prisma `Decimal @db.Decimal(12,2)` for contract values and any money; never JS floats. Quantities are `Int`.
10. **Commit per task.** One task = one commit, using the message shown in the task's final step. Do not batch multiple tasks into one commit. Never commit secrets or `.env*`.
11. **Portuguese domain terms, English framework code.** Entity/field names use the domain terms above (Portuguese, snake_case in DB via `@map`). Comments and generic code in the repo's existing language. UI copy in Portuguese (matches existing views).

---

## Section 2 — Conventions you MUST follow (with references)

**API (`apps/api`)**
- Module folder = `apps/api/src/tier/` with sub-resources; each resource has `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.spec.ts`, and `dto/`. Model on `apps/api/src/cars/` and `apps/api/src/fornecedores/`.
- Register the top-level `TierModule` in `apps/api/src/app.module.ts` imports array (single-line addition).
- Controllers: `@Controller('v1/tier/<resource>')`. Protected by default (global `GlobalAuthGuard`). At the top of each handler: `const actor = await this.actorContext.fromRequest(req, { orgMode: 'tenant' }); await this.access.requireTenantFeature(actor, 'TIER');`
- Prisma: models in `apps/api/prisma/schema.prisma` with `@@map`, `@@schema("app")`, snake_case `@map`, `@db.Uuid` ids `@default(dbgenerated("gen_random_uuid()"))`, `@db.Timestamptz(6)` timestamps, relations with explicit `@relation(..., onDelete: ...)`.
- Migrations: hand-written `apps/api/prisma/migrations/<timestamp>_<name>/migration.sql`, fully-qualified `app.` names, `CREATE TABLE IF NOT EXISTS`, guarded `DO $$ ... CREATE TYPE`, `CREATE INDEX IF NOT EXISTS`. Timestamp format `YYYYMMDDHHMMSS`.
- DTOs: class-validator. Query DTOs coerce with `@Type(() => Number)`. Global ValidationPipe = `{ whitelist: true, forbidNonWhitelisted: true, transform: true }` (already set).
- Errors: throw `new BadRequestException({ code, message })` / `NotFoundException` / `ForbiddenException({ code, message, details })`.
- Blob upload: reuse the pattern in `apps/api/src/attachments/attachments.service.ts` (`BlobServiceClient.fromConnectionString(...).getContainerClient(container).getBlockBlobClient(path).uploadData(buffer, { blobHTTPHeaders })`). Do NOT re-implement a different uploader.

**Web (`apps/web`)**
- Add a route in `apps/web/src/router/index.ts` (child of AppShell, `meta: { requiresAuth: true, title, feature: 'TIER' }`, lazy `() => import(...)`).
- Add the sidebar tab in `apps/web/src/views/AppShellView.vue`: an entry in `baseNavItems` (`{ key: 'tier', label: 'Tier', icon: <lucide icon>, feature: 'TIER' }`), an `activeKey` path-prefix case, and a `navigate('tier')` → `router.push('/tier')` case.
- Data access: shared axios `http` from `@/api/http`; unwrap with `unwrapData`/`unwrapPaged` from `@/api/envelope`. Reusable API fns go in `apps/web/src/features/tier/api.ts` with types in `apps/web/src/features/tier/types.ts`.
- Views under `apps/web/src/views/tier/`. Styling = Tailwind utility classes + shadcn-vue primitives from `@/ui` and `@/components`; icons from `lucide-vue-next`. Model list pages on `SchedulesView.vue`, forms on `NewAnalysisView.vue`/`SchedulesView.vue` create-modal.

**Feature flag:** endpoints and the route are gated by the tenant feature `TIER`. Enabling it for an org (a row in `orgFeatureAccess`) is an operational step done in staging, NOT part of this code plan — note it in the PR description.

---

## Section 3 — File structure map

**Create (api):**
```
apps/api/prisma/migrations/<ts>_tier_module/migration.sql
apps/api/src/tier/tier.module.ts                      # aggregates all tier sub-modules
apps/api/src/tier/common/tier-access.ts               # tiny helper: resolve actor + requireTenantFeature('TIER')
apps/api/src/tier/proprietarios/{proprietarios.module,controller,service,service.spec}.ts
apps/api/src/tier/proprietarios/dto/{create-proprietario.dto,update-proprietario.dto,list-proprietarios.query}.ts
apps/api/src/tier/fazendas/{...}.ts  + dto/
apps/api/src/tier/cars/{...}.ts      + dto/
apps/api/src/tier/frigorificos/{...}.ts (+ grupos) + dto/
apps/api/src/tier/tiers/{...}.ts     + dto/           # the Tier entity + snapshot + saldo/credito
apps/api/src/tier/lotes/{...}.ts     + dto/
apps/api/src/tier/documentos/{...}.ts + dto/          # Blob upload
apps/api/src/tier/abates/{...}.ts    + dto/           # Abate + AbateTier ledger
apps/api/src/tier/gtas/{...}.ts      + dto/
apps/api/src/tier/analise/{analise.module,controller,service}.ts   # CAR→landwatch join (read-only)
```
**Modify (api):** `apps/api/prisma/schema.prisma` (add models), `apps/api/src/app.module.ts` (add `TierModule` to imports), `apps/api/src/config/config.schema.ts` (add Tier Blob container key if a separate container is used — see Task A2).

**Create (web):**
```
apps/web/src/features/tier/api.ts
apps/web/src/features/tier/types.ts
apps/web/src/views/tier/TierListView.vue          # list of tiers (landing of the tab)
apps/web/src/views/tier/TierDetailView.vue        # one tier: data, lotes, documents, saldo
apps/web/src/views/tier/ProprietariosView.vue
apps/web/src/views/tier/FazendasView.vue
apps/web/src/views/tier/FrigorificosView.vue
apps/web/src/views/tier/AbatesView.vue            # create abate w/ tier-saldo selection
```
**Modify (web):** `apps/web/src/router/index.ts`, `apps/web/src/views/AppShellView.vue`.

---

## Section 4 — Data layer (do this first, exactly)

### Task A1: Prisma models

**Files:** Modify `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Append the Tier models** to the END of `schema.prisma` (do not touch datasource/generator or existing models). Match existing mapping conventions precisely.

```prisma
enum TierStatus {
  SUBMETIDO
  APROVADO
  RECUSADO

  @@schema("app")
}

enum TierCarVinculo {
  PROPRIO
  ARRENDAMENTO
  COMODATO

  @@schema("app")
}

enum TierDocTipo {
  INSCRICAO_ESTADUAL
  PROCURACAO
  CONTRATO_COMODATO
  DOC_PESSOAL
  PARECER_TECNICO
  DECLARACAO_M049
  NF

  @@schema("app")
}

enum TierDocEscopo {
  PROPRIETARIO
  FAZENDA
  CAR
  TIER
  LOTE
  FRIGORIFICO

  @@schema("app")
}

model TierProprietario {
  id                             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  nome                           String
  cpfCnpj                        String?  @map("cpf_cnpj")
  tipo                           String   // "PF" | "PJ"
  inscricaoEstadual              String?  @map("inscricao_estadual")
  grupo                          String?
  municipio                      String?
  estado                         String?
  contratoValorAnimal            Decimal  @default(1.50) @map("contrato_valor_animal") @db.Decimal(12, 2)
  contratoValorAdicionalAprovado Decimal  @default(0) @map("contrato_valor_adicional_aprovado") @db.Decimal(12, 2)
  createdAt                      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt                      DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  fazendas TierFazenda[]
  tiers    Tier[]

  @@map("tier_proprietario")
  @@schema("app")
}

model TierFazenda {
  id                 String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  nome               String
  municipio          String?
  estado             String?
  proprietarioDonoId String?  @map("proprietario_dono_id") @db.Uuid
  sistema            String?  // "Boitel" | "Confinamento"
  createdAt          DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt          DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  proprietarioDono TierProprietario? @relation(fields: [proprietarioDonoId], references: [id], onDelete: SetNull)
  cars             TierCar[]
  tiers            Tier[]
  lotesOrigem      TierLoteOrigem[]
  gtasOrigem       TierGta[]

  @@index([proprietarioDonoId])
  @@map("tier_fazenda")
  @@schema("app")
}

model TierCar {
  id                String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  fazendaId         String         @map("fazenda_id") @db.Uuid
  carNumero         String         @map("car_numero")
  vinculo           TierCarVinculo @default(PROPRIO)
  titularNome       String?        @map("titular_nome")
  titularCpfCnpj    String?        @map("titular_cpf_cnpj")
  municipio         String?
  uf                String?
  areaHa            Decimal?       @map("area_ha") @db.Decimal(14, 4)
  landwatchAnaliseId String?       @map("landwatch_analise_id")
  analiseStatus     String?        @map("analise_status")
  analiseSnapshotAt DateTime?      @map("analise_snapshot_at") @db.Timestamptz(6)
  createdAt         DateTime       @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime       @updatedAt @map("updated_at") @db.Timestamptz(6)

  fazenda TierFazenda @relation(fields: [fazendaId], references: [id], onDelete: Cascade)

  @@index([fazendaId])
  @@index([carNumero])
  @@map("tier_car")
  @@schema("app")
}

model TierGrupoFrigorifico {
  id           String            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  nome         String
  createdAt    DateTime          @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt    DateTime          @updatedAt @map("updated_at") @db.Timestamptz(6)
  frigorificos TierFrigorifico[]

  @@map("tier_grupo_frigorifico")
  @@schema("app")
}

model TierFrigorifico {
  id                String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  nome              String
  inscricaoEstadual String?  @map("inscricao_estadual")
  cpfCnpj           String?  @map("cpf_cnpj")
  municipio         String?
  endereco          String?
  lat               Decimal? @db.Decimal(10, 7)
  lon               Decimal? @db.Decimal(10, 7)
  grupoId           String?  @map("grupo_id") @db.Uuid
  createdAt         DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  grupo  TierGrupoFrigorifico? @relation(fields: [grupoId], references: [id], onDelete: SetNull)
  tiers  Tier[]
  abates TierAbate[]

  @@index([grupoId])
  @@map("tier_frigorifico")
  @@schema("app")
}

model Tier {
  id                             String     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  proprietarioId                 String     @map("proprietario_id") @db.Uuid
  fazendaId                      String     @map("fazenda_id") @db.Uuid
  frigorificoId                  String?    @map("frigorifico_id") @db.Uuid
  qtdAnimais                     Int        @map("qtd_animais")
  status                         TierStatus @default(SUBMETIDO)
  data                           DateTime?  @db.Date
  validadoPor                    String?    @map("validado_por")
  dataAprovacao                  DateTime?  @map("data_aprovacao") @db.Timestamptz(6)
  contratoValorAnimal            Decimal    @map("contrato_valor_animal") @db.Decimal(12, 2)
  contratoValorAdicionalAprovado Decimal    @map("contrato_valor_adicional_aprovado") @db.Decimal(12, 2)
  createdAt                      DateTime   @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt                      DateTime   @updatedAt @map("updated_at") @db.Timestamptz(6)

  proprietario TierProprietario @relation(fields: [proprietarioId], references: [id], onDelete: Restrict)
  fazenda      TierFazenda      @relation(fields: [fazendaId], references: [id], onDelete: Restrict)
  frigorifico  TierFrigorifico? @relation(fields: [frigorificoId], references: [id], onDelete: SetNull)
  lotes        TierLote[]
  consumos     TierAbateConsumo[]

  @@index([proprietarioId])
  @@index([fazendaId])
  @@index([status])
  @@map("tier")
  @@schema("app")
}

model TierLote {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tierId    String   @map("tier_id") @db.Uuid
  nome      String
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  tier       Tier             @relation(fields: [tierId], references: [id], onDelete: Cascade)
  documentos TierDocumento[]
  gtas       TierLoteGta[]
  origens    TierLoteOrigem[]

  @@index([tierId])
  @@map("tier_lote")
  @@schema("app")
}

model TierAbate {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  dataAbate     DateTime @map("data_abate") @db.Date
  frigorificoId String?  @map("frigorifico_id") @db.Uuid
  qtd           Int
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt     DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  frigorifico TierFrigorifico?   @relation(fields: [frigorificoId], references: [id], onDelete: SetNull)
  consumos    TierAbateConsumo[]

  @@index([frigorificoId])
  @@map("tier_abate")
  @@schema("app")
}

model TierAbateConsumo {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  abateId      String   @map("abate_id") @db.Uuid
  tierId       String?  @map("tier_id") @db.Uuid
  qtdConsumida Int      @map("qtd_consumida")
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  abate TierAbate @relation(fields: [abateId], references: [id], onDelete: Cascade)
  tier  Tier?     @relation(fields: [tierId], references: [id], onDelete: SetNull)

  @@index([abateId])
  @@index([tierId])
  @@map("tier_abate_consumo")
  @@schema("app")
}

model TierDocumento {
  id             String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tipo           TierDocTipo
  escopo         TierDocEscopo
  refId          String        @map("ref_id") @db.Uuid
  loteId         String?       @map("lote_id") @db.Uuid
  dataRef        DateTime?     @map("data_ref") @db.Date
  statusValidacao String?      @map("status_validacao")
  validadoPor    String?       @map("validado_por")
  blobProvider   String?       @map("blob_provider")
  blobContainer  String?       @map("blob_container")
  blobPath       String        @map("blob_path")
  mime           String?
  createdAt      DateTime      @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime      @updatedAt @map("updated_at") @db.Timestamptz(6)

  lote TierLote? @relation(fields: [loteId], references: [id], onDelete: Cascade)

  @@index([escopo, refId])
  @@index([loteId])
  @@map("tier_documento")
  @@schema("app")
}

model TierGta {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  numero         String
  dataEmissao    DateTime? @map("data_emissao") @db.Date
  origemFazendaId String?  @map("origem_fazenda_id") @db.Uuid
  qtd            Int?
  sexo           String?
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  origemFazenda TierFazenda?  @relation(fields: [origemFazendaId], references: [id], onDelete: SetNull)
  lotes         TierLoteGta[]

  @@index([numero])
  @@map("tier_gta")
  @@schema("app")
}

model TierLoteGta {
  loteId String @map("lote_id") @db.Uuid
  gtaId  String @map("gta_id") @db.Uuid

  lote TierLote @relation(fields: [loteId], references: [id], onDelete: Cascade)
  gta  TierGta  @relation(fields: [gtaId], references: [id], onDelete: Cascade)

  @@id([loteId, gtaId])
  @@map("tier_lote_gta")
  @@schema("app")
}

model TierLoteOrigem {
  loteId         String @map("lote_id") @db.Uuid
  fazendaOrigemId String @map("fazenda_origem_id") @db.Uuid

  lote          TierLote    @relation(fields: [loteId], references: [id], onDelete: Cascade)
  fazendaOrigem TierFazenda @relation(fields: [fazendaOrigemId], references: [id], onDelete: Cascade)

  @@id([loteId, fazendaOrigemId])
  @@map("tier_lote_origem")
  @@schema("app")
}
```

- [ ] **Step 2: Regenerate the client.**

Run: `cd apps/api && npm run prisma:generate`
Expected: PASS (no DB needed). "Generated Prisma Client" printed, no schema validation errors. If it errors on relation names, fix the reported line — do not change conventions.

- [ ] **Step 3: Commit.**

```bash
cd apps/api && git add prisma/schema.prisma
git commit -m "feat(tier): add Prisma models for tier module"
```

### Task A2: Config env keys (only if using a dedicated Blob container)

**Files:** Modify `apps/api/src/config/config.schema.ts`

The Tier documents reuse the existing attachments Blob account. Add ONE optional key for a Tier-specific container; if unset, reuse `ATTACHMENTS_BLOB_CONTAINER`.

- [ ] **Step 1:** In `config.schema.ts`, next to the existing `ATTACHMENTS_BLOB_*` keys, add:
```ts
TIER_BLOB_CONTAINER: z.string().min(1).optional(),
```
- [ ] **Step 2:** Run `cd apps/api && npm run build`. Expected: PASS.
- [ ] **Step 3:** Commit: `git commit -am "feat(tier): add optional TIER_BLOB_CONTAINER env key"`

### Task A3: Hand-written migration

**Files:** Create `apps/api/prisma/migrations/<YYYYMMDDHHMMSS>_tier_module/migration.sql`

> Use a timestamp strictly greater than the latest existing migration folder. Fully-qualify everything with `app.`. This SQL is applied in CI/staging via `prisma migrate deploy`; you cannot run it locally.

- [ ] **Step 1: Write `migration.sql`** — enums (guarded), then tables (`IF NOT EXISTS`), then indexes and FKs. Full content:

```sql
-- Tier module

DO $$ BEGIN CREATE TYPE app."TierStatus" AS ENUM ('SUBMETIDO','APROVADO','RECUSADO'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE app."TierCarVinculo" AS ENUM ('PROPRIO','ARRENDAMENTO','COMODATO'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE app."TierDocTipo" AS ENUM ('INSCRICAO_ESTADUAL','PROCURACAO','CONTRATO_COMODATO','DOC_PESSOAL','PARECER_TECNICO','DECLARACAO_M049','NF'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE app."TierDocEscopo" AS ENUM ('PROPRIETARIO','FAZENDA','CAR','TIER','LOTE','FRIGORIFICO'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS app.tier_proprietario (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cpf_cnpj text,
  tipo text NOT NULL,
  inscricao_estadual text,
  grupo text,
  municipio text,
  estado text,
  contrato_valor_animal numeric(12,2) NOT NULL DEFAULT 1.50,
  contrato_valor_adicional_aprovado numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL,
  CONSTRAINT tier_proprietario_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS app.tier_fazenda (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  municipio text,
  estado text,
  proprietario_dono_id uuid,
  sistema text,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL,
  CONSTRAINT tier_fazenda_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS tier_fazenda_proprietario_dono_id_idx ON app.tier_fazenda (proprietario_dono_id);

CREATE TABLE IF NOT EXISTS app.tier_car (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL,
  car_numero text NOT NULL,
  vinculo app."TierCarVinculo" NOT NULL DEFAULT 'PROPRIO',
  titular_nome text,
  titular_cpf_cnpj text,
  municipio text,
  uf text,
  area_ha numeric(14,4),
  landwatch_analise_id text,
  analise_status text,
  analise_snapshot_at timestamptz(6),
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL,
  CONSTRAINT tier_car_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS tier_car_fazenda_id_idx ON app.tier_car (fazenda_id);
CREATE INDEX IF NOT EXISTS tier_car_car_numero_idx ON app.tier_car (car_numero);

CREATE TABLE IF NOT EXISTS app.tier_grupo_frigorifico (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL,
  CONSTRAINT tier_grupo_frigorifico_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS app.tier_frigorifico (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  inscricao_estadual text,
  cpf_cnpj text,
  municipio text,
  endereco text,
  lat numeric(10,7),
  lon numeric(10,7),
  grupo_id uuid,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL,
  CONSTRAINT tier_frigorifico_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS tier_frigorifico_grupo_id_idx ON app.tier_frigorifico (grupo_id);

CREATE TABLE IF NOT EXISTS app.tier (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  proprietario_id uuid NOT NULL,
  fazenda_id uuid NOT NULL,
  frigorifico_id uuid,
  qtd_animais integer NOT NULL,
  status app."TierStatus" NOT NULL DEFAULT 'SUBMETIDO',
  data date,
  validado_por text,
  data_aprovacao timestamptz(6),
  contrato_valor_animal numeric(12,2) NOT NULL,
  contrato_valor_adicional_aprovado numeric(12,2) NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL,
  CONSTRAINT tier_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS tier_proprietario_id_idx ON app.tier (proprietario_id);
CREATE INDEX IF NOT EXISTS tier_fazenda_id_idx ON app.tier (fazenda_id);
CREATE INDEX IF NOT EXISTS tier_status_idx ON app.tier (status);

CREATE TABLE IF NOT EXISTS app.tier_lote (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tier_id uuid NOT NULL,
  nome text NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL,
  CONSTRAINT tier_lote_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS tier_lote_tier_id_idx ON app.tier_lote (tier_id);

CREATE TABLE IF NOT EXISTS app.tier_abate (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_abate date NOT NULL,
  frigorifico_id uuid,
  qtd integer NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL,
  CONSTRAINT tier_abate_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS tier_abate_frigorifico_id_idx ON app.tier_abate (frigorifico_id);

CREATE TABLE IF NOT EXISTS app.tier_abate_consumo (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  abate_id uuid NOT NULL,
  tier_id uuid,
  qtd_consumida integer NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT tier_abate_consumo_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS tier_abate_consumo_abate_id_idx ON app.tier_abate_consumo (abate_id);
CREATE INDEX IF NOT EXISTS tier_abate_consumo_tier_id_idx ON app.tier_abate_consumo (tier_id);

CREATE TABLE IF NOT EXISTS app.tier_documento (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tipo app."TierDocTipo" NOT NULL,
  escopo app."TierDocEscopo" NOT NULL,
  ref_id uuid NOT NULL,
  lote_id uuid,
  data_ref date,
  status_validacao text,
  validado_por text,
  blob_provider text,
  blob_container text,
  blob_path text NOT NULL,
  mime text,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL,
  CONSTRAINT tier_documento_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS tier_documento_escopo_ref_id_idx ON app.tier_documento (escopo, ref_id);
CREATE INDEX IF NOT EXISTS tier_documento_lote_id_idx ON app.tier_documento (lote_id);

CREATE TABLE IF NOT EXISTS app.tier_gta (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  numero text NOT NULL,
  data_emissao date,
  origem_fazenda_id uuid,
  qtd integer,
  sexo text,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL,
  CONSTRAINT tier_gta_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS tier_gta_numero_idx ON app.tier_gta (numero);

CREATE TABLE IF NOT EXISTS app.tier_lote_gta (
  lote_id uuid NOT NULL,
  gta_id uuid NOT NULL,
  CONSTRAINT tier_lote_gta_pkey PRIMARY KEY (lote_id, gta_id)
);

CREATE TABLE IF NOT EXISTS app.tier_lote_origem (
  lote_id uuid NOT NULL,
  fazenda_origem_id uuid NOT NULL,
  CONSTRAINT tier_lote_origem_pkey PRIMARY KEY (lote_id, fazenda_origem_id)
);

-- Foreign keys
ALTER TABLE app.tier_fazenda      ADD CONSTRAINT tier_fazenda_dono_fkey     FOREIGN KEY (proprietario_dono_id) REFERENCES app.tier_proprietario(id) ON DELETE SET NULL;
ALTER TABLE app.tier_car          ADD CONSTRAINT tier_car_fazenda_fkey       FOREIGN KEY (fazenda_id)          REFERENCES app.tier_fazenda(id)       ON DELETE CASCADE;
ALTER TABLE app.tier_frigorifico  ADD CONSTRAINT tier_frigorifico_grupo_fkey FOREIGN KEY (grupo_id)            REFERENCES app.tier_grupo_frigorifico(id) ON DELETE SET NULL;
ALTER TABLE app.tier              ADD CONSTRAINT tier_proprietario_fkey      FOREIGN KEY (proprietario_id)     REFERENCES app.tier_proprietario(id)  ON DELETE RESTRICT;
ALTER TABLE app.tier              ADD CONSTRAINT tier_fazenda_fkey           FOREIGN KEY (fazenda_id)          REFERENCES app.tier_fazenda(id)       ON DELETE RESTRICT;
ALTER TABLE app.tier              ADD CONSTRAINT tier_frigorifico_fkey       FOREIGN KEY (frigorifico_id)      REFERENCES app.tier_frigorifico(id)   ON DELETE SET NULL;
ALTER TABLE app.tier_lote         ADD CONSTRAINT tier_lote_tier_fkey         FOREIGN KEY (tier_id)             REFERENCES app.tier(id)               ON DELETE CASCADE;
ALTER TABLE app.tier_abate        ADD CONSTRAINT tier_abate_frigorifico_fkey FOREIGN KEY (frigorifico_id)      REFERENCES app.tier_frigorifico(id)   ON DELETE SET NULL;
ALTER TABLE app.tier_abate_consumo ADD CONSTRAINT tier_abate_consumo_abate_fkey FOREIGN KEY (abate_id)         REFERENCES app.tier_abate(id)         ON DELETE CASCADE;
ALTER TABLE app.tier_abate_consumo ADD CONSTRAINT tier_abate_consumo_tier_fkey  FOREIGN KEY (tier_id)          REFERENCES app.tier(id)               ON DELETE SET NULL;
ALTER TABLE app.tier_documento    ADD CONSTRAINT tier_documento_lote_fkey     FOREIGN KEY (lote_id)             REFERENCES app.tier_lote(id)          ON DELETE CASCADE;
ALTER TABLE app.tier_gta          ADD CONSTRAINT tier_gta_origem_fkey         FOREIGN KEY (origem_fazenda_id)   REFERENCES app.tier_fazenda(id)       ON DELETE SET NULL;
ALTER TABLE app.tier_lote_gta     ADD CONSTRAINT tier_lote_gta_lote_fkey      FOREIGN KEY (lote_id)             REFERENCES app.tier_lote(id)          ON DELETE CASCADE;
ALTER TABLE app.tier_lote_gta     ADD CONSTRAINT tier_lote_gta_gta_fkey       FOREIGN KEY (gta_id)              REFERENCES app.tier_gta(id)           ON DELETE CASCADE;
ALTER TABLE app.tier_lote_origem  ADD CONSTRAINT tier_lote_origem_lote_fkey   FOREIGN KEY (lote_id)             REFERENCES app.tier_lote(id)          ON DELETE CASCADE;
ALTER TABLE app.tier_lote_origem  ADD CONSTRAINT tier_lote_origem_fazenda_fkey FOREIGN KEY (fazenda_origem_id)  REFERENCES app.tier_fazenda(id)       ON DELETE CASCADE;
```

- [ ] **Step 2: Sanity-check the SQL** matches the Prisma models field-by-field (names, types, nullability, defaults). Do not run it.
- [ ] **Step 3: Commit.**
```bash
cd apps/api && git add prisma/migrations
git commit -m "feat(tier): add tier_module migration (hand-written SQL)"
```

---

## Section 5 — Backend

### Task B0: Access helper + top-level module skeleton

**Files:** Create `apps/api/src/tier/common/tier-access.ts`, `apps/api/src/tier/tier.module.ts`; Modify `apps/api/src/app.module.ts`

- [ ] **Step 1:** Create `tier-access.ts`. It wraps the standard actor + feature check so every controller calls one line.
```ts
import { ActorContextService } from '../../auth/actor-context.service';
import { AccessService } from '../../auth/access.service';

export const TIER_FEATURE = 'TIER';

export async function requireTier(
  actorContext: ActorContextService,
  access: AccessService,
  req: unknown,
) {
  const actor = await actorContext.fromRequest(req as never, { orgMode: 'tenant' });
  await access.requireTenantFeature(actor, TIER_FEATURE);
  return actor;
}
```
> Verify the import paths and `fromRequest`/`requireTenantFeature` signatures against `apps/api/src/auth/actor-context.service.ts` and `access.service.ts` before finalizing. If the real signatures differ, match them exactly.

- [ ] **Step 2:** Create `tier.module.ts` that imports every sub-module (added as you build them). Start minimal:
```ts
import { Module } from '@nestjs/common';
import { ProprietariosModule } from './proprietarios/proprietarios.module';

@Module({
  imports: [ProprietariosModule],
})
export class TierModule {}
```
- [ ] **Step 3:** In `apps/api/src/app.module.ts`, add `TierModule` to the `imports` array (single line; keep alphabetical/positional style of the file). Import at top.
- [ ] **Step 4:** Run `cd apps/api && npm run build`. Expected: PASS.
- [ ] **Step 5:** Commit: `git commit -am "feat(tier): scaffold TierModule + access helper"`

### Task B1: Proprietarios CRUD — REFERENCE IMPLEMENTATION (build fully)

> This is the pattern for ALL simple-CRUD resources. Build it completely with tests. Later resource tasks reuse this exact shape and only state their field/endpoint differences — when building them, copy this structure verbatim and swap the specifics.

**Files:** Create under `apps/api/src/tier/proprietarios/`: `proprietarios.module.ts`, `proprietarios.controller.ts`, `proprietarios.service.ts`, `proprietarios.service.spec.ts`, `dto/create-proprietario.dto.ts`, `dto/update-proprietario.dto.ts`, `dto/list-proprietarios.query.ts`

- [ ] **Step 1: DTOs.**
`dto/create-proprietario.dto.ts`:
```ts
import { IsIn, IsOptional, IsString, Length, IsNumberString } from 'class-validator';

export class CreateProprietarioDto {
  @IsString() @Length(1, 200) nome!: string;
  @IsIn(['PF', 'PJ']) tipo!: 'PF' | 'PJ';
  @IsOptional() @IsString() @Length(1, 40) cpfCnpj?: string;
  @IsOptional() @IsString() @Length(1, 60) inscricaoEstadual?: string;
  @IsOptional() @IsString() @Length(1, 200) grupo?: string;
  @IsOptional() @IsString() @Length(1, 120) municipio?: string;
  @IsOptional() @IsString() @Length(2, 2) estado?: string;
  @IsOptional() @IsNumberString() contratoValorAnimal?: string; // decimal as string
  @IsOptional() @IsNumberString() contratoValorAdicionalAprovado?: string;
}
```
`dto/update-proprietario.dto.ts`:
```ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateProprietarioDto } from './create-proprietario.dto';

export class UpdateProprietarioDto extends PartialType(CreateProprietarioDto) {}
```
> Confirm `@nestjs/mapped-types` is already a dependency of `apps/api` (Nest ships it). If not present, replicate fields manually as all-optional — do NOT add a new dependency.
`dto/list-proprietarios.query.ts`:
```ts
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListProprietariosQuery {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number = 50;
}
```

- [ ] **Step 2: Failing service test.** `proprietarios.service.spec.ts`:
```ts
import { ProprietariosService } from './proprietarios.service';

describe('ProprietariosService', () => {
  const prisma = {
    tierProprietario: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  } as any;
  const service = new ProprietariosService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('list returns a paged envelope shape', async () => {
    prisma.tierProprietario.findMany.mockResolvedValue([{ id: '1', nome: 'A' }]);
    prisma.tierProprietario.count.mockResolvedValue(1);
    const res = await service.list({ page: 1, pageSize: 50 });
    expect(res).toEqual({ page: 1, pageSize: 50, total: 1, rows: [{ id: '1', nome: 'A' }] });
    expect(prisma.tierProprietario.findMany).toHaveBeenCalled();
  });

  it('get throws NotFound when missing', async () => {
    prisma.tierProprietario.findUnique.mockResolvedValue(null);
    await expect(service.get('x')).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run it, verify it fails.**
Run: `cd apps/api && npm run test -- proprietarios.service`
Expected: FAIL (module `./proprietarios.service` not found).

- [ ] **Step 4: Service.** `proprietarios.service.ts`:
```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProprietarioDto } from './dto/create-proprietario.dto';
import { UpdateProprietarioDto } from './dto/update-proprietario.dto';
import { ListProprietariosQuery } from './dto/list-proprietarios.query';

@Injectable()
export class ProprietariosService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListProprietariosQuery) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 50;
    const where = q.search
      ? { nome: { contains: q.search, mode: 'insensitive' as const } }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.tierProprietario.findMany({
        where,
        orderBy: { nome: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.tierProprietario.count({ where }),
    ]);
    return { page, pageSize, total, rows };
  }

  async get(id: string) {
    const row = await this.prisma.tierProprietario.findUnique({ where: { id } });
    if (!row) throw new NotFoundException({ code: 'TIER_PROPRIETARIO_NOT_FOUND', message: 'Proprietário não encontrado' });
    return row;
  }

  create(dto: CreateProprietarioDto) {
    return this.prisma.tierProprietario.create({ data: dto });
  }

  async update(id: string, dto: UpdateProprietarioDto) {
    await this.get(id);
    return this.prisma.tierProprietario.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.tierProprietario.delete({ where: { id } });
    return { id };
  }
}
```
> Prisma accepts decimal columns as strings; the `@IsNumberString` DTO fields map directly. Do not convert to float.

- [ ] **Step 5: Run test, verify pass.**
Run: `cd apps/api && npm run test -- proprietarios.service`
Expected: PASS (2 tests).

- [ ] **Step 6: Controller.** `proprietarios.controller.ts`:
```ts
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import { ActorContextService } from '../../auth/actor-context.service';
import { AccessService } from '../../auth/access.service';
import { requireTier } from '../common/tier-access';
import { ProprietariosService } from './proprietarios.service';
import { CreateProprietarioDto } from './dto/create-proprietario.dto';
import { UpdateProprietarioDto } from './dto/update-proprietario.dto';
import { ListProprietariosQuery } from './dto/list-proprietarios.query';

@Controller('v1/tier/proprietarios')
export class ProprietariosController {
  constructor(
    private readonly service: ProprietariosService,
    private readonly actorContext: ActorContextService,
    private readonly access: AccessService,
  ) {}

  @Get()
  async list(@Req() req: unknown, @Query() query: ListProprietariosQuery) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.list(query);
  }

  @Get(':id')
  async get(@Req() req: unknown, @Param('id', ParseUUIDPipe) id: string) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.get(id);
  }

  @Post()
  async create(@Req() req: unknown, @Body() dto: CreateProprietarioDto) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.create(dto);
  }

  @Put(':id')
  async update(@Req() req: unknown, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProprietarioDto) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.update(id, dto);
  }

  @Delete(':id')
  async remove(@Req() req: unknown, @Param('id', ParseUUIDPipe) id: string) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.remove(id);
  }
}
```
> The `list` return `{page,pageSize,total,rows}` is auto-wrapped into `{ data: rows, meta, correlationId }` by the global `EnvelopeInterceptor`. Do not wrap it yourself.

- [ ] **Step 7: Module.** `proprietarios.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { ProprietariosController } from './proprietarios.controller';
import { ProprietariosService } from './proprietarios.service';

@Module({
  imports: [AuthModule],
  controllers: [ProprietariosController],
  providers: [ProprietariosService],
})
export class ProprietariosModule {}
```
> Check how `cars.module.ts` obtains `ActorContextService`/`AccessService` (whether via an imported module or a global provider). Mirror that exactly — if those services are globally provided, drop the `AuthModule` import. Do NOT guess; match `cars`/`fornecedores`.

- [ ] **Step 8: Build + lint + test all.**
Run: `cd apps/api && npm run lint:check && npm run test && npm run build`
Expected: all PASS.

- [ ] **Step 9: Commit.** `git commit -am "feat(tier): proprietarios CRUD"`

### Task B2: Fazendas CRUD

Same shape as B1. Differences only:
- Route `v1/tier/fazendas`, Prisma delegate `tierFazenda`, error code `TIER_FAZENDA_NOT_FOUND`.
- Create DTO fields: `@IsString() @Length(1,200) nome!`; optional `municipio`, `estado(len 2)`, `sistema` (`@IsOptional() @IsString()`), `proprietarioDonoId` (`@IsOptional() @IsUUID()`).
- List query supports `search` (by `nome`) and optional `proprietarioDonoId` filter.
- Include CAR count in `get`: `include: { _count: { select: { cars: true } } }`.
- Build full CRUD + spec (2 tests: list paged shape, get NotFound). Commit `feat(tier): fazendas CRUD`.

### Task B3: Cars CRUD (nested under fazenda) + analysis snapshot field

Same shape. Differences:
- Route `v1/tier/cars`. Delegate `tierCar`. Code `TIER_CAR_NOT_FOUND`.
- Create DTO: `@IsUUID() fazendaId!`; `@IsString() @Length(5,200) carNumero!`; `@IsOptional() @IsIn(['PROPRIO','ARRENDAMENTO','COMODATO']) vinculo?`; optional `titularNome`, `titularCpfCnpj`, `municipio`, `uf(len 2)`, `areaHa (@IsNumberString)`.
- Extra list filter: `fazendaId` (required-ish; allow listing all). Order by `carNumero`.
- Do NOT put analysis fields in the create/update DTO — `analiseStatus`/`analiseSnapshotAt`/`landwatchAnaliseId` are set only by the snapshot endpoint in Task B7.
- Commit `feat(tier): cars CRUD`.

### Task B4: Frigorificos + GrupoFrigorifico CRUD

Two resources in one module `apps/api/src/tier/frigorificos/`. Same CRUD shape, two delegates.
- Routes `v1/tier/frigorificos` and `v1/tier/grupos-frigorifico`. Codes `TIER_FRIGORIFICO_NOT_FOUND`, `TIER_GRUPO_FRIGORIFICO_NOT_FOUND`.
- Frigorifico create DTO: `@IsString() @Length(1,200) nome!`; optional `inscricaoEstadual`, `cpfCnpj`, `municipio`, `endereco`, `lat`/`lon` (`@IsOptional() @IsNumberString()`), `grupoId` (`@IsOptional() @IsUUID()`).
- GrupoFrigorifico create DTO: `@IsString() @Length(1,200) nome!`.
- Frigorifico `list` includes `grupo` relation. Commit `feat(tier): frigorificos + grupos CRUD`.

### Task B5: Tier entity — CRUD + contract snapshot + approval + saldo

**Files:** `apps/api/src/tier/tiers/` — module/controller/service/spec + dto (`create-tier.dto.ts`, `update-tier.dto.ts`, `list-tiers.query.ts`, `sync-contrato.dto.ts`).

Core CRUD like B1 on delegate `tier`, route `v1/tier/tiers`, code `TIER_NOT_FOUND`. PLUS the special logic below — build these with tests.

- [ ] **Step 1: Create DTO.** Required `@IsUUID() proprietarioId!`, `@IsUUID() fazendaId!`, `@IsInt() @Min(1) qtdAnimais!`; optional `@IsUUID() frigorificoId?`, `@IsDateString() data?`. NO status, NO contract fields in create (status defaults SUBMETIDO; contract is snapshotted).

- [ ] **Step 2: Failing test for snapshot-on-create.** In spec, assert that `create` reads the proprietário's contract and copies it:
```ts
it('snapshots proprietario contract values into the tier on create', async () => {
  prisma.tierProprietario.findUnique.mockResolvedValue({
    id: 'p1', contratoValorAnimal: '1.50', contratoValorAdicionalAprovado: '0.30',
  });
  prisma.tier.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 't1', ...data }));
  const res = await service.create({ proprietarioId: 'p1', fazendaId: 'f1', qtdAnimais: 100 } as any);
  expect(res.contratoValorAnimal).toBe('1.50');
  expect(res.contratoValorAdicionalAprovado).toBe('0.30');
});
```
Run `npm run test -- tiers.service` → FAIL.

- [ ] **Step 3: Implement `create` with snapshot.**
```ts
async create(dto: CreateTierDto) {
  const prop = await this.prisma.tierProprietario.findUnique({ where: { id: dto.proprietarioId } });
  if (!prop) throw new NotFoundException({ code: 'TIER_PROPRIETARIO_NOT_FOUND', message: 'Proprietário não encontrado' });
  return this.prisma.tier.create({
    data: {
      proprietarioId: dto.proprietarioId,
      fazendaId: dto.fazendaId,
      frigorificoId: dto.frigorificoId ?? null,
      qtdAnimais: dto.qtdAnimais,
      data: dto.data ? new Date(dto.data) : null,
      contratoValorAnimal: prop.contratoValorAnimal,
      contratoValorAdicionalAprovado: prop.contratoValorAdicionalAprovado,
    },
  });
}
```
Run test → PASS.

- [ ] **Step 4: Approval endpoint.** Add `POST v1/tier/tiers/:id/status` with body `{ status: 'APROVADO'|'RECUSADO'|'SUBMETIDO', validadoPor?: string }`. Service sets `status`, `validadoPor`, and `dataAprovacao = new Date()` when status becomes APROVADO (else null). All-or-nothing — no partial quantity. Add a test asserting `dataAprovacao` is set on APROVADO.

- [ ] **Step 5: Contract override endpoint.** `PUT v1/tier/tiers/:id/contrato` with body `{ contratoValorAnimal?: string, contratoValorAdicionalAprovado?: string }` — updates ONLY the tier's snapshot values. This is the explicit re-sync the spec requires. A tier never auto-updates when the proprietário's contract changes.

- [ ] **Step 6: Saldo on `get`.** When returning a single tier, include computed `saldo` and `receita`. Compute `abatido` via aggregate:
```ts
async get(id: string) {
  const tier = await this.prisma.tier.findUnique({ where: { id } });
  if (!tier) throw new NotFoundException({ code: 'TIER_NOT_FOUND', message: 'Tier não encontrado' });
  const agg = await this.prisma.tierAbateConsumo.aggregate({
    _sum: { qtdConsumida: true }, where: { tierId: id },
  });
  const abatido = agg._sum.qtdConsumida ?? 0;
  const saldo = tier.status === 'APROVADO' ? tier.qtdAnimais - abatido : 0;
  const valorAnimal = Number(tier.contratoValorAnimal);
  const valorAdic = Number(tier.contratoValorAdicionalAprovado);
  const receita = tier.qtdAnimais * valorAnimal + (tier.status === 'APROVADO' ? tier.qtdAnimais * valorAdic : 0);
  return { ...tier, abatido, saldo, receita };
}
```
> `Number(...)` here is only for a derived display value returned to the client, never persisted — acceptable. Persisted money stays Decimal/string.
Add a test: approved tier qty 100, abatido 30 → saldo 70.

- [ ] **Step 7:** Register `TiersModule` in `tier.module.ts`. Build + lint + test. Commit `feat(tier): tier entity with contract snapshot, approval and saldo`.

### Task B6: Lotes + Documentos (Blob upload) + Abates + Gtas

Build in this order, each its own commit. All follow B1 CRUD shape plus the specifics:

- [ ] **B6a Lotes.** Route `v1/tier/lotes`, delegate `tierLote`. Create DTO: `@IsUUID() tierId!`, `@IsString() @Length(1,200) nome!`. `nome` editable via `PUT`. List filter by `tierId`. `get` includes documentos, gtas, origens. Commit `feat(tier): lotes CRUD`.

- [ ] **B6b Documentos + Blob.** Route `v1/tier/documentos`. Use `@nestjs/platform-express` `FileInterceptor` (already available — confirm in `attachments.controller.ts`). `POST` multipart: file + fields `tipo`, `escopo`, `refId`, optional `loteId`, `dataRef`. Service uploads to Blob **reusing the exact client pattern** from `attachments.service.ts`:
  ```ts
  const container = process.env.TIER_BLOB_CONTAINER ?? process.env.ATTACHMENTS_BLOB_CONTAINER ?? 'attachments';
  const blobPath = `tier/${escopo.toLowerCase()}/${refId}/${Date.now()}-${safeName}`;
  const client = BlobServiceClient.fromConnectionString(connectionString)
    .getContainerClient(container).getBlockBlobClient(blobPath);
  await client.uploadData(file.buffer, { blobHTTPHeaders: { blobContentType: file.mimetype } });
  ```
  Then persist a `tierDocumento` row with `blobProvider`, `blobContainer`, `blobPath`, `mime`. Reuse the allowed-MIME allowlist and the `BLOB_UPLOAD_FAILED` error handling from `attachments.service.ts` — do not invent new behavior. Provide `GET v1/tier/documentos?escopo=&refId=` (list) and `DELETE :id` (delete row; do NOT delete the blob — match attachments behavior, confirm). Add a spec that mocks the Blob client and asserts a row is created with the returned path. Commit `feat(tier): documentos with blob upload`.
  > Timestamp in path: `Date.now()` is fine in app runtime (only forbidden inside Workflow scripts, not here).

- [ ] **B6c Gtas.** Route `v1/tier/gtas`, delegate `tierGta`. Create DTO: `@IsString() numero!`, optional `dataEmissao (@IsDateString)`, `origemFazendaId (@IsUUID)`, `qtd (@IsInt)`, `sexo`. Also endpoints to link/unlink a GTA to a lote: `POST v1/tier/lotes/:loteId/gtas/:gtaId` and `DELETE` (writes `tier_lote_gta`). Commit `feat(tier): gtas CRUD + lote linkage`.

- [ ] **B6d Abates + ledger.** Route `v1/tier/abates`, delegate `tierAbate`. Create DTO:
  ```ts
  class CreateAbateDto {
    @IsDateString() dataAbate!: string;
    @IsOptional() @IsUUID() frigorificoId?: string;
    @IsInt() @Min(1) qtd!: number;
    @IsOptional() @ValidateNested({ each: true }) @Type(() => AbateConsumoDto) consumos?: AbateConsumoDto[];
  }
  class AbateConsumoDto {
    @IsUUID() tierId!: string;      // when provided
    @IsInt() @Min(1) qtdConsumida!: number;
  }
  ```
  Service creates the abate and its `tier_abate_consumo` rows in a `prisma.$transaction`. **Validation rule (build a test):** for each consumo, the tier must be `APROVADO` and its current saldo must be `>= qtdConsumida`, else throw `BadRequestException({ code: 'TIER_SALDO_INSUFICIENTE' })`. If `consumos` is omitted/empty, the abate is recorded with NO ledger rows (tier unknown) and does not affect credit — this is allowed per spec. Add endpoint `GET v1/tier/tiers/:id/consumos` to expose the ledger for a tier. Commit `feat(tier): abates with tier-consumo ledger and saldo validation`.

### Task B7: Credit report + CAR→LandWatch analysis (read-only)

**Files:** `apps/api/src/tier/tiers/` (add credit endpoint), `apps/api/src/tier/analise/` (new module).

- [ ] **Step 1: Credit report.** `GET v1/tier/proprietarios/:id/credito` returns Aprovados − Abatidos for the owner:
```ts
async credito(proprietarioId: string) {
  const aprovadosAgg = await this.prisma.tier.aggregate({
    _sum: { qtdAnimais: true },
    where: { proprietarioId, status: 'APROVADO' },
  });
  const aprovados = aprovadosAgg._sum.qtdAnimais ?? 0;
  const abatidosRows = await this.prisma.tierAbateConsumo.findMany({
    where: { tier: { proprietarioId, status: 'APROVADO' } },
    select: { qtdConsumida: true },
  });
  const abatidos = abatidosRows.reduce((s, r) => s + r.qtdConsumida, 0);
  return { proprietarioId, aprovados, abatidos, creditoRestante: aprovados - abatidos };
}
```
Add a test: aprovados 630, abatidos 181 → creditoRestante 449 (matches the reviewed spec validation). Put this method on `ProprietariosService` or a small `CreditoService` — wire it under the proprietarios controller. Commit `feat(tier): credito report per proprietario`.

- [ ] **Step 2: CAR analysis read.** New `analise.module.ts`/`analise.service.ts`/`analise.controller.ts`. `GET v1/tier/cars/:id/analise` looks up the `tier_car` row, takes `carNumero`, and queries the external `landwatch` schema by `feature_key` **reusing the raw-SQL pattern** from `cars.service.ts`:
  - Resolve schema: `const schema = process.env.LANDWATCH_SCHEMA ?? 'landwatch'; assertIdentifier(schema);` (copy `assertIdentifier` regex helper from `cars.service.ts` — do not import private members; re-declare the tiny guard locally).
  - Query existence/status of the CAR in category `SICAR` via `this.prisma.$queryRaw(Prisma.sql\`... WHERE c.code = 'SICAR' AND f.feature_key = ${carNumero}\`)` joining `lw_feature`/`lw_dataset`/`lw_category` with identifiers via `Prisma.raw(\`"${schema}"."lw_feature"\`)`. Only the schema is `Prisma.raw` (guarded); `carNumero` is bound.
  - Before querying call `await this.landwatchStatus.assertNotRefreshing()` if that service is importable (check `LandwatchStatusModule`); if wiring it is non-trivial, return the raw analysis presence without the refresh guard and note it in the PR — do NOT block the whole task on it.
  - Return `{ carNumero, encontrado: boolean, ... }`. This endpoint is READ-ONLY against LandWatch. It does not write. (Writing the snapshot into `tier_car` is a future enhancement; out of scope here unless trivially added as `POST :id/analise/snapshot` copying the read result into `analise_status`/`analise_snapshot_at` — allowed, one commit.)
  - Commit `feat(tier): read CAR environmental analysis from landwatch schema`.

- [ ] **Step 3:** Final api gate: `cd apps/api && npm run lint:check && npm run test && npm run build`. All PASS.

---

## Section 6 — Frontend

### Task W0: Sidebar tab + route

**Files:** Modify `apps/web/src/router/index.ts`, `apps/web/src/views/AppShellView.vue`; Create `apps/web/src/views/tier/TierListView.vue` (placeholder first).

- [ ] **Step 1:** Create a minimal `TierListView.vue` (`<template><div class="p-6">Tier</div></template><script setup lang="ts"></script>`) so the route resolves.
- [ ] **Step 2:** Add the route in `router/index.ts` as a child of AppShell:
```ts
{ path: 'tier', name: 'tier', component: () => import('../views/tier/TierListView.vue'),
  meta: { requiresAuth: true, title: 'Tier', feature: 'TIER' } },
{ path: 'tier/:id', name: 'tier-detail', component: () => import('../views/tier/TierDetailView.vue'),
  meta: { requiresAuth: true, title: 'Tier', feature: 'TIER' } },
```
(Also add routes `tier/proprietarios`, `tier/fazendas`, `tier/frigorificos`, `tier/abates` pointing to their views, same meta.)
- [ ] **Step 3:** In `AppShellView.vue`: import an icon from `lucide-vue-next` (e.g. `Beef` or `ClipboardList`), add to `baseNavItems`: `{ key: 'tier', label: 'Tier', icon: ClipboardList, feature: 'TIER' }`; add `activeKey` prefix case for `/tier`; add `navigate('tier')` → `router.push('/tier')`.
- [ ] **Step 4:** Gate: `cd apps/web && npm run lint && npm run typecheck && npm run build`. All PASS.
- [ ] **Step 5:** Commit `feat(tier-web): sidebar tab + routes`.

### Task W1: API layer + types

**Files:** Create `apps/web/src/features/tier/types.ts`, `apps/web/src/features/tier/api.ts`.

- [ ] **Step 1:** `types.ts` — TS interfaces mirroring the API responses (`Proprietario`, `Fazenda`, `Car`, `Frigorifico`, `GrupoFrigorifico`, `Tier` (with `saldo`, `receita`, `abatido`), `Lote`, `Abate`, `Gta`, `Documento`, `Credito`). Money fields typed as `string` (Decimal serialized).
- [ ] **Step 2:** `api.ts` — one function per endpoint using `http` + envelope helpers, e.g.:
```ts
import { http } from '@/api/http';
import { unwrapData, unwrapPaged, type ApiEnvelope, type Paged } from '@/api/envelope';
import type { Proprietario, Tier } from './types';

export async function listProprietarios(params: { search?: string; page?: number; pageSize?: number }) {
  const res = await http.get<ApiEnvelope<Proprietario[]>>('/v1/tier/proprietarios', { params });
  return unwrapPaged(res.data) as Paged<Proprietario>;
}
export async function createProprietario(body: Partial<Proprietario>) {
  const res = await http.post<ApiEnvelope<Proprietario>>('/v1/tier/proprietarios', body);
  return unwrapData(res.data);
}
// ...repeat for every endpoint built in Section 5 (tiers, fazendas, cars, frigorificos, lotes, documentos (multipart), abates, gtas, credito, analise)
```
> For document upload use `FormData` and let axios set the multipart boundary (do not set Content-Type manually) — match how any existing upload is done in the web app if one exists; otherwise standard `FormData`.
- [ ] **Step 3:** `cd apps/web && npm run typecheck`. PASS. Commit `feat(tier-web): api client + types`.

### Task W2: List/CRUD views (Proprietarios reference, then others)

**Files:** `apps/web/src/views/tier/ProprietariosView.vue` (reference), then `FazendasView.vue`, `FrigorificosView.vue`.

- [ ] **Step 1:** Build `ProprietariosView.vue` following `SchedulesView.vue`: a table (shadcn-vue/`@/ui` primitives + Tailwind), a search box, and a create/edit modal (mirror the `createModalOpen`/`createSchedule()` pattern). Load with `onMounted` calling `listProprietarios`. Show `nome`, `cpfCnpj`, `grupo`, contract values. Editing opens the modal; save calls `createProprietario`/`updateProprietario`.
- [ ] **Step 2:** Replicate for `FazendasView.vue` (fields incl. owner select from proprietarios; show CAR count; a nested CAR sub-list add/remove) and `FrigorificosView.vue` (fields incl. group select; a separate small section to manage `GrupoFrigorifico`).
- [ ] **Step 3:** Gate web (lint, typecheck, build). Commit per view: `feat(tier-web): proprietarios view`, `feat(tier-web): fazendas + cars view`, `feat(tier-web): frigorificos view`.

### Task W3: Tier list + detail (lotes, docs, saldo)

**Files:** `TierListView.vue` (replace placeholder), `TierDetailView.vue`.

- [ ] **Step 1:** `TierListView.vue`: table of tiers (proprietário, fazenda, qtd, status pill, saldo), filters by status/proprietário, "Novo Tier" modal (select proprietário + fazenda + qtd + frigorífico + data → `createTier`). Status pill uses semantic color (approved=green, recusado=red, submetido=neutral) — NOT the app accent.
- [ ] **Step 2:** `TierDetailView.vue` (`/tier/:id`): header with tier data + `saldo`/`receita`/`abatido` (from `getTier`); an approval control (`Aprovar`/`Recusar` → status endpoint); a contract panel (view snapshot, edit → contrato endpoint); a **Lotes** section (list child lotes, add lote with editable name, per-lote document upload via multipart + document list, link GTAs, add origem farms).
- [ ] **Step 3:** Gate. Commit `feat(tier-web): tier list and detail with lotes/docs/saldo`.

### Task W4: Abates view (saldo-aware selection)

**Files:** `AbatesView.vue`.

- [ ] **Step 1:** Create-abate form: date, frigorífico, total qtd, and a repeatable "consumo" row list. Each consumo row: a tier picker that **only lists tiers with `status=APROVADO` and `saldo>0`** (fetch via a tiers list filtered client-side or a dedicated query param), and a qty input capped at that tier's saldo. Allow zero consumos (unknown tier). Sum of consumo qtys should be shown vs total qtd (warn if mismatch, but do not hard-block — server validates saldo).
- [ ] **Step 2:** On submit call `createAbate`. On success, re-fetch tier saldos so consumed tiers drop off / reduce. Add a list of recent abates with their consumos.
- [ ] **Step 3:** Gate. Commit `feat(tier-web): abates view with saldo-aware tier selection`.

### Task W5: Tier sub-navigation (Option A — in-module tabs)

**Why:** W0 registered the routes `/tier`, `/tier/proprietarios`, `/tier/fazendas`, `/tier/frigorificos`, `/tier/abates` and W2–W4 built their views, but nothing in the UI links to the sub-views — the sidebar has a single "Tier" entry pointing at `/tier`. The cadastro pages are therefore unreachable except by typing the URL, which blocks the "Novo tier" flow (its selects have no data and no way to create it). This task adds a shared tab bar inside the Tier area. **No inline "+" create-in-select** — navigation only.

**Approach:** A single presentational `TierNav.vue` tab bar rendered at the top of each of the 5 list-level views. No router restructure (keep the flat sibling routes from W0). `TierDetailView.vue` (`/tier/:id`) is a drill-down and does NOT get the tab bar (it keeps its "← Voltar"); the "Tiers" tab stays highlighted while on a detail page.

**Files:**
- Create: `apps/web/src/views/tier/TierNav.vue`
- Modify: `apps/web/src/views/tier/TierListView.vue`, `ProprietariosView.vue`, `FazendasView.vue`, `FrigorificosView.vue`, `AbatesView.vue`

- [ ] **Step 1: Create the tab bar component.** `apps/web/src/views/tier/TierNav.vue`:

```vue
<template>
  <nav class="flex flex-wrap gap-1 border-b border-border">
    <RouterLink
      v-for="tab in tabs"
      :key="tab.to"
      :to="tab.to"
      class="rounded-t-md px-3 py-2 text-sm font-medium transition-colors"
      :class="
        tab.match(route.path)
          ? 'border-b-2 border-foreground text-foreground'
          : 'text-muted-foreground hover:text-foreground'
      "
    >
      {{ tab.label }}
    </RouterLink>
  </nav>
</template>

<script setup lang="ts">
import { useRoute, RouterLink } from "vue-router";

const route = useRoute();

const SUB = ["/tier/proprietarios", "/tier/fazendas", "/tier/frigorificos", "/tier/abates"];

const tabs = [
  {
    label: "Tiers",
    to: "/tier",
    // Active on the list (/tier) and on any tier detail (/tier/<uuid>),
    // but not on the other sub-pages.
    match: (p: string) =>
      p === "/tier" || (p.startsWith("/tier/") && !SUB.some((s) => p.startsWith(s))),
  },
  { label: "Proprietários", to: "/tier/proprietarios", match: (p: string) => p.startsWith("/tier/proprietarios") },
  { label: "Fazendas", to: "/tier/fazendas", match: (p: string) => p.startsWith("/tier/fazendas") },
  { label: "Frigoríficos", to: "/tier/frigorificos", match: (p: string) => p.startsWith("/tier/frigorificos") },
  { label: "Abates", to: "/tier/abates", match: (p: string) => p.startsWith("/tier/abates") },
];
</script>
```

- [ ] **Step 2: Render `<TierNav />` at the top of each list view.** In each of `TierListView.vue`, `ProprietariosView.vue`, `FazendasView.vue`, `FrigorificosView.vue`, `AbatesView.vue`:
  - Add the import inside `<script setup>`: `import TierNav from "./TierNav.vue";`
  - In `<template>`, make `<TierNav />` the FIRST child of the root `<section class="… p-6">`, immediately before the existing `<header>`. Example for `ProprietariosView.vue`:

```vue
<section class="flex flex-col gap-4 p-6">
  <TierNav />
  <header class="flex items-center justify-between gap-3">
    <!-- unchanged -->
```

  Do NOT change any other markup or logic in those views. `TierDetailView.vue` is intentionally left unchanged.

- [ ] **Step 3: Gate.**

Run: `cd apps/web && npm run lint && npm run typecheck && npm run build`
Expected: all PASS.

- [ ] **Step 4: Commit.**

```bash
git add apps/web/src/views/tier
git commit -m "feat(tier-web): in-module tab navigation"
```

---

## Section 7 — Limitations & known gaps (state these; do not silently fix)

1. **No live-DB verification anywhere in this plan.** Everything is validated by build/lint/unit tests with a mocked Prisma. First real execution happens when the migration is `deploy`ed to staging Azure and the app is exercised there. The PR description must say: "Migration not run locally (no local Postgres); run `npx prisma migrate deploy` against staging and smoke-test before prod."
2. **`TIER` feature flag must be enabled per org** (row in `orgFeatureAccess`) in staging before the UI/endpoints return data. This is an ops step, not code. Without it every endpoint 403s and the sidebar tab is hidden — that is expected behavior, not a bug.
3. **No Excel/folder import.** The historic data in `Tier/` is NOT migrated by this module. Data entry starts fresh in the UI. A one-off import script is a separate future task.
4. **Analysis is read-only and best-effort.** The CAR→LandWatch join surfaces whether a CAR exists in the `landwatch` `SICAR` category and its status; it does not reproduce the full LandWatch analysis UI. The `analise_status`/`analise_snapshot_at` snapshot is only written if Task B7 Step 2's optional snapshot endpoint is built. Point-in-time audit of analysis is therefore partial.
5. **Money as Decimal/string end-to-end.** Derived `receita`/`credito` numbers computed with JS `Number` are display-only and may carry float rounding; treat the Decimal columns as source of truth. Do not persist computed floats.
6. **No pagination on nested lists** (lotes per tier, cars per fazenda, consumos per tier) — assumed small. If a tier ever has hundreds of lotes this needs revisiting; out of scope now.
7. **Auth model unchanged.** Reuses the existing tenant/feature gating. No new roles, no per-record ownership beyond the `TIER` feature. Cross-org isolation for Tier data is NOT implemented (all Tier rows are visible to any org with the `TIER` feature) — if multi-tenant isolation of Tier data is required, that is a follow-up (would need an `orgId` column + `requireSameOrgOrPlatform`). **Flag this explicitly in the PR.**
8. **Delete is hard-delete** (except FK-restricted ones). No soft-delete/audit trail. Deleting a proprietário/fazenda referenced by a tier is blocked by `ON DELETE RESTRICT` and will surface a Prisma error — surface it as a 400, do not cascade.
9. **GTA parsing is manual.** Numbers like `S551171, 73` (multi-GTA cells in the source) are entered as separate GTA rows by the operator; no auto-splitting.

---

## Section 8 — Self-review (completed by plan author)

- **Spec coverage:** every entity in the approved model has a table (Task A1/A3), a CRUD module (B1–B6), and a view (W2–W4). Contract snapshot (B5), approval all-or-nothing (B5), saldo/credito computed no-table (B5/B7), abate↔tier optional ledger with qty (B6d), CAR 1:N + landwatch join (B3/B7), frigorífico group-or-standalone (B4), single proprietário registry with grupo-as-field (B1) — all present.
- **Placeholder scan:** reference CRUD (B1) and the special-logic tasks carry full code; sibling CRUD tasks (B2–B4, B6a/c) intentionally state only their field/route deltas against B1 and MUST be built by copying B1 verbatim with those swaps — this is a deliberate, stated structure, not a placeholder. When executing B2–B4/B6, reproduce the full B1 code with the listed differences; do not leave stubs.
- **Type consistency:** delegate names (`tierProprietario`, `tierFazenda`, `tierCar`, `tierFrigorifico`, `tierGrupoFrigorifico`, `tier`, `tierLote`, `tierAbate`, `tierAbateConsumo`, `tierDocumento`, `tierGta`) match the Prisma `@@map`/model names in A1. Routes are consistently `v1/tier/<resource>`. Feature key `TIER` used in guard (B0) and web meta (W0).

---

## Execution handoff

**Plan saved to `docs/superpowers/plans/2026-07-06-tier-module.md`.**

Because you (the user) will drive this with **Codex**, run it strictly in order (A → B → W), one task = one commit, and gate every task with the build/lint/test commands stated. Do NOT let the implementing agent proceed past a task whose gate fails, and do NOT let it expand scope. Between tasks, skim the diff to confirm it only touched the task's listed files.
