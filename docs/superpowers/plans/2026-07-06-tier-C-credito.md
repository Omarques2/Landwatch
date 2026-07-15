# Tier Sub-project C - Credito Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Attribute every abate to a proprietario and expose a Credito tab where approved animals minus all slaughtered animals is calculated per owner.

**Architecture:** `tier_abate.proprietario_id` becomes the authoritative owner link; optional tier consumos remain informational and are only checked for owner consistency. The existing owner credit endpoint is corrected and a new aggregate credit module joins grouped Tier and Abate totals. Vue Query keeps individual and aggregate credit under distinct child keys, while Abates and Credito views consume the new contracts.

**Tech Stack:** NestJS 11, Prisma 7/PostgreSQL, Jest 30, Vue 3.5, TanStack Vue Query 5, Vitest 3, Tailwind CSS.

## Global Constraints

- Follow `docs/superpowers/specs/2026-07-06-tier-credito-design.md` and keep cobrancas/pagamentos out of scope.
- Credit is animal count only: `APROVADO tier.qtdAnimais - tier_abate.qtd`, grouped by proprietario.
- Tier consumos on an abate are optional and never affect proprietario credit.
- No local PostgreSQL is available; validate migrations with `prisma generate` and apply later with `prisma migrate deploy` on staging.
- Preserve the existing per-tier saldo/receita calculation as informational behavior.
- One task produces one focused commit, without AI attribution trailers.

---

### Task 1: Persist the abate owner safely

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260715160000_tier_abate_proprietario/migration.sql`

**Interfaces:**
- Consumes: existing `app.tier_abate`, `app.tier_abate_consumo`, `app.tier`, and `app.tier_proprietario` tables.
- Produces: required `TierAbate.proprietarioId: string`, relation `TierAbate.proprietario`, and `TierProprietario.abates`.

- [ ] **Step 1: Add the Prisma relation**

Add `abates TierAbate[]` to `TierProprietario`. Add the following to `TierAbate` and index it:

```prisma
proprietarioId String @map("proprietario_id") @db.Uuid
proprietario   TierProprietario @relation(fields: [proprietarioId], references: [id], onDelete: Restrict)

@@index([proprietarioId])
```

- [ ] **Step 2: Add a data-safe SQL migration**

```sql
ALTER TABLE app.tier_abate
  ADD COLUMN IF NOT EXISTS proprietario_id uuid;

-- Legacy rows with consumos can be inferred only when every linked tier has
-- the same owner. Rows without a unique owner deliberately stop deployment.
UPDATE app.tier_abate AS abate
SET proprietario_id = inferred.proprietario_id
FROM (
  SELECT consumo.abate_id, MIN(tier.proprietario_id::text)::uuid AS proprietario_id
  FROM app.tier_abate_consumo AS consumo
  JOIN app.tier AS tier ON tier.id = consumo.tier_id
  GROUP BY consumo.abate_id
  HAVING COUNT(DISTINCT tier.proprietario_id) = 1
) AS inferred
WHERE inferred.abate_id = abate.id
  AND abate.proprietario_id IS NULL;

DO $$
DECLARE unresolved_count integer;
BEGIN
  SELECT COUNT(*) INTO unresolved_count
  FROM app.tier_abate
  WHERE proprietario_id IS NULL;

  IF unresolved_count > 0 THEN
    RAISE EXCEPTION
      'tier_abate has % row(s) without an inferable proprietario_id',
      unresolved_count;
  END IF;
END $$;

ALTER TABLE app.tier_abate
  ALTER COLUMN proprietario_id SET NOT NULL;

ALTER TABLE app.tier_abate
  ADD CONSTRAINT tier_abate_proprietario_id_fkey
  FOREIGN KEY (proprietario_id)
  REFERENCES app.tier_proprietario(id)
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS tier_abate_proprietario_id_idx
  ON app.tier_abate (proprietario_id);
```

- [ ] **Step 3: Generate the Prisma client**

Run: `npm run prisma:generate` from `apps/api`.

Expected: exit 0 and generated `TierAbate` types require `proprietarioId`.

- [ ] **Step 4: Commit the schema change**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260715160000_tier_abate_proprietario/migration.sql
git commit -m "feat(tier): require owner on abates"
```

---

