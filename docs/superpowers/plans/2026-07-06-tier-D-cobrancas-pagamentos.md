# Tier Sub-project D - Cobrancas e Pagamentos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate immutable per-owner invoices from Tier snapshots, manage payment/cancellation state, detect invoice drift, and expose list/detail/PDF workflows in the Pagamentos tab.

**Architecture:** PostgreSQL stores invoice headers and frozen item snapshots while a pure calculator owns Decimal arithmetic and drift comparison. `CobrancasService` coordinates preview, overlap/dedup, transactions, edits, and lifecycle transitions; `CobrancaPdfService` renders an already-authorized detail response. The web query layer feeds focused invoice form, payment, list, and detail components.

**Tech Stack:** NestJS 11, Prisma 7/PostgreSQL, `pdf-lib` 1.17, Jest 30, Vue 3.5, TanStack Vue Query 5, Vitest 3, Lucide Vue, Tailwind CSS.

## Global Constraints

- Follow `docs/superpowers/specs/2026-07-06-tier-cobrancas-pagamentos-design.md`.
- One invoice belongs to one proprietario and uses Tiers whose required `tier.data` is inside the inclusive period.
- Base value applies to every animal; approved additional value applies only when snapshot status is `APROVADO`.
- Store all currency in `Decimal(12,2)` and serialize it as strings; never calculate invoice money with JavaScript `number`.
- Saved items are immutable snapshots until an explicit edit or resync on a `NAO_PAGA` invoice.
- A non-cancelled invoice dedups its Tiers in preview; explicitly selected crossed-out Tiers may still be billed again.
- Period overlap requires explicit confirmation on create and edit, but does not permanently block saving.
- No hard delete. `reabrir` clears payment fields; `cancelar` accepts `NAO_PAGA` or `PAGA` and rejects `CANCELADA`.
- Reporting dashboards, CSV export, batch invoice generation, and payment-provider integration remain out of scope.
- No local PostgreSQL is available; generate Prisma locally and run `prisma migrate deploy` on staging later.
- Keep the branch commit history focused, without AI attribution trailers.

---

### Task 1: Make Tier dates required and add invoice storage

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260715190000_tier_cobrancas/migration.sql`
- Modify: `apps/api/src/tier/tiers/dto/create-tier.dto.ts`
- Modify: `apps/api/src/tier/tiers/dto/update-tier.dto.ts`
- Modify: `apps/api/src/tier/tiers/tiers.service.ts`
- Test: `apps/api/src/tier/tiers/tiers.service.spec.ts`
- Modify: `apps/web/src/features/tier/types.ts`
- Modify: `apps/web/src/features/tier/api.ts`
- Modify: `apps/web/src/views/tier/TierListView.vue`
- Create: `apps/web/src/views/tier/TierListView.spec.ts`

**Interfaces:**
- Consumes: nullable legacy `Tier.data`, existing Tier contract snapshots, and required create/edit date strings.
- Produces: non-null `Tier.data`, `TierCobrancaStatus`, `TierCobranca`, and `TierCobrancaItem` Prisma models.

- [ ] **Step 1: Write failing API date tests**

Add tests proving `TiersService.create` always passes `new Date(dto.data)` and `update` accepts a required date value without a nullable branch. Validate `CreateTierDto` with `class-validator` and assert a missing `data` produces an error.

- [ ] **Step 2: Verify API RED**

Run: `npm test -- --runInBand tier/tiers` from `apps/api`.

Expected: FAIL because `data` remains optional and service create writes `null`.

- [ ] **Step 3: Write failing web date contract**

Create `TierListView.spec.ts` and assert the create button guard includes `!form.data`, the API create type requires `data: string`, and the view no longer sends `data: form.data || undefined`.

- [ ] **Step 4: Verify web RED**

Run: `npm test -- --run src/views/tier/TierListView.spec.ts` from `apps/web`.

Expected: FAIL because the date is currently optional.

- [ ] **Step 5: Add Prisma models and relations**

Change `Tier.data` to `DateTime @db.Date`, add `cobrancaItens TierCobrancaItem[]` to `Tier`, and `cobrancas TierCobranca[]` to `TierProprietario`. Add:

```prisma
enum TierCobrancaStatus {
  NAO_PAGA
  PAGA
  CANCELADA

