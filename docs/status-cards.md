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
- [x] Guard global de auth (evitar endpoints sem @UseGuards)
  Aceite: endpoints privados retornam 401 sem token.
- [x] Aplicar ActiveUserGuard em rotas privadas (bloquear user disabled)
  Aceite: usuario com status disabled recebe 403.
- [x] Remover/isolate modulos legados do pbi-embed (admin-rls, bi-authz, powerbi)
  Aceite: modules legados removidos do app e schema ajustado.
- [ ] Configurar Mapbox (tokens + envs no web/api/worker)
  Aceite: tiles de satelite carregam local e em staging.

## EPIC-01 - Schema base org-ready + M2M (evita retrabalho)
- [x] Criar modelos org-ready (org, org_membership, org_group, org_group_membership)
  Aceite: migrations criadas e prisma generate ok.
- [x] Campos org_id nas entidades MVP (farm, analysis, api_client)
  Aceite: schema atualiza sem quebrar endpoints existentes.
- [x] Criar modelos M2M (api_client, api_key, api_key_scope)
  Aceite: tabela com hash de chave + scopes + expiracao.
- [x] Indices e constraints para org_id e M2M
  Aceite: indices compostos criados e revisados.
- [x] Migrations aplicadas em staging (migrate deploy)
  Aceite: `prisma migrate deploy` em staging sem erro.

## EPIC-02 - Auth e identidade (antes de negocio)
- [x] AuthGuard com JWKS (Entra)
  Aceite: token valido -> 200; token invalido -> 401.
- [x] Bootstrap user no /v1/users/me (upsert)
  Aceite: primeiro login cria user em app_user.
- [x] DTO de resposta /v1/users/me padronizado
  Aceite: resposta inclui email, displayName, status e correlationId.
- [x] Registrar lastLoginAt no mesmo fluxo (unificar guard/service)
  Aceite: lastLoginAt atualizado em cada login.
- [x] Erros padronizados para claims invalidas (sub ausente, token invalido)
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
- [x] Logs de uso por api_key (last_used_at)
  Aceite: uso atualiza last_used_at.

## EPIC-04 - Fazendas + Lookup por coordenadas (core)
- [x] Modelos Farm (org-ready, owner, metadata basica)
  Aceite: schema com campos car_key, owner, org_id nullable.
- [x] CRUD Farm (create/list/get/update)
  Aceite: endpoints CRUD com paginacao.
- [x] Regra de visibilidade (global read, restricted write)
  Aceite: usuario sem permissao nao edita farm.
- [x] Endpoint lookup por coordenadas (ponto)
  Aceite: retorna apenas CARs que intersectam a coordenada.
- [x] Endpoint bbox para SICAR (zoom >= 13)
  Aceite: retorna geometrias simplificadas por bbox.
- [x] Validacoes de CAR e CPF/CNPJ (inclui digitos verificadores)
  Aceite: entradas invalidas retornam 400 com VALIDATION_ERROR.

## EPIC-05 - Analises (core)
- [x] Modelo Analysis (status, analysis_date, created_by)
  Aceite: status enum + timestamps.
- [x] Modelo AnalysisResult
  Aceite: results vinculados por analysis_id.
- [x] AnalysisBiome (bioma exibido na análise via derivação em runtime)
  Aceite: biomas exibidos sem tabela dedicada (derivação dos resultados BIOMAS).
- [~] POST /v1/analyses (sincrono no MVP)
  Aceite: cria analysis + results e retorna resumo.
- [ ] Idempotency-Key em POST /analyses
  Aceite: mesma key nao cria duplicado.
- [x] Persistencia de resultados (createMany)
  Aceite: results gravados para a analise.
- [x] GET /v1/analyses (lista + filtros basicos)
  Aceite: filtros por carKey + paginacao.
- [x] GET /v1/analyses/:id (detalhe + resultados)
  Aceite: retorna header + resultados.
- [x] Consultas via funcoes landwatch (fn_intersections_* e fn_doc_*)
  Aceite: SQL usa funcoes do schema landwatch.
- [x] Subdividir Terras Indígenas por fase_ti (API + UI)
  Aceite: lista fases distintas e marca hit apenas nas fases com intersecção.
- [x] Subdividir Unidades de conservação por SiglaCateg (API + UI)
  Aceite: grupo dedicado com de/para; siglas desconhecidas exibem a própria sigla.

## EPIC-06 - Worker + fila (assinc)
- [ ] BullMQ setup (redis + queues)
  Aceite: worker consome fila local.
- [ ] Job analysis:run (PostGIS)
  Aceite: job executa query e atualiza status.
- [ ] Retry/backoff + dead-letter
  Aceite: falha repetida envia job para DLQ.
- [ ] Locks por carKey + analysis_date
  Aceite: concorrencia nao duplica execucao.