### Task 2: Require owner on abate creation

**Files:**
- Modify: `apps/api/src/tier/abates/dto/create-abate.dto.ts`
- Modify: `apps/api/src/tier/abates/abates.service.ts`
- Test: `apps/api/src/tier/abates/abates.service.spec.ts`

**Interfaces:**
- Consumes: `CreateAbateDto.proprietarioId: string` and optional `consumos`.
- Produces: abate list/detail/create rows including `proprietario`; error codes `TIER_PROPRIETARIO_NOT_FOUND`, `TIER_NOT_FOUND`, and `TIER_CONSUMO_OWNER_MISMATCH`.

- [ ] **Step 1: Write failing service tests**

Replace obsolete APROVADO/saldo tests with these behaviors:

```ts
it('requires an existing proprietario', async () => {
  tx.tierProprietario.findUnique.mockResolvedValue(null);
  await expect(service.create({
    proprietarioId: 'p1', dataAbate: '2026-04-16', qtd: 100,
  } as any)).rejects.toMatchObject({
    response: expect.objectContaining({ code: 'TIER_PROPRIETARIO_NOT_FOUND' }),
  });
});

it('creates an owner-attributed abate without consumos', async () => {
  await service.create({
    proprietarioId: 'p1', dataAbate: '2026-04-16', qtd: 100,
  } as any);
  expect(tx.tierAbate.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ proprietarioId: 'p1', qtd: 100 }),
  });
  expect(tx.tierAbateConsumo.create).not.toHaveBeenCalled();
});

it('rejects a consumo owned by another proprietario', async () => {
  tx.tier.findUnique.mockResolvedValue({ id: 't1', proprietarioId: 'p2' });
  await expect(service.create({
    proprietarioId: 'p1', dataAbate: '2026-04-16', qtd: 50,
    consumos: [{ tierId: 't1', qtdConsumida: 50 }],
  } as any)).rejects.toMatchObject({
    response: expect.objectContaining({ code: 'TIER_CONSUMO_OWNER_MISMATCH' }),
  });
});

it('accepts an informational consumo regardless of tier status or saldo', async () => {
  tx.tier.findUnique.mockResolvedValue({
    id: 't1', proprietarioId: 'p1', status: 'SUBMETIDO', qtdAnimais: 10,
  });
  await service.create({
    proprietarioId: 'p1', dataAbate: '2026-04-16', qtd: 50,
    consumos: [{ tierId: 't1', qtdConsumida: 50 }],
  } as any);
  expect(tx.tierAbateConsumo.create).toHaveBeenCalledWith({
    data: { abateId: 'a1', tierId: 't1', qtdConsumida: 50 },
  });
});
```

- [ ] **Step 2: Run the tests to verify RED**

Run: `npm test -- --runInBand tier/abates/abates.service.spec.ts` from `apps/api`.

Expected: FAIL because the transaction mock has no owner lookup and `create` does not persist or validate `proprietarioId`.

- [ ] **Step 3: Add DTO and service behavior**

Add `@IsUUID() proprietarioId!: string;` before `dataAbate`. In `create`, look up `tx.tierProprietario.findUnique({ where: { id: dto.proprietarioId } })`, throw `NotFoundException` with `TIER_PROPRIETARIO_NOT_FOUND` when absent, and pass `proprietarioId` to `tierAbate.create`. For every optional consumo, keep the missing-tier guard, remove APROVADO and saldo guards, and enforce:

```ts
if (tier.proprietarioId !== dto.proprietarioId) {
  throw new BadRequestException({
    code: 'TIER_CONSUMO_OWNER_MISMATCH',
    message: 'Tier nao pertence ao proprietario do abate',
  });
}
```

Use `include: { consumos: true, frigorifico: true, proprietario: true }` for `list`, `get`, and the created row.

- [ ] **Step 4: Run the tests to verify GREEN**

Run: `npm test -- --runInBand tier/abates/abates.service.spec.ts` from `apps/api`.

Expected: PASS with owner existence, mismatch, optional-consumo, and persistence coverage.

- [ ] **Step 5: Commit abate behavior**

```bash
git add apps/api/src/tier/abates
git commit -m "feat(tier): attribute abates to owners"
```

---

### Task 3: Correct individual and aggregate credit

