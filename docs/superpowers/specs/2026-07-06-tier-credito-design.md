# Tier — Crédito tab + proprietário no Abate (Sub-project C) — Design

**Status:** approved (design), pending spec review
**Part of:** Tier enhancements — A (cache/optimistic) → B (doc/GTA UX) → **C (this)** → D (Cobranças). Assumes A's query layer exists.

## Problem

There is no view of how much credit each cattle owner still has (approved animals not yet slaughtered). Worse, the `Abate` record has no owner: the slaughter's proprietário is only implicit via linked tiers, and tier links are optional (rarely known). So credit cannot be computed correctly today.

## Goal

Attribute every abate to a proprietário, and add a Crédito tab that shows, per owner, approved animals − slaughtered animals = remaining credit. Tier linkage on an abate stays optional and informational (not part of the credit math).

## Domain rule (agreed)

Credit is computed at the **proprietário** level, ignoring specific tiers:

```
credito(prop).aprovados = Σ tier.qtdAnimais   WHERE tier.proprietarioId = prop AND tier.status = 'APROVADO'
credito(prop).abatidos  = Σ abate.qtd          WHERE abate.proprietarioId = prop
credito(prop).restante  = aprovados − abatidos
```

Selecting tier(s) on an abate is optional and does not affect this math (kept only as informational detail). Knowing the exact source tier of a slaughter is rare, so it is never required.

## Components

### 1. `proprietarioId` on Abate (backend)
- **Migration:** `ALTER TABLE app.tier_abate ADD COLUMN proprietario_id uuid;` then backfill/validate and add FK `REFERENCES app.tier_proprietario(id) ON DELETE RESTRICT ON UPDATE CASCADE`. Column is **required** for new records (NOT NULL enforced at the app layer; if the table is empty on staging, set `NOT NULL` in the migration directly).
- **Prisma:** `Tier`/schema — add `proprietarioId String @map("proprietario_id") @db.Uuid` + relation on `TierAbate`; add `abates TierAbate[]` back-relation to `TierProprietario`.
- **DTO:** `CreateAbateDto` gains `@IsUUID() proprietarioId!` (required). `consumos` stays optional.
- **`AbatesService.create`:** require `proprietarioId` (throw if the proprietário does not exist); `consumos` optional; **if** consumos are provided, validate every referenced tier's `proprietarioId === abate.proprietarioId` (else `BadRequestException TIER_CONSUMO_OWNER_MISMATCH`). No saldo requirement, no APROVADO requirement on consumos (informational).

### 2. Credit calculation (backend, replaces B7 logic)
- Update `ProprietariosService.credito(id)`:
  - `aprovados` = `prisma.tier.aggregate(_sum qtdAnimais WHERE proprietarioId=id AND status=APROVADO)`
  - `abatidos` = `prisma.tierAbate.aggregate(_sum qtd WHERE proprietarioId=id)`
  - `restante = aprovados − abatidos`
  - Returns `{ proprietarioId, aprovados, abatidos, creditoRestante }`.
- **New aggregate endpoint** `GET /v1/tier/credito` (own controller/service, e.g. `credito/`): returns one row per proprietário `{ proprietarioId, nome, aprovados, abatidos, creditoRestante }` for **all** proprietários. Implementation: two grouped aggregates (`tier.groupBy proprietarioId where APROVADO`, `tierAbate.groupBy proprietarioId`) joined in memory against the proprietário list, or a single raw SQL with two `LEFT JOIN LATERAL`/subquery sums. Prefer the groupBy-in-service approach for clarity. Gated by `requireTier`.

### 3. Frontend
- **AbatesView (modify):**
  - Add a **required proprietário `Combobox`** (from B) at the top of the form.
  - The tier picker lists only that proprietário's tiers (filter `useTiers({ proprietarioId })`); selection is **optional**; drop the `saldo>0` gate. `qtd` stays required. Submit sends `proprietarioId`, `qtd`, optional `consumos`.
  - Recent-abates table gains a "Proprietário" column.
- **CreditoView (new):** route `tier/credito` + entry in `TierNav.vue` (`… · GTAs · Abates · Crédito`). Table over `GET /v1/tier/credito` for **all** proprietários: `Proprietário | Aprovados | Abatidos | Crédito restante` (tabular-nums; restante emphasized, red when negative). **Drill-down:** clicking a row expands/opens a panel showing the owner's APROVADO tiers (the "aprovados" side, via `useTiers({ proprietarioId, status:'APROVADO' })`) and the owner's abates (the "abatidos" side, filtered from `useAbates`).
- Queries/mutations go through A's `queries.ts` (new `useCredito` list hook; abate create invalidates credito + abates + tiers).

## Data flow
View (CreditoView) → `useCredito()` (cached) → `GET /v1/tier/credito`. Abate create → mutation → invalidate `credito`, `abates`, `tiers` → Crédito tab reflects new abatidos automatically (A's background refetch).

## Error handling
- Abate without `proprietarioId` → 400.
- Consumo tier of another owner → 400 `TIER_CONSUMO_OWNER_MISMATCH`.
- Credit endpoint tolerates owners with zero tiers/abates (0/0/0).

## Testing
- jest (mocked Prisma): credito uses `tierAbate._sum.qtd` for abatidos (not consumos); aprovados from APROVADO tiers; owner-mismatch consumo rejected; abate requires proprietarioId.
- Example check: aprovados 630, abates totalling 181 → restante 449 (independent of consumos).
- Web: gate + manual drill-down on staging.

## Migration notes / limitations
- `tier_abate.proprietario_id` added NOT NULL (table empty on staging). Applied via `prisma migrate deploy`.
- Per-tier `saldo`/`receita` in `getTier` (TierDetailView) remain but are now **informational** — the authoritative credit is proprietário-level. Left unchanged to avoid scope creep; a later cleanup could relabel them.
- Out of scope: Cobranças/pagamentos (D); any money valuation of credit (credit is animal counts here).
