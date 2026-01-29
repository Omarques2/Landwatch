# LandWatch - Status do Projeto (MVP Cards, granular)

Legenda:
- [x] feito
- [~] parcial
- [ ] nao feito

## EPIC-00 - Fundacoes e baseline (executar primeiro)
- [x] Monorepo base (API + Web) com build ok
  Aceite: `npm run build` em api/web finaliza sem erros.
- [x] /health e /ready ativos (API)
  Aceite: `/health` retorna 200 e `/ready` retorna 200 com DB online.
- [x] Validacao de env (Zod) com fail-fast
  Aceite: app falha ao subir sem env obrigatoria.
- [x] CI/CD staging + prod funcionando
  Aceite: pipeline passa e publica API+SWA em staging; prod exige aprovacao.
- [ ] Guard global de auth (evitar endpoints sem @UseGuards)
  Aceite: endpoints privados retornam 401 sem token.
- [ ] Aplicar ActiveUserGuard em rotas privadas (bloquear user disabled)
  Aceite: usuario com status disabled recebe 403.
- [ ] Remover/isolate modulos legados do pbi-embed (admin-rls, bi-authz, powerbi)
  Aceite: modules legados removidos ou isolados em pasta ignorada pelo build.
- [ ] Configurar Mapbox (tokens + envs no web/api/worker)
  Aceite: tiles de satelite carregam local e em staging.

## EPIC-01 - Schema base org-ready + M2M (evita retrabalho)
- [x] Criar modelos org-ready (org, org_membership, org_group, org_group_membership)
  Aceite: migrations criadas e prisma generate ok.
- [ ] Adicionar campos org_id nulos nas entidades MVP (farm, analysis, pdf, etc.)
  Aceite: schema atualiza sem quebrar endpoints existentes.
- [x] Criar modelos M2M (api_client, api_key, api_key_scope)
  Aceite: tabela com hash de chave + scopes + expiracao.
- [x] Indices e constraints para org_id e M2M
  Aceite: indices compostos criados e revisados.
- [ ] Migrations aplicadas em staging (migrate deploy)
  Aceite: `prisma migrate deploy` em staging sem erro.

## EPIC-02 - Auth e identidade (antes de negocio)
- [x] AuthGuard com JWKS (Entra)
  Aceite: token valido -> 200; token invalido -> 401.
- [x] Bootstrap user no /v1/users/me (upsert)
  Aceite: primeiro login cria user em app_user.
- [ ] DTO de resposta /v1/users/me padronizado
  Aceite: resposta inclui email, displayName, status e correlationId.
- [ ] Registrar lastLoginAt no mesmo fluxo (unificar guard/service)
  Aceite: lastLoginAt atualizado em cada login.
- [ ] Erros padronizados para claims invalidas (sub ausente, token invalido)
  Aceite: erro com code consistente (NO_SUBJECT / UNAUTHORIZED).

## EPIC-03 - M2M API Key (necessario para automacao)
- [x] Guard X-API-Key (hash + lookup)
  Aceite: requests sem chave -> 401; chave invalida -> 403.
- [x] Scopes por chave (analysis:write, pdf:read, etc.)
  Aceite: escopo insuficiente retorna 403.
- [ ] Rate limit por api_key
  Aceite: excesso retorna 429 com correlationId.
- [x] Endpoint admin interno para criar/revogar API keys
  Aceite: chave gerada uma unica vez e armazenada como hash.
- [x] Logs de uso por api_key (last_used_at, count)
  Aceite: uso atualiza last_used_at.

## EPIC-04 - Fazendas + Lookup por coordenadas (core)
- [ ] Modelos Farm (org-ready, owner, metadata basica)
  Aceite: schema com campos car_key, owner, org_id nullable.
- [ ] CRUD Farm (create/list/get/update)
  Aceite: endpoints CRUD com paginacao.
- [ ] Regra de visibilidade (global read, restricted write)
  Aceite: usuario sem permissao nao edita farm.
