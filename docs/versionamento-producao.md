# Versionamento em producao

Guia rapido para rodar o job de versionamento em producao via Docker.

## Pre-requisitos

Antes de executar, confirme em `apps/Versionamento/.env`:

```env
DATABASE_URL=postgresql://.../landwatch?schema=app&sslmode=require

LANDWATCH_STORAGE_MODE=blob
LANDWATCH_BLOB_CONNECTION_STRING=...
LANDWATCH_BLOB_CONTAINER=landwatch-versionamento-prod
LANDWATCH_BLOB_PREFIX=versionamento
LANDWATCH_RETENTION_RUNS=2
LANDWATCH_SAVE_RAW=0
LANDWATCH_WORK_DIR=/work

LANDWATCH_INGEST_ROOT_DIR=/work
LANDWATCH_OGR2OGR_PATH=/usr/bin/ogr2ogr
LANDWATCH_GDAL_DATA=/usr/share/gdal
LANDWATCH_PROJ_LIB=/usr/share/proj
LANDWATCH_OGR2OGR_LOG_DIR=/work/logs

LANDWATCH_PMTILES_BUILD_ENABLED=true
LANDWATCH_PMTILES_BLOB_CONNECTION_STRING=...
LANDWATCH_PMTILES_BLOB_CONTAINER=landwatch-pmtiles-prod
LANDWATCH_PMTILES_BLOB_PREFIX=pmtiles

LANDWATCH_SICAR_USE_DOCKER=0
SICAR_TEST_STATES=
```

Observacoes:

- `GDAL`, `ogr2ogr`, `tippecanoe`, `pmtiles` e `tesseract` ficam dentro da imagem Docker. Nao precisa instalar no Linux se o job for rodado via Docker.
- `SICAR_TEST_STATES=` vazio processa todos os estados. Se preencher, processa somente os estados informados.
- Nao use paths Windows no `.env` quando executar pelo Docker.

## Rodar tudo

Este comando executa `PRODES`, `DETER`, `SICAR` e `URL`.

```bash
cd ~/Desktop/Projetos/Sigfarm/LandWatch

sudo docker build -f apps/Versionamento/Dockerfile -t landwatch-versionamento:prod .

sudo rm -rf /tmp/landwatch-versionamento-work
mkdir -p /tmp/landwatch-versionamento-work

sudo docker run --rm \
  --env-file apps/Versionamento/.env.prod \
  -e TMPDIR=/work \
  -v /tmp/landwatch-versionamento-work:/work \
  landwatch-versionamento:prod \
  python jobs/run_job.py
```

O volume `/tmp/landwatch-versionamento-work:/work` e usado para downloads temporarios, logs e arquivos intermediarios.

## Rodar por categoria

Use o mesmo `docker run`, trocando apenas o comando final.

URL, incluindo bases como embargos, UCS, quilombolas, biomas e listas CSV:

```bash
sudo docker run --rm \
  --env-file apps/Versionamento/.env \
  -e TMPDIR=/work \
  -v /tmp/landwatch-versionamento-work:/work \
  landwatch-versionamento:prod \
  python jobs/run_job.py --category URL
```

DETER:

```bash
sudo docker run --rm \
  --env-file apps/Versionamento/.env \
  -e TMPDIR=/work \
  -v /tmp/landwatch-versionamento-work:/work \
  landwatch-versionamento:prod \
  python jobs/run_job.py --category DETER
```

PRODES completo:

```bash
sudo docker run --rm \
  --env-file apps/Versionamento/.env \
  -e TMPDIR=/work \
  -v /tmp/landwatch-versionamento-work:/work \
  landwatch-versionamento:prod \
  python jobs/run_job.py --category PRODES
```

PRODES filtrando workspace e ano:

```bash
sudo docker run --rm \
  --env-file apps/Versionamento/.env.prod \
  -e TMPDIR=/work \
  -v /tmp/landwatch-versionamento-work:/work \
  landwatch-versionamento:prod \
  python jobs/run_job.py --category PRODES \
    --prodes-workspaces prodes-mata-atlantica-nb \
    --prodes-years 2020
```

SICAR completo:

```bash
sudo docker run --rm \
  --env-file apps/Versionamento/.env.prod \
  -e TMPDIR=/work \
  -v /tmp/landwatch-versionamento-work:/work \
  landwatch-versionamento:prod \
  python jobs/run_job.py --category SICAR
```

## PMTiles no fluxo

Os PMTiles sao gerados automaticamente pelo `jobs/run_job.py` quando:

- `LANDWATCH_PMTILES_BUILD_ENABLED=true`;
- algum dataset da categoria foi ingerido ou atualizado;
- o refresh das materialized views terminou sem erro.

O fluxo automatico e:

```text
download -> ingestao -> refresh MVs -> build_pmtiles.py dos datasets alterados
```

Ou seja: se um dataset nao mudou e foi pulado por fingerprint/manifest, o PMTiles dele nao e regenerado nesse run.

Datasets que nao existem no banco ou que nao possuem feicoes espaciais exportaveis sao ignorados com `WARN`, sem abortar a publicacao dos demais PMTiles.

## Gerar PMTiles manualmente

Use este comando quando quiser reconstruir PMTiles sem rodar o versionamento completo, por exemplo depois de criar MVs, corrigir assets ou publicar um dataset especifico.

Um dataset:

```bash
sudo docker run --rm \
  --env-file apps/Versionamento/.env \
  -e TMPDIR=/work \
  -v /tmp/landwatch-pmtiles-work:/work \
  landwatch-versionamento:prod \
  python build_pmtiles.py --dataset-codes EMBARGOS_IBAMA
```

