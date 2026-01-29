# LandWatch - Funcionamento do Projeto e Revisao de Boas Praticas

Este documento explica como o projeto funciona hoje e avalia a aderencia as boas praticas (NestJS + Prisma) com base nos skills de referencia.

## 1) Visao geral (MVP atual)
- Stack: NestJS (API), Vue 3 (Web), Postgres + PostGIS, Redis (fila futura), Azure Blob (PDFs), Entra External ID (Auth).
- Fonte de verdade: `app.*` (transacional). Dados geoespaciais somente leitura em `landwatch.*`.
- PDF: artefato cacheavel com TTL curto, gerado server-side.
- M2M: automacoes via API Key entram no MVP.
- Mapa: Mapbox no MVP. SICAR visivel apenas acima de zoom minimo (default 13).
- Multi-tenant: **org-ready** no schema, mas **nao usado no MVP** (usuarios unicos).

## 2) Componentes e responsabilidades

### 2.1 API (NestJS)
Responsabilidades:
- Validacao de JWT do Entra External ID.
- Bootstrap do usuario no primeiro login.
- Endpoints de saude (/health, /ready).
- Camada transacional via Prisma (app.*).
- Pipeline futuro: analises, jobs, PDFs, documentos.

Principais pontos tecnicos:
- `ValidationPipe` global com whitelist e transform.
- `EnvelopeInterceptor` padroniza respostas (data + correlationId).
- `HttpExceptionFilter` centraliza erros (inclui Prisma).
- `requestLogger` e correlationId por request.
- CORS/CSP por env e rate limiting por rota.

### 2.2 Web (Vue 3 + Vite)
Responsabilidades:
- Login via Entra (MSAL).
- UI MVP com telas base (login, dashboard, fazendas, analises).
- Consumo de API com token do Entra.

### 2.3 Banco de Dados
- `landwatch.*`: data warehouse geoespacial versionado (read-only).
- `app.*`: usuarios, (futuro) orgs, farms, analyses, results, PDFs, keys.

### 2.4 CI/CD e ambientes
- Staging e Prod separados (API + SWA + DB).
- Workflows de CD com gates (health/ready + migrate deploy).
- Staging usado para testes de integracao.

## 3) Fluxos principais (planejado para MVP)

### 3.1 Autenticacao (Entra)
1) SPA redireciona para Entra.
2) Entra devolve JWT.
3) API valida JWT (JWKS).
4) Usuario e criado/atualizado no `app_user`.

### 3.2 Analise (assinc.)
1) `POST /v1/analyses` cria registro e enfileira job.
2) Worker executa query PostGIS (interseccoes).
3) Resultados persistem em `analysis_result` e `analysis_biome`.
4) Status evolui e o realtime notifica a UI.

### 3.3 PDF (server-side)
1) `POST /v1/analyses/{id}/pdf` enfileira job.
2) Worker gera imagem base (Mapbox Static Image).
3) Overlay de CAR + interseccoes no server.
4) PDF salvo no Blob com token de validacao.
5) TTL curto e regeneracao sob demanda.

### 3.4 M2M (Automacao)
1) Cliente usa `X-API-Key`.
2) API valida hash e escopos.
3) Permite criar analises e baixar PDF.

## 4) Avaliacao de boas praticas (skills)

### 4.1 NestJS (arquitetura, seguranca e DX)
Em conformidade:
- `arch-feature-modules`: modulos por feature (auth, users, health).
- `security-use-guards`: AuthGuard para rotas protegidas.
- `security-validate-all-input`: ValidationPipe global.
- `error-use-exception-filters`: filtro global para erros.
- `devops-use-config-module`: ConfigModule global com validação Zod.

Gaps / melhorias recomendadas:
- Guard global para autenticar por padrao (evita esquecer em controllers).
- `ActiveUserGuard` deve ser aplicado nas rotas protegidas (status disabled).
- DTOs e class-validator em endpoints (padronizar para future endpoints).
- Rate limit para endpoints principais alem de /auth e /admin.
- Remover modulos legados de pbi-embed (admin-rls, bi-authz, powerbi) ou mover para um pacote separado.

### 4.2 Prisma (schema, migrations, conexao)
Em conformidade:
- Prisma 7 com `prisma.config.ts` (sem url no schema).
- Migrations versionadas e `migrate deploy` no CI.
- Adapter PG com SSL controlado por env.
- Schema mapeado para `app` (namespaces corretos).

Gaps / melhorias recomendadas:
- Schema ainda sem entidades org-ready implementadas.
- Falta modelo `api_key`/`api_client` para M2M.
- Falta indice e constraints para futuros fluxos (farm, analysis, results).
- Adicionar `lastLoginAt` update no ActiveUserGuard (ou centralizar em UsersService).

## 5) Padrões de resposta e observabilidade
- Todas as respostas sao envelopadas com `data` e `correlationId`.
- Erros retornam `error.code` previsivel.
- Logs por request com correlationId.
- Health/Ready para gates de deploy.

## 6) O que ja esta pronto vs planejado

### Pronto
- Auth com Entra.
- Bootstrap de usuario.
- Health/Ready.
- CI/CD staging/prod.
- Web com login e home.

### Planejado (MVP)
- Farms + lookup por coordenadas.
- Analises assinc. + resultados persistidos.
- PDF server-side com Mapbox.
- API key para automacoes.
- UI MVP com mapa e tabelas.

## 7) Proximos blocos tecnicos (recomendacao)
1) API Key M2M + rate limit.
2) Schema org-ready (org, membership) mesmo sem uso no MVP.
3) Entidades Farms + Analyses + Results + PDF.
4) Worker + BullMQ (analysis e pdf).
5) Mapbox Static Image + overlay.

