# Tier & Abate — Quantidade por Sexo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir lançar quantidades distintas por sexo (MACHO / FEMEA / INDEFINIDO) dentro de um mesmo Tier e de um mesmo Abate, mantendo crédito e cobrança operando sobre o total.

**Architecture:** Substituir a coluna única de total (`tier.qtd_animais`, `tier_abate.qtd`) por três colunas por sexo. O total passa a ser **derivado** (`qtdMacho + qtdFemea + qtdIndefinido`) via helper compartilhado; nenhum total é armazenado nas linhas vivas. Crédito, saldo, receita e cobrança continuam sobre o total derivado. Preço não varia por sexo.

**Tech Stack:** NestJS + Prisma (Postgres, schema `app`) na API; Vue 3 + Vite + Vitest no web. API testa com Jest (Prisma mockado). Sem Postgres local — migração roda no staging; gate local é `prisma generate` + `nest build` + `jest`.

**Referência de contexto (não muda):** `TierCobranca` / `TierCobrancaItem` guardam `qtd_animais`/`qtd_aprovados` como snapshots congelados do total no momento da cobrança. `TierAbateConsumo.qtdConsumida` segue no total, sem sexo.

---

## File Structure

**API — criar:**
- `apps/api/src/tier/common/sexo-quantidade.ts` — helper `totalSexo()` + validador `SexoQuantidadeValida` (DRY, reusado por tier e abate).
- `apps/api/src/tier/common/sexo-quantidade.spec.ts` — testes do helper + validador.
- `apps/api/prisma/migrations/20260724120000_tier_abate_sexo/migration.sql` — migração.

**API — modificar:**
- `apps/api/prisma/schema.prisma` — models `Tier` e `TierAbate`.
- `apps/api/src/tier/tiers/dto/create-tier.dto.ts`, `update-tier.dto.ts`
- `apps/api/src/tier/tiers/tiers.service.ts`
- `apps/api/src/tier/abates/dto/create-abate.dto.ts`
- `apps/api/src/tier/abates/abates.service.ts`
- `apps/api/src/tier/cobrancas/cobranca-calculator.ts`
- `apps/api/src/tier/credito/credito.service.ts`

**API — testes a atualizar:** `tiers.service.spec.ts`, `abates.service.spec.ts`, `cobranca-calculator.spec.ts`, `credito.service.spec.ts`.
(`cobrancas.service.ts` **não muda**: `loadTiers`/`preview` carregam a linha completa via `include`, então as 3 colunas chegam ao `snapshotTier` automaticamente.)

**Web — modificar:**
- `apps/web/src/features/tier/types.ts`
- `apps/web/src/features/tier/api.ts`
- `apps/web/src/views/tier/AbatesView.vue`
- `apps/web/src/views/tier/TierListView.vue`
- `apps/web/src/views/tier/TierDetailView.vue`

**Web — testes:** atualizar `apps/web/src/views/tier/AbatesView.spec.ts`; criar `apps/web/src/views/tier/TierListView.spec.ts`.

---

## Task 1: Schema Prisma + Migração

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (model `Tier` ~L990-1017, model `TierAbate` ~L1082-1099)
- Create: `apps/api/prisma/migrations/20260724120000_tier_abate_sexo/migration.sql`

Sem teste unitário (sem DB local). Gate = `prisma generate` compila e `nest build` passa no fim.

- [ ] **Step 1: Editar model `Tier` no schema**

Em `apps/api/prisma/schema.prisma`, no model `Tier`, remover a linha:

```prisma
  qtdAnimais                     Int        @map("qtd_animais")
```

e adicionar (logo após `frigorificoId`):

```prisma
  qtdMacho                       Int        @default(0) @map("qtd_macho")
  qtdFemea                       Int        @default(0) @map("qtd_femea")
  qtdIndefinido                  Int        @default(0) @map("qtd_indefinido")
```

- [ ] **Step 2: Editar model `TierAbate` no schema**

No model `TierAbate`, remover:

```prisma
  qtd            Int
```

e adicionar (no lugar):

```prisma
  qtdMacho       Int      @default(0) @map("qtd_macho")
  qtdFemea       Int      @default(0) @map("qtd_femea")
  qtdIndefinido  Int      @default(0) @map("qtd_indefinido")
```

- [ ] **Step 3: Criar a migração SQL**

Criar `apps/api/prisma/migrations/20260724120000_tier_abate_sexo/migration.sql`:

```sql
-- tier: quebra por sexo, total derivado (drop qtd_animais)
ALTER TABLE app.tier
  ADD COLUMN qtd_macho integer NOT NULL DEFAULT 0,
  ADD COLUMN qtd_femea integer NOT NULL DEFAULT 0,
  ADD COLUMN qtd_indefinido integer NOT NULL DEFAULT 0;

UPDATE app.tier SET qtd_indefinido = qtd_animais;

ALTER TABLE app.tier DROP COLUMN qtd_animais;

ALTER TABLE app.tier
  ADD CONSTRAINT tier_qtd_sexo_nonneg
    CHECK (qtd_macho >= 0 AND qtd_femea >= 0 AND qtd_indefinido >= 0),
  ADD CONSTRAINT tier_qtd_sexo_total_min
    CHECK (qtd_macho + qtd_femea + qtd_indefinido >= 1);

-- tier_abate: idem
ALTER TABLE app.tier_abate
  ADD COLUMN qtd_macho integer NOT NULL DEFAULT 0,
  ADD COLUMN qtd_femea integer NOT NULL DEFAULT 0,
  ADD COLUMN qtd_indefinido integer NOT NULL DEFAULT 0;

UPDATE app.tier_abate SET qtd_indefinido = qtd;

ALTER TABLE app.tier_abate DROP COLUMN qtd;

ALTER TABLE app.tier_abate
  ADD CONSTRAINT tier_abate_qtd_sexo_nonneg
    CHECK (qtd_macho >= 0 AND qtd_femea >= 0 AND qtd_indefinido >= 0),
  ADD CONSTRAINT tier_abate_qtd_sexo_total_min
    CHECK (qtd_macho + qtd_femea + qtd_indefinido >= 1);
```