  @@map("tier_cobranca_status")
  @@schema("app")
}

model TierCobranca {
  id             String             @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  proprietarioId String             @map("proprietario_id") @db.Uuid
  periodoIni     DateTime           @map("periodo_ini") @db.Date
  periodoFim     DateTime           @map("periodo_fim") @db.Date
  status         TierCobrancaStatus @default(NAO_PAGA)
  valorBase      Decimal            @map("valor_base") @db.Decimal(12, 2)
  valorAdicional Decimal            @map("valor_adicional") @db.Decimal(12, 2)
  valorTotal     Decimal            @map("valor_total") @db.Decimal(12, 2)
  qtdAnimais     Int                @map("qtd_animais")
  qtdAprovados   Int                @map("qtd_aprovados")
  dataPagamento  DateTime?          @map("data_pagamento") @db.Date
  valorPago      Decimal?           @map("valor_pago") @db.Decimal(12, 2)
  createdAt      DateTime           @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime           @updatedAt @map("updated_at") @db.Timestamptz(6)

  proprietario TierProprietario    @relation(fields: [proprietarioId], references: [id], onDelete: Restrict)
  itens         TierCobrancaItem[]

  @@index([proprietarioId, status])
  @@map("tier_cobranca")
  @@schema("app")
}

model TierCobrancaItem {
  id                                String     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  cobrancaId                        String     @map("cobranca_id") @db.Uuid
  tierId                            String     @map("tier_id") @db.Uuid
  tierData                          DateTime   @map("tier_data") @db.Date
  qtdAnimais                        Int        @map("qtd_animais")
  status                            TierStatus
  contratoValorAnimal               Decimal    @map("contrato_valor_animal") @db.Decimal(12, 2)
  contratoValorAdicionalAprovado    Decimal    @map("contrato_valor_adicional_aprovado") @db.Decimal(12, 2)
  valorBase                         Decimal    @map("valor_base") @db.Decimal(12, 2)
  valorAdicional                    Decimal    @map("valor_adicional") @db.Decimal(12, 2)
  valorItem                         Decimal    @map("valor_item") @db.Decimal(12, 2)

  cobranca TierCobranca @relation(fields: [cobrancaId], references: [id], onDelete: Cascade)
  tier     Tier          @relation(fields: [tierId], references: [id], onDelete: Restrict)

  @@index([cobrancaId])
  @@index([tierId])
  @@map("tier_cobranca_item")
  @@schema("app")
}
```

- [ ] **Step 6: Add SQL migration**

Create the migration with the exact backfill, storage, indexes, and referential actions:

```sql
UPDATE app.tier
SET data = created_at::date
WHERE data IS NULL;

ALTER TABLE app.tier
  ALTER COLUMN data SET NOT NULL;

DO $$
BEGIN
  CREATE TYPE app.tier_cobranca_status AS ENUM ('NAO_PAGA', 'PAGA', 'CANCELADA');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE app.tier_cobranca (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  proprietario_id uuid NOT NULL,
  periodo_ini date NOT NULL,
  periodo_fim date NOT NULL,
  status app.tier_cobranca_status NOT NULL DEFAULT 'NAO_PAGA',
  valor_base numeric(12,2) NOT NULL,
  valor_adicional numeric(12,2) NOT NULL,
  valor_total numeric(12,2) NOT NULL,
  qtd_animais integer NOT NULL,
  qtd_aprovados integer NOT NULL,
  data_pagamento date,
  valor_pago numeric(12,2),
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(6) NOT NULL,
  CONSTRAINT tier_cobranca_pkey PRIMARY KEY (id)
);

