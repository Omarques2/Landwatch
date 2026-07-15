# Tier — Cobranças / Pagamentos (Sub-project D) — Design

**Status:** approved (design), pending spec review
**Part of:** Tier enhancements — A (cache/optimistic) → B (doc/GTA UX) → C (Crédito) → **D (this)**. Assumes A's query layer and C's `proprietarioId`-on-abate exist. Independent of B.

## Problem / Goal

There is no way to bill the Sigfarm commission per cattle owner. Need a "Pagamentos" tab to generate an invoice (fatura) for one proprietário over a date period, aggregating that owner's Tiers in the period × their snapshot contract, track payment status, and export a simple PDF to send to the owner. Reporting dashboards are explicitly deferred.

## Agreed rules

- One fatura = one proprietário + one period (`periodoIni`..`periodoFim`). Generation is per-owner (batch deferred).
- Tier membership: `tier.data` within `[ini, fim]`. **`tier.data` becomes required** (NOT NULL).
- Every tier in the period is billed: base on **all** animals, adicional on **APROVADO** only.
- **Snapshot** on save (values frozen); a drift detector flags later tier changes with a manual "Atualizar fatura".
- **Dedup:** a tier already in a non-cancelled fatura is shown struck-through (red) and excluded by default; user can "desrasurar" to include it. Period overlap raises a non-blocking confirm on save.
- Lifecycle: `NAO_PAGA` → `PAGA` (confirm w/ data+valor, defaults today/total, both editable) → `reabrir` back to `NAO_PAGA`; edit only while `NAO_PAGA`; **cancelar** only (soft, stays visible, frees its tiers) — no hard delete.
- Money as `Decimal(12,2)`; counts as `Int`.

## Data model (migration)

- `tier.data` → **NOT NULL** (backfill existing nulls to `created_at::date` first).
- Enum `tier_cobranca_status` = `NAO_PAGA | PAGA | CANCELADA`.
- **`tier_cobranca`**: `id, proprietario_id uuid (FK RESTRICT), periodo_ini date, periodo_fim date, status tier_cobranca_status default NAO_PAGA, valor_base numeric(12,2), valor_adicional numeric(12,2), valor_total numeric(12,2), qtd_animais int, qtd_aprovados int, data_pagamento date?, valor_pago numeric(12,2)?, created_at, updated_at`. Index `(proprietario_id, status)`.
- **`tier_cobranca_item`**: `id, cobranca_id uuid (FK CASCADE), tier_id uuid (FK RESTRICT), tier_data date, qtd_animais int, status tier_status, contrato_valor_animal numeric(12,2), contrato_valor_adicional_aprovado numeric(12,2), valor_base numeric(12,2), valor_adicional numeric(12,2), valor_item numeric(12,2)`. Index `(cobranca_id)`, `(tier_id)`. All value/qty columns are the **frozen snapshot** at generation.

## Value calculation

Per item: `valor_base = qtd_animais × contrato_valor_animal`; `valor_adicional = status==APROVADO ? qtd_animais × contrato_valor_adicional_aprovado : 0`; `valor_item = valor_base + valor_adicional`. Fatura totals = Σ over included items (`valor_base`, `valor_adicional`, `valor_total`, `qtd_animais`, `qtd_aprovados`). Contract values are copied from each tier's own snapshot at generation time (double snapshot: tier already froze the proprietário contract; the fatura freezes the tier's).

## Backend endpoints (`v1/tier/cobrancas`, `requireTier`)

- **`GET /preview?proprietarioId=&ini=&fim=`** → no persist. Returns:
  - `itens`: tiers with `tier.data ∈ [ini,fim]` for the owner, each with computed base/adicional/total + `jaCobrado` (bool) + `cobrancaIdExistente` (which non-cancelled fatura already holds it).
  - `overlap`: non-cancelled faturas of the owner whose period intersects `[ini,fim]`.
  - `totais`: computed over the not-`jaCobrado` items (default inclusion).