- [ ] **Step 4: Regenerar o Prisma Client**

Run: `cd apps/api && npx prisma generate`
Expected: "Generated Prisma Client" sem erros. Os tipos `Tier`/`TierAbate` agora têm `qtdMacho/qtdFemea/qtdIndefinido` e não têm mais `qtdAnimais`/`qtd`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260724120000_tier_abate_sexo/migration.sql
git commit -m "feat(tier): add per-sexo quantity columns to tier and abate"
```

---

## Task 2: Helper + validador de sexo (compartilhado)

**Files:**
- Create: `apps/api/src/tier/common/sexo-quantidade.ts`
- Test: `apps/api/src/tier/common/sexo-quantidade.spec.ts`

- [ ] **Step 1: Escrever o teste falho**

Criar `apps/api/src/tier/common/sexo-quantidade.spec.ts`:

```ts
import { validate } from 'class-validator';
import { totalSexo, SexoQuantidadeValida } from './sexo-quantidade';

class Alvo {
  qtdMacho?: number;
  qtdFemea?: number;
  qtdIndefinido?: number;
  @SexoQuantidadeValida() _check!: unknown;
}

function make(v: Partial<Alvo>) {
  return Object.assign(new Alvo(), v);
}

describe('totalSexo', () => {
  it('soma as tres colunas', () => {
    expect(totalSexo({ qtdMacho: 3, qtdFemea: 2, qtdIndefinido: 5 })).toBe(10);
  });
});