## EPIC-07 - Realtime (status)
- [ ] Socket.IO no API
  Aceite: cliente conecta e recebe eventos.
- [ ] Eventos: analysis.status.changed, pdf.ready
  Aceite: evento emitido a cada transicao.
- [ ] Rooms: user:{id}, analysis:{id}
  Aceite: eventos nao vazam entre usuarios.
- [ ] MV status via websocket (landwatch mv-status push)
  Aceite: server notifica inicio/fim de refresh e UI atualiza sem polling.

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
- [x] Console de testes (home) para farms/analises/lookup
  Aceite: UI simples permite criar farm, rodar analise e ver resultados.
- [x] Dashboard (cards + ultimas analises)
  Aceite: cards com dados reais e estados vazios.
- [x] Lista de analises + filtros
  Aceite: filtros refletem query backend.
- [x] Detalhe da analise (mapa + tabela)
  Aceite: mapa e tabela renderizam sem erro.
- [x] Nova analise (form + validacoes)
  Aceite: validacoes e POST /analyses funcionam.
- [x] Abas no sidebar (Nova analise / Buscar CAR) + confirmacao de campos opcionais
  Aceite: CAR selecionado no mapa preenche form; se nome/CPF-CNPJ vazios, confirma antes de criar.
- [x] Mascaras de entrada (CAR/CPF-CNPJ/Data)
  Aceite: inputs formatam automaticamente enquanto digita (Nova Analise e Nova Fazenda).
- [x] Auto-preenchimento de dados da fazenda na Nova Analise
  Aceite: ao preencher CAR/CPF-CNPJ/nome, sugere dados existentes e preenche campos faltantes.
- [x] Fazendas (lista + modal criar)
  Aceite: CRUD basico acessivel por modal.
- [x] Detalhe da fazenda (editar + mapa)
  Aceite: edita dados basicos e mostra geometria do CAR + historico de analises.
- [x] Tela "Buscar por coordenadas"
  Aceite: ponto no mapa retorna CARs que intersectam a coordenada.
- [x] Botão "Usar minha localização" (GPS)
  Aceite: navegador preenche coordenadas atuais com permissão do usuário (mobile/desktop).
- [x] Suporte a DD/DMM/DMS na busca por coordenadas
  Aceite: campos aceitam formatos com hemisferio (N/S/E/W/O) e convertem para decimal.
- [x] Mapa de CARs com cores variadas e ordenacao por area
  Aceite: CARs aparecem com cores diferentes e os menores ficam por cima para clique.
- [x] Seleção de CAR não bloqueia menores
  Aceite: destaque do selecionado não intercepta cliques em CARs internos.
- [x] Marcador de busca com pin padrão Leaflet
  Aceite: ponto de busca usa o pin padrão do Leaflet.
- [x] Baixar GeoJSON no Detalhe da analise
  Aceite: exporta CAR + intersecoes em um GeoJSON.
- [x] Skeletons para dados dinâmicos
  Aceite: telas evitam estado vazio até confirmação da API.

## EPIC-10 - Hardening final do MVP
- [x] Rate limit para endpoints criticos (analises/pdf)
  Aceite: 429 em excesso de requests.
- [x] Logs estruturados para jobs e falhas
  Aceite: logs incluem correlationId e jobId.
- [x] Testes minimos (auth, farm CRUD, analysis flow)
  Aceite: suite e2e roda em staging.
- [x] Checklist de deploy (staging -> prod)
  Aceite: checklist documentado e aprovado.
- [x] MVs "quentes" para acelerar analises (sicar meta, fase_ti, sigla_categ, attrs light)
  Aceite: analise current usa MVs e mantem fallback historico.
- [x] MV de feicoes ativas (current) para acelerar interseccoes do SICAR (sem DETER)
  Aceite: consultas de interseccao current usam MV e reduzem latencia significativamente.
- [x] Downloads + ingest via Blob com limpeza automatica (job unico modular)
  Aceite: job baixa, ingere por categoria e remove blobs antigos com retencao curta (1–2 execucoes).
- [x] SICAR (Docker) - corrigir template do script interno e melhorar log de falha
  Aceite: erro nao dispara KeyError 'code' e stack/saida do container aparece no log.
- [x] Auditoria de indices DB (app + landwatch)
  Aceite: filtros/joins criticos com indices revisados (indices criados + ANALYZE aplicado).
- [ ] Intersecoes com GIST (evitar ST_Transform no WHERE)
  Aceite: queries de interseccao usam bbox no SRID nativo e o planner usa GIST.
- [~] Cache de analises (TTL 2 meses)
  Aceite: cache grava na geracao; leitura do detalhe prioriza cache; limpeza automática por expiração. Pendente validar em ambiente com MVs estáveis.
- [x] Detectar lock de MVs e sinalizar no sistema
  Aceite: API detecta refresh/lock de MV e UI informa "base em atualizacao" e bloqueia ações dependentes durante ingestao.