CREATE TABLE app.tier_cobranca_item (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cobranca_id uuid NOT NULL,
  tier_id uuid NOT NULL,
  tier_data date NOT NULL,
  qtd_animais integer NOT NULL,
  status app.tier_status NOT NULL,
  contrato_valor_animal numeric(12,2) NOT NULL,
  contrato_valor_adicional_aprovado numeric(12,2) NOT NULL,
  valor_base numeric(12,2) NOT NULL,
  valor_adicional numeric(12,2) NOT NULL,
  valor_item numeric(12,2) NOT NULL,
  CONSTRAINT tier_cobranca_item_pkey PRIMARY KEY (id)
);

CREATE INDEX tier_cobranca_proprietario_id_status_idx
  ON app.tier_cobranca(proprietario_id, status);
CREATE INDEX tier_cobranca_item_cobranca_id_idx
  ON app.tier_cobranca_item(cobranca_id);
CREATE INDEX tier_cobranca_item_tier_id_idx
  ON app.tier_cobranca_item(tier_id);

ALTER TABLE app.tier_cobranca
  ADD CONSTRAINT tier_cobranca_proprietario_id_fkey
  FOREIGN KEY (proprietario_id) REFERENCES app.tier_proprietario(id)
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE app.tier_cobranca_item
  ADD CONSTRAINT tier_cobranca_item_cobranca_id_fkey
  FOREIGN KEY (cobranca_id) REFERENCES app.tier_cobranca(id)
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE app.tier_cobranca_item
  ADD CONSTRAINT tier_cobranca_item_tier_id_fkey
  FOREIGN KEY (tier_id) REFERENCES app.tier(id)
  ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 7: Make date required end-to-end**

Remove `@IsOptional()` from create `data`; retain optional update `data` because PATCH-like update may omit it, but never accept null. `TiersService.create` writes `new Date(dto.data)`. Web `Tier.data` becomes `string`, create API body requires `data`, and the form button/save guard requires it.

- [ ] **Step 8: Verify GREEN and generate Prisma**

Run `npm run prisma:generate && npm test -- --runInBand tier/tiers` in `apps/api`, then the TierList test and `npm run typecheck` in `apps/web`.

Expected: all commands exit 0.

- [ ] **Step 9: Commit storage foundation**

```bash
git add apps/api/prisma apps/api/src/tier/tiers apps/web/src/features/tier apps/web/src/views/tier/TierListView.vue apps/web/src/views/tier/TierListView.spec.ts
git commit -m "feat(tier): add invoice storage"
```

---

### Task 2: Implement Decimal snapshot calculation and DTO validation

**Files:**
- Create: `apps/api/src/tier/cobrancas/cobranca-calculator.ts`
- Test: `apps/api/src/tier/cobrancas/cobranca-calculator.spec.ts`
- Create: `apps/api/src/tier/cobrancas/dto/preview-cobranca.query.ts`
- Create: `apps/api/src/tier/cobrancas/dto/create-cobranca.dto.ts`
- Create: `apps/api/src/tier/cobrancas/dto/update-cobranca.dto.ts`
- Create: `apps/api/src/tier/cobrancas/dto/list-cobrancas.query.ts`
- Create: `apps/api/src/tier/cobrancas/dto/pagar-cobranca.dto.ts`
- Create: `apps/api/src/tier/cobrancas/cobranca.types.ts`

**Interfaces:**
- Consumes: `Tier` fields `data`, `qtdAnimais`, `status`, and both Decimal contract values.
- Produces: `snapshotTier(tier)`, `sumSnapshots(items)`, `isSnapshotStale(item)`, validated create/update/list/pay inputs, and consistent serialized shapes.

- [ ] **Step 1: Write calculator RED tests**

