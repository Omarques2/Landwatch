# LandWatch - Planning (Working Draft)

## Sumario executivo
- Produto: plataforma de analise socioambiental e compliance em imoveis rurais, baseada em interseccoes geoespaciais.
- Fonte de verdade: dados estruturados no Postgres (app.*). PDF e um artefato cacheavel e regeneravel.
- Dados geoespaciais: schema landwatch.* (read-only) com historico e estado corrente.
- Arquitetura alvo: API + Worker (NestJS), fila BullMQ/Redis, Postgres + PostGIS, Blob Storage, SPA Vue 3.
- MVP atual: analises **sincronas** na API (para testes manuais), com evolucao para assinc via Worker.

## Decisoes tomadas (2026-01-27)
- Provedor de tiles/satelite para PDF: Mapbox no MVP (avaliar custo/licenca para produção).
- Validacao publica do PDF: token aleatorio + QR apontando para URL publica com token.
- Retencao de PDF: TTL curto (1h) com regeneracao sob demanda.
- Realtime: Socket.IO no MVP (postergado para MVP+).
- Concurrency de jobs: configuravel, mas fora do MVP.
- Sem versionamento de template do PDF no MVP.
- MVP inclui todos os datasets.
- Data access: Prisma para `app.*`; queries PostGIS (landwatch.*) via SQL direto (read-only).
- Versionamento SHP/PostGIS vive em repo separado e foi refatorado (LandwatchVersionamento).

## Decisoes tomadas (2026-01-28)
- Auth: somente Entra External ID (sem email/senha local e sem Google no MVP).
- Acesso: sem politica de "pending" no MVP; usuarios ativos no primeiro login.
- MVP sem orgs/grupos (modo usuarios unicos). Orgs serao adicionadas depois.
- Mapa web e PDF: satelite (Mapbox no MVP).
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
- Lookup CAR por coordenadas + bbox para mapa.
- Analise **sincrona** na API (usa funcoes landwatch) com resultados persistidos.
- API M2M com API Key para automacoes (Fabric).
- UI simples para testes manuais (console home).

Fora do MVP (ou MVP+):
- Worker + BullMQ (analises assinc).
- Realtime (Socket.IO).
- PDF server-side + Blob + pagina publica de validacao.
- Documentos anexados.
- Schedules/alerts.
- Admin completo.
- UI completa (dashboard, listas, detalhes com mapas).

## Nao objetivos (por enquanto)
- Ingestao de camadas (fica no Fabric/Versionamento).
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
  - Mapbox (tiles/satelite)
- Realtime:
  - Socket.IO no API (adapter Redis para scale-out futuro)

## Data model (app.*) - baseline
- user (entra_sub, status, last_login_at)
- org
- org_membership (user_id, org_id, role, status)
- org_group + org_group_membership
- farm (owner_user_id, car_key, cpf_cnpj, org_id?)
- analysis (car_key, analysis_date, status, created_by_user_id, org_id?)
- analysis_result (analysis_id, dataset_code, feature_id, areas, pct)
- api_client (name, org_id?, status)
- api_key (client_id, key_hash, scopes, last_used_at, expires_at)

## Integracao com landwatch.* (read-only)
- Normalizar analysisDate para DATE.
- Estrutura atual (2026-02-01): tabelas lw_* (lw_category, lw_dataset, lw_feature, lw_feature_geom_hist, lw_geom_store, lw_doc_index, etc).
- Funcoes oficiais do schema landwatch (DB_ANALYSIS_GUIDE.md):
  - fn_sicar_feature_current / fn_sicar_feature_asof
  - fn_intersections_current_simple / fn_intersections_asof_simple
  - fn_intersections_current_area / fn_intersections_asof_area
  - fn_doc_current / fn_doc_asof
- Consultas historicas seguem valid_from/valid_to no historico.
- Identificacao de feicao: dataset_id + feature_id (surrogate estavel).
- Acesso read-only ao schema landwatch.* (usuario DB separado).
- Queries geoespaciais sempre parametrizadas.
- Consulta de SICAR para mapa com limite de zoom (carregar apenas quando proximo; default 13).

## Jobs e idempotencia (MVP+)
- BullMQ com filas separadas: analysis:run, pdf:render, alerts:tick.
- Idempotency-Key em POST /analyses e /pdf para evitar duplicacao.
- Locks por (car_key, analysis_date, category_set) no banco.
- Status consistentes: QUEUED -> RUNNING -> DONE/FAILED.
- Dead-letter e backoff para jobs falhos.

## PDF (artefato cacheavel)
- PDF nunca e fonte de verdade; DB e a fonte.
- Sem versionamento de template no MVP.
- Token aleatorio + QR apontando para URL publica com token.
- TTL curto (1h) + regeneracao sob demanda.
- Mapbox Static Image + overlay de CAR + interseccoes.

## Autenticacao e acesso (MVP)
- Login apenas via Entra External ID (MSAL).
- Usuarios ativos no primeiro login (sem etapa pending).
- Sem organizacoes no MVP (usuarios unicos).
- Futuro: usuarios podem criar orgs e gerenciar membros; platform admin com escopo global.

## Integracao externa (Fabric)
- API deve aceitar automacoes (job submit + polling + download PDF).
- Auth M2M: API Key no MVP (rate limit + escopos).

## UX/UI
- Direcao visual e telas base em `docs/ui-design.md`.
- Layout base: header + sidebar + content cards.
- Foco em legibilidade, fluxo simples e estados vazios claros.

## Seguranca e compliance
- JWT validation (aud/iss) e guard global.
- RBAC basico + grants (farm_edit_grant) para fase futura.
- Rate limiting em auth/admin e M2M.
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
- Planejar MV de feicoes ativas (current) para acelerar interseccoes do SICAR (sem DETER), mantendo historico intacto.
- Nao precomputar todas as interseccoes (custo/armazenamento alto); usar MV de feicoes ativas como fonte corrente.
## Ingest (Downloads + Blob)
- Downloads temporarios via Azure Blob Storage com limpeza automatica apos ingest.
- Job unico modular: download -> manifest -> ingest seletivo por categoria.
- Retencao curta (1–2 execucoes) para reprocessamento rapido.

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
- Aceite: endpoint por ponto retorna apenas CARs que intersectam a coordenada, com resposta rapida.

### EPIC-03: Analises (P0)
Card P0 — POST /analyses (sincrono)
- Aceite: cria analysis e results com base no schema landwatch.

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
Card P1 — Fluxo essencial (login -> farm -> analise)
- Aceite: usuario consegue executar o fluxo completo sem refresh.

Card P1 — Telas base (Dashboard, Analises, Fazendas, Nova Analise)
- Aceite: UI consistente com `docs/ui-design.md` e responsiva.

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
