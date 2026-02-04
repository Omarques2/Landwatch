# LandWatch DB - Estrutura e Consultas de Analise

Data de referencia: 2026-02-01

Este arquivo descreve a estrutura basica do schema `landwatch` e traz exemplos de SELECT
para analise **na data atual** (feicoes ativas hoje) e **em uma data especifica**
(usando historico valido naquela data).

## 1) Estrutura do DB (resumo)

- `lw_category`
  - Lista categorias (ex.: SICAR, PRODES, EMBARGOS)

- `lw_dataset`
  - Lista datasets dentro de categorias (ex.: CAR_MT, PRODES_LEGAL_AMZ_2020)
  - `natural_id_col` define o ID natural quando for SHP (ex.: `cod_imovel` no SICAR)

- `lw_dataset_version`
  - Versoes carregadas por dataset e snapshot

- `lw_feature`
  - Chave logica por dataset (`feature_key`) + `feature_id`

- `lw_feature_state`
  - Estado atual da feicao (presente/ausente), com hashes

- `lw_geom_store`
  - Geometrias deduplicadas por hash

- `lw_feature_geom_hist`
  - Historico de geometria por feicao (valid_from / valid_to)

- `lw_attr_pack` e `lw_feature_attr_pack_hist`
  - Atributos em JSONB com historico (valid_from / valid_to)

- `lw_doc_index`
  - Indice de CPF/CNPJ (doc_normalized) com historico

## 2) Analise por cod_imovel (SICAR)

### 2.1 Feicao SICAR atual (hoje)

```sql
SELECT * FROM landwatch.fn_sicar_feature_current(:cod_imovel);
```

### 2.2 Interseccoes atuais (hoje) - retorno simples (1a linha = SICAR)

```sql
SELECT * FROM landwatch.fn_intersections_current_simple(:cod_imovel);
```

### 2.2.1 Interseccoes atuais (hoje) com ST_Area e % sobreposicao (todas categorias, exceto SICAR/DETER)

```sql
SELECT * FROM landwatch.fn_intersections_current_area(:cod_imovel);
```

### 2.3 Feicao SICAR em uma data especifica

```sql
SELECT * FROM landwatch.fn_sicar_feature_asof(:cod_imovel, :as_of_date);
```

### 2.4 Interseccoes em uma data especifica - retorno simples (1a linha = SICAR)

```sql
SELECT * FROM landwatch.fn_intersections_asof_simple(:cod_imovel, :as_of_date);
```

### 2.4.1 Interseccoes em data especifica com ST_Area e % sobreposicao (todas categorias, exceto SICAR/DETER)

```sql
SELECT * FROM landwatch.fn_intersections_asof_area(:cod_imovel, :as_of_date);
```

## 3) Analise por CPF/CNPJ

### 3.1 Verificar se existe CPF/CNPJ hoje

```sql
SELECT * FROM landwatch.fn_doc_current(:doc);
```

### 3.2 Verificar CPF/CNPJ em data especifica

```sql
SELECT * FROM landwatch.fn_doc_asof(:doc, :as_of_date);
```

## 4) Observacoes praticas

- `feature_key` vem do `natural_id_col` do dataset (ex.: `cod_imovel` no SICAR).
- Para datasets SICAR, ha varios datasets por estado (CAR_MT, CAR_GO, etc). As queries acima varrem todos os datasets da categoria.
- Para analises historicas, use sempre `valid_from/valid_to` em `lw_feature_geom_hist` e `lw_doc_index`.
- Para evitar falso positivo em interseccoes, considere `ST_Intersects(ST_Buffer(s.sicar_geom, 0), g.geom)` quando ha geometria invalida.

## 5) Funcoes (com parametros)

### 5.1 Feicao SICAR hoje

