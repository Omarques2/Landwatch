# Análise por Raio — v1 (sem anti-fraude) — Design & Spec

**Data:** 2026-07-01
**Status:** Aprovado — pronto para plano de implementação
**Autor:** Otávio Marques (+ Claude)
**Base:** refina [2026-06-29-radius-analysis-design.md](2026-06-29-radius-analysis-design.md), removendo o mecanismo anti-fraude.

---

## 1. Objetivo

Gerar análise ambiental a partir de **um ponto (lat,lng) + raio (m)**, verificando os mesmos
datasets que a análise por CAR já verifica, **sem exigir um `carKey`**.

## 2. Escopo desta v1

**Dentro:**
- Geometria-alvo = **apenas o círculo** (buffer geográfico do ponto).
- Datasets **STANDARD**.
- Suporte a **data histórica** (`analysisDate` passado) via variantes as-of.
- UI, API, migração de banco, camada SQL, detail/serialização, PDF.

**Fora (v1):**
- **Anti-fraude** (classificação de CARs parciais, `ST_Union`, regra de reveal,
  `source_car_keys`, `within_radius`, `radius_partial_cars`).
- DETER por raio.
- Endpoint de preview do formulário (o círculo é desenhado no client).
- Cadastro/vínculo de Farm (`farmId` nulo; só um rótulo/nome na análise).

## 3. Decisões (fechadas)

| # | Tema | Decisão |
|---|------|---------|
| 1 | Geometria-alvo | **Só o círculo.** `ST_Buffer(pt::geography, radius_m)::geometry`. Sem CARs. |
| 2 | Datasets | **STANDARD apenas.** |
| 3 | Modelagem | Coluna `subject_type = CAR \| RADIUS` (default `CAR`), ortogonal a `analysis_kind`. `car_key` nullable. |
| 4 | Endpoint | **Separado:** `POST /v1/analyses/radius`. |
| 5 | Montagem do subject | Círculo montado **na query do runner** (não numa fn dedicada). |
| 6 | Faixa do raio | **1000–50000 m** (reaproveita slider de busca, 1–50 km). |
| 7 | Data histórica | **Suportar `analysisDate`** passado no v1 (variantes as-of). |
| 8 | Documentos CPF/CNPJ | **Opcional** (paridade; `CNPJ_REFRESH` continua standalone). |
| 9 | Vínculo com Farm | **Sem Farm.** Só rótulo (nome) na análise (`farm_name_snapshot`); `farm_id` nulo. |
| 10 | `subject_geom_id` | **Não persiste.** Círculo reconstruído de centro+raio onde preciso. |
| 11 | Self-row SQL | **Sem linha sintética RADIUS.** Círculo é desenhado só no client. `_geom` retornam só interseções reais. |

## 4. Camada SQL (`landwatch` / `apps/Versionamento/create_functions.sql`)