**Files:**
- Modify: `apps/api/src/tier/proprietarios/proprietarios.service.ts`
- Test: `apps/api/src/tier/proprietarios/proprietarios.service.spec.ts`
- Create: `apps/api/src/tier/credito/credito.service.ts`
- Create: `apps/api/src/tier/credito/credito.service.spec.ts`
- Create: `apps/api/src/tier/credito/credito.controller.ts`
- Create: `apps/api/src/tier/credito/credito.module.ts`
- Modify: `apps/api/src/tier/tier.module.ts`

**Interfaces:**
- Consumes: grouped `Tier.qtdAnimais` for `APROVADO` and grouped `TierAbate.qtd` by `proprietarioId`.
- Produces: individual `{ proprietarioId, aprovados, abatidos, creditoRestante }` and aggregate rows `{ proprietarioId, nome, aprovados, abatidos, creditoRestante }` from `GET /v1/tier/credito`.

- [ ] **Step 1: Write failing individual-credit test**

Change the Prisma mock to `tierAbate: { aggregate: jest.fn() }` and assert:

```ts
prisma.tier.aggregate.mockResolvedValue({ _sum: { qtdAnimais: 630 } });
prisma.tierAbate.aggregate.mockResolvedValue({ _sum: { qtd: 181 } });
expect(await service.credito('p1')).toEqual({
  proprietarioId: 'p1', aprovados: 630, abatidos: 181, creditoRestante: 449,
});
expect(prisma.tierAbate.aggregate).toHaveBeenCalledWith({
  _sum: { qtd: true }, where: { proprietarioId: 'p1' },
});
```

- [ ] **Step 2: Verify individual-credit RED**

Run: `npm test -- --runInBand tier/proprietarios/proprietarios.service.spec.ts` from `apps/api`.

Expected: FAIL because the service still reads `tierAbateConsumo`.

- [ ] **Step 3: Implement individual credit**

After `await this.get(id)`, aggregate approved tiers and owner abates with `Promise.all`, normalize null sums to zero, and subtract `abatidos` from `aprovados`.

- [ ] **Step 4: Verify individual-credit GREEN**

Run the command from Step 2.

Expected: PASS, including the 630 - 181 = 449 example.

- [ ] **Step 5: Write failing aggregate-credit test**

Create `credito.service.spec.ts` with two proprietarios, grouped totals only for the first, and expect the second row to be `0/0/0`. Also assert `tier.groupBy` filters `status: 'APROVADO'` and `tierAbate.groupBy` groups by `proprietarioId`.

- [ ] **Step 6: Verify aggregate-credit RED**

Run: `npm test -- --runInBand tier/credito/credito.service.spec.ts` from `apps/api`.

Expected: FAIL because `CreditoService` does not exist.

- [ ] **Step 7: Implement aggregate service and endpoint**

`CreditoService.list()` runs these calls concurrently:

```ts
this.prisma.tierProprietario.findMany({
  select: { id: true, nome: true }, orderBy: { nome: 'asc' },
});
this.prisma.tier.groupBy({
  by: ['proprietarioId'], where: { status: 'APROVADO' },
  _sum: { qtdAnimais: true },
});
this.prisma.tierAbate.groupBy({
  by: ['proprietarioId'], _sum: { qtd: true },
});
```

Join the grouped arrays through maps and return one row per proprietario. Add `CreditoController` at `v1/tier/credito`, gate `@Get()` with `requireTier`, register provider/controller in `CreditoModule`, and import it from `TierModule`.

- [ ] **Step 8: Verify aggregate-credit GREEN and API regression**

Run: `npm test -- --runInBand tier` from `apps/api`.

Expected: all Tier suites PASS.

- [ ] **Step 9: Commit credit API**

```bash
git add apps/api/src/tier/proprietarios apps/api/src/tier/credito apps/api/src/tier/tier.module.ts
git commit -m "feat(tier): add owner credit summary"
```

---

### Task 4: Add distinct web credit contracts

**Files:**
- Modify: `apps/web/src/features/tier/types.ts`
- Modify: `apps/web/src/features/tier/api.ts`
- Modify: `apps/web/src/features/tier/queries.ts`
- Test: `apps/web/src/features/tier/queries.spec.ts`