```sql
CREATE OR REPLACE FUNCTION landwatch.fn_sicar_feature_current(p_cod_imovel text)
RETURNS TABLE (
  dataset_id bigint,
  feature_id bigint,
  feature_key text,
  geom geometry
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    f.dataset_id,
    f.feature_id,
    f.feature_key,
    g.geom
  FROM landwatch.lw_feature f
  JOIN landwatch.lw_dataset d ON d.dataset_id = f.dataset_id
  JOIN landwatch.lw_category c ON c.category_id = d.category_id
  JOIN landwatch.lw_feature_geom_hist h
    ON h.dataset_id = f.dataset_id
   AND h.feature_id = f.feature_id
   AND h.valid_to IS NULL
  JOIN landwatch.lw_geom_store g ON g.geom_id = h.geom_id
  WHERE c.code = 'SICAR'
    AND f.feature_key = p_cod_imovel;
$$;
```

### 5.2 Feicao SICAR em uma data especifica

```sql
CREATE OR REPLACE FUNCTION landwatch.fn_sicar_feature_asof(p_cod_imovel text, p_as_of_date date)
RETURNS TABLE (
  dataset_id bigint,
  feature_id bigint,
  feature_key text,
  geom geometry
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    f.dataset_id,
    f.feature_id,
    f.feature_key,
    g.geom
  FROM landwatch.lw_feature f
  JOIN landwatch.lw_dataset d ON d.dataset_id = f.dataset_id
  JOIN landwatch.lw_category c ON c.category_id = d.category_id
  JOIN landwatch.lw_feature_geom_hist h
    ON h.dataset_id = f.dataset_id
   AND h.feature_id = f.feature_id
   AND h.valid_from <= p_as_of_date
   AND (h.valid_to IS NULL OR h.valid_to > p_as_of_date)
  JOIN landwatch.lw_geom_store g ON g.geom_id = h.geom_id
  WHERE c.code = 'SICAR'
    AND f.feature_key = p_cod_imovel;
$$;
```

### 5.3 Interseccoes atuais - retorno simples

```sql
CREATE OR REPLACE FUNCTION landwatch.fn_intersections_current_simple(p_cod_imovel text)
RETURNS TABLE (
  category_code text,
  dataset_code text,
  snapshot_date date,
  feature_id bigint,
  geom geometry
)
LANGUAGE sql
STABLE
AS $$
  WITH sicar_feature AS (
    SELECT
      f.dataset_id,
      f.feature_id,
      g.geom AS sicar_geom
    FROM landwatch.lw_feature f
    JOIN landwatch.lw_dataset d ON d.dataset_id = f.dataset_id
    JOIN landwatch.lw_category c ON c.category_id = d.category_id
    JOIN landwatch.lw_feature_geom_hist h
      ON h.dataset_id = f.dataset_id
     AND h.feature_id = f.feature_id
     AND h.valid_to IS NULL
    JOIN landwatch.lw_geom_store g ON g.geom_id = h.geom_id
    WHERE c.code = 'SICAR'
      AND f.feature_key = p_cod_imovel
  )
  SELECT
    'SICAR' AS category_code,
    d.code AS dataset_code,
    NULL::date AS snapshot_date,
    f.feature_id,
    s.sicar_geom AS geom
  FROM sicar_feature s
  JOIN landwatch.lw_feature f
    ON f.dataset_id = s.dataset_id
   AND f.feature_id = s.feature_id
  JOIN landwatch.lw_dataset d ON d.dataset_id = f.dataset_id

  UNION ALL

  SELECT
    c.code AS category_code,
    d.code AS dataset_code,
    v.snapshot_date AS snapshot_date,
    f.feature_id,
    g.geom AS geom
  FROM sicar_feature s
  JOIN landwatch.lw_feature_geom_hist h
    ON h.valid_to IS NULL
  JOIN landwatch.lw_geom_store g ON g.geom_id = h.geom_id
  JOIN landwatch.lw_feature f
    ON f.dataset_id = h.dataset_id
   AND f.feature_id = h.feature_id
  JOIN landwatch.lw_dataset d ON d.dataset_id = f.dataset_id
  JOIN landwatch.lw_category c ON c.category_id = d.category_id
  JOIN landwatch.lw_dataset_version v ON v.version_id = h.version_id
  WHERE c.code NOT IN ('SICAR', 'DETER')
    AND g.geom && s.sicar_geom
    AND ST_Intersects(s.sicar_geom, g.geom)
  ORDER BY dataset_code, feature_id;
$$;
```

