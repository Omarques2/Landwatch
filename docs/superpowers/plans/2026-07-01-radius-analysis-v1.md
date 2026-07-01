# Análise por Raio — v1 (sem anti-fraude) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir criar uma análise ambiental a partir de um ponto (lat,lng) + raio, verificando os mesmos datasets STANDARD que a análise por CAR, sem exigir `carKey` e sem o mecanismo anti-fraude.

**Architecture:** Geometria-alvo = só o círculo (`ST_Buffer` geográfico). Novas funções SQL `_geom` recebem a geom pronta. Uma coluna `subject_type = CAR|RADIUS` (ortogonal a `analysis_kind`) e `car_key` nullable. Endpoint separado `POST /v1/analyses/radius`. Runner ganha um ramo RADIUS que monta o círculo e chama as fns `_geom` (current + as-of). Frontend reaproveita o card de busca já existente e desenha o círculo no client.

**Tech Stack:** NestJS + Prisma (PostgreSQL, schema `app`), PostGIS (schema `landwatch`), Vue 3 + MapLibre GL, Jest.

**Spec:** [docs/superpowers/specs/2026-07-01-radius-analysis-v1-design.md](../specs/2026-07-01-radius-analysis-v1-design.md)

---

## File Structure

**Camada SQL** (`apps/Versionamento/create_functions.sql`)
- Adiciona `fn_intersections_current_area_geom(geometry)` e `fn_intersections_asof_area_geom(geometry, date)`. Espelha as funções por `cod_imovel`, mas recebe a geom pronta e omite a linha "self".

**Banco** (`apps/api/prisma/`)
- `schema.prisma`: enum `SubjectType`, colunas novas em `Analysis`, `carKey` nullable.
- Nova migração `migrations/<ts>_radius_analysis/migration.sql`.

**API** (`apps/api/src/analyses/`)
- `dto/create-radius-analysis.dto.ts` (novo): DTO da criação por raio.
- `analyses.service.ts`: `createRadiusForActor()` + `createRadiusForActor` público wrapper; tipo `CreateRadiusAnalysisInput`.
- `analyses.controller.ts`: `POST /v1/analyses/radius`.
- `analysis-runner.service.ts`: ramo RADIUS (fetch dos campos, `buildRadiusCurrentAreaQuery`/`buildRadiusAsofAreaQuery`, `executeRadiusIntersectionsQuery`).
- `analysis-detail.service.ts`: expõe `subjectType`/`radius`.

**Frontend** (`apps/web/src/views/`)
- `NewAnalysisView.vue`: pill "Análise de Raio" + submit no endpoint novo.
- View de detalhe da análise: mostra centro+raio quando RADIUS.

---

## Task 1: SQL — `fn_intersections_current_area_geom`

**Files:**
- Modify: `apps/Versionamento/create_functions.sql` (adicionar após `fn_intersections_current_area`, ~linha 1007)

- [ ] **Step 1: Adicionar a função current `_geom`**

Adicione ao final do bloco de funções de interseção (o corpo é a **segunda metade** de `fn_intersections_current_area` — só o `UNION ALL` contra datasets, sem a linha "self" do SICAR; a geom-alvo vem por parâmetro):

```sql
CREATE OR REPLACE FUNCTION landwatch.fn_intersections_current_area_geom(p_subject geometry)
RETURNS TABLE (
  category_code text,
  dataset_code text,
  snapshot_date date,
  feature_id bigint,
  geom_id bigint,
  geom geometry,
  sicar_area_m2 numeric,
  feature_area_m2 numeric,
  overlap_area_m2 numeric,
  overlap_pct_of_sicar numeric
)
LANGUAGE sql
STABLE
AS $$
  WITH subject AS (
    SELECT p_subject AS geom, ST_Area(p_subject::geography) AS subject_area_m2
  )
  SELECT
    c.code AS category_code,
    d.code AS dataset_code,
    v.snapshot_date AS snapshot_date,
    f.feature_id,
    a.geom_id AS geom_id,
    a.geom AS geom,
    s.subject_area_m2 AS sicar_area_m2,
    ST_Area(a.geom::geography) AS feature_area_m2,
    ST_Area(ST_Intersection(s.geom, a.geom)::geography) AS overlap_area_m2,
    CASE
      WHEN s.subject_area_m2 = 0 THEN 0
      ELSE ST_Area(ST_Intersection(s.geom, a.geom)::geography)
           / s.subject_area_m2 * 100
    END AS overlap_pct_of_sicar
  FROM subject s
  JOIN landwatch.mv_feature_geom_active a ON TRUE
  JOIN landwatch.lw_feature f
    ON f.dataset_id = a.dataset_id
   AND f.feature_id = a.feature_id
  JOIN landwatch.lw_dataset d ON d.dataset_id = f.dataset_id
  JOIN landwatch.lw_category c ON c.category_id = d.category_id
  JOIN landwatch.lw_dataset_version v ON v.version_id = a.version_id
  WHERE c.code NOT IN ('SICAR', 'DETER')
    AND a.geom && s.geom
    AND ST_Intersects(s.geom, a.geom)
  ORDER BY dataset_code, feature_id;
$$;
```

