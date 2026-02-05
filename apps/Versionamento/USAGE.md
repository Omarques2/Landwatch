# Uso dos scripts (bulk_ingest.py e run_job.py)

Este arquivo mostra exemplos práticos de como usar os parâmetros mais comuns.

> Dica: no Git Bash use `\` para quebrar linha. No PowerShell use `` ` ``.

---

## bulk_ingest.py

### 1) Ingerir 1 SHP específico
Git Bash:
```bash
python bulk_ingest.py --files "C:/Users/Sigfarm/Desktop/Github/LandWatch/apps/Versionamento/Dados/SICAR/CAR_SP.shp" --snapshot-date 2026-02-04
```

### 2) Forcar categoria/dataset (quando a pasta nao esta padrao)
```bash
python bulk_ingest.py \
  --files "C:/data/CAR_SP.shp" \
  --category SICAR \
  --dataset CAR_SP \
  --snapshot-date 2026-02-04
```

### 3) Ingerir tudo dentro de um root
```bash
python bulk_ingest.py --root "C:/Users/Sigfarm/Desktop/Github/LandWatch/apps/Versionamento/Dados/Prodes"
```

### 4) Ingerir apenas uma categoria (ex: PRODES)
```bash
python bulk_ingest.py --root "C:/Users/Sigfarm/Desktop/Github/LandWatch/apps/Versionamento/Dados" --category PRODES
```

### 5) Ingerir apenas um dataset (ex: PRODES_MATA_ATLANTICA_NB_2020)
```bash
python bulk_ingest.py \
  --root "C:/Users/Sigfarm/Desktop/Github/LandWatch/apps/Versionamento/Dados" \
  --dataset PRODES_MATA_ATLANTICA_NB_2020 \
  --snapshot-date 2020-02-01
```

### 6) Snapshot date (quando nao definido)
Se `LANDWATCH_DEFAULT_SNAPSHOT_DATE` nao estiver no `.env`, o script usa a data atual.

### 7) Exemplos reais por categoria (Git Bash)
SICAR (1 arquivo):
```bash
python bulk_ingest.py --files "C:/Users/Sigfarm/Desktop/Github/LandWatch/apps/Versionamento/Dados/SICAR/CAR_SP.shp" --snapshot-date 2026-02-04
```

DETER (2 arquivos):
```bash
python bulk_ingest.py \
  --files "C:/Users/Sigfarm/Desktop/Github/LandWatch/apps/Versionamento/Dados/DETER/deter-amz_ALLYEARS.shp,C:/Users/Sigfarm/Desktop/Github/LandWatch/apps/Versionamento/Dados/DETER/deter-cerrado-nb_ALLYEARS.shp" \
  --snapshot-date 2026-02-04
```

URL (CSV simples):
```bash
python bulk_ingest.py \
  --files "C:/Users/Sigfarm/Desktop/Github/LandWatch/apps/Versionamento/Dados/LISTA_EMBARGOS_IBAMA/Lista_Embargos_Ibama.csv" \
  --snapshot-date 2026-02-04
```

---

## run_job.py

### 1) Rodar tudo (PRODES + DETER + SICAR + URL)
```bash
python jobs/run_job.py
```

### 2) Rodar apenas uma categoria
```bash
python jobs/run_job.py --category PRODES
```

### 3) Rodar PRODES filtrando workspace
```bash
python jobs/run_job.py --category PRODES --prodes-workspaces prodes-mata-atlantica-nb
```

### 4) Rodar PRODES filtrando ano
```bash
python jobs/run_job.py --category PRODES --prodes-years 2020
```

### 5) Rodar PRODES filtrando workspace + ano
```bash
python jobs/run_job.py --category PRODES --prodes-workspaces prodes-mata-atlantica-nb --prodes-years 2020
```

### 6) Reaproveitar arquivos locais
O `run_job.py` reutiliza arquivos locais **apenas** se o ultimo manifest da categoria estiver com `status: failed`.
Se o manifest nao estiver `failed`, ele faz download novamente.

### 7) Exemplos reais por categoria (Git Bash)
SICAR:
```bash
python jobs/run_job.py --category SICAR
```

DETER:
```bash
python jobs/run_job.py --category DETER
```

URL:
```bash
python jobs/run_job.py --category URL
```

PRODES (Mata Atlântica 2020):
```bash
python jobs/run_job.py --category PRODES --prodes-workspaces prodes-mata-atlantica-nb --prodes-years 2020
```

---

## Observacoes importantes

- `bulk_ingest.py` **nao apaga** arquivos.
- O `run_job.py` pode apagar arquivos baixados ao final se:
  - a ingestao foi `ingested` ou `skipped`, e
  - `LANDWATCH_SAVE_RAW` nao estiver `1`.
- Para manter arquivos baixados: `LANDWATCH_SAVE_RAW=1` no `.env`.
