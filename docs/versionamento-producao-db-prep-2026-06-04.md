# Preparacao do BD producao para update de versionamento

Data da auditoria: 2026-06-04  
Escopo: somente schema `landwatch`.

## Diagnostico validado

- `landwatch_staging`: ja esta no modelo novo.
- `landwatch` producao: ainda esta no modelo antigo.
- Consultas executadas em transacao read-only (`transaction_read_only=on`).
- PostgreSQL em ambos: `17.9`.
- Testes locais de versionamento: `26 passed`.

### Staging

- `mv_feature_geom_active`: tabela (`relkind = r`)
- `mv_feature_geom_tile_active`: tabela (`relkind = r`)
- `mv_feature_active_attrs_light`: tabela (`relkind = r`)
- `mv_feature_tooltip_active`: tabela (`relkind = r`)
- `mv_sicar_meta_active`: tabela (`relkind = r`)
- `lw_feature_delta`: existe
- `lw_feature_delta_run`: existe
- `lw_feature_state.attr_compare_hash`: existe
- `lw_feature_state.tooltip_hash`: existe
- Funcoes novas existem:
  - `refresh_feature_geom_active_cache`
  - `refresh_feature_geom_tile_cache`
  - `refresh_feature_active_attrs_light_cache`
  - `refresh_feature_tooltip_active_cache`
  - `refresh_sicar_meta_cache`
  - `refresh_feature_caches_delta`
  - `attr_compare_json`
  - `tooltip_identity_json`

### Producao

- Os 5 caches ainda sao materialized views (`relkind = m`).
- Faltam:
  - `lw_feature_delta`
  - `lw_feature_delta_run`
  - `lw_feature_state.attr_compare_hash`
  - `lw_feature_state.tooltip_hash`
  - funcoes de refresh incremental/cache
- Preflight prod:
  - sem objetos `_old` ou `_cache` conflitantes
  - sem `REFRESH MATERIALIZED VIEW` em execucao
  - sem locks pendentes em `landwatch.*`

Tamanhos relevantes em prod:

| objeto | tamanho | linhas estimadas |
|---|---:|---:|
| `lw_feature_state` | 3210 MB | 14.9M |
| `mv_feature_geom_tile_active` | 9891 MB | 4.9M |
| `mv_feature_geom_active` | 4018 MB | 4.9M |
| `mv_feature_active_attrs_light` | 955 MB | 4.9M |
| `mv_feature_tooltip_active` | 359 MB | 4.9M |
| `mv_sicar_meta_active` | 902 MB | 1.9M |

## Regra critica

Nao rode `apps/Versionamento/schema.sql` em producao. Ele contem `DROP SCHEMA landwatch CASCADE`.

Nao use `create_functions.sql` como migration principal. Para prod existente, use os scripts `*_apply.sql` abaixo.

## Ordem obrigatoria

Rodar em janela de manutencao, sem job de versionamento ativo.

Usar `apps/Versionamento/.env.prod`, nao `apps/Versionamento/.env`.

```bash
set -euo pipefail
set -a
. apps/Versionamento/.env.prod
set +a
```

### 1) Backup/checkpoint antes de DDL

Obrigatorio antes de qualquer apply:

- confirmar backup automatico Azure recente;
- gerar dump de schema;
- se possivel, snapshot/backup manual do servidor ou banco.

Exemplo:

```bash
pg_dump "$DATABASE_URL" \
  --schema=landwatch \
  --schema-only \
  --no-owner \
  --no-privileges \
  > "landwatch-prod-schema-before-$(date +%Y%m%d-%H%M%S).sql"
```

### 2) Precheck prod

```sql
SELECT c.relname, c.relkind
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'landwatch'
  AND c.relname IN (
    'mv_feature_geom_tile_active',
    'mv_sicar_meta_active',
    'mv_feature_geom_active',
    'mv_feature_active_attrs_light',
    'mv_feature_tooltip_active'
  )
ORDER BY c.relname;
```

Esperado antes da migration: todos `relkind = m`.

```sql
SELECT c.relname, c.relkind
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'landwatch'
  AND c.relname IN (
    'mv_feature_geom_tile_active_old',
    'mv_sicar_meta_active_old',
    'mv_feature_geom_active_old',
    'mv_feature_active_attrs_light_geom_active_old',
    'mv_feature_tooltip_active_geom_active_old',
    'mv_feature_active_attrs_light_old',
    'mv_feature_tooltip_active_old',
    'mv_feature_geom_tile_active_cache',
    'mv_sicar_meta_active_cache',
    'mv_feature_geom_active_cache',
    'mv_feature_active_attrs_light_cache',
    'mv_feature_tooltip_active_cache'
  );
```

Esperado antes da migration: zero linhas.

```sql
SELECT pid, state, now() - query_start AS age, query
FROM pg_stat_activity
WHERE pid <> pg_backend_pid()
  AND query ILIKE '%REFRESH MATERIALIZED VIEW%'
  AND query ILIKE '%landwatch%';
```

Esperado: zero linhas.

### 3) Aplicar migrations