describe('SexoQuantidadeValida', () => {
  it('aceita os tres presentes com soma >= 1', async () => {
    const errors = await validate(
      make({ qtdMacho: 1, qtdFemea: 0, qtdIndefinido: 0 }),
    );
    expect(errors).toHaveLength(0);
  });

  it('rejeita soma zero', async () => {
    const errors = await validate(
      make({ qtdMacho: 0, qtdFemea: 0, qtdIndefinido: 0 }),
    );
    expect(errors).toHaveLength(1);
  });

  it('rejeita triple incompleto (so alguns presentes)', async () => {
    const errors = await validate(make({ qtdMacho: 1 }));
    expect(errors).toHaveLength(1);
  });

  it('aceita nenhum presente (update sem mexer no breakdown)', async () => {
    const errors = await validate(make({}));
    expect(errors).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd apps/api && npx jest src/tier/common/sexo-quantidade.spec.ts`
Expected: FAIL — "Cannot find module './sexo-quantidade'".

- [ ] **Step 3: Implementar o helper + validador**

Criar `apps/api/src/tier/common/sexo-quantidade.ts`:

```ts
import { registerDecorator, ValidationOptions } from 'class-validator';

export interface SexoQuantidade {
  qtdMacho: number;
  qtdFemea: number;
  qtdIndefinido: number;
}

// Total derivado — nunca armazenado nas linhas vivas de Tier/Abate.
export function totalSexo(q: SexoQuantidade): number {
  return q.qtdMacho + q.qtdFemea + q.qtdIndefinido;
}

// Regra unica p/ create e update:
// - nenhum dos tres presente  -> valido (update que nao mexe no breakdown)
// - parcialmente presente      -> invalido (informe os tres juntos)
// - os tres presentes          -> soma deve ser >= 1
export function SexoQuantidadeValida(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'sexoQuantidadeValida',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(_value: unknown, args) {
          const o = args.object as Record<string, unknown>;
          const vals = [o.qtdMacho, o.qtdFemea, o.qtdIndefinido];
          const presentes = vals.filter((v) => v !== undefined && v !== null);
          if (presentes.length === 0) return true;
          if (presentes.length < 3) return false;
          return presentes.reduce<number>((s, v) => s + Number(v), 0) >= 1;
        },
        defaultMessage() {
          return 'Informe qtdMacho, qtdFemea e qtdIndefinido juntos, com soma >= 1';
        },
      },
    });
  };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd apps/api && npx jest src/tier/common/sexo-quantidade.spec.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/tier/common/sexo-quantidade.ts apps/api/src/tier/common/sexo-quantidade.spec.ts
git commit -m "feat(tier): add totalSexo helper and SexoQuantidadeValida validator"
```

---

## Task 3: DTOs de Tier

**Files:**
- Modify: `apps/api/src/tier/tiers/dto/create-tier.dto.ts`
- Modify: `apps/api/src/tier/tiers/dto/update-tier.dto.ts`
- Test: `apps/api/src/tier/tiers/tiers.service.spec.ts` (bloco de validação existente)

- [ ] **Step 1: Atualizar o teste de validação do CreateTierDto**

Em `apps/api/src/tier/tiers/tiers.service.spec.ts`, substituir o teste `'requires data in CreateTierDto'` por:

```ts
  it('requires data in CreateTierDto', async () => {
    const errors = await validate(
      Object.assign(new CreateTierDto(), {
        proprietarioId: '550e8400-e29b-41d4-a716-446655440000',
        fazendaId: '550e8400-e29b-41d4-a716-446655440001',
        qtdMacho: 1,
        qtdFemea: 0,
        qtdIndefinido: 0,
      }),
    );
    expect(errors.some((error) => error.property === 'data')).toBe(true);
  });

  it('rejects a CreateTierDto whose sexo total is zero', async () => {
    const errors = await validate(
      Object.assign(new CreateTierDto(), {
        proprietarioId: '550e8400-e29b-41d4-a716-446655440000',
        fazendaId: '550e8400-e29b-41d4-a716-446655440001',
        qtdMacho: 0,
        qtdFemea: 0,
        qtdIndefinido: 0,
        data: '2026-07-15',
      }),
    );
    expect(errors.some((e) => e.property === 'qtdMacho')).toBe(true);
  });
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd apps/api && npx jest src/tier/tiers/tiers.service.spec.ts -t "CreateTierDto"`
Expected: FAIL de compilação/asserção (DTO ainda usa `qtdAnimais`).

- [ ] **Step 3: Reescrever `create-tier.dto.ts`**

```ts
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';
import { SexoQuantidadeValida } from '../../common/sexo-quantidade';

export class CreateTierDto {
  @IsUUID() proprietarioId!: string;
  @IsUUID() fazendaId!: string;
  @IsInt() @Min(0) qtdMacho!: number;
  @IsInt() @Min(0) qtdFemea!: number;
  @IsInt() @Min(0) qtdIndefinido!: number;
  @SexoQuantidadeValida() private readonly _sexo!: unknown;
  @IsOptional() @IsUUID() frigorificoId?: string;
  @IsNotEmpty() @IsDateString() data!: string;
}
```

- [ ] **Step 4: Reescrever `update-tier.dto.ts`**

```ts
import { IsDateString, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { SexoQuantidadeValida } from '../../common/sexo-quantidade';

// General edits only. Status is changed via POST :id/status, contract via
// PUT :id/contrato. Proprietario/fazenda are immutable after creation (the
// contract snapshot depends on the proprietario). Sexo quantities are edited
// as a group (all three together) or not at all.
export class UpdateTierDto {
  @IsOptional() @IsInt() @Min(0) qtdMacho?: number;
  @IsOptional() @IsInt() @Min(0) qtdFemea?: number;
  @IsOptional() @IsInt() @Min(0) qtdIndefinido?: number;
  @SexoQuantidadeValida() private readonly _sexo!: unknown;
  @IsOptional() @IsUUID() frigorificoId?: string;
  @IsOptional() @IsDateString() data?: string;
}
```

- [ ] **Step 5: Rodar e confirmar passa**

Run: `cd apps/api && npx jest src/tier/tiers/tiers.service.spec.ts -t "CreateTierDto"`
Expected: PASS (o restante do spec falha na compilação enquanto o service não é atualizado — Task 4).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/tier/tiers/dto/create-tier.dto.ts apps/api/src/tier/tiers/dto/update-tier.dto.ts apps/api/src/tier/tiers/tiers.service.spec.ts
git commit -m "feat(tier): accept per-sexo quantities in tier DTOs"
```

---

## Task 4: TiersService (deriva total)

**Files:**
- Modify: `apps/api/src/tier/tiers/tiers.service.ts`
- Test: `apps/api/src/tier/tiers/tiers.service.spec.ts`

- [ ] **Step 1: Atualizar os testes de create/get do service**

Em `tiers.service.spec.ts`, atualizar os testes que usam `qtdAnimais` para o novo shape:

No teste `'snapshots proprietario contract values into the tier on create'`, trocar a chamada `service.create({...})`:

```ts
    const res = await service.create({
      proprietarioId: 'p1',
      fazendaId: 'f1',
      qtdMacho: 60,
      qtdFemea: 40,
      qtdIndefinido: 0,
      data: '2026-07-15',
    } as any);
```

No teste `'always writes a date on create'`, trocar o corpo:

```ts
    await service.create({
      proprietarioId: 'p1',
      fazendaId: 'f1',
      qtdMacho: 1,
      qtdFemea: 0,
      qtdIndefinido: 0,
      data: '2026-07-16',
    } as any);
```

No teste `'create throws when proprietario missing'`, trocar:

```ts
      service.create({
        proprietarioId: 'x',
        fazendaId: 'f',
        qtdMacho: 1,
        qtdFemea: 0,
        qtdIndefinido: 0,
      } as any),
```

No teste `'get computes saldo and receita for an approved tier'`, trocar o `mockResolvedValue` e as asserções:

```ts
    prisma.tier.findUnique.mockResolvedValue({
      id: 't1',
      status: 'APROVADO',
      qtdMacho: 60,
      qtdFemea: 40,
      qtdIndefinido: 0,
      contratoValorAnimal: '1.50',
      contratoValorAdicionalAprovado: '0.30',
    });
    prisma.tierAbateConsumo.aggregate.mockResolvedValue({
      _sum: { qtdConsumida: 30 },
    });
    const res = await service.get('t1');
    expect(res.qtdAnimais).toBe(100);
    expect(res.abatido).toBe(30);
    expect(res.saldo).toBe(70);
    // 100*1.50 + 100*0.30 = 180
    expect(res.receita).toBe(180);
```

No teste `'get yields zero saldo when not approved'`, trocar o mock para o breakdown:

```ts
    prisma.tier.findUnique.mockResolvedValue({
      id: 't1',
      status: 'SUBMETIDO',
      qtdMacho: 100,
      qtdFemea: 0,
      qtdIndefinido: 0,
      contratoValorAnimal: '1.50',
      contratoValorAdicionalAprovado: '0.30',
    });
```

(as asserções `saldo === 0` e `receita === 150` permanecem.)

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd apps/api && npx jest src/tier/tiers/tiers.service.spec.ts`
Expected: FAIL (service ainda lê `tier.qtdAnimais`, que não existe mais).

- [ ] **Step 3: Atualizar `tiers.service.ts`**

Adicionar o import no topo:

```ts
import { totalSexo } from '../common/sexo-quantidade';
```

Em `list()`, mapear as rows para incluir o total derivado. Trocar o `return`:

```ts
    return {
      page,
      pageSize,
      total,
      rows: rows.map((row) => ({ ...row, qtdAnimais: totalSexo(row) })),
    };
```

Em `get()`, trocar o bloco de cálculo (linhas ~62-70):

```ts
    const abatido = agg._sum.qtdConsumida ?? 0;
    const aprovado = tier.status === 'APROVADO';
    const total = totalSexo(tier);
    const saldo = aprovado ? total - abatido : 0;
    const valorAnimal = Number(tier.contratoValorAnimal);
    const valorAdicional = Number(tier.contratoValorAdicionalAprovado);
    const receita =
      total * valorAnimal + (aprovado ? total * valorAdicional : 0);
    return { ...tier, qtdAnimais: total, abatido, saldo, receita };
```

Em `create()`, trocar `qtdAnimais: dto.qtdAnimais,` no objeto `data` por:

```ts
        qtdMacho: dto.qtdMacho,
        qtdFemea: dto.qtdFemea,
        qtdIndefinido: dto.qtdIndefinido,
```

e envolver o retorno para incluir o total. Trocar `return this.prisma.tier.create({...})` por:

```ts
    const created = await this.prisma.tier.create({
      data: {
        proprietarioId: dto.proprietarioId,
        fazendaId: dto.fazendaId,
        frigorificoId: dto.frigorificoId ?? null,
        qtdMacho: dto.qtdMacho,
        qtdFemea: dto.qtdFemea,
        qtdIndefinido: dto.qtdIndefinido,
        data: new Date(dto.data),
        contratoValorAnimal: prop.contratoValorAnimal,
        contratoValorAdicionalAprovado: prop.contratoValorAdicionalAprovado,
      },
    });
    return { ...created, qtdAnimais: totalSexo(created) };
```

Em `update()`, trocar a linha do `qtdAnimais` no `data` por patch das três colunas e incluir total no retorno:

```ts
  async update(id: string, dto: UpdateTierDto) {
    await this.findOrThrow(id);
    const updated = await this.prisma.tier.update({
      where: { id },
      data: {
        ...(dto.qtdMacho !== undefined ? { qtdMacho: dto.qtdMacho } : {}),
        ...(dto.qtdFemea !== undefined ? { qtdFemea: dto.qtdFemea } : {}),
        ...(dto.qtdIndefinido !== undefined
          ? { qtdIndefinido: dto.qtdIndefinido }
          : {}),
        ...(dto.frigorificoId !== undefined
          ? { frigorificoId: dto.frigorificoId }
          : {}),
        ...(dto.data !== undefined ? { data: new Date(dto.data) } : {}),
      },
    });
    return { ...updated, qtdAnimais: totalSexo(updated) };
  }
```

- [ ] **Step 4: Rodar e confirmar passa**

Run: `cd apps/api && npx jest src/tier/tiers/tiers.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/tier/tiers/tiers.service.ts apps/api/src/tier/tiers/tiers.service.spec.ts
git commit -m "feat(tier): derive tier total from per-sexo columns"
```

---

## Task 5: DTO + AbatesService

**Files:**
- Modify: `apps/api/src/tier/abates/dto/create-abate.dto.ts`
- Modify: `apps/api/src/tier/abates/abates.service.ts`
- Test: `apps/api/src/tier/abates/abates.service.spec.ts`

- [ ] **Step 1: Atualizar os testes do AbatesService**

Em `abates.service.spec.ts`, trocar cada `qtd: N` das chamadas `service.create({...})` pelo breakdown. No teste `'requires an existing proprietario'`:

```ts
        proprietarioId: 'p1',
        dataAbate: '2026-04-16',
        qtdMacho: 100,
        qtdFemea: 0,
        qtdIndefinido: 0,
```

No teste `'creates an owner-attributed abate without consumos'`, trocar o corpo e a asserção:

```ts
    await service.create({
      proprietarioId: 'p1',
      dataAbate: '2026-04-16',
      qtdMacho: 60,
      qtdFemea: 40,
      qtdIndefinido: 0,
    } as any);
    expect(tx.tierAbate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        proprietarioId: 'p1',
        qtdMacho: 60,
        qtdFemea: 40,
        qtdIndefinido: 0,
      }),
    });
    expect(tx.tierAbateConsumo.create).not.toHaveBeenCalled();
