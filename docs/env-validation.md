# LandWatch - Ambientes (Local, Staging, Prod)

## Objetivo
- Separar totalmente **staging** e **prod** desde o inicio.
- Evitar testes locais contra prod.
- Usar **DB staging** como base de testes (conforme combinado).

## Ambientes

### Local (dev)
- API: roda local (NestJS).
- WEB: roda local (Vite).
- DB: pode apontar para **staging** para testes (ou um DB local se houver).

### Staging
- **API**: Azure Container Apps (staging).
- **WEB**: Azure Static Web Apps (staging).
- **DB**: DB staging (tambem usado para testes locais).

### Prod
- **API**: Azure Container Apps (prod).
- **WEB**: Azure Static Web Apps (prod).
- **DB**: DB prod (nunca usado em testes locais).

## CI/CD (GitHub Actions)
- Push em `main`:
  - Build e publish da imagem da API.
  - Deploy automatico em **staging** (API + WEB).
  - **Prod somente com aprovacao** (ambiente `production` no GitHub).

## Regras
- **Nunca** rodar migrations em prod fora do pipeline.
- **Nunca** apontar local para DB prod.
- Staging e prod sempre com secrets separados.

## Novos secrets (EPIC-12)
- `SCHEDULES_JOB_TOKEN` (Container App env): token que protege `POST /internal/schedules/run-due`.
- `SCHEDULES_JOB_TOKEN_STAGING` (GitHub Actions secret): token enviado no cron para staging.
- `SCHEDULES_JOB_TOKEN_PROD` (GitHub Actions secret): token enviado no cron para produção.