### 5.4 Interseccoes em data especifica - retorno simples

```sql
CREATE OR REPLACE FUNCTION landwatch.fn_intersections_asof_simple(p_cod_imovel text, p_as_of_date date)
RETURNS TABLE (
  category_code text,
  dataset_code text,
  snapshot_date date,
  feature_id bigint,
  geom geometry
)
LANGUAGE sql
STABLE
AS $$
  WITH sicar_feature AS (
    SELECT
      f.dataset_id,
      f.feature_id,
      g.geom AS sicar_geom
    FROM landwatch.lw_feature f
    JOIN landwatch.lw_dataset d ON d.dataset_id = f.dataset_id
    JOIN landwatch.lw_category c ON c.category_id = d.category_id
    JOIN landwatch.lw_feature_geom_hist h
      ON h.dataset_id = f.dataset_id
     AND h.feature_id = f.feature_id
     AND h.valid_from <= p_as_of_date
     AND (h.valid_to IS NULL OR h.valid_to > p_as_of_date)
    JOIN landwatch.lw_geom_store g ON g.geom_id = h.geom_id
    WHERE c.code = 'SICAR'
      AND f.feature_key = p_cod_imovel
  )
  SELECT
    'SICAR' AS category_code,
    d.code AS dataset_code,
    NULL::date AS snapshot_date,
    f.feature_id,
    s.sicar_geom AS geom
  FROM sicar_feature s
  JOIN landwatch.lw_feature f
    ON f.dataset_id = s.dataset_id
   AND f.feature_id = s.feature_id
  JOIN landwatch.lw_dataset d ON d.dataset_id = f.dataset_id

  UNION ALL

  SELECT
    c.code AS category_code,
    d.code AS dataset_code,
    v.snapshot_date AS snapshot_date,
    f.feature_id,
    g.geom AS geom
  FROM sicar_feature s
  JOIN landwatch.lw_feature_geom_hist h
    ON h.valid_from <= p_as_of_date
   AND (h.valid_to IS NULL OR h.valid_to > p_as_of_date)
  JOIN landwatch.lw_geom_store g ON g.geom_id = h.geom_id
  JOIN landwatch.lw_feature f
    ON f.dataset_id = h.dataset_id
   AND f.feature_id = h.feature_id
  JOIN landwatch.lw_dataset d ON d.dataset_id = f.dataset_id
  JOIN landwatch.lw_category c ON c.category_id = d.category_id
  JOIN landwatch.lw_dataset_version v ON v.version_id = h.version_id
  WHERE c.code NOT IN ('SICAR', 'DETER')
    AND g.geom && s.sicar_geom
    AND ST_Intersects(s.sicar_geom, g.geom)
  ORDER BY dataset_code, feature_id;
$$;
```

### 5.5 Interseccoes atuais - com ST_Area e % sobreposicao