**Interfaces:**
- Consumes: API contracts from Tasks 2 and 3.
- Produces: `CreditoRow`, `listCreditos()`, `useCreditos()`, owner-aware `Abate`, and non-colliding credit query keys.

- [ ] **Step 1: Write failing query-key tests**

```ts
expect(tierKeys.credito()).toEqual(['tier', 'credito']);
expect(tierKeys.creditoByProprietario('p1')).toEqual([
  'tier', 'credito', 'proprietario', 'p1',
]);
expect(tierKeys.creditos()).toEqual(['tier', 'credito', 'list']);
```

- [ ] **Step 2: Verify web RED**

Run: `npm test -- --run src/features/tier/queries.spec.ts` from `apps/web`.

Expected: FAIL because individual and aggregate key factories do not exist.

- [ ] **Step 3: Implement types and API functions**

Add `proprietarioId: string` and optional `proprietario?: Proprietario` to `Abate`. Add:

```ts
export interface CreditoRow extends Credito {
  nome: string;
}
```

Require `proprietarioId` in `createAbate`. Add `listCreditos(): Promise<CreditoRow[]>` using `GET /v1/tier/credito`.

- [ ] **Step 4: Implement distinct hooks**

Keep `tierKeys.credito()` as the invalidation prefix. Add `creditoByProprietario(id)` and `creditos()`. Point `useCredito(id)` to the individual key and add `useCreditos()` for the aggregate endpoint. Add an optional `enabled` argument to `useTiers` so the Abates and Credito views do not fetch owner tiers before an owner is selected.

- [ ] **Step 5: Verify web GREEN**

Run: `npm test -- --run src/features/tier/queries.spec.ts` and `npm run typecheck` from `apps/web`.

Expected: query-key tests PASS and typecheck exits 0.

- [ ] **Step 6: Commit web contracts**

```bash
git add apps/web/src/features/tier
git commit -m "feat(tier-web): add credit query contracts"
```

---

### Task 5: Make Abates owner-first

**Files:**
- Modify: `apps/web/src/views/tier/AbatesView.vue`
- Create: `apps/web/src/views/tier/AbatesView.spec.ts`

**Interfaces:**
- Consumes: `useProprietarios`, conditionally enabled `useTiers`, owner-aware `useAbates`, and `createAbate({ proprietarioId, ... })`.
- Produces: required searchable owner selection, owner-filtered optional tier consumos, and a Proprietario table column.

- [ ] **Step 1: Write failing source-contract test**

Read `AbatesView.vue` and assert it imports/renders `UiCombobox`, binds `form.proprietarioId`, invokes `useTiers` with `proprietarioId`, sends `proprietarioId` to the mutation, renders the `Proprietario` heading, and no longer references `saldoOf` or `useAvailableTiers`.

- [ ] **Step 2: Verify Abates view RED**

Run: `npm test -- --run src/views/tier/AbatesView.spec.ts` from `apps/web`.

Expected: FAIL because the current view is saldo-driven and has no owner field.

- [ ] **Step 3: Implement owner-first form**

Add searchable `UiCombobox` owner selection before date, require it for submit, and build options from `useProprietarios`. Query tiers with `{ proprietarioId: form.proprietarioId }`, enabled only when the owner is selected. Clear consumos whenever owner changes. Keep tier selection optional, remove saldo/status copy and max restrictions, and label tiers with fazenda plus quantity/status.

- [ ] **Step 4: Update submit and list**

Send `proprietarioId`, reset it on success, render `a.proprietario?.nome`, update empty/loading colspans, and change explanatory/error copy so it does not claim saldo validation.

- [ ] **Step 5: Verify Abates view GREEN**

Run: `npm test -- --run src/views/tier/AbatesView.spec.ts` and `npm run typecheck` from `apps/web`.

Expected: source contract PASS and typecheck exits 0.

- [ ] **Step 6: Commit Abates UI**

```bash
git add apps/web/src/views/tier/AbatesView.vue apps/web/src/views/tier/AbatesView.spec.ts
git commit -m "feat(tier-web): make abates owner-first"
```

---

### Task 6: Add the Credito tab and drill-down