```

No teste `'rejects a consumo owned by another proprietario'`:

```ts
        proprietarioId: 'p1',
        dataAbate: '2026-04-16',
        qtdMacho: 50,
        qtdFemea: 0,
        qtdIndefinido: 0,
        consumos: [{ tierId: 't1', qtdConsumida: 50 }],
```

No teste `'accepts an informational consumo regardless of tier status or saldo'`:

```ts
    await service.create({
      proprietarioId: 'p1',
      dataAbate: '2026-04-16',
      qtdMacho: 50,
      qtdFemea: 0,
      qtdIndefinido: 0,
      consumos: [{ tierId: 't1', qtdConsumida: 50 }],
    } as any);
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd apps/api && npx jest src/tier/abates/abates.service.spec.ts`
Expected: FAIL (DTO/service ainda usam `qtd`).

- [ ] **Step 3: Reescrever `create-abate.dto.ts`**

```ts
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { SexoQuantidadeValida } from '../../common/sexo-quantidade';

export class AbateConsumoDto {
  @IsUUID() tierId!: string;
  @IsInt() @Min(1) qtdConsumida!: number;
}

export class CreateAbateDto {
  @IsUUID() proprietarioId!: string;
  @IsDateString() dataAbate!: string;
  @IsOptional() @IsUUID() frigorificoId?: string;
  @IsInt() @Min(0) qtdMacho!: number;
  @IsInt() @Min(0) qtdFemea!: number;
  @IsInt() @Min(0) qtdIndefinido!: number;
  @SexoQuantidadeValida() private readonly _sexo!: unknown;
  // Optional and informational: owner credit is calculated from the abate total.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AbateConsumoDto)
  consumos?: AbateConsumoDto[];
}
```

- [ ] **Step 4: Atualizar `abates.service.ts`**

Adicionar import no topo:

```ts
import { totalSexo } from '../common/sexo-quantidade';
```

Em `create()`, trocar o objeto `data` do `tx.tierAbate.create`:

```ts
      const abate = await tx.tierAbate.create({
        data: {
          proprietarioId: dto.proprietarioId,
          dataAbate: new Date(dto.dataAbate),
          frigorificoId: dto.frigorificoId ?? null,
          qtdMacho: dto.qtdMacho,
          qtdFemea: dto.qtdFemea,
          qtdIndefinido: dto.qtdIndefinido,
        },
      });