```sql
CREATE OR REPLACE FUNCTION landwatch.fn_intersections_current_area(p_cod_imovel text)
RETURNS TABLE (
  category_code text,
  dataset_code text,
  snapshot_date date,
  feature_id bigint,
  geom geometry,
  sicar_area_m2 numeric,
  feature_area_m2 numeric,
  overlap_area_m2 numeric,
  overlap_pct_of_sicar numeric
)
LANGUAGE sql
STABLE
AS $$
  WITH sicar_feature AS (
    SELECT
      f.dataset_id,
      f.feature_id,
      g.geom AS sicar_geom
    FROM landwatch.lw_feature f
    JOIN landwatch.lw_dataset d ON d.dataset_id = f.dataset_id
    JOIN landwatch.lw_category c ON c.category_id = d.category_id
    JOIN landwatch.lw_feature_geom_hist h
      ON h.dataset_id = f.dataset_id
     AND h.feature_id = f.feature_id
     AND h.valid_to IS NULL
    JOIN landwatch.lw_geom_store g ON g.geom_id = h.geom_id
    WHERE c.code = 'SICAR'
      AND f.feature_key = p_cod_imovel
  )
  SELECT
    'SICAR' AS category_code,
    d.code AS dataset_code,
    NULL::date AS snapshot_date,
    f.feature_id,
    s.sicar_geom AS geom,
    ST_Area(s.sicar_geom::geography) AS sicar_area_m2,
    NULL::numeric AS feature_area_m2,
    NULL::numeric AS overlap_area_m2,
    NULL::numeric AS overlap_pct_of_sicar
  FROM sicar_feature s
  JOIN landwatch.lw_feature f
    ON f.dataset_id = s.dataset_id
   AND f.feature_id = s.feature_id
  JOIN landwatch.lw_dataset d ON d.dataset_id = f.dataset_id

  UNION ALL

  SELECT
    c.code AS category_code,
    d.code AS dataset_code,
    v.snapshot_date AS snapshot_date,
    f.feature_id,
    g.geom AS geom,
    ST_Area(s.sicar_geom::geography) AS sicar_area_m2,
    ST_Area(g.geom::geography) AS feature_area_m2,
    ST_Area(ST_Intersection(s.sicar_geom, g.geom)::geography) AS overlap_area_m2,
    CASE
      WHEN ST_Area(s.sicar_geom::geography) = 0 THEN 0
      ELSE ST_Area(ST_Intersection(s.sicar_geom, g.geom)::geography)
           / ST_Area(s.sicar_geom::geography) * 100
    END AS overlap_pct_of_sicar
  FROM sicar_feature s
  JOIN landwatch.lw_feature_geom_hist h
    ON h.valid_to IS NULL
  JOIN landwatch.lw_geom_store g ON g.geom_id = h.geom_id
  JOIN landwatch.lw_feature f
    ON f.dataset_id = h.dataset_id
   AND f.feature_id = h.feature_id
  JOIN landwatch.lw_dataset d ON d.dataset_id = f.dataset_id
  JOIN landwatch.lw_category c ON c.category_id = d.category_id
  JOIN landwatch.lw_dataset_version v ON v.version_id = h.version_id
  WHERE c.code NOT IN ('SICAR', 'DETER')
    AND g.geom && s.sicar_geom
    AND ST_Intersects(s.sicar_geom, g.geom)
  ORDER BY dataset_code, feature_id;
$$;
```

### 5.6 Interseccoes em data especifica - com ST_Area e % sobreposicao

