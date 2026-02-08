# Planejamento: LandWatch Versionamento (armazenamento mínimo + ingestão diária)

Atualizado em: 2026-02-07

## 1) Objetivo e premissas
- Prioridade máxima: reduzir armazenamento no Postgres.
- Consultas 99% geoespaciais (intersecções entre geometrias).
- CSVs são menores; precisam de consulta por CPF/CNPJ ativo.
- Ingestão diária.
- Eliminar JSON de configuração externo; regras ficam no banco.

## 2) Diretrizes de modelagem
- Evitar duplicação de geometria (dedupe por hash).
- Evitar EAV de atributos completos; usar JSONB compacto e dedupe por hash.
- Armazenar apenas mudanças (histórico por hash).
- Índices somente para caminhos de consulta reais.
- Particionamento por dataset nas tabelas grandes.

## 3) Modelo de dados (proposto)

### Metadados
- **lw_category**
  - category_id (PK), code, description
  - default_srid, natural_id_col (default)
- **lw_dataset**
  - dataset_id (PK), category_id (FK), code, description
  - is_spatial, default_srid, natural_id_col
  - csv_delimiter, csv_encoding
  - csv_doc_col (CPF/CNPJ), csv_date_closed_col, csv_geom_col
  - attr_store_mode: `PACK_JSONB`
- **lw_dataset_version**
  - version_id (PK), dataset_id
  - version_label, snapshot_date
  - status (RUNNING/COMPLETED/FAILED/SKIPPED_NO_CHANGES)
  - source_path, source_fingerprint
  - loaded_at, error_message

### Features e estado
- **lw_feature**
  - feature_id (PK), dataset_id, feature_key
- **lw_feature_state**
  - dataset_id, feature_id
  - is_present, geom_hash, attr_hash
  - snapshot_date, current_version_id, updated_at

### Geometrias (dedupe)
- **lw_geom_store**
  - geom_id (PK), geom_hash (unique)
  - geom (PostGIS geometry), srid
- **lw_feature_geom_hist**
  - dataset_id, feature_id, geom_id
  - version_id, valid_from, valid_to

### Atributos (JSONB dedupe)
- **lw_attr_pack**
  - pack_id (PK), pack_hash (unique)
  - pack_json (JSONB)
- **lw_feature_attr_pack_hist**
  - dataset_id, feature_id, pack_id
  - version_id, valid_from, valid_to

### Índice de CPF/CNPJ (consulta principal dos CSVs)
- **lw_doc_index**
  - dataset_id, feature_id
  - doc_normalized
  - date_closed
  - version_id, valid_from, valid_to
  - Índice parcial: (dataset_id, doc_normalized) WHERE date_closed IS NULL AND valid_to IS NULL

## 4) Regras por dataset (CSV)

### Cadastro de empregadores.csv
- feature_key = hash de todas as colunas normalizadas.
- doc_normalized = coluna `CNPJ/CPF` (somente dígitos).
- Não há data de fechamento: ativo se a linha existir no snapshot atual.
- Se a linha sumir no próximo snapshot -> inativa.

### Lista embargos Ibama.csv
- feature_key = hash de todas as colunas normalizadas.
- doc_normalized = `CPF_CNPJ_EMBARGADO` (somente dígitos).
- `DAT_DESEMBARGO`:
  - se preenchido, não armazenar como ativo.
  - se estava ativo e passou a ter data, inativar.
- `GEOM_AREA_EMBARGADA` (WKT):
  - armazenar somente quando ativo.
  - se inativado, fechar geometria.

## 5) Hashing e normalização
- Normalizar valores: trim, NULL para vazio/NaN.
- Hash de atributo: `md5(payload::text)` (nativo, evita dependência do pgcrypto).
- feature_key (CSV): `md5(payload::text)` de todas as colunas normalizadas.
- geom_hash: `md5(encode(ST_AsBinary(geom), 'hex'))`.

## 6) Pipeline de ingestão diário (alto desempenho)

### 6.1 Staging (rápido)
- CSV: `COPY` para tabela `stg_csv_*` (UNLOGGED).
- SHP: `ogr2ogr` para `stg_shp_*` (UNLOGGED).

### 6.2 Normalização / transformação
- Gerar feature_key.
- Gerar doc_normalized.
- Converter WKT -> geometry (CSV com geom).
- Calcular hashes (geom_hash, attr_hash).

### 6.3 Diff vs estado atual
- Comparar `stg_*` com `lw_feature_state`.
- Identificar novos, alterados, removidos.

### 6.4 Escrita mínima
- **Geometria**: inserir em `lw_geom_store` apenas se hash novo.
- **Atributos**: inserir em `lw_attr_pack` apenas se hash novo.
- **Histórico**: inserir/fechar em `*_hist` apenas quando mudou.
- **Doc index**: apenas linhas ativas (date_closed NULL).

### 6.5 Finalização
- Atualizar `lw_feature_state`.
- Atualizar `lw_dataset_version`.
- Limpar staging.