```

Em `list()`, mapear o total derivado. Trocar o `return`:

```ts
  async list() {
    const rows = await this.prisma.tierAbate.findMany({
      orderBy: { dataAbate: 'desc' },
      include: { consumos: true, frigorifico: true, proprietario: true },
    });
    return rows.map((row) => ({ ...row, qtd: totalSexo(row) }));
  }
```

Em `get()`, incluir o total no retorno. Trocar o `return row;` final por:

```ts
    return { ...row, qtd: totalSexo(row) };
```

- [ ] **Step 5: Rodar e confirmar passa**

Run: `cd apps/api && npx jest src/tier/abates/abates.service.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/tier/abates/dto/create-abate.dto.ts apps/api/src/tier/abates/abates.service.ts apps/api/src/tier/abates/abates.service.spec.ts
git commit -m "feat(tier): accept per-sexo quantities in abate"
```

---

## Task 6: Cobrança calculator (deriva total no snapshot)

**Files:**
- Modify: `apps/api/src/tier/cobrancas/cobranca-calculator.ts`
- Test: `apps/api/src/tier/cobrancas/cobranca-calculator.spec.ts`

- [ ] **Step 1: Atualizar o factory e o teste de drift**

Em `cobranca-calculator.spec.ts`, trocar o factory `tier()` para o novo shape:

```ts
const tier = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 't1',
    data: new Date('2026-07-15'),
    qtdMacho: 60,
    qtdFemea: 40,
    qtdIndefinido: 0,
    status: 'SUBMETIDO',
    contratoValorAnimal: new Prisma.Decimal('1.50'),
    contratoValorAdicionalAprovado: new Prisma.Decimal('0.30'),
    ...overrides,
  }) as any;