```sql
CREATE OR REPLACE FUNCTION landwatch.fn_intersections_asof_area(p_cod_imovel text, p_as_of_date date)
RETURNS TABLE (
  category_code text,
  dataset_code text,
  snapshot_date date,
  feature_id bigint,
  geom geometry,
  sicar_area_m2 numeric,
  feature_area_m2 numeric,
  overlap_area_m2 numeric,
  overlap_pct_of_sicar numeric
)
LANGUAGE sql
STABLE
AS $$
  WITH sicar_feature AS (
    SELECT
      f.dataset_id,
      f.feature_id,
      g.geom AS sicar_geom
    FROM landwatch.lw_feature f
    JOIN landwatch.lw_dataset d ON d.dataset_id = f.dataset_id
    JOIN landwatch.lw_category c ON c.category_id = d.category_id
    JOIN landwatch.lw_feature_geom_hist h
      ON h.dataset_id = f.dataset_id
     AND h.feature_id = f.feature_id
     AND h.valid_from <= p_as_of_date
     AND (h.valid_to IS NULL OR h.valid_to > p_as_of_date)
    JOIN landwatch.lw_geom_store g ON g.geom_id = h.geom_id
    WHERE c.code = 'SICAR'
      AND f.feature_key = p_cod_imovel
  )
  SELECT
    'SICAR' AS category_code,
    d.code AS dataset_code,
    NULL::date AS snapshot_date,
    f.feature_id,
    s.sicar_geom AS geom,
    ST_Area(s.sicar_geom::geography) AS sicar_area_m2,
    NULL::numeric AS feature_area_m2,
    NULL::numeric AS overlap_area_m2,
    NULL::numeric AS overlap_pct_of_sicar
  FROM sicar_feature s
  JOIN landwatch.lw_feature f
    ON f.dataset_id = s.dataset_id
   AND f.feature_id = s.feature_id
  JOIN landwatch.lw_dataset d ON d.dataset_id = f.dataset_id

  UNION ALL

  SELECT
    c.code AS category_code,
    d.code AS dataset_code,
    v.snapshot_date AS snapshot_date,
    f.feature_id,
    g.geom AS geom,
    ST_Area(s.sicar_geom::geography) AS sicar_area_m2,
    ST_Area(g.geom::geography) AS feature_area_m2,
    ST_Area(ST_Intersection(s.sicar_geom, g.geom)::geography) AS overlap_area_m2,
    CASE
      WHEN ST_Area(s.sicar_geom::geography) = 0 THEN 0
      ELSE ST_Area(ST_Intersection(s.sicar_geom, g.geom)::geography)
           / ST_Area(s.sicar_geom::geography) * 100
    END AS overlap_pct_of_sicar
  FROM sicar_feature s
  JOIN landwatch.lw_feature_geom_hist h
    ON h.valid_from <= p_as_of_date
   AND (h.valid_to IS NULL OR h.valid_to > p_as_of_date)
  JOIN landwatch.lw_geom_store g ON g.geom_id = h.geom_id
  JOIN landwatch.lw_feature f
    ON f.dataset_id = h.dataset_id
   AND f.feature_id = h.feature_id
  JOIN landwatch.lw_dataset d ON d.dataset_id = f.dataset_id
  JOIN landwatch.lw_category c ON c.category_id = d.category_id
  JOIN landwatch.lw_dataset_version v ON v.version_id = h.version_id
  WHERE c.code NOT IN ('SICAR', 'DETER')
    AND g.geom && s.sicar_geom
    AND ST_Intersects(s.sicar_geom, g.geom)
  ORDER BY dataset_code, feature_id;
$$;
```

### 5.7 Verificar CPF/CNPJ hoje

```sql
CREATE OR REPLACE FUNCTION landwatch.fn_doc_current(p_doc text)
RETURNS TABLE (
  dataset_code text,
  feature_id bigint,
  doc_normalized text
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    d.code AS dataset_code,
    di.feature_id,
    di.doc_normalized
  FROM landwatch.lw_doc_index di
  JOIN landwatch.lw_dataset d ON d.dataset_id = di.dataset_id
  WHERE di.doc_normalized = p_doc
    AND di.valid_to IS NULL
    AND di.date_closed IS NULL
  ORDER BY d.code;
$$;
```

### 5.8 Verificar CPF/CNPJ em data especifica

```sql
CREATE OR REPLACE FUNCTION landwatch.fn_doc_asof(p_doc text, p_as_of_date date)
RETURNS TABLE (
  dataset_code text,
  feature_id bigint,
  doc_normalized text
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    d.code AS dataset_code,
    di.feature_id,
    di.doc_normalized
  FROM landwatch.lw_doc_index di
  JOIN landwatch.lw_dataset d ON d.dataset_id = di.dataset_id
  WHERE di.doc_normalized = p_doc
    AND di.valid_from <= p_as_of_date
    AND (di.valid_to IS NULL OR di.valid_to > p_as_of_date)
    AND (di.date_closed IS NULL OR di.date_closed > p_as_of_date)
  ORDER BY d.code;
$$;
```

