# LandWatch - Planning (Working Draft)

## Sumario executivo
- Produto: plataforma de analise socioambiental e compliance em imoveis rurais, baseada em interseccoes geoespaciais.
- Fonte de verdade: dados estruturados no Postgres (app.*). PDF e um artefato cacheavel e regeneravel.
- Dados geoespaciais: schema landwatch.* (read-only) com historico e estado corrente.
- Arquitetura: API + Worker (NestJS), fila BullMQ/Redis, Postgres + PostGIS, Blob Storage, SPA Vue 3.
- Multi-tenant (visao futuro): usuario individual e corporativo, com suporte LandWatch e permissoes finas.

## Decisoes tomadas (2026-01-27)
- Provedor de tiles/satelite para PDF: Mapbox no MVP (avaliar custo/licenca para produção).
- Validacao publica do PDF: token aleatorio + QR apontando para URL publica com token.
- Retencao de PDF: TTL curto (1h) com regeneracao sob demanda.
- Realtime: Socket.IO no MVP.
- Concurrency de jobs: configuravel, mas fora do MVP.
- Sem versionamento de template do PDF no MVP.
- MVP inclui todos os datasets.
- Data access: Prisma para `app.*`; queries PostGIS (landwatch.*) via SQL direto (read-only).
- Versionamento SHP/PostGIS vive em repo separado e sera refatorado depois.

## Decisoes tomadas (2026-01-28)
- Auth: somente Entra External ID (sem email/senha local e sem Google no MVP).
- Acesso: sem politica de "pending" no MVP; usuarios ativos no primeiro login.
- MVP sem orgs/grupos (modo usuarios unicos). Orgs serao adicionadas depois.
- Mapa web e PDF: satelite (preferencia Google), mas escolher provedor com menor custo/licenca adequada.
- Analise: uma query principal (PostGIS) + status para feedback no UI.
- Entrada minima: CAR ou selecao de area no mapa (SICAR visivel em zoom alto).
- CPF/CNPJ opcional destrava consultas adicionais (metadata).
- Documentos anexos com aprovacao administrativa (sem bloquear PDF).
- API deve suportar uso por automacoes externas (Fabric) para criar analises e baixar PDF.
- Integracao M2M: entra no MVP via API Key.
- Schema deve nascer org-ready (tabelas e campos preparados, mesmo sem uso no MVP).
- Mapa de coordenadas: SICAR carregado apenas acima de um zoom minimo (inicial 13, ajustavel).

## Principios de projeto (NestJS + Prisma)
- Modules por feature (evitar camadas tecnicas). (nestjs-best-practices: arch-feature-modules)
- Services pequenos e com responsabilidade unica; evitar god-services. (arch-single-responsibility)
- Guards e pipes para auth e validacao; DTOs com class-validator. (security-use-guards, security-validate-all-input)
- Exceptions centralizadas com filter e envelope padrao. (error-use-exception-filters, api-use-interceptors)
- Prisma via repositorios por dominio, com transacoes nas operacoes criticas. (arch-use-repository-pattern, db-use-transactions)
- Queries complexas e geoespaciais via SQL parametrizado ($queryRaw) e indexes adequados. (db-avoid-n-plus-one, perf-optimize-database)

## Reuso recomendado do pbi-embed (componentes maduros)
- Bootstrap seguro: ValidationPipe global, Helmet com CSP opcional, CORS por env, rate limit por escopo. (`apps/api/src/main.ts`)
- CorrelationId + request logger + envelope + exception filter padrao. (`apps/api/src/common/http`)
- Validacao de env com zod (fail-fast) e testes de schema. (`apps/api/src/config/config.schema.ts`)
- Auth Entra JWT com jose + JWKS remoto, guard de token. (`apps/api/src/auth`)
- PrismaService com adapter pg e SSL controlado por env. (`apps/api/src/prisma/prisma.service.ts`)
- Health/Ready endpoints para gates de deploy. (`apps/api/src/health`)
- CI/CD com paths-filter (monorepo), gates e staging/prod. (`.github/workflows`)
- Docs operacionais: env, migrations, reset, CD. (`docs/*`)

## Escopo do MVP (fase inicial)
Incluido:
- Auth (Entra External ID) + contexto de usuario.
- Farms (CRUD) com regra de leitura global e escrita restrita.
- Lookup CAR por coordenadas.
- Mapa de busca por coordenadas com exibicao de fazendas proximas (SICAR) em zoom alto.
- Analise assincrona (BullMQ) com resultados persistidos no DB.
- Realtime (Socket.IO) para status.
- PDF assincrono, Blob + pagina publica de validacao (QR/Token).
- Todos os datasets no MVP (com possibilidade de feature-flag por config).
- UI MVP: Login, Dashboard, Lista de Analises, Detalhe da Analise, Nova Analise, Fazendas (lista) e Detalhe da Fazenda.
- API publica para automacao (criar analise, consultar status, baixar PDF).