Ordem validada contra staging e precondicoes dos scripts:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/Versionamento/sql/mv_feature_geom_tile_cache_apply.sql

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/Versionamento/sql/mv_sicar_meta_cache_apply.sql

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/Versionamento/sql/mv_feature_geom_active_cache_apply.sql

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/Versionamento/sql/mv_feature_attrs_tooltip_cache_apply.sql

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/Versionamento/sql/feature_semantic_delta_apply.sql
```

Observacoes:

- `mv_feature_geom_tile_cache_apply.sql` deve rodar antes de `mv_feature_geom_active_cache_apply.sql`.
- `mv_feature_geom_active_cache_apply.sql` exige `mv_feature_geom_tile_active` ja como tabela.
- `mv_feature_attrs_tooltip_cache_apply.sql` exige `mv_feature_geom_active` ja como tabela.
- `feature_semantic_delta_apply.sql` adiciona colunas, tabelas delta, funcoes semanticas e backfill em `lw_feature_state`.

### 4) Analyze/vacuum pos-migration

Depois do `feature_semantic_delta_apply.sql`:

```sql
ANALYZE landwatch.lw_feature_state;
ANALYZE landwatch.lw_feature_delta;
ANALYZE landwatch.lw_feature_delta_run;
ANALYZE landwatch.mv_feature_geom_active;
ANALYZE landwatch.mv_feature_geom_tile_active;
ANALYZE landwatch.mv_feature_active_attrs_light;
ANALYZE landwatch.mv_feature_tooltip_active;
ANALYZE landwatch.mv_sicar_meta_active;
```

Depois da janela, considerar:

```sql
VACUUM (ANALYZE) landwatch.lw_feature_state;
```

Nao rodar `VACUUM FULL` sem nova janela dedicada.

### 5) Validacao estrutural obrigatoria

```sql
SELECT c.relname, c.relkind
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'landwatch'
  AND c.relname IN (
    'mv_feature_geom_active',
    'mv_feature_geom_tile_active',
    'mv_feature_active_attrs_light',
    'mv_feature_tooltip_active',
    'mv_sicar_meta_active'
  )
ORDER BY c.relname;
```

Esperado pos-migration: todos `relkind = r`.

```sql
WITH objects(kind, name) AS (VALUES
  ('table', 'lw_feature_delta'),
  ('table', 'lw_feature_delta_run'),
  ('column', 'lw_feature_state.attr_compare_hash'),
  ('column', 'lw_feature_state.tooltip_hash'),
  ('function', 'refresh_feature_geom_active_cache'),
  ('function', 'refresh_feature_geom_tile_cache'),
  ('function', 'refresh_feature_active_attrs_light_cache'),
  ('function', 'refresh_feature_tooltip_active_cache'),
  ('function', 'refresh_sicar_meta_cache'),
  ('function', 'refresh_feature_caches_delta'),
  ('function', 'attr_compare_json'),
  ('function', 'tooltip_identity_json')
)
SELECT o.kind, o.name,
  CASE
    WHEN o.kind = 'table' THEN EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'landwatch'
        AND table_name = o.name
        AND table_type = 'BASE TABLE'
    )
    WHEN o.kind = 'column' THEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'landwatch'
        AND table_name = split_part(o.name, '.', 1)
        AND column_name = split_part(o.name, '.', 2)
    )
    WHEN o.kind = 'function' THEN EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'landwatch'
        AND p.proname = o.name
    )
    ELSE FALSE
  END AS exists
FROM objects o
ORDER BY o.kind, o.name;
```

Esperado: todas linhas com `exists = true`.

### 6) Validacao SQL pesada

Rodar fora do horario de pico. Pode demorar por causa de tabelas com milhoes de linhas.

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/Versionamento/sql/mv_feature_geom_tile_active_validation.sql

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/Versionamento/sql/mv_feature_geom_active_validation.sql

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/Versionamento/sql/mv_feature_attrs_tooltip_cache_validation.sql

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/Versionamento/sql/mv_sicar_meta_cache_validation.sql

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/Versionamento/sql/feature_semantic_delta_validation.sql
```

Na auditoria read-only, `mv_feature_geom_tile_active_validation.sql` e `mv_feature_geom_active_validation.sql` passaram de 180s em staging e foram interrompidos. Portanto, em prod use janela propria ou `statement_timeout` alto.

### 7) Deploy do codigo

Somente depois da validacao estrutural:

- commitar/deployar alteracoes de versionamento;
- usar `apps/Versionamento/.env.prod` no job de prod;
- nao iniciar job novo antes de validar funcoes/colunas acima.

Motivo: o novo `ingest.sql` escreve em:

- `lw_feature_state.attr_compare_hash`
- `lw_feature_state.tooltip_hash`
- `lw_feature_delta`
- `lw_feature_delta_run`

Sem migration, o job novo falha.

### 8) Smoke test pos-deploy

Rodar uma categoria pequena primeiro:

```bash
sudo docker build -f apps/Versionamento/Dockerfile -t landwatch-versionamento:prod .

sudo rm -rf /tmp/landwatch-versionamento-work
mkdir -p /tmp/landwatch-versionamento-work

sudo docker run --rm \
  --env-file apps/Versionamento/.env.prod \
  -e TMPDIR=/work \
  -v /tmp/landwatch-versionamento-work:/work \
  landwatch-versionamento:prod \
  python jobs/run_job.py --category URL
```

Validar logs:

- sem erro de coluna ausente;
- sem erro de funcao ausente;
- cache refresh usando `refresh_feature_caches_delta` quando houver `version_ids`;
- PMTiles publicados sem abortar todos por falha isolada.

Depois rodar full job.

## Rollback

Se falhar antes do commit interno de algum script, o proprio script aborta.

Se falhar apos algum swap:

1. parar job/API que use `landwatch`;
2. usar rollback na ordem inversa dos scripts aplicados;
3. validar `relkind = m` nos objetos restaurados.

Scripts disponiveis:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/Versionamento/sql/feature_semantic_delta_rollback.sql

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/Versionamento/sql/mv_feature_attrs_tooltip_cache_rollback.sql

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/Versionamento/sql/mv_feature_geom_active_cache_rollback.sql

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/Versionamento/sql/mv_sicar_meta_cache_rollback.sql

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/Versionamento/sql/mv_feature_geom_tile_cache_rollback.sql
```

Nao remover objetos `_old` ate concluir validacao e pelo menos um job de prod com sucesso.