Cover these exact examples with `Prisma.Decimal`: 100 SUBMETIDO animals at 1.50 + 0.30 yields base `150.00`, additional `0.00`, total `150.00`; 100 APROVADO yields `150.00`, `30.00`, `180.00`. Sum mixed items and assert counts. Change each snapshot field independently and assert stale; identical values are not stale.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --runInBand tier/cobrancas/cobranca-calculator.spec.ts` from `apps/api`.

Expected: FAIL because calculator files do not exist.

- [ ] **Step 3: Implement calculator without Number conversion**

Use `new Prisma.Decimal(tier.qtdAnimais).mul(tier.contratoValorAnimal)`, `.add`, `.equals`, and Decimal zero. Return frozen fields with two-decimal Decimal values and aggregate totals `{ valorBase, valorAdicional, valorTotal, qtdAnimais, qtdAprovados }`.

- [ ] **Step 4: Add concrete DTO rules**

- Preview/create dates use `@IsDateString()` and owner uses `@IsUUID()`.
- Create `tierIds` uses `@IsArray() @ArrayNotEmpty() @ArrayUnique() @IsUUID('4', { each: true })` and `confirmOverlap` is optional boolean default false.
- Update accepts optional dates/tier IDs plus optional `confirmOverlap`; at least one business field is checked in service.
- Payment accepts optional ISO date and optional decimal string with max two fractional digits and non-negative value.
- List accepts optional owner, status enum, and date bounds.

- [ ] **Step 5: Verify GREEN and lint**

Run calculator tests and `npx eslint "src/tier/cobrancas/**/*.ts"`.

Expected: tests and lint exit 0.

- [ ] **Step 6: Commit calculation contracts**

```bash
git add apps/api/src/tier/cobrancas
git commit -m "feat(tier): add invoice snapshot calculator"
```

---

### Task 3: Implement preview, overlap, dedup, and invoice creation

**Files:**
- Create: `apps/api/src/tier/cobrancas/cobrancas.service.ts`
- Create: `apps/api/src/tier/cobrancas/cobrancas.service.spec.ts`

**Interfaces:**
- Consumes: calculator/DTO contracts from Task 2 and Prisma invoice models from Task 1.
- Produces: `preview(query)` and `create(dto)` with error codes `COBRANCA_INVALID_PERIOD`, `TIER_PROPRIETARIO_NOT_FOUND`, `COBRANCA_NO_ITEMS`, `COBRANCA_TIER_INVALID`, and `COBRANCA_OVERLAP`.

- [ ] **Step 1: Write preview RED tests**

Mock owner/Tier/invoice item queries. Assert inclusive date filters, all statuses included, already-billed Tiers remain in `itens` with `jaCobrado=true` and `cobrancaIdExistente`, overlap condition is `periodoIni <= fim AND periodoFim >= ini`, and default totals exclude billed items.

- [ ] **Step 2: Write creation RED tests**

Assert invalid/reversed dates reject, empty IDs reject, missing/wrong-owner/out-of-period Tier IDs reject, unconfirmed overlap throws `ConflictException` with overlapping invoice payload, confirmed overlap creates one `NAO_PAGA` header and nested snapshot items, and explicitly selected already-billed Tier IDs are accepted.

- [ ] **Step 3: Verify RED**

Run: `npm test -- --runInBand tier/cobrancas/cobrancas.service.spec.ts`.

Expected: FAIL because service behavior does not exist.

- [ ] **Step 4: Implement shared period and lookup helpers**

`parsePeriod(ini,fim)` converts date-only strings and throws when `ini > fim`. `findOverlap(tx, owner, ini, fim, excludeId?)` filters out `CANCELADA` and optionally the invoice being edited. `loadSnapshotTiers(tx, owner, period, ids)` deduplicates IDs, queries by owner/date/IDs, and rejects unless all IDs resolve.

- [ ] **Step 5: Implement preview**

Run owner existence, period Tier lookup, billed-item lookup through `cobranca.status.not=CANCELADA`, and overlap lookup concurrently after period validation. Map snapshots with calculator values and compute totals from `!jaCobrado` items only.

- [ ] **Step 6: Implement transactional create**

Use interactive `$transaction`: recheck overlap, load current Tiers, calculate snapshots/totals, then create the header with nested `itens.create`. Persist Decimal objects directly. Return the created detail with owner/items.

- [ ] **Step 7: Verify GREEN**

Run service tests, Tier tests, and scoped lint.

Expected: all pass.

- [ ] **Step 8: Commit generation flow**

```bash
git add apps/api/src/tier/cobrancas
git commit -m "feat(tier): generate owner invoices"
```

---

### Task 4: Implement listing, drift, edit, and lifecycle transitions

**Files:**
- Modify: `apps/api/src/tier/cobrancas/cobrancas.service.ts`
- Modify: `apps/api/src/tier/cobrancas/cobrancas.service.spec.ts`

**Interfaces:**
- Consumes: saved snapshots and live Tier relations.
- Produces: `list`, `get`, `update`, `resync`, `pagar`, `reabrir`, and `cancelar`; error codes `COBRANCA_NOT_FOUND`, `COBRANCA_NOT_EDITABLE`, `COBRANCA_NOT_PAYABLE`, `COBRANCA_NOT_REOPENABLE`, and `COBRANCA_ALREADY_CANCELLED`.

- [ ] **Step 1: Write list/detail/drift RED tests**

Assert filters map correctly, list performs one nested items+Tier query rather than per-row queries, identical live Tiers yield `stale=false`, and changing date/status/quantity/contract values yields `stale=true`. Because FK is `RESTRICT`, Tier deletion is blocked by storage; no unreachable deleted-Tier branch is required.

- [ ] **Step 2: Write edit/resync RED tests**

Assert only `NAO_PAGA` can edit/resync; edit merges omitted values with stored period/item IDs; changed period with overlapping invoice requires `confirmOverlap`; current snapshot/totals replace old items atomically; resync keeps stored period and stored Tier IDs even when a Tier's current date drifted outside the period.

- [ ] **Step 3: Write lifecycle RED tests**

Assert pay defaults to UTC current date and total, accepts edited date/value, rejects non-`NAO_PAGA`; reopen only accepts `PAGA` and clears payment fields; cancel accepts `NAO_PAGA` and `PAGA`, rejects `CANCELADA`; cancelled invoice items disappear from preview dedup.

- [ ] **Step 4: Verify RED**

Run the Cobrancas service spec.

Expected: new tests fail on missing methods.

- [ ] **Step 5: Implement list/detail and drift mapping**

Use nested `include: { proprietario: true, itens: { include: { tier: true } } }`. Map `stale` through the pure comparator and strip live `tier` from public item snapshots unless detail UI explicitly needs the current comparison.

- [ ] **Step 6: Implement update/resync transaction**

Guard status, derive final period/IDs, validate overlap and Tiers, delete old items, create new snapshots, and update totals/period in one transaction. Resync calls the same private replacement helper with existing values and bypasses period membership validation for the stored Tier set.

- [ ] **Step 7: Implement lifecycle transitions**

Use guarded status checks before `update`. Payment writes date/value; reopen writes `status=NAO_PAGA`, `dataPagamento=null`, `valorPago=null`; cancel only changes status.

- [ ] **Step 8: Verify GREEN and commit**

Run Cobrancas/Tier tests and scoped lint, then:

```bash
git add apps/api/src/tier/cobrancas
git commit -m "feat(tier): manage invoice lifecycle"
```

---

### Task 5: Expose endpoints and generate the invoice PDF

**Files:**
- Create: `apps/api/src/tier/cobrancas/cobrancas.controller.ts`
- Create: `apps/api/src/tier/cobrancas/cobrancas.controller.spec.ts`
- Create: `apps/api/src/tier/cobrancas/cobranca-pdf.service.ts`
- Create: `apps/api/src/tier/cobrancas/cobranca-pdf.service.spec.ts`
- Create: `apps/api/src/tier/cobrancas/cobrancas.module.ts`
- Modify: `apps/api/src/tier/tier.module.ts`

**Interfaces:**
- Consumes: service detail rows and existing `src/assets/logo.png` fallback sequence.
- Produces: all `/v1/tier/cobrancas` routes and PDF `{ buffer, filename, contentType: 'application/pdf' }`.

- [ ] **Step 1: Write controller RED tests**

Assert every endpoint calls `requireTier`, static `preview` is routed before `:id`, DTOs reach the corresponding service methods, and PDF sets `Content-Type`, quoted UTF-8-safe `Content-Disposition`, `Content-Length`, then sends the Buffer.

- [ ] **Step 2: Write PDF RED tests**

Generate a paid fixture with two items, load the result using `PDFDocument.load`, and assert at least one page plus `%PDF` header. Spy on logo reads to prove missing logo falls back without failing. Test filename is `fatura-<id>.pdf`.

- [ ] **Step 3: Verify RED**

Run controller/PDF specs.

Expected: FAIL because files do not exist.

- [ ] **Step 4: Implement PDF renderer**

Use Helvetica/HelveticaBold, A4 pages, page-break helper, optional PNG logo from `src/assets/logo.png` then `dist/assets/logo.png`, owner/period/status block, six-column item table, totals, and payment block for `PAGA`. Format BRL from Decimal strings only at presentation time with two digits.

- [ ] **Step 5: Implement controller/module**

Add preview, create, list, get, update, resync, pay, reopen, cancel, and PDF routes. Register service/PDF/controller in `CobrancasModule` and import it into `TierModule`.

- [ ] **Step 6: Verify GREEN and API gate**

Run controller/PDF specs, all Tier tests, scoped lint, and API build.

- [ ] **Step 7: Commit API surface**

```bash
git add apps/api/src/tier/cobrancas apps/api/src/tier/tier.module.ts
git commit -m "feat(tier): expose invoice api and pdf"
```

---

### Task 6: Add web invoice contracts, queries, and pure formatting

**Files:**
- Modify: `apps/web/src/features/tier/types.ts`
- Modify: `apps/web/src/features/tier/api.ts`
- Modify: `apps/web/src/features/tier/queries.ts`
- Modify: `apps/web/src/features/tier/queries.spec.ts`
- Create: `apps/web/src/features/tier/cobranca-format.ts`
- Create: `apps/web/src/features/tier/cobranca-format.spec.ts`

**Interfaces:**
- Consumes: API response shapes from Tasks 3-5.
- Produces: invoice/item/preview/total types, CRUD/lifecycle/PDF API functions, Vue Query hooks/mutations, `formatMoney`, `formatDateOnly`, and `totalsForSelection`.

- [ ] **Step 1: Write query/formatter RED tests**

Assert keys `['tier','cobrancas']`, list filters, detail ID, and preview params. Assert BRL formatting from decimal strings, date-only formatting without timezone shift, and selection totals including manually un-crossed items.

- [ ] **Step 2: Verify RED**

Run both focused specs.

Expected: FAIL on missing contracts/helpers.

- [ ] **Step 3: Add exact web types**

Define `CobrancaStatus`, `CobrancaItem`, `Cobranca`, `CobrancaPreviewItem`, `CobrancaPreview`, and mutation payloads. Decimal fields are strings; date fields are ISO strings; `stale` is boolean.

- [ ] **Step 4: Add API methods**

Implement list/detail/preview/create/update/resync/pay/reopen/cancel. `downloadCobrancaPdf(id)` requests `responseType:'blob'`, creates an object URL, clicks a temporary anchor named `fatura-<id>.pdf`, revokes URL, and removes the anchor.

- [ ] **Step 5: Add query hooks and invalidation**

Use reactive computed keys for filters/IDs/preview. Preview is enabled only with owner+both dates. Mutations invalidate `['tier','cobrancas']` and `tierKeys.credito()` as required by the spec.

- [ ] **Step 6: Verify GREEN and commit**

Run focused tests, lint, and typecheck, then:

```bash
git add apps/web/src/features/tier
git commit -m "feat(tier-web): add invoice data contracts"
```

---

### Task 7: Build invoice form and payment dialogs

**Files:**
- Create: `apps/web/src/views/tier/CobrancaFormDialog.vue`
- Create: `apps/web/src/views/tier/CobrancaFormDialog.spec.ts`
- Create: `apps/web/src/views/tier/CobrancaPaymentDialog.vue`
- Create: `apps/web/src/views/tier/CobrancaPaymentDialog.spec.ts`

**Interfaces:**
- Consumes: proprietario options, preview query, create/update mutations, overlap 409 payload, and payment mutation.
- Produces: emitted `saved`/`close` events, live included Tier set, explicit duplicate inclusion, overlap confirmation, and editable payment defaults.

- [ ] **Step 1: Write form-dialog RED contract**

Assert searchable owner Combobox, two required date inputs, preview rows, crossed-out red billed rows, inclusion checkbox/toggle, overlap label, running counts/value, disabled save for zero selected items, and retry with `confirmOverlap:true` after user confirmation.

- [ ] **Step 2: Write payment-dialog RED contract**

Assert date defaults to local YYYY-MM-DD, value defaults to invoice total string, both remain editable, cancel emits close, and save calls pay payload.

- [ ] **Step 3: Verify RED**

Run both dialog specs.

Expected: FAIL because components do not exist.

- [ ] **Step 4: Implement form dialog**

Use `UiDialog` with `max-w-5xl`, no nested cards, stable table dimensions, owner/date controls, preview loading/error/empty states, and native checkbox for inclusion. Initialize selected IDs to `!jaCobrado`; toggling a crossed item is the explicit "desrasurar" action. On overlap 409 or preview overlap, use one confirmation and resend.

- [ ] **Step 5: Implement payment dialog**

Use a compact `UiDialog`, date and decimal text/number input, validation for non-negative two-decimal value, and pending state.

- [ ] **Step 6: Verify GREEN and commit**

Run focused tests, lint, and typecheck, then:

```bash
git add apps/web/src/views/tier/CobrancaFormDialog.vue apps/web/src/views/tier/CobrancaFormDialog.spec.ts apps/web/src/views/tier/CobrancaPaymentDialog.vue apps/web/src/views/tier/CobrancaPaymentDialog.spec.ts
git commit -m "feat(tier-web): add invoice dialogs"
```

---

### Task 8: Build Pagamentos list, detail, actions, and navigation

**Files:**
- Create: `apps/web/src/views/tier/CobrancaStatusBadge.vue`
- Create: `apps/web/src/views/tier/CobrancasView.vue`
- Create: `apps/web/src/views/tier/CobrancasView.spec.ts`
- Create: `apps/web/src/views/tier/CobrancaDetailView.vue`
- Create: `apps/web/src/views/tier/CobrancaDetailView.spec.ts`
- Modify: `apps/web/src/views/tier/TierNav.vue`
- Modify: `apps/web/src/views/tier/TierNav.spec.ts`
- Modify: `apps/web/src/router/index.ts`

**Interfaces:**
- Consumes: query/mutation hooks, dialogs, status badge, PDF download, and routes `/tier/cobrancas` plus `/tier/cobrancas/:id`.
- Produces: complete Pagamentos list/detail workflow with status-sensitive actions and stale resync.

- [ ] **Step 1: Write list/detail/navigation RED tests**

List contract asserts TierNav first, owner/period/total/status/stale columns, open/edit/pay/reopen/cancel/PDF actions, printer Lucide icon, and new invoice command. Detail contract asserts owner/payment header, snapshot item table, totals, stale alert+resync, status actions, and PDF. TierNav contract asserts Pagamentos route and active matching for detail.

- [ ] **Step 2: Verify RED**

Run the three focused specs.

Expected: FAIL because views/routes/nav entry do not exist.

- [ ] **Step 3: Implement status badge and shared action rules**

Map `NAO_PAGA` to muted/amber, `PAGA` to green, and `CANCELADA` to red semantic classes. Show edit/pay only for `NAO_PAGA`, reopen only for `PAGA`, cancel for any non-cancelled invoice, PDF/open for all.

- [ ] **Step 4: Implement list view**

Render filters and dense table, open row/detail action, dialogs, confirmation for cancel/reopen, stale indicator, and icon buttons with titles/aria labels. Refetch/invalidation is query-driven.

- [ ] **Step 5: Implement detail view**

Use an unframed page layout with TierNav first, invoice metadata, snapshot table, totals, optional payment block, stale alert and resync only when `NAO_PAGA`, and the same lifecycle/PDF actions.

- [ ] **Step 6: Add routes and nav**

Insert both static routes before `tier/:id`. Add `/tier/cobrancas` to `SUB` and `Pagamentos` after Credito; matching uses `startsWith('/tier/cobrancas')`.

- [ ] **Step 7: Verify GREEN and commit**

Run focused tests, lint, typecheck, and build, then:

```bash
git add apps/web/src/views/tier apps/web/src/router/index.ts
git commit -m "feat(tier-web): add payments workflow"
```

---

### Task 9: Full verification and staging handoff

**Files:**
- Verify all D files; do not edit unrelated lint/test debt.

**Interfaces:**
- Consumes: Tasks 1-8.
- Produces: build/test evidence and explicit staging migration/PDF checklist.

- [ ] **Step 1: Run API verification**

Run from `apps/api`:

```bash
npm run prisma:generate
npm test -- --runInBand
npm run build
npx eslint "src/tier/**/*.ts" src/admin/admin.service.spec.ts
```

Expected: 397+ tests pass, build exits 0, and scoped lint exits 0. Record the known unrelated global API lint baseline separately.

- [ ] **Step 2: Run web verification**

Run from `apps/web`:

```bash
npm run lint
npm test -- --run
npm run typecheck
npm run build
```

Expected: every command exits 0; existing non-failing warnings are recorded.

- [ ] **Step 3: Verify requirements and diff**

Run `git diff --check`, inspect all D commits, and map every spec rule to a task/test: required Tier date, Decimal formula, snapshot, drift/resync, dedup rasura, overlap confirmation, lifecycle, no delete, PDF, list/detail, and navigation.

- [ ] **Step 4: Staging checklist**

Before `prisma migrate deploy`, query null Tier dates and invoice table conflicts. After deploy, create one owner invoice with mixed statuses, verify crossed dedup in a second preview, edit a Tier to trigger stale, resync, pay/reopen/cancel, and inspect/download the PDF from list and detail.

## Self-review

- **Spec coverage:** Task 1 storage/date; Task 2 money/validation; Tasks 3-4 preview/create/drift/lifecycle; Task 5 endpoints/PDF; Task 6 web contracts; Task 7 create/edit/pay dialogs; Task 8 list/detail/navigation; Task 9 gates/staging.
- **Placeholder scan:** no deferred implementation markers or generic error-handling steps remain. Out-of-scope reporting/batch/CSV work is explicitly excluded.
- **Type consistency:** all money is Prisma Decimal in API and string in web; status names match Prisma/API/web; period fields consistently use `periodoIni`/`periodoFim`; item total is `valorItem`; aggregate total is `valorTotal`.
- **State consistency:** only `NAO_PAGA` edits/resyncs/pays; only `PAGA` reopens and clears payment fields; any non-cancelled invoice may cancel; cancelled invoices no longer dedup Tiers.
- **Concurrency policy:** create/edit recompute snapshots and overlap inside a transaction. Duplicate Tier inclusion is an explicit supported override, so no uniqueness constraint incorrectly forbids it.
- **Drift policy:** FK `RESTRICT` prevents deleting referenced Tiers; stale compares live mutable Tier fields to frozen item fields and never auto-updates.