Fora do MVP:
- Documentos anexados.
- Schedules/alerts.
- Admin completo.
- Funcionalidades avancadas de UI (alertas, agendamentos, admin completo).

## Nao objetivos (por enquanto)
- Ingestao de camadas (fica no Fabric).
- Observabilidade completa (APM/tracing avancado).
- Regras de governanca complexas (ABAC profundo).

## Arquitetura (macro)
- Monorepo:
  - `apps/api` (NestJS)
  - `apps/worker` (NestJS)
  - `apps/web` (Vue 3 + Vite)
  - `packages/shared` (DTOs, enums, tipos)
- Infra:
  - Postgres + PostGIS (Azure)
  - Redis (BullMQ)
  - Blob Storage (Azure)
  - Entra External ID (JWT)
  - Google Maps (tiles/satelite para web e PDF)
- Realtime:
  - Socket.IO no API (adapter Redis para scale-out futuro)

## Data model (app.*) - proposta base
- user (entra_sub, status, last_login_at)
- org
- org_membership (user_id, org_id, role, status)
- org_group + org_group_membership
- farm (owner_org_id, car_key, car_dataset_id, meta)
- farm_edit_grant (farm_id, org_id, granted_by)
- analysis (farm_id, analysis_date, status, requested_by, org_context)
- analysis_job (job_id, attempts, error, duration_ms)
- analysis_result (analysis_id, dataset_id, feature_id, area_ha, pct_farm, valid_from, valid_to)
- analysis_biome (analysis_id, biome_code, area_ha, pct_farm)
- pdf_artifact (analysis_id, status, blob_key, token, generated_at, expires_at)
- document (blob_key, type, meta, created_by, visibility)
- document_feature_link (dataset_id, feature_id, document_id)
- document_farm_link (farm_id, document_id)
- api_client (name, org_id?, status)
- api_key (client_id, key_hash, scopes, last_used_at, expires_at)
- schedule + schedule_run
- alert_policy + alert + alert_event

## Integração com landwatch.* (read-only)
- Normalizar analysisTs para DATE (America/Sao_Paulo).
- Consultas atuais: feature_state + valid_to IS NULL.
- Consultas historicas: valid_from <= D AND (valid_to IS NULL OR valid_to > D).
- Identificacao de feicao: dataset_id + feature_id (surrogate estavel).
- Acesso read-only ao schema landwatch.* (usuario DB separado).
- Queries geoespaciais sempre parametrizadas.
- Camada de queries PostGIS isolada (repositorio/servico dedicado).
- Consulta de SICAR para mapa com limite de zoom (carregar apenas quando proximo; default 13).

## Jobs e idempotencia
- BullMQ com filas separadas: analysis:run, pdf:render, alerts:tick.
- Idempotency-Key em POST /analyses e /pdf para evitar duplicacao.
- Locks por (farm_id, analysis_date, category_set) no banco.
- Status consistentes: QUEUED -> RUNNING -> DONE/FAILED.
- Dead-letter e backoff para jobs falhos.
- Concurrency configuravel (fora do MVP).

## PDF (artefato cacheavel)
- PDF nunca e fonte de verdade; DB e a fonte.
- Sem versionamento de template no MVP.
- Token aleatorio + QR apontando para URL publica com token.
- TTL curto (1h) + regeneracao sob demanda.
- Google Maps para render do mapa (validar custos/licenca).

## Autenticacao e acesso (MVP)
- Login apenas via Entra External ID (MSAL).
- Usuarios ativos no primeiro login (sem etapa pending).
- Sem organizacoes no MVP (usuarios unicos).
- Futuro: usuarios podem criar orgs e gerenciar membros; platform admin com escopo global.

## Integracao externa (Fabric)
- API deve aceitar automacoes (job submit + polling + download PDF).
- Auth M2M: API Key no MVP (rate limit + escopos).

## Realtime
- Eventos: analysis.status.changed, pdf.ready, alert.created.
- Rooms: user:{id}, org:{id}, analysis:{id}.
- Redis adapter para scale-out (opcional no MVP).

## UX/UI
- Direcao visual e telas base em `docs/ui-design.md`.
- Layout base: header + sidebar + content cards.
- Foco em legibilidade, fluxo simples e estados vazios claros.

## Seguranca e compliance
- JWT validation (aud/iss) e guard global.
- RBAC basico + grants (farm_edit_grant).
- Rate limiting em auth/admin.
- Sanitizacao de output e validacao de inputs.
- Logs sem dados sensiveis.

## Observabilidade e operacao
- CorrelationId em requests e jobs.
- Logs estruturados (method, path, status, latency).
- Health (/health) e readiness (/ready com DB).
- Metrics basicas: jobs por status, tempo medio, falhas.

## Ambientes, deploy e DR (base para producao)
- Ambientes separados: local, staging, prod (DBs distintos).
- CI/CD com gates: lint/test/build + /health + /ready + migrate deploy.
- Migrations: `migrate dev` so em dev; `migrate deploy` em staging/prod.
- Backups/PITR: politica de retention e testes periodicos de restore.
- Secrets: variaveis por ambiente; nenhum segredo em log.