Varios datasets:

```bash
sudo docker run --rm \
  --env-file apps/Versionamento/.env \
  -e TMPDIR=/work \
  -v /tmp/landwatch-pmtiles-work:/work \
  landwatch-versionamento:prod \
  python build_pmtiles.py --dataset-codes EMBARGOS_IBAMA,EMBARGOS_ICMBIO,UNIDADES_CONSERVACAO,TERRAS_INDIGENAS,TERRAS_QUILOMBOLAS
```

Exemplos uteis para datasets frequentes:

```bash
sudo docker run --rm \
  --env-file apps/Versionamento/.env \
  -e TMPDIR=/work \
  -v /tmp/landwatch-pmtiles-work:/work \
  landwatch-versionamento:prod \
  python build_pmtiles.py --dataset-codes BIOMAS,LDI_SEMAS_MANUAL,LDI_SEMAS_AUTOMATIZADO,LDI_SEMAS_SEMSOBREPOSICAO
```

## Ingerir CNUC local

Use este fluxo quando o link publico do CNUC estiver bloqueando download automatico, como pode acontecer com links do SharePoint.

Importante: nao ingira o SHP cru do `UCS_CNUC` diretamente como dataset final, salvo se essa for a intencao. No fluxo atual, o CNUC e combinado com a base federal de UCS para gerar o dataset final:

```text
UNIDADES_CONSERVACAO
```

### 1) Preparar arquivos locais

Coloque o ZIP do CNUC baixado pelo navegador em `~/Downloads/cnuc_2026_03_atualizado.zip`.

Depois prepare a pasta de trabalho:

```bash
cd ~/Desktop/Projetos/Sigfarm/LandWatch

WORK=/tmp/landwatch-versionamento-work/manual-ucs

rm -rf "$WORK"
mkdir -p "$WORK/cnuc" "$WORK/federal" "$WORK/prepared"

unzip -o "$HOME/Downloads/cnuc_2026_03_atualizado.zip" -d "$WORK/cnuc"

curl -L \
  -o "$WORK/ucs_federal.zip" \
  "https://www.gov.br/icmbio/pt-br/dados_geoespaciais/mapa-tematico-e-dados-geoestatisticos-das-unidades-de-conservacao-federais/limite_ucs_federais_032016_a2_.zip"

unzip -o "$WORK/ucs_federal.zip" -d "$WORK/federal"
```

Confira se existem shapefiles nos dois lados:

```bash
find "$WORK/cnuc" "$WORK/federal" -iname "*.shp"
```

### 2) Preparar, ingerir e gerar PMTiles

Ajuste `--snapshot-date` se quiser usar outra data. Para o CNUC de marco/2026, o exemplo abaixo usa `2026-03-30`.

```bash
sudo docker run --rm \
  --env-file apps/Versionamento/.env \
  -e TMPDIR=/work \
  -v /tmp/landwatch-versionamento-work:/work \
  landwatch-versionamento:prod \
  sh -lc '
    set -e

    FED_SHP="$(find /work/manual-ucs/federal -iname "*.shp" | head -n 1)"
    CNUC_SHP="$(find /work/manual-ucs/cnuc -iname "cnuc_2026_03*.shp" | head -n 1)"

    test -n "$FED_SHP"
    test -n "$CNUC_SHP"

    python jobs/steps/prepare_ucs.py \
      --fed-shp "$FED_SHP" \
      --cnuc-shp "$CNUC_SHP" \
      --output-dir /work/manual-ucs/prepared \
      --output-stem UNIDADES_CONSERVACAO

    python bulk_ingest.py \
      --files /work/manual-ucs/prepared/UNIDADES_CONSERVACAO.shp \
      --category UCS \
      --snapshot-date 2026-05-21

    python build_pmtiles.py --dataset-codes UNIDADES_CONSERVACAO
  '
```

Esse comando faz:

- prepara o SHP final `UNIDADES_CONSERVACAO.shp`;
- ingere o dataset `UNIDADES_CONSERVACAO` na categoria `UCS`;
- atualiza as materialized views no fim do `bulk_ingest.py`;
- publica o PMTiles de `UNIDADES_CONSERVACAO`.

Se o `find` nao localizar o CNUC porque o nome interno do SHP veio diferente, rode:

```bash
find /tmp/landwatch-versionamento-work/manual-ucs/cnuc -iname "*.shp"
```

Depois substitua no comando o trecho:

```bash
CNUC_SHP="$(find /work/manual-ucs/cnuc -iname "cnuc_2026_03*.shp" | head -n 1)"
```

por um caminho fixo, por exemplo:

```bash
CNUC_SHP="/work/manual-ucs/cnuc/caminho/do/arquivo.shp"
```

## Validacao no banco

Apos gerar PMTiles, conferir assets ativos:

```sql
SELECT
  d.code,
  a.version_id,
  a.blob_container,
  a.blob_path,
  a.blob_size_bytes,
  a.feature_count,
  a.is_active,
  a.updated_at
FROM landwatch.lw_dataset_pmtiles_asset a
JOIN landwatch.lw_dataset d ON d.dataset_id = a.dataset_id
WHERE a.is_active = true
ORDER BY d.code;
```

Conferir se alguma MV ainda esta em refresh/lock pela API:

```text
GET /api/geo/materialized-views/status
```

Se `busy=false`, a base geoespacial esta liberada para uso normal.