**Files:**
- Create: `apps/web/src/views/tier/CreditoView.vue`
- Create: `apps/web/src/views/tier/CreditoView.spec.ts`
- Modify: `apps/web/src/views/tier/TierNav.vue`
- Modify: `apps/web/src/views/tier/TierNav.spec.ts`
- Modify: `apps/web/src/router/index.ts`

**Interfaces:**
- Consumes: `useCreditos`, conditionally enabled `useTiers`, `useAbates`, `/tier/credito` route, and `TierNav`.
- Produces: aggregate credit table with negative-credit emphasis and expandable approved-tier/abate detail.

- [ ] **Step 1: Write failing navigation and view tests**

Extend `TierNav.spec.ts` so `CreditoView.vue` is a list view and assert the nav includes `/tier/credito`. Add `CreditoView.spec.ts` source assertions for `useCreditos`, APROVADO owner tiers, owner-filtered abates, all four columns, negative red styling, and `<TierNav />` as the section's first child.

- [ ] **Step 2: Verify Credito view RED**

Run: `npm test -- --run src/views/tier/TierNav.spec.ts src/views/tier/CreditoView.spec.ts` from `apps/web`.

Expected: FAIL because the route, nav item, and view do not exist.

- [ ] **Step 3: Add route and navigation**

Insert `tier/credito` before `tier/:id`, titled `Tier - Credito`, feature-gated by `TIER`. Add `/tier/credito` to `SUB` and a `Credito` tab after Abates.

- [ ] **Step 4: Implement CreditoView**

Render `TierNav`, a table with `Proprietario | Aprovados | Abatidos | Credito restante`, tabular numeric cells, and red negative balance. Use an icon button with `ChevronRight`/`ChevronDown` and accessible label to toggle `expandedId`. Under the expanded row, render two unframed columns: APROVADO tiers for the selected owner and all abates filtered by `proprietarioId`. Show loading and empty states without nesting cards.

- [ ] **Step 5: Verify Credito view GREEN**

Run the command from Step 2, then `npm run lint && npm run typecheck && npm run build` from `apps/web`.

Expected: tests and all web gates exit 0.

- [ ] **Step 6: Commit Credito UI**

```bash
git add apps/web/src/views/tier/CreditoView.vue apps/web/src/views/tier/CreditoView.spec.ts apps/web/src/views/tier/TierNav.vue apps/web/src/views/tier/TierNav.spec.ts apps/web/src/router/index.ts
git commit -m "feat(tier-web): add credit tab"
```

---

### Task 7: Full verification

**Files:**
- Verify only; fix only failures caused by Tasks 1-6.

**Interfaces:**
- Consumes: the complete C implementation.
- Produces: evidence that API and web compile, lint, test, and build together.

- [ ] **Step 1: Run API gate**

Run from `apps/api`:

```bash
npm run prisma:generate
npm run lint:check
npm test -- --runInBand
npm run build
```

Expected: every command exits 0.

- [ ] **Step 2: Run web gate**

Run from `apps/web`:

```bash
npm run lint
npm test -- --run
npm run typecheck
npm run build
```

Expected: every command exits 0; existing non-failing warnings are recorded in the handoff.

- [ ] **Step 3: Review requirements and repository state**

Run `git diff HEAD~6 --check`, inspect `git status --short`, and map every C spec requirement to Tasks 1-6. Confirm `docs/superpowers/plans/2026-07-06-tier-module.md` remains untouched.

## Self-review

- **Spec coverage:** Task 1 persists owner safely; Task 2 enforces owner and optional informational consumos; Task 3 implements individual and aggregate credit; Task 4 separates cache contracts; Task 5 updates Abates; Task 6 adds Credito navigation, table, and drill-down; Task 7 verifies the full project.
- **Placeholder scan:** no deferred implementation markers or unspecified error handling remain. The only staging action is the explicitly out-of-band `prisma migrate deploy` required by the spec.
- **Type consistency:** `proprietarioId` flows from SQL/Prisma through DTO/service, `Abate`, API mutation, and view form. Individual `Credito` and aggregate `CreditoRow` share identical numeric field names. Both credit hooks live under the `['tier','credito']` invalidation prefix without key collision.
- **Migration safety:** empty tables pass; inferable legacy rows backfill; ambiguous or ownerless legacy rows stop deployment before `NOT NULL`, preserving data for manual correction.