## Contratos de API
- Envelope padrao: { data, meta?, error? } com correlationId.
- Errors com codes consistentes (VALIDATION_ERROR, NOT_FOUND, UNIQUE_CONSTRAINT).
- Paginacao padronizada (page, pageSize, total).
- Versionamento de API via prefixo /v1.

## Performance (PostGIS)
- Indexes espaciais em geometrias relevantes.
- Queries limitadas por bbox e thresholds.
- Cache de geometria do CAR na analysis_date (se necessario).
- Analise por lotes para evitar overload (concurrency por org).

## Backlog por epicos (P0/P1/P2)

### EPIC-00: Repo e infra base (P0)
Card P0 — Monorepo + Compose local
- Objetivo: subir API + Worker + Redis + Postgres local.
- Aceite: `docker compose up` funcional; /health responde.

Card P0 — Config e env validation
- Objetivo: schema de env (zod) com defaults seguros.
- Aceite: app falha se env obrigatoria ausente.

### EPIC-01: Auth + Contexto multi-tenant (P0)
Card P0 — JWT Entra + AuthGuard
- Objetivo: validar JWT com JWKS remoto.
- Aceite: 401 sem token, 200 com token valido.

Card P0 — User bootstrap
- Objetivo: criar user no primeiro login (status ativo).
- Aceite: usuario entra sem bloqueio no MVP.

### EPIC-02: Farms + CAR lookup (P0)
Card P0 — CRUD farms com regra global-read/restricted-write
- Aceite: leitura global; escrita apenas owner org ou support.

Card P0 — Lookup CAR por coordenadas
- Aceite: endpoint retorna candidatos com distancia e area.

### EPIC-03: Analises assincronas (P0)
Card P0 — POST /analyses + job queue
- Aceite: cria analysis, enfileira job, status evolui.

Card P0 — Persistencia de resultados
- Aceite: analysis_result e analysis_biome populados e consultaveis.

Card P1 — Idempotencia e locks
- Aceite: mesma request nao duplica analise.

### EPIC-04: Realtime (P1)
Card P1 — Socket.IO no API
- Aceite: cliente recebe eventos de status.

### EPIC-05: PDF + validacao publica (P1)
Card P1 — Geracao de PDF no Worker
- Aceite: PDF gerado, blob salvo, status READY.

Card P1 — Pagina publica /verify/{token}
- Aceite: dados canonicos exibidos sem login.

### EPIC-06: Documentos anexados (P2)
Card P2 — Upload + link a features/farms
- Aceite: docs aparecem no PDF quando intersectados.

### EPIC-07: Schedules + Alerts (P2)
Card P2 — Tick jobs e policies
- Aceite: alertas so quando nova interseccao.

### EPIC-08: Admin/Support (P2)
Card P2 — Admin basico (orgs/users/grants)
- Aceite: suporte gerencia orgs e grants.

### EPIC-09: SPA MVP (P1)
Card P1 — Fluxo essencial (login -> farm -> analise -> pdf)
- Aceite: usuario consegue executar o fluxo completo sem refresh.

Card P1 — Telas base (Dashboard, Analises, Fazendas, Nova Analise)
- Aceite: UI consistente com `docs/ui-design.md` e responsiva.

Card P1 — Detalhe de analise com mapa (MVP)
- Aceite: mapa mostra CAR + intersecoes e tabela abaixo.

### EPIC-11: Automacao externa (P1)
Card P1 — API para automacao (Fabric)
- Objetivo: endpoints para criar analise, consultar status, baixar PDF.
- Aceite: automacao externa consegue executar o fluxo sem UI.

Card P0 — API Key para M2M
- Objetivo: autenticar chamadas de automacao via X-API-Key.
- Aceite: chave valida permite criar analise e baixar PDF, com rate limit.

### EPIC-10: Hardening e qualidade (P1/P2)
Card P1 — Envelope + ExceptionFilter + correlationId
- Aceite: respostas padronizadas com correlationId.

Card P1 — Health/Ready + CI gates
- Aceite: pipeline bloqueia deploy sem /ready.

Card P2 — Tests e2e + factories
- Aceite: test:e2e isolado de prod/staging.

## Decisoes pendentes (precisam de resposta)
- Performance: estrategias de cache e views materializadas.
- Governanca: RBAC puro vs RBAC + grants + ABAC leve.
- Politica de retencao de PDFs por org (pos-MVP).
- Workflow de aprovacao de documentos (regras, SLA, selo no PDF).

## Riscos principais e mitigacoes
- PostGIS pesado -> limitar bbox, indexes e batch.
- PDF render com mapa -> validar provider e custos cedo.
- Multitenancy -> definir org_context e regras claras no MVP.
- Custos Redis/Blob -> TTL e regeneracao sob demanda.
