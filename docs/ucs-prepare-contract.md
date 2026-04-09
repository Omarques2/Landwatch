# Contrato de Dados - Prepare UCS (CARD-13.1)

Data de referencia: 2026-04-08

## 1) Objetivo

Definir o contrato oficial da etapa `prepare_ucs` (pre-ingest) para gerar um unico SHP de saida (`UNIDADES_CONSERVACAO.shp`) com:

- merge entre Federal e CNUC,
- enriquecimento de atributos via CNUC,
- sem duplicidade por codigo CNUC,
- com regras bloqueantes de qualidade antes do ingest.

Este documento cobre schema final, regras de normalizacao, regras de conflito e checklist QA com queries objetivas e thresholds.

## 2) Fontes de entrada (raw)

| Fonte | Caminho | Layer | Chave de origem | Observacao |
|---|---|---|---|---|
| Federal | `UCs-shps/copy_of_Limites_UCs_fed_112025/limites_UCs_fed_112025_a.shp` | `limites_UCs_fed_112025_a` | `Cnuc` | Fonte prioritaria de geometria na intersecao |
| CNUC | `UCs-shps/shp_cnuc_2025_08/cnuc_2025_08.shp` | `cnuc_2025_08` | `cd_cnuc` | Fonte canonica de `categoria`, `grupo`, `esfera` |

Nota: o campo correto do CNUC validado no SHP e `cd_cnuc` (nao `cd_cnunc`).

## 3) Normalizacao oficial da chave

Funcao canonica de chave:

```text
cnuc_code = UPPER(TRIM(raw_code))
```

Regras:

1. Aplicar em ambas as fontes (`Cnuc` e `cd_cnuc`).
2. Nao remover pontuacao interna do codigo (ex.: `0000.00.0125`).
3. `cnuc_code` vazio ou nulo apos normalizacao reprova o lote.
4. Duplicidade de `cnuc_code` apos normalizacao reprova o lote.

## 4) Regras de merge e prioridade

1. Base final sempre preserva 100% das linhas federais validas.
2. Federal e enriquecido com atributos do CNUC por `cnuc_code`.
3. CNUC complementar entra por anti-join dinamico (`cnuc_code` inexistente no Federal).
4. Se o codigo existir nas duas fontes, a geometria final e sempre a do Federal.
5. `categoria`, `grupo`, `esfera` no output vem do CNUC para linhas federais e complementares.
6. Campo `source` no output:
   - `FEDERAL` para linhas vindas do SHP federal,
   - `CNUC_COMPLEMENTAR` para linhas vindas do anti-join do CNUC.

## 5) Schema final do SHP preparado

Arquivo de saida fixo:

- `UNIDADES_CONSERVACAO.shp` (+ `.dbf`, `.shx`, `.prj`, `.cpg`)

Campos minimos obrigatorios:

| Campo | Tipo esperado | Nulo? | Origem/Regra |
|---|---|---|---|
| `cnuc_code` | String (ate 80) | Nao | Chave canonica (`UPPER(TRIM())`) |
| `nome_uc` | String (ate 254) | Nao | Federal `NomeUC` (quando `source=FEDERAL`), senao CNUC `nome_uc` |
| `categoria` | String (ate 80) | Nao | CNUC `categoria` |
| `grupo` | String (ate 80) | Nao | CNUC `grupo` |
| `esfera` | String (ate 80) | Nao | CNUC `esfera` |
| `source` | String (ate 20) | Nao | `FEDERAL` ou `CNUC_COMPLEMENTAR` |
| `geometry` | Polygon/MultiPolygon SRID 4674 | Nao | Prioridade geometrica Federal na intersecao |

## 6) Regras bloqueantes de qualidade

O preprocess deve falhar (nao seguir para ingest) se qualquer item abaixo ocorrer:

1. `cnuc_code` nulo/vazio.
2. `cnuc_code` duplicado no output.
3. `categoria` nula/vazia.
4. `nome_uc` nulo/vazio.
5. geometria nula.
6. `source` fora de `FEDERAL` / `CNUC_COMPLEMENTAR`.
7. Cobertura do CNUC sobre codigos federais abaixo de 99%:
   - `intersect_codes / fed_codes < 0.99`