- [ ] Endpoint lookup por coordenadas (ST_DWithin)
  Aceite: retorna lista ranqueada por distancia.
- [ ] Endpoint bbox para SICAR (zoom >= 13)
  Aceite: retorna geometrias simplificadas por bbox.
- [ ] Validacoes de CAR e CPF/CNPJ (DTO + class-validator)
  Aceite: entradas invalidas retornam 400 com VALIDATION_ERROR.

## EPIC-05 - Analises (core)
- [ ] Modelo Analysis (status, requested_by, analysis_date)
  Aceite: status enum + timestamps.
- [ ] Modelo AnalysisResult + AnalysisBiome
  Aceite: results vinculados por analysis_id.
- [ ] POST /v1/analyses (idempotency-key)
  Aceite: mesma key nao cria duplicado.
- [ ] Persistencia de resultados (upsert por analysis_id)
  Aceite: rerun nao duplica intersecoes.
- [ ] GET /v1/analyses (lista + filtros)
  Aceite: filtros por data/status/farm.
- [ ] GET /v1/analyses/:id (detalhe + resultados)
  Aceite: retorna resumo + tabela de intersecoes.

## EPIC-06 - Worker + fila (assinc)
- [ ] BullMQ setup (redis + queues)
  Aceite: worker consome fila local.
- [ ] Job analysis:run (PostGIS)
  Aceite: job executa query e atualiza status.
- [ ] Retry/backoff + dead-letter
  Aceite: falha repetida envia job para DLQ.
- [ ] Locks por farm_id + analysis_date
  Aceite: concorrencia nao duplica execucao.

## EPIC-07 - Realtime (status)
- [ ] Socket.IO no API
  Aceite: cliente conecta e recebe eventos.
- [ ] Eventos: analysis.status.changed, pdf.ready
  Aceite: evento emitido a cada transicao.
- [ ] Rooms: user:{id}, analysis:{id}
  Aceite: eventos nao vazam entre usuarios.

## EPIC-08 - PDF server-side (Mapbox)
- [ ] Modelo PdfArtifact (token + expires_at)
  Aceite: token unico por PDF e status pronto.
- [ ] Job pdf:render
  Aceite: gera PDF com base em analysis_id.
- [ ] Mapbox Static Image + overlay (CAR + intersecoes)
  Aceite: PDF contem mapa satelite com overlays.
- [ ] Upload Blob + SAS download
  Aceite: PDF baixado via SAS valido.
- [ ] Endpoint publico /verify/{token}
  Aceite: retorna dados canonicos da analise.

## EPIC-09 - UI MVP (fluxo completo)
- [x] Login Entra
  Aceite: login redireciona e token permite /v1/users/me.
- [x] Home placeholder
  Aceite: rota inicial ok com token valido.
- [ ] Dashboard (cards + ultimas analises)
  Aceite: cards com dados reais e estados vazios.
- [ ] Lista de analises + filtros
  Aceite: filtros refletem query backend.
- [ ] Detalhe da analise (mapa + tabela)
  Aceite: mapa e tabela renderizam sem erro.
- [ ] Nova analise (form + validacoes)
  Aceite: validacoes e POST /analyses funcionam.
- [ ] Fazendas (lista + modal criar)
  Aceite: CRUD basico acessivel por modal.
- [ ] Detalhe da fazenda
  Aceite: historico de analises por farm.
- [ ] Tela "Buscar por coordenadas"
  Aceite: ponto no mapa retorna CARs proximos.

## EPIC-10 - Hardening final do MVP
- [ ] Rate limit para endpoints criticos (analises/pdf)
  Aceite: 429 em excesso de requests.
- [ ] Logs estruturados para jobs e falhas
  Aceite: logs incluem correlationId e jobId.
- [ ] Testes minimos (auth, farm CRUD, analysis flow)
  Aceite: suite e2e roda em staging.
- [ ] Checklist de deploy (staging -> prod)
  Aceite: checklist documentado e aprovado.