Base: `fn_intersections_current_area(p_cod_imovel text)`
([create_functions.sql:930](../../../apps/Versionamento/create_functions.sql#L930)) e
`fn_intersections_asof_area(p_cod_imovel, p_as_of_date)` (create_functions.sql:1094).

Novas funções — recebem a geom pronta em vez de resolver por `cod_imovel`:

```sql
landwatch.fn_intersections_current_area_geom(p_subject geometry)
  RETURNS TABLE(category_code text, dataset_code text, snapshot_date date,
                feature_id bigint, geom_id bigint, geom geometry,
                sicar_area_m2 numeric, feature_area_m2 numeric,
                overlap_area_m2 numeric, overlap_pct_of_sicar numeric)

landwatch.fn_intersections_asof_area_geom(p_subject geometry, p_as_of_date date)
  RETURNS TABLE(... mesma assinatura ...)
```

- Extraem **só a metade "UNION ALL contra datasets"** das funções atuais (a que filtra
  `c.code NOT IN ('SICAR','DETER')`, bbox `&&` + `ST_Intersects`).
- **Sem a linha "self"** (o SICAR). Retornam apenas as interseções reais.
- `sicar_area_m2 = ST_Area(p_subject::geography)` → `overlap_pct_of_sicar` passa a significar
  **% da área do raio** coberta pela interseção. Fórmula de pct inalterada.
- Current usa `mv_feature_geom_active`; as-of usa `lw_feature_geom_hist` com janela temporal
  (`valid_from <= p_as_of_date AND (valid_to IS NULL OR valid_to > p_as_of_date)`).
- **DRY (opcional):** refatorar `fn_intersections_current_area(cod)` / `_asof_area(cod,date)` para
  resolver a geom do SICAR e delegar às `_geom` (mantendo a linha self só na variante por CAR).
- Aplicação: mesmas convenções do arquivo (SQL aplicado direto, não migração numerada Prisma).

## 5. Banco (Prisma — `apps/api/prisma/schema.prisma` + migração)

- Enum novo `SubjectType { CAR RADIUS }` (`@@map("subject_type")`, `@@schema("app")`).
- `Analysis`:
  - `subjectType SubjectType @default(CAR) @map("subject_type")`
  - `carKey String?` → **nullable** (era obrigatório).
  - `radiusCenterLat Decimal? @map("radius_center_lat")`
  - `radiusCenterLng Decimal? @map("radius_center_lng")`
  - `radiusM Int? @map("radius_m")`
- Migração: adiciona colunas + enum, torna `car_key` nullable, **backfill `subject_type='CAR'`** no legado.
- `AnalysisResult` **inalterado**. `farmId` nulo; `farmNameSnapshot` = rótulo. **Nenhuma** coluna de
  anti-fraude.

## 6. API — criação (`apps/api/src/analyses/`)

- **`CreateRadiusAnalysisDto`** (`dto/create-radius-analysis.dto.ts`):
  `lat` (number), `lng` (number), `radiusMeters` (int, 1000–50000), `name` (string, obrigatório,
  2–200), `documents?` (string[] 11–18), `analysisDate?` (ISO8601). **Sem** `carKey`/`farmId`.
- **`AnalysesService.createRadiusForActor(actor, input)`** — paralelo a `createWithActor`
  ([analyses.service.ts:222](../../../apps/api/src/analyses/analyses.service.ts#L222)):
  - valida org (tenant), normaliza data (default hoje) e docs;
  - **pula** `ensureCarExists` e resolução de farm;
  - cria `analysis` `subjectType=RADIUS`, `status=pending`, grava `farmNameSnapshot=name`,
    `radiusCenterLat/Lng`, `radiusM`, `carKey=null`, `farmId=null`;
  - enfileira runner + jobs `CNPJ_REFRESH` por doc.
- **`POST /v1/analyses/radius`** ([analyses.controller.ts:30](../../../apps/api/src/analyses/analyses.controller.ts#L30)):
  `orgMode:'tenant'`, feature gate `ANALYSIS_CREATE`, chama `createRadiusForActor`.

## 7. Runner (`analysis-runner.service.ts`)

- Ramo `subjectType=RADIUS` na seleção de estratégia
  ([buildIntersectionsQuery:393](../../../apps/api/src/analyses/analysis-runner.service.ts#L393)):
  monta o círculo
  `ST_Buffer(ST_SetSRID(ST_MakePoint(lng,lat),4326)::geography, radiusM)::geometry` e chama:
  - `analysisDate` atual → `fn_intersections_current_area_geom(circle)`;
  - `analysisDate` passado → `fn_intersections_asof_area_geom(circle, date)`.
- Persistência de `AnalysisResult` **idêntica** ao CAR (mesmo mapeamento de colunas).
- Radius não tem base SICAR row: garantir que `shouldKeepRow`/`isBaseSicarIntersection` e a contagem
  de interseções funcionem sem self-row (não devem descartar interseções válidas nem exigir a base).

## 8. Detail / serialização (`analysis-detail.service.ts`)

- `GET /v1/analyses/:id`: expõe `subjectType`, `radius {lat,lng,m}`, `name`.
- Quando `RADIUS`: cabeçalho/meta mostra **centro + raio** em vez de dados do CAR/SICAR
  (município/UF/coords do SICAR não se aplicam).
- `getMapById` / `getGeoJsonById` **inalterados** (interseções vêm de `AnalysisResult`). O círculo é
  desenhado no client a partir de centro+raio.

## 9. PDF

- Cabeçalho: centro + raio quando `RADIUS`.
- Legenda ganha item **"Raio"**.
- Desenha o **círculo** no mapa do PDF (de centro+raio). Sem reveal condicional de CAR.

## 10. Frontend (`apps/web/src/views/NewAnalysisView.vue`)

- Pill **"Análise de Raio"** em `/analyses/new`, **default off**.
- Ao ativar: **esconde** o campo CAR; mostra **lat, lng, botão GPS e seletor de raio** —
  componentes já existentes no card de busca (`center.lat/lng`, `searchRadiusKm`, GPS,
  `CarSelectMap`).
- **Mapa** desenha o **contorno do círculo** (client-side) a partir de centro+raio. Sem geoms de CAR.
- Campo **`name` obrigatório**.
- Submit → `POST /v1/analyses/radius`.
- **Detail view**: quando `RADIUS`, mostra centro+raio em vez de CAR.

## 11. Testes

- **SQL:** `fn_intersections_current_area_geom` / `_asof_area_geom` contra geom conhecida →
  interseções esperadas; pct = % da área do raio.
- **Unit:** `createRadiusForActor` (cria RADIUS, pula CAR/farm, enfileira runner); ramo RADIUS do
  runner (fn correta por data); validação do DTO (faixa 1000–50000, `name` obrigatório, sem `carKey`).
- **e2e:** cria análise por raio → resultados persistidos + detail expõe `subjectType/radius`.

## 12. Ordem de implementação (fases)

1. **SQL** — `fn_intersections_current_area_geom` + `_asof_area_geom` (+ refactor DRY opcional).
2. **Migração Prisma** — colunas + enum `subject_type`, `car_key` nullable, backfill.
3. **API criação** — DTO + `createRadiusForActor` + `POST /v1/analyses/radius`.
4. **Runner** — ramo RADIUS (círculo + fns novas).
5. **Detail/serialização** — expõe `subjectType`/`radius`; cabeçalho por raio.
6. **PDF** — cabeçalho + legenda + círculo.
7. **Frontend** — pill + componentes de busca reaproveitados + mapa com círculo + submit.
8. **Testes** — unit + e2e.

Camadas independentes (SQL → migração → API/runner → serialização → PDF → frontend) permitem entrega
incremental; frontend pode ser mockado contra o endpoint antes do PDF.