```

No teste `'detects drift in every frozen field'`, trocar o caso `{ qtdAnimais: 99 }` por um caso de breakdown:

```ts
    for (const changed of [
      { qtdMacho: 59 },
      { status: 'APROVADO' },
      { contratoValorAnimal: new Prisma.Decimal('2.00') },
      { contratoValorAdicionalAprovado: new Prisma.Decimal('0.40') },
      { data: new Date('2026-07-16') },
    ]) {
```

(os totais `150.00`/`180.00`/`qtdAnimais: 200`/`qtdAprovados: 100` continuam válidos: 60+40 = 100.)

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd apps/api && npx jest src/tier/cobrancas/cobranca-calculator.spec.ts`
Expected: FAIL (`snapshotTier` ainda espera `qtdAnimais`).

- [ ] **Step 3: Atualizar `cobranca-calculator.ts`**

Trocar a assinatura e o corpo de `snapshotTier` (o campo `CobrancaSnapshot.qtdAnimais` permanece = total):

```ts
export function snapshotTier(tier: {
  id: string;
  data: Date;
  qtdMacho: number;
  qtdFemea: number;
  qtdIndefinido: number;
  status: 'SUBMETIDO' | 'APROVADO' | 'RECUSADO';
  contratoValorAnimal: Prisma.Decimal | string;
  contratoValorAdicionalAprovado: Prisma.Decimal | string;
}): CobrancaSnapshot {
  const total = tier.qtdMacho + tier.qtdFemea + tier.qtdIndefinido;
  const contratoValorAnimal = new Prisma.Decimal(tier.contratoValorAnimal);
  const contratoValorAdicionalAprovado = new Prisma.Decimal(
    tier.contratoValorAdicionalAprovado,
  );
  const valorBase = new Prisma.Decimal(total).mul(contratoValorAnimal);
  const valorAdicional =
    tier.status === 'APROVADO'
      ? new Prisma.Decimal(total).mul(contratoValorAdicionalAprovado)
      : zero();
  return {
    tierId: tier.id,
    tierData: tier.data,
    qtdAnimais: total,
    status: tier.status,
    contratoValorAnimal,
    contratoValorAdicionalAprovado,
    valorBase,
    valorAdicional,
    valorItem: valorBase.add(valorAdicional),
  };
}
```

Trocar a assinatura e a comparação de `isSnapshotStale`:

```ts
export function isSnapshotStale(
  snapshot: CobrancaSnapshot,
  tier: {
    data: Date;
    qtdMacho: number;
    qtdFemea: number;
    qtdIndefinido: number;
    status: string;
    contratoValorAnimal: Prisma.Decimal | string;
    contratoValorAdicionalAprovado: Prisma.Decimal | string;
  } | null,
): boolean {
  if (!tier) return true;
  const total = tier.qtdMacho + tier.qtdFemea + tier.qtdIndefinido;
  return (
    snapshot.qtdAnimais !== total ||
    snapshot.status !== tier.status ||
    snapshot.tierData.getTime() !== tier.data.getTime() ||
    !snapshot.contratoValorAnimal.equals(tier.contratoValorAnimal) ||
    !snapshot.contratoValorAdicionalAprovado.equals(
      tier.contratoValorAdicionalAprovado,
    )
  );
}
```

- [ ] **Step 4: Rodar e confirmar passa**

Run: `cd apps/api && npx jest src/tier/cobrancas/cobranca-calculator.spec.ts`
Expected: PASS.

- [ ] **Step 5: Rodar o spec de cobrancas.service (sem mudança de código, garante regressão)**

Run: `cd apps/api && npx jest src/tier/cobrancas/cobrancas.service.spec.ts`
Expected: PASS. Se algum mock de tier no spec usa `qtdAnimais`, trocar para `qtdMacho/qtdFemea/qtdIndefinido` (ver Step 6).

- [ ] **Step 6: Ajustar mocks de tier em cobrancas.service.spec (se houver)**

Procurar `qtdAnimais` em `apps/api/src/tier/cobrancas/cobrancas.service.spec.ts`. Para cada objeto de **tier** mockado (não item de cobrança), trocar `qtdAnimais: N` por `qtdMacho: N, qtdFemea: 0, qtdIndefinido: 0`. Objetos de `TierCobrancaItem` (que têm `valorItem`/`tierData`) mantêm `qtdAnimais`. Rodar de novo e confirmar PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/tier/cobrancas/cobranca-calculator.ts apps/api/src/tier/cobrancas/cobranca-calculator.spec.ts apps/api/src/tier/cobrancas/cobrancas.service.spec.ts
git commit -m "feat(tier): derive cobranca snapshot total from per-sexo columns"
```

---

## Task 7: CreditoService (soma as 3 colunas)

**Files:**
- Modify: `apps/api/src/tier/credito/credito.service.ts`
- Test: `apps/api/src/tier/credito/credito.service.spec.ts`

- [ ] **Step 1: Atualizar o teste do CreditoService**

Em `credito.service.spec.ts`, trocar os mocks de `groupBy` e as asserções de argumentos:

```ts
    prisma.tier.groupBy.mockResolvedValue([
      {
        proprietarioId: 'p1',
        _sum: { qtdMacho: 400, qtdFemea: 200, qtdIndefinido: 30 },
      },
    ]);
    prisma.tierAbate.groupBy.mockResolvedValue([
      {
        proprietarioId: 'p1',
        _sum: { qtdMacho: 100, qtdFemea: 80, qtdIndefinido: 1 },
      },
    ]);
```

(mantém `aprovados: 630`, `abatidos: 181`, `creditoRestante: 449`.)

E as asserções de chamada:

```ts
    expect(prisma.tier.groupBy).toHaveBeenCalledWith({
      by: ['proprietarioId'],
      where: { status: 'APROVADO' },
      _sum: { qtdMacho: true, qtdFemea: true, qtdIndefinido: true },
    });
    expect(prisma.tierAbate.groupBy).toHaveBeenCalledWith({
      by: ['proprietarioId'],
      _sum: { qtdMacho: true, qtdFemea: true, qtdIndefinido: true },
    });
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd apps/api && npx jest src/tier/credito/credito.service.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Atualizar `credito.service.ts`**

Adicionar import no topo:

```ts
import { totalSexo } from '../common/sexo-quantidade';
```

Trocar os dois `groupBy` e os dois `Map`:

```ts
      this.prisma.tier.groupBy({
        by: ['proprietarioId'],
        where: { status: 'APROVADO' },
        _sum: { qtdMacho: true, qtdFemea: true, qtdIndefinido: true },
      }),
      this.prisma.tierAbate.groupBy({
        by: ['proprietarioId'],
        _sum: { qtdMacho: true, qtdFemea: true, qtdIndefinido: true },
      }),
    ]);

    const aprovadosPorProprietario = new Map(
      aprovados.map((row) => [
        row.proprietarioId,
        totalSexo({
          qtdMacho: row._sum.qtdMacho ?? 0,
          qtdFemea: row._sum.qtdFemea ?? 0,
          qtdIndefinido: row._sum.qtdIndefinido ?? 0,
        }),
      ]),
    );
    const abatidosPorProprietario = new Map(
      abatidos.map((row) => [
        row.proprietarioId,
        totalSexo({
          qtdMacho: row._sum.qtdMacho ?? 0,
          qtdFemea: row._sum.qtdFemea ?? 0,
          qtdIndefinido: row._sum.qtdIndefinido ?? 0,
        }),
      ]),
    );
```

- [ ] **Step 4: Rodar e confirmar passa**

Run: `cd apps/api && npx jest src/tier/credito/credito.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Gate da API — build + suíte completa**

Run: `cd apps/api && npm run build && npm test`
Expected: `nest build` sem erros de tipo; todos os specs PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/tier/credito/credito.service.ts apps/api/src/tier/credito/credito.service.spec.ts
git commit -m "feat(tier): sum per-sexo columns for credito totals"
```

---

## Task 8: Web — tipos e payloads

**Files:**
- Modify: `apps/web/src/features/tier/types.ts`
- Modify: `apps/web/src/features/tier/api.ts`

Sem teste dedicado (coberto pelo `vue-tsc` no build da Task 11).

- [ ] **Step 1: Estender as interfaces em `types.ts`**

No `interface Tier`, trocar a linha `qtdAnimais: number;` por:

```ts
  qtdAnimais: number; // total derivado (soma dos sexos), vindo da API
  qtdMacho: number;
  qtdFemea: number;
  qtdIndefinido: number;
```

No `interface Abate`, trocar `qtd: number;` por:

```ts
  qtd: number; // total derivado (soma dos sexos), vindo da API
  qtdMacho: number;
  qtdFemea: number;
  qtdIndefinido: number;
```

- [ ] **Step 2: Atualizar os payloads em `api.ts`**

Em `createTier`, trocar o tipo do body `qtdAnimais: number;` por:

```ts
  qtdMacho: number;
  qtdFemea: number;
  qtdIndefinido: number;
```

Em `updateTier`, trocar o body para:

```ts
  body: {
    qtdMacho?: number;
    qtdFemea?: number;
    qtdIndefinido?: number;
    frigorificoId?: string;
    data?: string;
  },
```

Em `createAbate`, trocar `qtd: number;` por:

```ts
  qtdMacho: number;
  qtdFemea: number;
  qtdIndefinido: number;
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/tier/types.ts apps/web/src/features/tier/api.ts
git commit -m "feat(tier-web): add per-sexo fields to tier/abate types and payloads"
```

---

## Task 9: Web — AbatesView (3 inputs)

**Files:**
- Modify: `apps/web/src/views/tier/AbatesView.vue`
- Test: `apps/web/src/views/tier/AbatesView.spec.ts`

- [ ] **Step 1: Estender o spec (source-string)**

Em `AbatesView.spec.ts`, adicionar dentro do `it(...)` existente:

```ts
    expect(source).toContain('form.qtdMacho');
    expect(source).toContain('form.qtdFemea');
    expect(source).toContain('form.qtdIndefinido');
    expect(source).not.toContain('v-model.number="form.qtd"');
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd apps/web && npx vitest run src/views/tier/AbatesView.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Trocar o input único por 3 inputs no template**

Em `AbatesView.vue`, substituir o bloco do input de quantidade (`UiLabel for="a-qtd"` + `UiInput id="a-qtd"`, ~L40-41) por:

```html
        <div class="grid grid-cols-3 gap-2">
          <div>
            <UiLabel for="a-macho">Macho</UiLabel>
            <UiInput id="a-macho" v-model.number="form.qtdMacho" type="number" min="0" />
          </div>
          <div>
            <UiLabel for="a-femea">Fêmea</UiLabel>
            <UiInput id="a-femea" v-model.number="form.qtdFemea" type="number" min="0" />
          </div>
          <div>
            <UiLabel for="a-indef">Indefinido</UiLabel>
            <UiInput id="a-indef" v-model.number="form.qtdIndefinido" type="number" min="0" />
          </div>
        </div>
        <p class="text-sm text-muted-foreground">Total: {{ qtdTotal }}</p>
```

- [ ] **Step 4: Atualizar o script setup**

No tipo do form (onde está `qtd: number;` ~L152) trocar por:

```ts
  qtdMacho: number;
  qtdFemea: number;
  qtdIndefinido: number;
```

No `reactive`/objeto inicial (onde está `qtd: 0,` ~L158) trocar por:

```ts
  qtdMacho: 0,
  qtdFemea: 0,
  qtdIndefinido: 0,
```

Adicionar um computed do total logo após o `consumoSum` (~L192):

```ts
const qtdTotal = computed(
  () => (Number(form.qtdMacho) || 0) + (Number(form.qtdFemea) || 0) + (Number(form.qtdIndefinido) || 0),
);
```

Trocar todas as referências a `form.qtd` / `Number(form.qtd)`:
- no aviso de consumo (`consumoSum !== Number(form.qtd)` e `{{ form.qtd || 0 }}`) → usar `qtdTotal`:

```html
          v-if="form.consumos.length && consumoSum !== qtdTotal"
```
```html
          Soma dos consumos ({{ consumoSum }}) difere do total ({{ qtdTotal }}).
```

- no `:disabled` do botão (`!form.qtd`) → `!qtdTotal`:

```html
        <UiButton :disabled="saving || !form.proprietarioId || !form.dataAbate || !qtdTotal" @click="save">
```

- no guard do `save()` (`!form.qtd`) → `!qtdTotal`; e no payload trocar `qtd: Number(form.qtd),` por:

```ts
      qtdMacho: Number(form.qtdMacho),
      qtdFemea: Number(form.qtdFemea),
      qtdIndefinido: Number(form.qtdIndefinido),
```

- no reset após salvar (`form.qtd = 0;`) trocar por:

```ts
    form.qtdMacho = 0;
    form.qtdFemea = 0;
    form.qtdIndefinido = 0;
```

- [ ] **Step 5: Mostrar o breakdown na tabela**

Na célula da coluna Qtd (`{{ a.qtd }}`, ~L113) trocar por total + breakdown:

```html
            <td class="px-3 py-2 tabular-nums">
              {{ a.qtd }}
              <span class="text-xs text-muted-foreground">
                (M {{ a.qtdMacho }} · F {{ a.qtdFemea }} · I {{ a.qtdIndefinido }})
              </span>
            </td>
```

- [ ] **Step 6: Rodar e confirmar passa**

Run: `cd apps/web && npx vitest run src/views/tier/AbatesView.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/views/tier/AbatesView.vue apps/web/src/views/tier/AbatesView.spec.ts
git commit -m "feat(tier-web): per-sexo inputs and breakdown in AbatesView"
```

---

## Task 10: Web — TierListView (3 inputs) + TierDetailView (breakdown)

**Files:**
- Modify: `apps/web/src/views/tier/TierListView.vue`
- Modify: `apps/web/src/views/tier/TierDetailView.vue`
- Test: `apps/web/src/views/tier/TierListView.spec.ts` (novo)

- [ ] **Step 1: Criar o spec (source-string)**

Criar `apps/web/src/views/tier/TierListView.spec.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "src/views/tier/TierListView.vue"), "utf8");