## 7) Checklist QA com queries e thresholds

### 7.1 QA das fontes (raw)

Federal:

```bash
ogrinfo -ro "UCs-shps/copy_of_Limites_UCs_fed_112025/limites_UCs_fed_112025_a.shp" \
  -dialect SQLite \
  -sql "SELECT COUNT(*) AS total,
               SUM(CASE WHEN Cnuc IS NULL OR TRIM(Cnuc)='' THEN 1 ELSE 0 END) AS null_code,
               COUNT(DISTINCT UPPER(TRIM(Cnuc))) AS distinct_code
        FROM limites_UCs_fed_112025_a"
```

Thresholds:

- `null_code = 0` (bloqueante)
- `distinct_code = total` (bloqueante)

CNUC:

```bash
ogrinfo -ro "UCs-shps/shp_cnuc_2025_08/cnuc_2025_08.shp" \
  -dialect SQLite \
  -sql "SELECT COUNT(*) AS total,
               SUM(CASE WHEN cd_cnuc IS NULL OR TRIM(cd_cnuc)='' THEN 1 ELSE 0 END) AS null_code,
               COUNT(DISTINCT UPPER(TRIM(cd_cnuc))) AS distinct_code,
               SUM(CASE WHEN categoria IS NULL OR TRIM(categoria)='' THEN 1 ELSE 0 END) AS null_categoria,
               SUM(CASE WHEN Geometry IS NULL THEN 1 ELSE 0 END) AS null_geom
        FROM cnuc_2025_08"
```

Thresholds:

- `null_code = 0` (bloqueante)
- `distinct_code = total` (bloqueante)
- `null_categoria = 0` (bloqueante)
- `null_geom` pode existir no raw, mas deve ser removida antes do output

### 7.2 QA dinamico de intersecao/anti-join por codigo

```bash
ogr2ogr -f SQLite %TEMP%/ucs_contract_qc.sqlite "UCs-shps/copy_of_Limites_UCs_fed_112025/limites_UCs_fed_112025_a.shp" -nln fed
ogr2ogr -f SQLite -append %TEMP%/ucs_contract_qc.sqlite "UCs-shps/shp_cnuc_2025_08/cnuc_2025_08.shp" -nln cnuc
ogrinfo -ro %TEMP%/ucs_contract_qc.sqlite -dialect SQLite \
  -sql "WITH f AS (SELECT DISTINCT UPPER(TRIM(Cnuc)) AS code FROM fed WHERE Cnuc IS NOT NULL AND TRIM(Cnuc)<>''), \
              c AS (SELECT DISTINCT UPPER(TRIM(cd_cnuc)) AS code FROM cnuc WHERE cd_cnuc IS NOT NULL AND TRIM(cd_cnuc)<>'' ) \
        SELECT (SELECT COUNT(*) FROM f) AS fed_codes, \
               (SELECT COUNT(*) FROM c) AS cnuc_codes, \
               (SELECT COUNT(*) FROM f JOIN c USING (code)) AS intersect_codes, \
               (SELECT COUNT(*) FROM c LEFT JOIN f USING (code) WHERE f.code IS NULL) AS cnuc_complement_codes"
```

Thresholds:

- `intersect_codes <= fed_codes` (consistencia)
- `intersect_codes / fed_codes >= 0.99` (bloqueante)
- `cnuc_complement_codes = cnuc_codes - intersect_codes` (consistencia)

### 7.3 QA do arquivo preparado (`UNIDADES_CONSERVACAO.shp`)

