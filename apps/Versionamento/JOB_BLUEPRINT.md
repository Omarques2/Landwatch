# Versionamento - Job Unico Modular (Downloads + Ingest)

## Objetivo
Executar em um unico job (Container Apps Job) todas as etapas de download e ingestao com passos independentes por categoria, usando Blob Storage como staging temporario e limpeza automatica.

Fluxo:
- download_prodes  -> ingest_prodes (se mudou)
- download_deter   -> ingest_deter  (se mudou)
- download_sicar   -> ingest_sicar  (se mudou)
- download_url     -> ingest_url    (se mudou)
- cleanup (mantem 1–2 execucoes)

## Scripts
- `jobs/run_job.py` (orquestrador)
- `jobs/steps/download_prodes.py`
- `jobs/steps/download_deter.py`
- `jobs/steps/download_sicar.py`
- `jobs/steps/download_url.py`
- `jobs/steps/manifest.py`
- `jobs/steps/ingest.py`
- `jobs/steps/cleanup.py`

## Variaveis de ambiente
### Storage
- `LANDWATCH_STORAGE_MODE=blob|local`
- `LANDWATCH_BLOB_CONNECTION_STRING=...`
- `LANDWATCH_BLOB_CONTAINER=landwatch`
- `LANDWATCH_BLOB_PREFIX=landwatch`
- `LANDWATCH_LOCAL_ROOT=storage` (modo local)
- `LANDWATCH_RETENTION_RUNS=2`
- `LANDWATCH_SAVE_RAW=0` (0/1, evita copia completa para raw)

### Runner
- `LANDWATCH_WORK_DIR=work`
- `LANDWATCH_DEFAULT_SNAPSHOT_DATE=YYYY-MM-DD`

### PRODES
- `PRODES_ALL_YEARS=1`
- `PRODES_PAGE_SIZE=50000`

### DETER
- `DETER_ALL_YEARS=1`
- `DETER_DIAS=7`
- `DETER_PAGE_SIZE=50000`

### SICAR
- `LANDWATCH_SICAR_MODULE_PATH=/app/SICAR` (se o pacote SICAR nao estiver no PYTHONPATH)
- `SICAR_TEST_STATES=SP,GO,MT`
- `SICAR_TRIES_PER_STATE=25`
- `SICAR_OUTER_RETRIES=3`
- `LANDWATCH_SICAR_USE_DOCKER=1` (usa imagem Docker do SICAR)
- `LANDWATCH_SICAR_DOCKER_IMAGE=urbanogilson/sicar:latest`
- `LANDWATCH_SICAR_DOCKER_PULL=0` (1 para sempre fazer pull)

### URL
- `LANDWATCH_DOWNLOAD_URLS=/app/Download_urls.json`

## Manifesto
Cada categoria gera `manifests/<CATEGORY>/<run_id>.json` contendo fingerprint por dataset.
O ingest so roda quando o fingerprint muda vs ultimo manifest.

## Ingest seletivo
`jobs/steps/ingest.py` chama `bulk_ingest.py --files <lista> --snapshot-date <date>`.

## Limpeza
`jobs/steps/cleanup.py` remove blobs de runs antigos, mantendo as ultimas `LANDWATCH_RETENTION_RUNS`.
Quando `LANDWATCH_SAVE_RAW=0`, os arquivos baixados sao removidos do work_dir apos ingest (ou skip).

## Execucao local (modo local)
```
$env:LANDWATCH_STORAGE_MODE='local'
$env:LANDWATCH_LOCAL_ROOT='storage'
python jobs/run_job.py
```

## Execucao blob (prod)
```
$env:LANDWATCH_STORAGE_MODE='blob'
$env:LANDWATCH_BLOB_CONNECTION_STRING='...'
$env:LANDWATCH_BLOB_CONTAINER='landwatch'
python jobs/run_job.py
```

## Docker (Container Apps Job)
Build local:
```
docker build -f apps/Versionamento/Dockerfile -t landwatch-versionamento:latest .
```

Push para registry (exemplo Azure ACR):
```
az acr login -n <ACR_NAME>
docker tag landwatch-versionamento:latest <ACR_NAME>.azurecr.io/landwatch-versionamento:latest
docker push <ACR_NAME>.azurecr.io/landwatch-versionamento:latest
```

Container Apps Job:
- Usar a imagem acima.
- Definir envs (DATABASE_URL, LANDWATCH_*).
- O job executa `python jobs/run_job.py`.

Importante:
- Em ACA Jobs, Docker-in-Docker nao e permitido. O modo Docker interno do SICAR sera desativado automaticamente.
- O SICAR roda via Python no mesmo container (SICAR instalado via pip).

## GitHub Actions (build automatico)
Workflow: `.github/workflows/cd-versionamento.yml`
- Builda e publica a imagem no GHCR a cada commit em `apps/Versionamento/**`.
- Tags: `:latest` e `:${{ github.sha }}`.