## 7) Particionamento e índices
- Particionar tabelas grandes por `dataset_id`.
- Índices mínimos:
  - `lw_feature(dataset_id, feature_key)` UNIQUE
  - `lw_feature_state(dataset_id, feature_id)`
  - `lw_feature_geom_hist(dataset_id, feature_id, valid_to)`
  - `lw_geom_store(geom_hash)` UNIQUE + GIST(geom)
  - `lw_doc_index(dataset_id, doc_normalized)` parcial (ativos)

## 8) Observabilidade e operação
- Métricas por ingestão: total de linhas, novas, alteradas, removidas.
- Log de tempo de cada etapa.
- Status da versão em `lw_dataset_version`.

## 9) Container Apps Job + GitHub Actions
- Container com:
  - GDAL/ogr2ogr
  - Python (orquestração) + SQL
- GH Actions:
  - Build image
  - Push to registry
  - Trigger job (daily schedule)
  - Secrets via Azure Key Vault / GitHub Secrets

## 10) Próximas entregas
1) DDL completo das tabelas e índices.
2) SQL de ingestão set-based (staging -> diff -> hist).
3) Refatoração do `bulk_ingest.py` (orquestrador).
4) Pipeline CI/CD (Container Apps Job + GitHub Actions).

## 10.1) Entregas recentes (OK)
- Job unico modular (downloads + ingest seletivo + limpeza).
- Subdividir Terras Indígenas por `fase_ti` e UCS por `SiglaCateg` na API/UI.
- Persistir `geom_id` nos resultados da análise e usar no `/analyses/:id/map` com fallback por `feature_id`.
- MV `landwatch.mv_feature_geom_active` criada e usada nas funcoes `fn_*_current` e endpoints (refresh apos ingest).
- Mascaras de entrada (CAR/CPF-CNPJ/Data) aplicadas em Nova Analise e Nova Fazenda (criacao/edicao).
- Busca por coordenadas aceita DD/DMM/DMS com hemisferio (N/S/E/W/O).
- Botao "Baixar GeoJSON" no Detalhe da analise (CAR + intersecoes).
- Busca por coordenadas com cores variadas por CAR e ordem por area (menores por cima).
- Abas no sidebar para Nova analise/Buscar CAR, com confirmacao de campos opcionais e loading no envio.
- SICAR (Docker): corrigido template do script interno (KeyError 'code') e log de erro detalhado.
- MVs quentes para analises current (attrs light, sicar meta, fase_ti, sigla_categ) e uso nos endpoints com fallback historico.
- Seleção de CAR destaca o selecionado sem bloquear cliques nos menores (overlay não interativo).

## 11) Seeds e execução local

### 11.1 Criar schema e extensões
```
psql "postgresql://app_user:***@gns-postgres.postgres.database.azure.com:5432/landwatch_staging" -f schema.sql
```

### 11.2 Cadastrar categorias (pastas)
```
psql "postgresql://app_user:***@gns-postgres.postgres.database.azure.com:5432/landwatch_staging" -f seed_categories.sql
```

### 11.3 Ingestão local
```
python bulk_ingest.py
```

### 11.5 Variáveis úteis (GDAL/PROJ)
- `LANDWATCH_OGR2OGR_PATH`: caminho do `ogr2ogr.exe` com driver PostgreSQL
- `LANDWATCH_OGR2OGR_ENCODING`: encoding dos SHPs (default `LATIN1`)
- `LANDWATCH_GDAL_DATA`: pasta `gdal` do QGIS (resolve conflitos de PROJ/GDAL)
- `LANDWATCH_PROJ_LIB`: pasta `proj` do QGIS (resolve conflitos de PROJ)

### 11.4 Como os datasets são criados
- O `bulk_ingest.py` cria `lw_dataset` automaticamente com base em:
  - nome da pasta (categoria)
  - nome do arquivo (dataset)
- Exemplo:
  - pasta `PRODES` + arquivo `prodes_legal_amz_2024.shp`
  - dataset = `PRODES_LEGAL_AMZ_2024` (stemtoupper)

## 12) Job unico modular (downloads + ingest seletivo + limpeza)
Implementado em `apps/Versionamento/jobs`.

Fluxo por categoria:
- download_prodes -> ingest_prodes (se fingerprint mudou)
- download_deter  -> ingest_deter  (se fingerprint mudou)
- download_sicar  -> ingest_sicar  (se fingerprint mudou)
- download_url    -> ingest_url    (se fingerprint mudou)
- cleanup (mantem 1-2 runs)

Scripts:
- `jobs/run_job.py` (orquestrador)
- `jobs/steps/download_*.py`, `jobs/steps/manifest.py`, `jobs/steps/ingest.py`, `jobs/steps/cleanup.py`

Ingest seletivo:
- `bulk_ingest.py` aceita `--files`, `--category`, `--dataset`, `--root`.

Armazenamento:
- Blob: `LANDWATCH_STORAGE_MODE=blob` (usa container + prefixo)
- Local: `LANDWATCH_STORAGE_MODE=local` (usa `LANDWATCH_LOCAL_ROOT`)
Sem snapshot raw:
- `LANDWATCH_SAVE_RAW=0` remove os arquivos baixados apos ingest/skip (minimiza disco e tempo).
