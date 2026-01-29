# LandWatch - Visao Atual do Projeto (2026-01-28)

## Objetivo
Plataforma de analise socioambiental e compliance em imoveis rurais, baseada em interseccoes geoespaciais entre o CAR (SICAR) e camadas versionadas (PRODES, DETER, embargos, UCs, TIs, biomas, etc).

## Estado atual (infra e base tecnica)
- Monorepo com API (NestJS), Worker (previsto), SPA (Vue 3).
- Ambientes separados: local, staging, prod.
- CI/CD com gates e aprovacao para prod.
- Staging/prod com API + SWA funcionando e login OK.
- Prisma 7 configurado via prisma.config.ts.
- Health/Ready e env validation ja ativos.

## Decisoes chaves
- PostGIS (landwatch.*) read-only por SQL direto.
- Prisma para app.* (transacional).
- PDF como artefato cacheavel com TTL curto (1h).
- Validacao publica via token aleatorio + QR.
- Realtime via Socket.IO (MVP).
- Satelite para web/PDF: Mapbox no MVP (avaliar custo/licenca para produção).
- MVP inclui todos os datasets.
- Auth somente Entra (sem email/senha e sem Google no MVP).
- Sem politica pending no MVP (usuario ativo no primeiro login).
- MVP sem organizacoes; usuarios unicos por enquanto.
- Documentos anexos com aprovacao administrativa (nao bloqueia PDF).
- API deve suportar automacao externa (Fabric).
- Integracao M2M: API Key entra no MVP.
- Schema deve nascer org-ready (campos/tabelas preparados, sem uso no MVP).
- SICAR no mapa apenas acima de um zoom minimo (default 13, ajustavel).

## Arquitetura (macro)
- API: NestJS + Prisma + JWT (Entra External ID).
- Worker: NestJS + BullMQ + PostGIS SQL.
- DB: Azure Postgres + PostGIS (schema landwatch + app).
- Queue: Redis + BullMQ.
- Storage: Azure Blob (PDFs, anexos).
- Front: Vue 3 SPA hospedada em Azure Static Web Apps.

## Data domains
- landwatch.*: data warehouse versionado (read-only).
- app.*: users, orgs, farms, analyses, results, pdfs, alerts.

## Fluxos principais
1) Login -> /v1/users/me -> UI com contexto do usuario.
2) Criar analise -> job -> persistir results -> realtime status.
3) Gerar PDF -> job -> blob -> verificar via /verify/{token}.
4) Automacao externa -> criar analise -> polling -> baixar PDF.

## UX/UI (MVP)
Telas alvo:
- Login
- Dashboard
- Lista de Analises
- Detalhe da Analise
- Nova Analise
- Fazendas (lista)
- Detalhe da Fazenda

Referencia visual: `docs/ui-design.md`.

## Escopo MVP
- Auth + contexto basico.
- CRUD de fazendas.
- Lookup por coordenadas (fase inicial).
- Mapa para localizar fazendas por coordenadas e visualizar fazendas proximas.
- Analises assincronas + resultados persistidos.
- Realtime de status.
- PDF assincrono (sem mapa no primeiro corte, se necessario).
- UI MVP com as telas base (dashboard, analises, fazendas, nova analise).

Fora do MVP:
- Documentos anexados.
- Agendamentos e alertas.
- Admin completo.

## Riscos principais
- Carga pesada de PostGIS -> otimizar queries e indices.
- PDF com mapa -> custos/limites de tiles.
- Permissoes -> alinhar regras antes de expandir multi-tenant.

## Duvidas pendentes (alinhamento)
- Modelo final de RBAC + grants (escalabilidade de permissao).
- Politica por org para retencao de PDF (pos-MVP).
- Cache/materialized views para performance geoespacial.
- Fluxo de aprovacao de usuarios (pending vs active).

## Proximos passos recomendados
1) Definir contrato canonico do resultado da analise.
2) Definir schema app.* minimo (org, farm, analysis, result).
3) Criar job de analise (BullMQ) + persistencia.
4) Criar UI base (layout + dashboard + lista de analises).
