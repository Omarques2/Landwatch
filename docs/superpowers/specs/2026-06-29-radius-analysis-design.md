# Análise por Raio (sem CAR) — Design & Plano de Implementação

**Data:** 2026-06-29
**Status:** Draft — decisões fechadas, aguardando revisão final
**Autor:** Otávio Marques (+ Claude)

---

## 1. Problema

Hoje toda análise ambiental exige um `carKey`. A geometria-alvo é **sempre** o polígono SICAR
daquele CAR (ver `fn_intersections_current_area(p_cod_imovel)` em
[create_functions.sql:930](../../../apps/Versionamento/create_functions.sql#L930)). O fluxo não prevê
análise sobre geometria arbitrária.

Em muitos casos reais não há CAR confiável: fazenda sem registro, localização incerta, etc. Precisamos
gerar uma análise a partir de **um ponto + raio**, verificando os mesmos problemas ambientais que a
análise por CAR já verifica.

### Risco de fraude (motivador central)

Um raio pode cobrir **parcialmente** uma fazenda (CAR). Cenário de fraude: a coordenada cai numa
extremidade do imóvel, o raio engloba só a parte limpa do CAR, e o problema ambiental está na parte que
ficou **de fora** do raio. Uma análise só do círculo não pegaria isso.

**Mitigação:** localizar todos os CARs no raio. CARs **100% dentro** já são cobertos pelo círculo →
ignorados. CARs **parcialmente** dentro (têm porção fora do raio) entram na verificação de segurança: a
geometria-alvo passa a ser **raio ∪ CARs parciais**.

---

## 2. Decisões fechadas

| # | Tema | Decisão |
|---|------|---------|
| 1 | Geometria-alvo | **Merge** — `ST_Union(círculo, CARs parciais)`, um único passe de interseção. CARs parciais guardados em metadados p/ auditoria. |
| 2 | Apresentação dos hits | Ver **regra de reveal** (§5). Resumo: só renderiza o polígono de um CAR quando ele captura interseção **exclusivamente fora** do raio. |
| 3 | Modelagem | Nova coluna `subject_type = CAR \| RADIUS`, ortogonal a `analysis_kind`. `car_key` nullable. |
| 4 | Escopo de datasets | **STANDARD apenas** (DETER por raio fica para depois). |
| A | Montar subject + classificar CARs | **Em SQL** (`fn_radius_subject`). Menos round-trips, geom não trafega pela app. |
| B | Endpoint | **Separado:** `POST /v1/analyses/radius`. DTO/validação distintos. |
| C | Sliver | **Ignorar CAR parcial abaixo de limiar** de sobreposição (valor a definir — ver §7). |
| D | Faixa do raio | **1000–50000m**, usuário escolhe (reaproveita validação de `cars.createMapSearch`). |
| E | Data histórica | **Suportar `analysisDate` passado no v1** (variantes as-of das funções + `cars.nearby` as-of). |
| F | Documentos CPF/CNPJ | **Opcional**, mantém paridade (fluxo `CNPJ_REFRESH` já é standalone). |
| G | Vínculo com Farm | **Sem cadastro de Farm.** Só um **rótulo** (nome) na análise p/ o usuário reconhecê-la depois. `farmId` nulo, **não** cria registro em `/farms`. |
| H | Hit em vários CARs | **`source_car_keys[]`** lista todos os CARs parciais que o hit toca. |

---

## 3. Conceito

```
        coordenada (lat,lng) + raio (m) [+ analysisDate?]
                    │
        ┌───────────▼────────────┐
        │  círculo = buffer(pt)   │
        └───────────┬────────────┘
                    │  cars.nearby(lat,lng,raio[,date])
        ┌───────────▼────────────────────────────────┐
        │  classifica cada CAR no raio:               │
        │   • ST_Contains(círculo, car)        → IGNORA│
        │   • intersecta mas não contido + > limiar    │
        │                                      → PARCIAL│
        └───────────┬────────────────────────────────┘
                    │
        subject = ST_Union(círculo, [CARs parciais])
                    │
        ┌───────────▼───────────────────────────────────┐
        │  fn_intersections_current_area_geom(subject)    │  ← NOVA fn
        │  (+ variante _asof_ p/ data histórica)          │
        └───────────┬───────────────────────────────────┘
                    │
        1 analysisID + por hit:
          • within_radius : ST_Intersects(hit.geom, círculo)
          • source_car_keys[] : CARs parciais que o hit toca
```

**Uma única `analysisID`.** Não geramos N análises. CARs parciais = insumo de segurança.

---

## 4. Arquitetura

### 4.1 Camada SQL (Versionamento / schema `landwatch`)

Ponto crítico. `fn_intersections_current_area(p_cod_imovel text)`
([create_functions.sql:930](../../../apps/Versionamento/create_functions.sql#L930)) resolve a geom SICAR
internamente e roda o `UNION ALL` dos datasets contra ela. Extrair variante que recebe a geom pronta:

```sql
-- NOVAS
landwatch.fn_intersections_current_area_geom(p_subject geometry) RETURNS TABLE(...)
landwatch.fn_intersections_asof_area_geom(p_subject geometry, p_as_of_date date) RETURNS TABLE(...)
landwatch.fn_radius_subject(p_lat double precision, p_lng double precision,
                            p_radius_m int, p_as_of_date date DEFAULT NULL)
  -- retorna: subject geometry  +  TABLE de CARs parciais (feature_key, geom, overlap_m2)
```

- A 1ª metade da fn atual (linha "self" do SICAR) **não se aplica**; no lugar, linha sintética
  `category_code='RADIUS'` representando o círculo (render + área).
- `fn_intersections_current_area(p_cod_imovel)` pode ser **refatorada** p/ delegar à `_geom` (DRY).
- Classificação de "parcial" e construção do `ST_Union` ficam dentro de `fn_radius_subject`.

### 4.2 Camada de aplicação (`apps/api`)

- **Schema Prisma** (`analysis`):
  - `car_key TEXT` → **nullable**.
  - `subject_type` enum novo: `CAR | RADIUS` (default `CAR`).
  - `radius_center_lat`, `radius_center_lng` (decimal), `radius_m` (int) — só RADIUS.
  - `subject_geom_id BIGINT?` — geom-alvo (o union) em `lw_geom_store` p/ render/tiles.
  - `radius_partial_cars JSONB` — `[{carKey, geomId, overlapM2, contributedOutsideHit}]`.
  - **Rótulo:** reaproveitar `farm_name_snapshot` como nome da análise (sem FK de Farm; `farm_id` nulo).
  - `analysis_result`: `within_radius BOOLEAN`, `source_car_keys TEXT[]`.
- **DTO** `CreateRadiusAnalysisDto`: `lat`, `lng`, `radiusMeters` (1000–50000), `name` (obrigatório),
  `documents?`, `analysisDate?`. **Sem** `carKey`/`farmId`.
- **`AnalysesService.createRadiusForActor()`** — paralelo a `createWithActor()`. Pula `ensureCarExists`.
  Cria `analysis` `subject_type=RADIUS`, status `pending`, grava rótulo, enfileira no runner.
- **`AnalysisRunnerService`** — ramo RADIUS no `buildIntersectionsQuery`:
  1. `fn_radius_subject(...)` → subject + CARs parciais (as-of se houver data),
  2. `fn_intersections_(current|asof)_area_geom(subject)`,
  3. por hit: `within_radius = ST_Intersects(hit.geom, círculo)`; se fora, `source_car_keys` = CARs
     parciais que o hit toca,
  4. persiste resultados + `subject_geom_id` + `radius_partial_cars` (marca `contributedOutsideHit`).
- **Endpoint preview (form)** — `GET /v1/cars/partial-in-radius?lat&lng&radius[&date]` (ou reusar
  `cars.nearby` + classificar no servidor): retorna círculo + geoms dos CARs parciais p/ o mapa do
  formulário renderizar antes de submeter.

### 4.3 Apresentação (detail / tiles / PDF)

- **`/v1/analyses/:id`**: `subjectType`, `radius{lat,lng,m}`, nome; em `results`/`datasetGroups` expor
  `withinRadius` e `sourceCarKeys`.
- **vector-map / tiles**: renderizar **sempre** o círculo; interseções dentro do raio normais; e
  **condicionalmente** (regra §5) o polígono dos CARs que capturaram hit só-fora + suas interseções.
- **PDF**: mesma regra. Legenda ganha "Raio" e, quando houver, "CAR (verificação de segurança)".
  Cabeçalho troca "coordenadas/área do CAR" por centro + raio quando `subject_type=RADIUS`.

### 4.4 Frontend — formulário de criação (`NewAnalysisView.vue`)

`/analyses/new` e `/analyses/search` já são o **mesmo** `NewAnalysisView.vue` (card de CAR + card de
busca por ponto/raio). A busca por raio **já existe**: `center.lat/lng`, slider `searchRadiusKm`, botão
GPS, `searchCars`, mapa.

UX da análise por raio (sem textos técnicos — UI autoexplicativa):
- **Pill button "Análise de Raio"** no `/analyses/new`, default **off**.
- Ao ativar: **remove o campo CAR**; abaixo do campo de data, adiciona **lat, lng, botão de localização
  (GPS) e seletor de raio** — componentes reaproveitados do card de busca (`/analyses/search`).
- **Mapa** estilo `/analyses/search`: renderiza o **contorno do raio** e as **geometrias dos CARs que
  escapam do raio** (os parciais — via endpoint preview §4.2). Isso já comunica visualmente que a análise
  cobre raio + esses CARs (anti-fraude), sem precisar de texto.
- Submit chama `POST /v1/analyses/radius`.

---

## 5. Regra de reveal dos CARs (Q-H, refinada)

Sempre renderiza o **círculo do raio**. Para cada interseção (hit):

- `within_radius = ST_Intersects(hit.geom, círculo)`.
- **Hit dentro do raio** (`within_radius=true`) → não mostra CAR.
- **Hit que pega dentro E fora** (atravessa a borda → intersecta o círculo) → `within_radius=true` →
  não mostra CAR (o raio já evidencia o problema).
- **Hit exclusivamente fora do raio** (`within_radius=false`, só na porção externa de CAR(s) parcial(is))
  → **revela o(s) polígono(s) do(s) CAR(s)** em `source_car_keys` + renderiza a interseção.

Ou seja: um CAR parcial só aparece no mapa/PDF/detail quando é `source_car_key` de **pelo menos um hit
com `within_radius=false`**. CARs parciais sem hit externo permanecem só nos metadados.

---

## 6. Regras de classificação (defaults)

- **Círculo:** `ST_Buffer(ponto::geography, radius_m)::geometry` (buffer em metros), consistente com o
  `ST_DWithin` geográfico de `cars.nearby`.
- **CAR 100% dentro:** `ST_Contains(círculo, car_geom)` → ignora.
- **CAR parcial:** `ST_Intersects(círculo, car_geom) AND NOT ST_Contains(círculo, car_geom)` **e**
  sobreposição acima do limiar de sliver (§7 Q-C).
- **Hit fora do raio:** `geom` não intersecta o círculo → revela CAR(s) de origem.

---

## 7. Plano de implementação (fases)

1. **SQL (`landwatch`)** — `fn_intersections_current_area_geom`, `fn_intersections_asof_area_geom`,
   `fn_radius_subject` (current + as-of); (opcional) refatorar `fn_intersections_current_area` p/ delegar.
   Testar contra dados que reproduzem a fraude (problema só fora do raio).
2. **Migration Prisma** — colunas novas em `analysis` + `analysis_result`, enum `subject_type`,
   `car_key` nullable; backfill `subject_type='CAR'` no legado.
3. **API criação** — `CreateRadiusAnalysisDto` + `createRadiusForActor()` + `POST /v1/analyses/radius`.
4. **Preview endpoint** — `GET /v1/cars/partial-in-radius` p/ o mapa do formulário.
5. **Runner** — ramo RADIUS: subject, classificação, fns novas, flags `within_radius`/`source_car_keys`,
   persistência de metadados.
6. **Detail/serialization** — expor campos novos; ocultar CARs sem hit externo.
7. **Tiles/vector-map** — render do círculo + render condicional dos CARs (regra §5).
8. **PDF** — legenda + cabeçalho + render condicional.
9. **Frontend** — pill "Análise de Raio", reaproveitar componentes de busca, mapa com raio + CARs
   parciais, submit no endpoint novo.
10. **Testes** — unit (classificação, flags, regra de reveal) + e2e do cenário de fraude.

---

## 8. Questão ainda aberta

- **Q-C (limiar de sliver):** qual o corte para ignorar um CAR que "só encosta" no raio? Opções:
  área de sobreposição absoluta (ex.: `< 1000 m²`), **ou** % do CAR (ex.: `< 0,5%` da área do CAR),
  **ou** sem corte (qualquer interseção conta). *Recomendo % do CAR.* **Valor a definir.**

Demais pontos (Q-A,B,D,E,F,G,H) **fechados** na tabela §2.