- [ ] **Step 2: Aplicar e testar manualmente contra uma geom conhecida**

Aplique o arquivo de funções no banco de dev (mesma forma que o projeto aplica `create_functions.sql`), depois rode:

```sql
-- círculo de 5km em torno de um ponto sabidamente sobre um dataset (ajuste lat/lng do seu dev)
SELECT category_code, dataset_code, round(overlap_area_m2) AS overlap_m2, round(overlap_pct_of_sicar,2) AS pct
FROM landwatch.fn_intersections_current_area_geom(
  ST_Buffer(ST_SetSRID(ST_MakePoint(-47.9, -15.8), 4326)::geography, 5000)::geometry
);
```

Expected: retorna 1+ linhas de datasets que intersectam o círculo; `pct` = % da área do círculo (0–100); nenhuma linha `SICAR`/`DETER`.

- [ ] **Step 3: Commit**

```bash
git add apps/Versionamento/create_functions.sql
git commit -m "feat(sql): fn_intersections_current_area_geom (radius subject)"
```

---

## Task 2: SQL — `fn_intersections_asof_area_geom`

**Files:**
- Modify: `apps/Versionamento/create_functions.sql` (adicionar após a função do Task 1)

- [ ] **Step 1: Adicionar a variante as-of `_geom`**

Espelha `fn_intersections_asof_area` (create_functions.sql:1094), lendo geometria histórica de `lw_feature_geom_hist`/`lw_geom_store` com janela temporal, recebendo a geom-alvo por parâmetro:

```sql
CREATE OR REPLACE FUNCTION landwatch.fn_intersections_asof_area_geom(
  p_subject geometry,
  p_as_of_date date
)
RETURNS TABLE (
  category_code text,
  dataset_code text,
  snapshot_date date,
  feature_id bigint,
  geom_id bigint,
  geom geometry,
  sicar_area_m2 numeric,
  feature_area_m2 numeric,
  overlap_area_m2 numeric,
  overlap_pct_of_sicar numeric
)
LANGUAGE sql
STABLE
AS $$
  WITH subject AS (
    SELECT p_subject AS geom, ST_Area(p_subject::geography) AS subject_area_m2
  )
  SELECT
    c.code AS category_code,
    d.code AS dataset_code,
    v.snapshot_date AS snapshot_date,
    f.feature_id,
    g.geom_id AS geom_id,
    g.geom AS geom,
    s.subject_area_m2 AS sicar_area_m2,
    ST_Area(g.geom::geography) AS feature_area_m2,
    ST_Area(overlap.overlap_geom::geography) AS overlap_area_m2,
    CASE
      WHEN s.subject_area_m2 = 0 THEN 0
      ELSE ST_Area(overlap.overlap_geom::geography) / s.subject_area_m2 * 100
    END AS overlap_pct_of_sicar
  FROM subject s
  CROSS JOIN LATERAL (
    SELECT gs.geom_id, gs.geom, h.dataset_id, h.feature_id, h.version_id
    FROM landwatch.lw_geom_store gs
    JOIN landwatch.lw_feature_geom_hist h
      ON h.geom_id = gs.geom_id
     AND h.valid_from <= p_as_of_date
     AND (h.valid_to IS NULL OR h.valid_to > p_as_of_date)
    WHERE gs.geom && s.geom
      AND ST_Intersects(s.geom, gs.geom)
  ) g
  JOIN landwatch.lw_feature f
    ON f.dataset_id = g.dataset_id AND f.feature_id = g.feature_id
  JOIN landwatch.lw_dataset d ON d.dataset_id = f.dataset_id
  JOIN landwatch.lw_category c ON c.category_id = d.category_id
  JOIN landwatch.lw_dataset_version v ON v.version_id = g.version_id
  CROSS JOIN LATERAL (
    SELECT ST_Intersection(s.geom, g.geom) AS overlap_geom
  ) overlap
  WHERE c.code NOT IN ('SICAR', 'DETER')
    AND NOT ST_IsEmpty(overlap.overlap_geom)
  ORDER BY dataset_code, feature_id;
$$;
```

> Nota: confira contra o corpo real de `fn_intersections_asof_area` (create_functions.sql:1094–1199) que os nomes de coluna de `lw_feature_geom_hist`/`lw_geom_store`/`lw_dataset_version` batem (ex.: `version_id`, `snapshot_date`). Ajuste se o schema divergir.

- [ ] **Step 2: Testar manualmente com data passada**

```sql
SELECT category_code, dataset_code, snapshot_date, round(overlap_pct_of_sicar,2) AS pct
FROM landwatch.fn_intersections_asof_area_geom(
  ST_Buffer(ST_SetSRID(ST_MakePoint(-47.9, -15.8), 4326)::geography, 5000)::geometry,
  '2024-01-01'::date
);
```

Expected: linhas com `snapshot_date` respeitando a data histórica; sem erro; sem linhas SICAR/DETER.