```bash
ogrinfo -ro "work/.../UNIDADES_CONSERVACAO.shp" -dialect SQLite \
  -sql "SELECT COUNT(*) AS total,
               COUNT(DISTINCT UPPER(TRIM(cnuc_code))) AS distinct_code,
               SUM(CASE WHEN cnuc_code IS NULL OR TRIM(cnuc_code)='' THEN 1 ELSE 0 END) AS null_code,
               SUM(CASE WHEN nome_uc IS NULL OR TRIM(nome_uc)='' THEN 1 ELSE 0 END) AS null_nome,
               SUM(CASE WHEN categoria IS NULL OR TRIM(categoria)='' THEN 1 ELSE 0 END) AS null_categoria,
               SUM(CASE WHEN grupo IS NULL OR TRIM(grupo)='' THEN 1 ELSE 0 END) AS null_grupo,
               SUM(CASE WHEN esfera IS NULL OR TRIM(esfera)='' THEN 1 ELSE 0 END) AS null_esfera,
               SUM(CASE WHEN source NOT IN ('FEDERAL','CNUC_COMPLEMENTAR') OR source IS NULL THEN 1 ELSE 0 END) AS invalid_source,
               SUM(CASE WHEN Geometry IS NULL THEN 1 ELSE 0 END) AS null_geom
        FROM UNIDADES_CONSERVACAO"
```

Thresholds (todos bloqueantes):

- `total = distinct_code`
- `null_code = 0`
- `null_nome = 0`
- `null_categoria = 0`
- `null_grupo = 0`
- `null_esfera = 0`
- `invalid_source = 0`
- `null_geom = 0`

QA de composicao dinamica por origem:

```bash
ogrinfo -ro "work/.../UNIDADES_CONSERVACAO.shp" -dialect SQLite \
  -sql "SELECT source, COUNT(*) AS n FROM UNIDADES_CONSERVACAO GROUP BY source ORDER BY source"
```

Thresholds:

- `FEDERAL = fed_codes_validos`
- `CNUC_COMPLEMENTAR = cnuc_complement_codes_validos`
- `output_total = FEDERAL + CNUC_COMPLEMENTAR`

### 7.4 QA geometrico da intersecao (diagnostico)

Objetivo: detectar divergencia abrupta de geometria entre fontes para mesmo codigo.

Consulta recomendada (PostGIS em ambiente de teste):

```sql
WITH fed AS (
  SELECT UPPER(TRIM(cnuc)) AS code, geom
  FROM public.tmp_ucs_fed
  WHERE cnuc IS NOT NULL AND TRIM(cnuc) <> ''
),
cnuc AS (
  SELECT UPPER(TRIM(cd_cnuc)) AS code, geom
  FROM public.tmp_ucs_cnuc
  WHERE cd_cnuc IS NOT NULL AND TRIM(cd_cnuc) <> ''
),
joined AS (
  SELECT f.code, f.geom AS fed_geom, c.geom AS cnuc_geom
  FROM fed f
  JOIN cnuc c USING (code)
)
SELECT
  COUNT(*) AS compared,
  ROUND(AVG(ST_Area(ST_Intersection(fed_geom, cnuc_geom)::geography)
       / NULLIF(ST_Area(ST_Union(fed_geom, cnuc_geom)::geography), 0))::numeric, 8) AS avg_iou,
  ROUND(MIN(ST_Area(ST_Intersection(fed_geom, cnuc_geom)::geography)
       / NULLIF(ST_Area(ST_Union(fed_geom, cnuc_geom)::geography), 0))::numeric, 8) AS min_iou
FROM joined;
```

Thresholds:

- `avg_iou >= 0.99` (alerta forte se cair abaixo, revisar fonte antes de publicar)
- `min_iou >= 0.85` (alerta se cair abaixo, revisar outliers por codigo)

## 8) Baseline validado em 2026-04-08

Resultados medidos no repositorio e banco de teste:

| Metrica | Valor |
|---|---|
| Federal (codigos distintos) | 344 |
| CNUC (codigos distintos) | 3122 |
| Intersecao por codigo | 344 |
| CNUC complementar por codigo | 2778 |
| CNUC com geometria nula no raw | 1 (`0000.00.2234`) |
| `avg_iou` (intersecao Federal x CNUC) | 0.99880641 |
| `min_iou` (intersecao Federal x CNUC) | 0.90172576 |

## 9) Relacao com aceite do CARD-13.1

Este documento atende os dois criterios de aceite do card:

1. Contrato publicado no repositorio com campos, tipos, regras e exemplos.
2. Checklist de validacao de qualidade definido com queries objetivas e thresholds.
