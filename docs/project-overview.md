# LandWatch - Funcionamento do Projeto e Revisao de Boas Praticas

Este documento explica como o projeto funciona hoje e avalia a aderencia as boas praticas (NestJS + Prisma) com base nos skills de referencia.

## 1) Visao geral (MVP atual)
- Stack: NestJS (API), Vue 3 (Web), Postgres + PostGIS, Redis (fila futura), Azure Blob (PDFs), Entra External ID (Auth).
- Fonte de verdade: `app.*` (transacional). Dados geoespaciais somente leitura em `landwatch.*`.
- Analise MVP: **sincrona** na API (para testes manuais rapidos), usando funcoes do schema landwatch.
- PDF: artefato cacheavel com TTL curto, gerado server-side (planejado para MVP+).
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
- Endpoints de farms, cars lookup e analises (sincronas).
- M2M via API Key + admin endpoints de chaves.

Principais pontos tecnicos:
- `ValidationPipe` global com whitelist e transform.
- `EnvelopeInterceptor` padroniza respostas (data + correlationId).
- `HttpExceptionFilter` centraliza erros (inclui Prisma).
- `requestLogger` e correlationId por request.
- CORS/CSP por env e rate limiting por rota (parcial).

### 2.2 Web (Vue 3 + Vite)
Responsabilidades:
- Login via Entra (MSAL).
- UI MVP simplificada para testes manuais (farms + analises + lookup).
- Consumo de API com token do Entra.

### 2.3 Banco de Dados
- `landwatch.*`: data warehouse geoespacial versionado (read-only) com tabelas `lw_*`.
- Funcoes oficiais para analise (ver `LandwatchVersionamento/DB_ANALYSIS_GUIDE.md`):
  - `fn_sicar_feature_current`, `fn_sicar_feature_asof`
  - `fn_intersections_current_simple`, `fn_intersections_asof_simple`
  - `fn_intersections_current_area`, `fn_intersections_asof_area`
  - `fn_doc_current`, `fn_doc_asof`
- `app.*`: usuarios, orgs (future), farms, analyses, results, API keys.

### 2.4 CI/CD e ambientes
- Staging e Prod separados (API + SWA + DB).
- Workflows de CD com gates (health/ready + migrate deploy).
- Staging usado para testes de integracao.

## 3) Fluxos principais (MVP atual)

### 3.1 Autenticacao (Entra)
1) SPA redireciona para Entra.
2) Entra devolve JWT.
3) API valida JWT (JWKS).
4) Usuario e criado/atualizado no `app_user`.

### 3.2 Analise (sincrona no MVP)
1) `POST /v1/analyses` recebe carKey (+ cpfCnpj opcional + analysisDate).
2) API chama funcoes do schema landwatch:
   - `fn_intersections_*_area` para interseccoes e areas.
   - `fn_doc_*` quando CPF/CNPJ e informado.
3) Resultados persistem em `analysis_result`.
4) Resposta inclui `analysisId` e resumo.

### 3.3 M2M (Automacao)
1) Cliente usa `X-API-Key`.
2) API valida hash e escopos.
3) Permite criar analises e consultar resultados.

## 4) Avaliacao de boas praticas (skills)

### 4.1 NestJS (arquitetura, seguranca e DX)
Em conformidade:
- `arch-feature-modules`: modulos por feature (auth, users, farms, analyses, cars).
- `security-use-guards`: AuthGuard para rotas protegidas.
- `security-validate-all-input`: ValidationPipe global.
- `error-use-exception-filters`: filtro global para erros.
- `devops-use-config-module`: ConfigModule global com validação Zod.

Gaps / melhorias recomendadas:
- Guard global para autenticar por padrao (evita esquecer @UseGuards).
- `ActiveUserGuard` aplicado em todas as rotas privadas (status disabled).
- Rate limit por API Key e endpoints criticos (analises/pdf).
- Extração do acesso `landwatch.*` para um repositorio de queries dedicado.

### 4.2 Prisma (schema, migrations, conexao)
Em conformidade:
- Prisma 7 com `prisma.config.ts` (sem url no schema).
- Migrations versionadas e `migrate deploy` no CI.
- Schema mapeado para `app` (multi-schema com `@@schema`).
- Relacoes explicitas (User -> Analysis, Farm, Org).

Gaps / melhorias recomendadas:
- Add `AnalysisBiome` quando BIOMAS entrar no MVP.
- Revisar indices de performance apos carga real.

## 5) Padrões de resposta e observabilidade
- Todas as respostas sao envelopadas com `data` e `correlationId`.
- Erros retornam `error.code` previsivel.
- Logs por request com correlationId.
- Health/Ready para gates de deploy.

## 6) O que ja esta pronto vs planejado

### Pronto
- Auth com Entra + bootstrap user.
- Health/Ready.
- CI/CD staging/prod.
- API Key M2M + admin endpoint.
- Farms: schema + CRUD.
- Cars: lookup por coordenadas + bbox.
- Analises: endpoints basicos usando funcoes do landwatch.
- UI simples para testes manuais (home console).

### Planejado (MVP+)
- Analises assincronas com Worker + BullMQ.
- PDF server-side com Mapbox + blob.
- UI completa (dashboard, listas, detalhes).

## 7) Proximos blocos tecnicos (recomendacao)
1) UI MVP (fluxo completo com mapas).
2) PDF server-side (mapa + overlay).
3) Worker + BullMQ para assinc.
4) Rate limit por API Key e por rota critica.