- [ ] **Step 3: Commit**

```bash
git add apps/Versionamento/create_functions.sql
git commit -m "feat(sql): fn_intersections_asof_area_geom (radius as-of)"
```

---

## Task 3: Migração Prisma — `subject_type`, colunas de raio, `car_key` nullable

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (model `Analysis` ~204-248; bloco de enums ~726)
- Create: `apps/api/prisma/migrations/<timestamp>_radius_analysis/migration.sql`

- [ ] **Step 1: Editar `schema.prisma` — enum novo**

Adicione junto aos outros enums (perto de `enum AnalysisKind`):

```prisma
enum SubjectType {
  CAR
  RADIUS

  @@map("subject_type")
  @@schema("app")
}
```

- [ ] **Step 2: Editar `schema.prisma` — model `Analysis`**

Torne `carKey` nullable e adicione as colunas de raio + subject_type:

```prisma
  carKey            String?            @map("car_key")
  subjectType       SubjectType        @default(CAR) @map("subject_type")
  radiusCenterLat   Decimal?           @map("radius_center_lat")
  radiusCenterLng   Decimal?           @map("radius_center_lng")
  radiusM           Int?               @map("radius_m")
```

(Mantenha o restante do model igual. `carKey` era `String` → agora `String?`.)

- [ ] **Step 3: Gerar a migração**

Run: `cd apps/api && npx prisma migrate dev --name radius_analysis --create-only`
Expected: cria `migrations/<timestamp>_radius_analysis/migration.sql`.

- [ ] **Step 4: Conferir o SQL gerado**

O `migration.sql` deve conter (equivalente a):

```sql
CREATE TYPE "app"."subject_type" AS ENUM ('CAR', 'RADIUS');
ALTER TABLE "app"."analysis" ADD COLUMN "subject_type" "app"."subject_type" NOT NULL DEFAULT 'CAR';
ALTER TABLE "app"."analysis" ALTER COLUMN "car_key" DROP NOT NULL;
ALTER TABLE "app"."analysis" ADD COLUMN "radius_center_lat" DECIMAL;
ALTER TABLE "app"."analysis" ADD COLUMN "radius_center_lng" DECIMAL;
ALTER TABLE "app"."analysis" ADD COLUMN "radius_m" INTEGER;
```

O `DEFAULT 'CAR'` já faz o backfill do legado (linhas existentes viram `CAR`). Nenhum `UPDATE` extra necessário.

- [ ] **Step 5: Aplicar e gerar client**

Run: `cd apps/api && npx prisma migrate dev && npx prisma generate`
Expected: migração aplicada, client Prisma regenerado com `SubjectType` e campos novos.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(db): analysis subject_type + radius columns, car_key nullable"
```

---

## Task 4: Resolver o ripple de `carKey` nullable (typecheck)

Tornar `carKey` nullable quebra o build TS onde o código assume `string`. Corrigir antes de seguir.

**Files:**
- Modify: `apps/api/src/analyses/analyses.service.ts` (tipo `AnalysisStatusPayload` ~72-83)
- Modify: outros pontos apontados pelo typecheck.

- [ ] **Step 1: Rodar o typecheck para achar os pontos quebrados**

Run: `cd apps/api && npx tsc --noEmit`
Expected: erros do tipo `Type 'string | null' is not assignable to type 'string'` em locais que leem `analysis.carKey`.

- [ ] **Step 2: Ajustar `AnalysisStatusPayload`**

Em [analyses.service.ts:73](../../../apps/api/src/analyses/analyses.service.ts#L73), troque:

```ts
  carKey: string;
```

por:

```ts
  carKey: string | null;
```

- [ ] **Step 3: Corrigir os demais pontos**

Para cada erro restante do typecheck: se for consumo por CAR (ex.: attachments snapshot no runner), use `analysis.carKey ?? ''` ou guarde atrás do ramo CAR. Aplique o mínimo para compilar sem alterar comportamento da análise por CAR.

- [ ] **Step 4: Verificar typecheck limpo**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src
git commit -m "fix(api): handle nullable carKey after schema change"
```

---

## Task 5: DTO — `CreateRadiusAnalysisDto`

**Files:**
- Create: `apps/api/src/analyses/dto/create-radius-analysis.dto.ts`
- Test: `apps/api/src/analyses/dto/create-radius-analysis.dto.spec.ts`

- [ ] **Step 1: Escrever o teste de validação (falhando)**