- **`POST /`** → `{ proprietarioId, periodoIni, periodoFim, tierIds: string[], confirmOverlap: boolean }`. `tierIds` = the user's final included set (after rasura toggles). Server recomputes+snapshots items for those tiers, computes totals, creates the fatura (`NAO_PAGA`). If `overlap exists && !confirmOverlap` → `409 COBRANCA_OVERLAP` (UI resends with `confirmOverlap:true`).
- **`GET /`** → list (filters `proprietarioId`, `status`, `ini`/`fim`), each with `stale` flag.
- **`GET /:id`** → fatura + items + `stale` + the owner's basic data.
- **`PUT /:id`** (only `NAO_PAGA`) → `{ periodoIni?, periodoFim?, tierIds? }` → re-snapshot items/totals.
- **`POST /:id/resync`** (only `NAO_PAGA`) → re-snapshot items from current tiers for the stored period/tier set (clears `stale`).
- **`POST /:id/pagar`** → `{ dataPagamento?, valorPago? }` (defaults today / `valor_total`) → `PAGA`.
- **`POST /:id/reabrir`** → `PAGA` → `NAO_PAGA`.
- **`POST /:id/cancelar`** → `CANCELADA` (frees its tiers for dedup).
- **`GET /:id/pdf`** → `application/pdf`.

**Drift (`stale`) detection:** for each item, compare snapshot (`qtd_animais`, `status`, contract values, `tier_data`) against the current tier (by `tier_id`); if any differ, or a tier was deleted, `stale = true`. Never auto-updates.

## PDF (`GET /:id/pdf`) — initial, simple

Server-side with **`pdf-lib`** (reuse the approach in `apps/api/src/analyses/pdf/analysis-pdf.service.ts`). Layout:
- Header: company logo (reuse the brand asset used by `analysis-pdf.service`; if none, a configurable/placeholder), title "Fatura", fatura id, emission date.
- Owner block: proprietário nome, CPF/CNPJ, período `ini–fim`, status.
- Items table: one row per tier — `data | qtd animais | aprovado? | valor base | valor adicional | valor item`.
- Totals: base, adicional, **total**; payment block (data pagamento / valor pago) when `PAGA`.
Iterate on styling later; keep v1 minimal.

## Frontend — "Pagamentos" tab

- Route `tier/cobrancas` + `tier/cobrancas/:id`; add **"Pagamentos"** entry to `TierNav.vue`.
- **CobrancasView (list):** table — proprietário, período, `valor_total`, status badge (semantic color), `stale` indicator. Row actions: **abrir (detail)**, pagar/reabrir/cancelar/editar (by status), **PDF (printer icon → downloads `/:id/pdf`)**. "Nova fatura" button.
- **Nova fatura (modal):** proprietário `Combobox` (from B) + período (2 date inputs) → **live preview** via `GET /preview`: items table with `jaCobrado` rows struck-through/red + a toggle to include ("desrasurar"); running totals (animais, aprovados, valor); a **label** when `overlap` is present. Save → `POST /` (resends `confirmOverlap:true` after the confirm dialog if overlap).
- **CobrancaDetailView (`/:id`):** the openable invoice view (what the user inspects before PDF and what the PDF mirrors) — header (owner, período, status, pagamento), items table, totals, `stale` alert + "Atualizar fatura" (resync), and the same status actions + PDF button.
- All data via A's `queries.ts` (`useCobrancas`, `useCobranca(id)`, preview as a manual/`enabled` query; mutations invalidate `cobrancas` + `credito`).

## Error handling
- `POST /` overlap without confirm → `409 COBRANCA_OVERLAP` (payload lists the overlapping faturas) → UI shows confirm dialog.
- Edit/resync/pay on wrong status → `400` with a clear code (`COBRANCA_NOT_EDITABLE`, etc.).
- `tier.data` NOT NULL: create/edit Tier now requires `data` (frontend TierListView create form makes it required).

## Testing
- jest (mocked Prisma): item value calc (base all + adicional approved); totals; `jaCobrado` flag; overlap detection; snapshot immutability vs live tier change → `stale`; pay/reabrir/cancelar transitions + guards; cancel frees tier from dedup.
- Web: gate (lint/typecheck/build); PDF + preview validated manually on staging.

## Migration notes / limitations
- `tier.data` NOT NULL — backfill first; applied via `prisma migrate deploy`.
- `pdf-lib` already a dependency (analysis PDF). Logo asset reused/placeholder — refine later.
- Batch generation (all owners at once), reporting dashboards, and CSV export are **out of scope** (future).
- Per-tier credit remains proprietário-level (from C); faturas bill by tier line items but credit math is unchanged by D.