describe("TierListView per-sexo form", () => {
  it("captures per-sexo quantities on create", () => {
    expect(source).toContain("form.qtdMacho");
    expect(source).toContain("form.qtdFemea");
    expect(source).toContain("form.qtdIndefinido");
    expect(source).not.toContain('v-model.number="form.qtdAnimais"');
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd apps/web && npx vitest run src/views/tier/TierListView.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Trocar o input de quantidade no template do TierListView**

Substituir o bloco do input `UiInput id="t-qtd" v-model.number="form.qtdAnimais"` (~L86) por:

```html
          <div class="grid grid-cols-3 gap-2">
            <div>
              <UiLabel for="t-macho">Macho</UiLabel>
              <UiInput id="t-macho" v-model.number="form.qtdMacho" type="number" min="0" />
            </div>
            <div>
              <UiLabel for="t-femea">Fêmea</UiLabel>
              <UiInput id="t-femea" v-model.number="form.qtdFemea" type="number" min="0" />
            </div>
            <div>
              <UiLabel for="t-indef">Indefinido</UiLabel>
              <UiInput id="t-indef" v-model.number="form.qtdIndefinido" type="number" min="0" />
            </div>
          </div>
```

- [ ] **Step 4: Atualizar o script setup do TierListView**

Adicionar um computed de total perto dos demais computeds (após os imports/refs do setup):

```ts
const qtdTotal = computed(
  () => (Number(form.qtdMacho) || 0) + (Number(form.qtdFemea) || 0) + (Number(form.qtdIndefinido) || 0),
);
```

(garantir que `computed` está importado de `vue`; se não estiver, adicionar ao import.)

No objeto reativo `form` (as duas ocorrências de `qtdAnimais: 0,` — inicial ~L151 e reset ~L170) trocar cada uma por:

```ts
    qtdMacho: 0,
    qtdFemea: 0,
    qtdIndefinido: 0,
```

No guard do `save()` (`!form.qtdAnimais`, ~L178) trocar por `!qtdTotal`; no `:disabled` do botão (`!form.qtdAnimais`, ~L104) trocar por `!qtdTotal`.

No payload do `save()` (`qtdAnimais: Number(form.qtdAnimais),` ~L183) trocar por:

```ts
      qtdMacho: Number(form.qtdMacho),
      qtdFemea: Number(form.qtdFemea),
      qtdIndefinido: Number(form.qtdIndefinido),
```

- [ ] **Step 5: Mostrar breakdown na coluna da lista**

Na célula `{{ row.qtdAnimais }}` (~L49) trocar por:

```html
            <td class="px-3 py-2 tabular-nums">
              {{ row.qtdAnimais }}
              <span class="text-xs text-muted-foreground">
                (M {{ row.qtdMacho }} · F {{ row.qtdFemea }} · I {{ row.qtdIndefinido }})
              </span>
            </td>
```

- [ ] **Step 6: Mostrar breakdown no TierDetailView**

No `TierDetailView.vue`, na stat de quantidade (`{{ tier.qtdAnimais }}`, ~L27) adicionar o breakdown logo abaixo do valor:

```html
            <div class="text-lg font-semibold tabular-nums">{{ tier.qtdAnimais }}</div>
            <div class="text-xs text-muted-foreground">
              M {{ tier.qtdMacho }} · F {{ tier.qtdFemea }} · I {{ tier.qtdIndefinido }}
            </div>
```

- [ ] **Step 7: Rodar e confirmar passa**

Run: `cd apps/web && npx vitest run src/views/tier/TierListView.spec.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/views/tier/TierListView.vue apps/web/src/views/tier/TierListView.spec.ts apps/web/src/views/tier/TierDetailView.vue
git commit -m "feat(tier-web): per-sexo inputs and breakdown in tier list/detail"
```

---

## Task 11: Gate final (API + Web)

**Files:** nenhum (verificação).

- [ ] **Step 1: Build + testes da API**

Run: `cd apps/api && npx prisma generate && npm run build && npm test`
Expected: sem erros de compilação; toda a suíte Jest PASS.

- [ ] **Step 2: Typecheck + testes + build do Web**

Run: `cd apps/web && npm run test -- run && npm run build`
Expected: vitest PASS; `vue-tsc -b` sem erros; `vite build` conclui.

- [ ] **Step 3: Verificação visual dos critérios de aceite**

Conferir manualmente no diff: Tier e Abate aceitam quantidades por sexo; total = soma; qualquer combinação (inclusive só INDEFINIDO) é aceita; crédito/saldo/receita/cobrança usam o total.

- [ ] **Step 4: Commit final (se algo pendente)**

```bash
git add -A
git commit -m "chore(tier): finalize per-sexo quantity feature"
```

---

## Self-Review Notes

- **Cobertura do spec:** modelo (Task 1), migração+backfill→INDEFINIDO (Task 1), CHECK constraints (Task 1), DTOs+validação soma≥1 (Tasks 3/5/2), total derivado em tiers/abates/cobrança/crédito (Tasks 4/5/6/7), web tipos+forms+breakdown (Tasks 8/9/10), testes (todas as tasks), gate `nest build`/`vue-tsc` (Task 11). ✓
- **Sem stored total:** confirmado — nenhuma coluna de total; `qtdAnimais`/`qtd` nas respostas são computados em memória via `totalSexo`. ✓
- **Consistência de nomes:** `totalSexo`, `SexoQuantidadeValida`, colunas `qtdMacho/qtdFemea/qtdIndefinido` (mapeadas `qtd_macho/qtd_femea/qtd_indefinido`) usadas de forma idêntica em API e web. ✓
- **`cobrancas.service.ts` sem mudança de código:** `loadTiers`/`preview` usam `include` (linha completa), então as 3 colunas chegam ao snapshot; só o mock do spec pode precisar de ajuste (Task 6 Step 6). ✓
```