```ts
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateRadiusAnalysisDto } from './create-radius-analysis.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateRadiusAnalysisDto, payload);
  return validate(dto);
}

describe('CreateRadiusAnalysisDto', () => {
  const base = { lat: -15.8, lng: -47.9, radiusMeters: 5000, name: 'Fazenda X' };

  it('accepts a valid radius payload', async () => {
    expect(await errorsFor(base)).toHaveLength(0);
  });

  it('rejects radius below 1000m', async () => {
    const errs = await errorsFor({ ...base, radiusMeters: 999 });
    expect(errs.some((e) => e.property === 'radiusMeters')).toBe(true);
  });

  it('rejects radius above 50000m', async () => {
    const errs = await errorsFor({ ...base, radiusMeters: 50001 });
    expect(errs.some((e) => e.property === 'radiusMeters')).toBe(true);
  });

  it('requires a name', async () => {
    const { name, ...noName } = base;
    const errs = await errorsFor(noName);
    expect(errs.some((e) => e.property === 'name')).toBe(true);
  });

  it('rejects out-of-range latitude', async () => {
    const errs = await errorsFor({ ...base, lat: 200 });
    expect(errs.some((e) => e.property === 'lat')).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar o teste (deve falhar)**

Run: `cd apps/api && npx jest create-radius-analysis.dto -t "valid radius payload"`
Expected: FAIL — módulo `create-radius-analysis.dto` não existe.

- [ ] **Step 3: Implementar o DTO**

```ts
import {
  IsArray,
  IsInt,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CreateRadiusAnalysisDto {
  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;

  @IsInt()
  @Min(1000)
  @Max(50000)
  radiusMeters!: number;

  @IsString()
  @Length(2, 200)
  name!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Length(11, 18, { each: true })
  documents?: string[];

  @IsOptional()
  @IsISO8601()
  analysisDate?: string;
}
```

> `@IsLatitude`/`@IsLongitude` do class-validator aceitam number ou string numérica. Se o projeto envia number por JSON, mantenha number. Caso o typecheck reclame, adicione `@IsNumber()` antes.

- [ ] **Step 4: Rodar os testes (devem passar)**

Run: `cd apps/api && npx jest create-radius-analysis.dto`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/analyses/dto/create-radius-analysis.dto.ts apps/api/src/analyses/dto/create-radius-analysis.dto.spec.ts
git commit -m "feat(api): CreateRadiusAnalysisDto with validation"
```

---

## Task 6: Service — `createRadiusForActor`

**Files:**
- Modify: `apps/api/src/analyses/analyses.service.ts` (tipo `CreateRadiusAnalysisInput` perto de `CreateAnalysisInput` ~38; método novo perto de `createWithActor` ~222; wrapper público perto de `createForActor`)
- Test: `apps/api/src/analyses/analyses.service.spec.ts`

- [ ] **Step 1: Escrever o teste (falhando)**

Adicione ao final de `analyses.service.spec.ts` (use os mesmos helpers `makePrismaMock`/`makeDeps`/`now` já presentes no arquivo):

```ts
it('creates a RADIUS analysis without CAR/farm and enqueues the runner', async () => {
  const prisma = makePrismaMock();
  prisma.analysis.create.mockResolvedValue({
    id: 'an-radius',
    carKey: null,
    analysisDate: new Date('2026-07-01'),
    status: 'pending',
    analysisKind: 'STANDARD',
    subjectType: 'RADIUS',
  });
  const deps = makeDeps();
  const service = new AnalysesService(
    prisma,
    deps.runner as any,
    deps.detail as any,
    deps.cache as any,
    deps.vectorMap as any,
    deps.postprocess as any,
    deps.pdf as any,
    deps.landwatchStatus as any,
    () => now,
  );

  const res = await service.createRadiusForActor(
    { userId: 'u1', orgId: 'org-1' } as any,
    { lat: -15.8, lng: -47.9, radiusMeters: 5000, name: 'Área X' },
  );

  expect(res.analysisId).toBe('an-radius');
  expect(prisma.analysis.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        subjectType: 'RADIUS',
        carKey: null,
        farmId: null,
        radiusM: 5000,
        farmNameSnapshot: 'Área X',
      }),
    }),
  );
  expect(deps.runner.enqueue).toHaveBeenCalledWith('an-radius');
});
```

- [ ] **Step 2: Rodar o teste (deve falhar)**

Run: `cd apps/api && npx jest analyses.service -t "RADIUS analysis without CAR"`
Expected: FAIL — `createRadiusForActor` não existe.

- [ ] **Step 3: Adicionar o tipo de input**

Perto de `CreateAnalysisInput` ([analyses.service.ts:38](../../../apps/api/src/analyses/analyses.service.ts#L38)):

```ts
type CreateRadiusAnalysisInput = {
  lat: number;
  lng: number;
  radiusMeters: number;
  name: string;
  documents?: string[];
  analysisDate?: string;
};
```

- [ ] **Step 4: Implementar `createRadiusForActor`**

Adicione o método (paralelo a `createWithActor`), reaproveitando `normalizeDate`, `normalizeDocuments`, `normalizeFarmNameInput` e `landwatchStatus`:

```ts
async createRadiusForActor(
  actor: CreateActor,
  input: CreateRadiusAnalysisInput,
) {
  const { userId, orgId } = actor;
  if (!orgId) {
    throw new ForbiddenException({
      code: 'ORG_REQUIRED',
      message: 'Organization context required to create analysis',
    });
  }

  const analysisDate = this.normalizeDate(input.analysisDate);
  const documents = this.normalizeDocuments(input.documents);
  const name = this.normalizeFarmNameInput(input.name);
  if (!name) {
    throw new BadRequestException({
      code: 'INVALID_ANALYSIS_NAME',
      message: 'Nome da análise é obrigatório',
    });
  }

  if (this.isCurrentAnalysisDate(analysisDate)) {
    await this.landwatchStatus.assertNotRefreshing();
  }

  const cnpjDocs = documents
    .filter((doc) => doc.docType === FarmDocType.CNPJ)
    .map((doc) => doc.docNormalized);

  const analysis = await this.prisma.analysis.create({
    data: {
      subjectType: 'RADIUS',
      carKey: null,
      analysisDocs: documents as Prisma.InputJsonValue,
      analysisDate: new Date(analysisDate),
      status: 'pending',
      analysisKind: AnalysisKind.STANDARD,
      createdByUserId: userId,
      orgId: orgId ?? undefined,
      farmId: null,
      farmNameSnapshot: name,
      radiusCenterLat: new Prisma.Decimal(input.lat),
      radiusCenterLng: new Prisma.Decimal(input.lng),
      radiusM: input.radiusMeters,
      hasIntersections: false,
      intersectionCount: 0,
    },
    select: {
      id: true,
      analysisDate: true,
      status: true,
      analysisKind: true,
      subjectType: true,
    },
  });

  this.runner.enqueue(analysis.id);
  await Promise.all(
    cnpjDocs.map((docNormalized) =>
      this.postprocess.enqueue({
        jobType: AnalysisPostprocessJobType.CNPJ_REFRESH,
        docNormalized,
        dedupeKey: `cnpj:${docNormalized}`,
      }),
    ),
  );

  return {
    analysisId: analysis.id,
    analysisDate: analysis.analysisDate,
    status: analysis.status,
    analysisKind: analysis.analysisKind,
    subjectType: analysis.subjectType,
  };
}
```

- [ ] **Step 5: Rodar o teste (deve passar)**

Run: `cd apps/api && npx jest analyses.service -t "RADIUS analysis without CAR"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/analyses/analyses.service.ts apps/api/src/analyses/analyses.service.spec.ts
git commit -m "feat(api): AnalysesService.createRadiusForActor"
```

---

## Task 7: Controller — `POST /v1/analyses/radius`

**Files:**
- Modify: `apps/api/src/analyses/analyses.controller.ts`

- [ ] **Step 1: Importar o DTO**

Perto do import de `CreateAnalysisDto` ([analyses.controller.ts:18](../../../apps/api/src/analyses/analyses.controller.ts#L18)):

```ts
import { CreateRadiusAnalysisDto } from './dto/create-radius-analysis.dto';
```

- [ ] **Step 2: Adicionar o endpoint**

Adicione logo após o `create()` existente (~linha 43), espelhando o gate/fluxo:

```ts
@Post('radius')
async createRadius(
  @Req() req: AuthedRequest,
  @Body() dto: CreateRadiusAnalysisDto,
) {
  if (!req.user) {
    throw new UnauthorizedException({
      code: 'UNAUTHORIZED',
      message: 'Missing user claims',
    });
  }
  const actor = await this.actorContext.fromRequest(req, {
    orgMode: 'tenant',
  });
  await this.access.requireTenantFeature(actor, 'ANALYSIS_CREATE');
  return this.analyses.createRadiusForActor(actor, dto);
}
```

> `@Post('radius')` deve vir **antes** de qualquer rota `@Get(':id')`; como é POST não há colisão com o GET dinâmico, mas mantenha junto do `create()` para clareza.

- [ ] **Step 3: Verificar build**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/analyses/analyses.controller.ts
git commit -m "feat(api): POST /v1/analyses/radius endpoint"
```

---

## Task 8: Runner — ramo RADIUS

**Files:**
- Modify: `apps/api/src/analyses/analysis-runner.service.ts` (select em `processAnalysis` ~121-134; ramo antes de `executeIntersectionsQuery` ~164; novos builders perto de `buildStandardCurrentAreaQuery` ~380)

- [ ] **Step 1: Incluir os campos de raio no select do `processAnalysis`**

Em [analysis-runner.service.ts:123-133](../../../apps/api/src/analyses/analysis-runner.service.ts#L123), adicione ao `select`:

```ts
          subjectType: true,
          radiusCenterLat: true,
          radiusCenterLng: true,
          radiusM: true,
```

- [ ] **Step 2: Adicionar os builders de query RADIUS**

Perto de `buildStandardCurrentAreaQuery` ([analysis-runner.service.ts:380](../../../apps/api/src/analyses/analysis-runner.service.ts#L380)):

```ts
private buildRadiusCurrentAreaQuery(
  schema: string,
  lat: number,
  lng: number,
  radiusM: number,
) {
  const fn = Prisma.raw(`"${schema}"."fn_intersections_current_area_geom"`);
  return Prisma.sql`
    WITH subject AS (
      SELECT ST_Buffer(
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ${radiusM}
      )::geometry AS geom
    ),
    intersections AS (
      SELECT * FROM ${fn}((SELECT geom FROM subject))
    )
    SELECT
      i.*,
      ST_GeometryType(i.geom) AS geometry_type
    FROM intersections i
  `;
}

private buildRadiusAsofAreaQuery(
  schema: string,
  lat: number,
  lng: number,
  radiusM: number,
  analysisDate: string,
) {
  const fn = Prisma.raw(`"${schema}"."fn_intersections_asof_area_geom"`);
  return Prisma.sql`
    WITH subject AS (
      SELECT ST_Buffer(
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ${radiusM}
      )::geometry AS geom
    ),
    intersections AS (
      SELECT * FROM ${fn}((SELECT geom FROM subject), ${analysisDate}::date)
    )
    SELECT
      i.*,
      ST_GeometryType(i.geom) AS geometry_type
    FROM intersections i
  `;
}

private async executeRadiusIntersectionsQuery(
  schema: string,
  lat: number,
  lng: number,
  radiusM: number,
  analysisDate: string | undefined,
  analysisId: string,
): Promise<{ rows: IntersectionRow[] }> {
  const query =
    analysisDate && !this.isCurrentAnalysisDate(analysisDate)
      ? this.buildRadiusAsofAreaQuery(schema, lat, lng, radiusM, analysisDate)
      : this.buildRadiusCurrentAreaQuery(schema, lat, lng, radiusM);
  const startedAt = process.hrtime.bigint();
  const rows = await this.prisma.$queryRaw<IntersectionRow[]>(query);
  this.logEvent('analysis.intersections.query.raw', {
    analysisId,
    strategy: 'radius_area',
    durationMs: this.elapsedMs(startedAt),
    rowCount: Array.isArray(rows) ? rows.length : 0,
  });
  return { rows };
}
```

- [ ] **Step 3: Ramificar no `processAnalysis`**

Substitua o bloco que chama `executeIntersectionsQuery` ([analysis-runner.service.ts:164-174](../../../apps/api/src/analyses/analysis-runner.service.ts#L164)) por:

```ts
      let rawIntersections: IntersectionRow[];
      if (analysis.subjectType === 'RADIUS') {
        const { rows } = await this.executeRadiusIntersectionsQuery(
          schema,
          Number(analysis.radiusCenterLat),
          Number(analysis.radiusCenterLng),
          analysis.radiusM ?? 0,
          analysisDate,
          analysisId,
        );
        rawIntersections = rows;
      } else {
        const { rows } = await this.executeIntersectionsQuery(
          schema,
          analysis.carKey ?? '',
          analysisDate,
          kind,
          analysisId,
        );
        rawIntersections = rows;
      }
```

> Isso substitui a desestruturação `{ rows: rawIntersections, strategy, usedFallback }`. Se `strategy`/`usedFallback` forem usados no `logEvent('analysis.intersections.query', ...)` logo abaixo, remova esses dois campos do log (ou registre `strategy: analysis.subjectType === 'RADIUS' ? 'radius_area' : ...`). Mantenha o log compilando.

- [ ] **Step 4: Garantir o snapshot de attachments com carKey nulo**

No bloco de transação, a chamada `captureEffectiveSnapshotForAnalysisTx` usa `analysis.carKey` ([analysis-runner.service.ts:246](../../../apps/api/src/analyses/analysis-runner.service.ts#L246)). Troque para `carKey: analysis.carKey ?? ''` (RADIUS não tem attachments por CAR; snapshot vazio é o comportamento correto).

- [ ] **Step 5: Verificar build + rodar suíte do runner**

Run: `cd apps/api && npx tsc --noEmit && npx jest analysis-runner`
Expected: sem erros de tipo; testes existentes do runner continuam passando.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/analyses/analysis-runner.service.ts
git commit -m "feat(api): runner RADIUS branch (circle subject + _geom fns)"
```

---

## Task 9: Runner — teste do ramo RADIUS

**Files:**
- Test: `apps/api/src/analyses/analysis-runner.service.spec.ts`

- [ ] **Step 1: Escrever o teste (falhando)**

Espelhe um teste existente de `processAnalysis` do arquivo. O ponto-chave: quando `subjectType='RADIUS'`, o `$queryRaw` recebe SQL contendo `fn_intersections_current_area_geom` e **não** resolve CAR. Use o mock de prisma já presente:

```ts
it('runs a RADIUS analysis via the _geom current function', async () => {
  const { runner, prisma } = makeRunner(); // helper existente no arquivo
  prisma.analysis.updateMany.mockResolvedValue({ count: 1 });
  prisma.analysis.findUnique.mockResolvedValue({
    id: 'an-r',
    carKey: null,
    subjectType: 'RADIUS',
    radiusCenterLat: -15.8,
    radiusCenterLng: -47.9,
    radiusM: 5000,
    analysisDate: new Date(), // hoje → current
    analysisKind: 'STANDARD',
    analysisDocs: [],
    farmId: null,
    scheduleId: null,
    orgId: 'org-1',
    attachmentsSnapshotCutoffAt: new Date(),
  });
  prisma.$queryRaw.mockResolvedValue([
    {
      category_code: 'UC',
      dataset_code: 'UC_FED',
      snapshot_date: null,
      feature_id: 1n,
      geom_id: 1n,
      geometry_type: 'ST_Polygon',
      sicar_area_m2: '1000',
      feature_area_m2: '500',
      overlap_area_m2: '200',
      overlap_pct_of_sicar: '20',
    },
  ]);

  await runner.processAnalysis('an-r');

  const sql = prisma.$queryRaw.mock.calls[0][0];
  expect(JSON.stringify(sql)).toContain('fn_intersections_current_area_geom');
  expect(prisma.analysisResult.createMany).toHaveBeenCalled();
  expect(prisma.analysis.update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ status: 'completed' }),
    }),
  );
});
```

> Ajuste `makeRunner`/nomes de mock aos helpers reais do arquivo. Se `$queryRaw` recebe um objeto `Prisma.Sql`, inspecione `sql.strings`/`sql.values` em vez de `JSON.stringify` conforme o padrão dos testes vizinhos.

- [ ] **Step 2: Rodar (deve passar após Task 8)**

Run: `cd apps/api && npx jest analysis-runner -t "RADIUS analysis via the _geom"`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/analyses/analysis-runner.service.spec.ts
git commit -m "test(api): runner RADIUS branch"
```

---

## Task 10: Detail — expor `subjectType` e `radius`

**Files:**
- Modify: `apps/api/src/analyses/analysis-detail.service.ts` (`getById` ~176-368)
- Test: `apps/api/src/analyses/analysis-detail.service.spec.ts` (se existir; senão cobrir via e2e no Task 13)

- [ ] **Step 1: Incluir os campos no fetch da análise**

No `select`/`findUnique` que carrega a análise dentro de `getById`, adicione:

```ts
          subjectType: true,
          radiusCenterLat: true,
          radiusCenterLng: true,
          radiusM: true,
```

- [ ] **Step 2: Adicionar `subjectType`/`radius` à resposta**

No objeto de retorno de `getById`, adicione (após os campos de topo como `carKey`/`analysisKind`):

```ts
    subjectType: analysis.subjectType,
    radius:
      analysis.subjectType === 'RADIUS'
        ? {
            lat: analysis.radiusCenterLat != null ? Number(analysis.radiusCenterLat) : null,
            lng: analysis.radiusCenterLng != null ? Number(analysis.radiusCenterLng) : null,
            m: analysis.radiusM ?? null,
          }
        : null,
```

- [ ] **Step 3: Tornar a meta do SICAR condicional**

Onde `getById` resolve metadados via `carKey` (município/UF/coords do SICAR, ex.: `fetchSicarMeta`), envolva num guard para não chamar quando não há CAR:

```ts
    const sicarMeta =
      analysis.subjectType === 'RADIUS' || !analysis.carKey
        ? null
        : await this.fetchSicarMeta(/* args existentes */);
```

Ajuste os usos subsequentes de `sicarMeta` para tolerar `null` (já deve tolerar, pois CAR sem meta também pode retornar null).

- [ ] **Step 4: Verificar build**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/analyses/analysis-detail.service.ts
git commit -m "feat(api): expose subjectType + radius in analysis detail"
```

---

## Task 11: PDF — cabeçalho + legenda + círculo

**Files:**
- Modify: arquivos em `apps/api/src/analyses/pdf/` (localize o template do cabeçalho e da legenda do mapa)

- [ ] **Step 1: Localizar o ponto de render do cabeçalho/legenda**

Run: `cd apps/api && grep -rn "carKey\|Coordenadas\|Legenda\|legend" src/analyses/pdf`
Expected: arquivos que montam o cabeçalho (dados do CAR) e a legenda do mapa.

- [ ] **Step 2: Cabeçalho condicional por subjectType**

Onde o cabeçalho imprime dados do CAR, adicione o ramo RADIUS mostrando **centro + raio** (ex.: `Centro: {lat}, {lng} · Raio: {m} m`) quando `subjectType === 'RADIUS'`. Use os campos já expostos pelo detail (Task 10).

- [ ] **Step 3: Legenda + círculo no mapa**

Adicione item de legenda **"Raio"**. No render do mapa do PDF, quando RADIUS, desenhe o contorno do círculo a partir de centro+raio (buffer client-side no gerador do mapa do PDF, mesmo estilo do círculo do frontend). Sem reveal de CAR.

- [ ] **Step 4: Verificar geração do PDF de uma análise RADIUS**

Run: gerar PDF de uma análise RADIUS criada em dev (via endpoint `GET /v1/analyses/:id/pdf`).
Expected: cabeçalho mostra centro+raio, legenda tem "Raio", mapa desenha o círculo, sem erro.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/analyses/pdf
git commit -m "feat(api): radius header/legend/circle in analysis PDF"
```

---

## Task 12: Frontend — pill "Análise de Raio" + submit

**Files:**
- Modify: `apps/web/src/views/NewAnalysisView.vue`
- Modify: view de detalhe da análise (localizar com grep)

- [ ] **Step 1: Adicionar estado do modo raio**

No `<script setup>` de `NewAnalysisView.vue`, adicione:

```ts
const radiusMode = ref(false);
```

- [ ] **Step 2: Pill de alternância no `/analyses/new`**

No topo do card de criação, adicione um botão pill (default off). Ao ligar, esconde o campo CAR e revela os controles de ponto/raio já existentes do card de busca:

```html
<button
  type="button"
  class="pill"
  :class="{ 'pill-active': radiusMode }"
  data-testid="radius-mode-toggle"
  @click="radiusMode = !radiusMode"
>
  Análise de Raio
</button>
```

Envolva o campo CAR com `v-if="!radiusMode"` e o bloco de lat/lng + GPS + slider de raio (já existentes no card de busca — `center.lat/lng`, botão GPS `useMyLocation`, `searchRadiusKm`) com `v-if="radiusMode"`. Reaproveite o `CarSelectMap`/mapa para desenhar o **círculo** a partir de `center` + `searchRadiusKm` (o componente já recebe `center`; passe o raio para desenhar o contorno client-side).

- [ ] **Step 3: Campo de nome obrigatório no modo raio**

Adicione (dentro do bloco `v-if="radiusMode"`) um input `v-model="radiusName"` obrigatório:

```ts
const radiusName = ref("");
```

- [ ] **Step 4: Função de submit**

Adicione:

```ts
async function submitRadiusAnalysis() {
  const payload = {
    lat: Number(center.lat),
    lng: Number(center.lng),
    radiusMeters: Math.round(searchRadiusKm.value * 1000),
    name: radiusName.value.trim(),
    documents: normalizedDocuments.value, // reutilize a mesma normalização de docs do form
    analysisDate: isoAnalysisDate.value || undefined, // reutilize a conversão de data existente
  };
  const res = await http.post<ApiEnvelope<{ analysisId: string }>>(
    "/v1/analyses/radius",
    payload,
  );
  const analysisId = unwrapData(res.data)?.analysisId;
  if (analysisId) router.push(`/analyses/${analysisId}`);
}
```

Ligue o botão de submit principal a `submitRadiusAnalysis` quando `radiusMode` estiver on (senão o submit por CAR já existente). Valide `radiusName` não-vazio e `center.lat/lng` preenchidos antes de enviar.

- [ ] **Step 5: Detail view — mostrar centro+raio**

Na view de detalhe da análise, quando `analysis.subjectType === 'RADIUS'`, mostre centro+raio em vez do CAR, e desenhe o círculo no mapa a partir de `analysis.radius`.

Localize: `cd apps/web && grep -rln "carKey\|analysisKind" src/views`

- [ ] **Step 6: Verificar build do front**

Run: `cd apps/web && npm run build` (ou `npm run type-check` se existir)
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): radius analysis mode in NewAnalysisView + detail"
```

---

## Task 13: e2e — criar análise por raio

**Files:**
- Test: localize a suíte e2e de analyses (`apps/api/test/` ou `*.e2e-spec.ts`)

- [ ] **Step 1: Escrever o e2e**

Espelhe um e2e existente de criação por CAR. Fluxo: `POST /v1/analyses/radius` com payload válido → 201/200 com `analysisId`; buscar `GET /v1/analyses/:id` → `subjectType === 'RADIUS'` e `radius` preenchido. Se o ambiente e2e tiver dados PostGIS, verifique que a análise completa com resultados; senão, verifique a criação + persistência dos campos de raio.

- [ ] **Step 2: Rodar o e2e**

Run: `cd apps/api && npx jest --config test/jest-e2e.json -t "radius"` (ajuste ao runner e2e do projeto)
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/test
git commit -m "test(api): e2e radius analysis creation"
```

---

## Task 14: Verificação final

- [ ] **Step 1: Suíte completa da API**

Run: `cd apps/api && npx jest && npx tsc --noEmit`
Expected: tudo verde.

- [ ] **Step 2: Build do front**

Run: `cd apps/web && npm run build`
Expected: sucesso.

- [ ] **Step 3: Smoke manual**

Criar uma análise por raio pela UI (`/analyses/new` → pill "Análise de Raio" → ponto + raio + nome → submit), acompanhar até `completed`, abrir o detalhe (centro+raio + círculo no mapa) e baixar o PDF.
Expected: fluxo completo sem erro.

---

## Cobertura vs Spec

- §4 SQL → Tasks 1, 2
- §5 Banco → Tasks 3, 4
- §6 API criação → Tasks 5, 6, 7
- §7 Runner → Tasks 8, 9
- §8 Detail → Task 10
- §9 PDF → Task 11
- §10 Frontend → Task 12
- §11 Testes → Tasks 5, 6(unit), 9, 13(e2e) + 14 (verificação)

Fora de escopo confirmado: anti-fraude, DETER por raio, endpoint de preview, cadastro de Farm.
