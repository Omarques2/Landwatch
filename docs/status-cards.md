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
- [x] Analise com multiplos documentos (JSONB) + sync com fazenda
  Aceite: analysis_docs armazena lista de CPF/CNPJ; criacao da analise upserta docs em farm_document; analise permanece imutavel (requer reset do schema app + migrate deploy).
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
- [x] Nova analise com multiplos documentos (chips + selecao)
  Aceite: usuario adiciona varios docs, seleciona docs da fazenda e payload envia array `documents`.
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
- [x] Intersecoes com GIST (evitar ST_Transform no WHERE)
  Aceite: queries de interseccao usam bbox no SRID nativo e o planner usa GIST.
- [~] Cache de analises (TTL 2 meses)
  Aceite: cache grava na geracao; leitura do detalhe prioriza cache; limpeza automática por expiração. Pendente validar em ambiente com MVs estáveis.
- [x] Detectar lock de MVs e sinalizar no sistema
  Aceite: API detecta refresh/lock de MV e UI informa "base em atualizacao" e bloqueia ações dependentes durante ingestao.

## EPIC-11 - Hardening de autenticação e sessão (UX + resiliencia)
- [x] Evitar logout agressivo em erro transitório de token
  Problema: falhas transitórias de rede/timeouts derrubavam sessão válida sem necessidade.
  Aceite: token silent usa retry/backoff para erros transitórios e só redireciona para interação quando realmente necessário.
- [x] Reset de auth não-destrutivo
  Problema: limpeza ampla de storage pode apagar estado útil da aplicação e piorar UX.
  Aceite: reset limpa apenas estado de autenticação (MSAL/chaves correlatas) sem `localStorage.clear()` global.
- [x] Boot não-bloqueante no startup
  Problema: inicialização síncrona de auth bloqueia primeiro paint e aumenta percepção de travamento.
  Aceite: app monta imediatamente e init auth roda em warm-up assíncrono com timeout.
- [x] Mutex/serialização de aquisição de token
  Problema: requests paralelos competem por token e elevam erro de interação em lote.
  Aceite: aquisição de token usa single-flight/serialização com reaproveitamento de promessa em voo.
- [x] Retry/backoff para `/v1/users/me` com fallback seguro
  Problema: instabilidade temporária era tratada como sessão inválida.
  Aceite: `/v1/users/me` aplica retry; apenas 401/403 invalidam sessão imediatamente.
- [x] Recuperação automática após background/aba suspensa
  Problema: retomada após longo período em segundo plano podia quebrar fluxo sem recuperação silenciosa.
  Aceite: listeners de `focus`, `visibilitychange`, `pageshow` e `online` disparam recuperação com throttle.
- [x] Retry inteligente no client HTTP após 401
  Problema: primeiro 401 forçava logout sem tentativa de refresh.
  Aceite: interceptor tenta uma repetição com `forceRefresh` antes de reset/logout.
- [x] Mensagens de UX mais corretas no Pending
  Problema: erros transitórios apareciam como "sessão expirada" e confundiam usuário.
  Aceite: Pending diferencia erro transitório de não autorizado e orienta sem pedir limpeza manual.
- [x] Validação de issuer alinhada ao `ENTRA_AUTHORITY_HOST`
  Problema: issuer fixo em `login.microsoftonline.com` quebrava cenários com host de autoridade customizado/soberano.
  Aceite: backend valida issuer pelo host configurado em env.
- [x] Política anti-stale para rotas SPA de auth
  Problema: HTML stale em borda/cache pode gerar callback/login inconsistente após deploy.
  Aceite: rotas críticas (`/`, `/login`, `/auth/callback`, `/dashboard`, `/farms*`, `/analyses*`) com `Cache-Control: no-store`.

## EPIC-12 - Agendamento de análises + Alertas de novidade (UX-first)
- [x] Modelagem de dados para agendamento e alertas
  Problema: hoje não existe domínio persistente para recorrência nem para histórico de alertas.
  Aceite:
  - Prisma com `analysisKind` (`STANDARD`, `DETER`) no modelo de análise.
  - Nova tabela de schedules com `farmId`, `analysisKind`, `frequency`, `nextRunAt`, `isActive`.
  - Nova tabela de alerts com `scheduleId`, `analysisId`, `analysisKind`, `newIntersectionCount`, `status`.

- [x] API de agendamentos (CRUD básico)
  Problema: usuário não consegue configurar recorrência por fazenda.
  Aceite:
  - Endpoints para criar/listar/editar/pausar/reativar agendamentos.
  - Frequências suportadas: diária, semanal, quinzenal e mensal.
  - Cada schedule aponta explicitamente para tipo de análise (`STANDARD` ou `DETER`).

- [x] Endpoint interno para execução de schedules vencidos
  Problema: sem worker completo, não há executor automático para agendas.
  Aceite:
  - Endpoint `POST /internal/schedules/run-due` protegido por `x-job-token`.
  - Processa apenas schedules ativos com `nextRunAt <= now`.
  - Retorna resumo com `processed`, `created`, `failed`.

- [x] Workflow diário no GitHub Actions (interim scheduler)
  Problema: falta trigger operacional diária para executar o endpoint interno.
  Aceite:
  - Workflow com `schedule` diário e `workflow_dispatch`.
  - Chama staging e prod com tokens separados.
  - Falha de ambiente/token interrompe job com erro explícito.

- [x] Suporte a análise comum agendada (`STANDARD`)
  Problema: análises recorrentes comuns ainda dependem de execução manual.
  Aceite:
  - Execução automática cria análise `STANDARD` equivalente ao fluxo atual.
  - Persistência e status seguem pipeline atual de análises.
  - Sem regressão no comportamento da análise manual.

- [x] Suporte a análise DETER preventiva agendada (`DETER`)
  Problema: não existe fluxo separado para monitoramento preventivo simplificado.
  Aceite:
  - Execução `DETER` consulta exclusivamente camada DETER no CAR.
  - Detalhe da análise DETER simplificado (mapa + legenda + datasets DETER).
  - Fluxo deixa explícito que é análise preventiva, não parecer final de compliance.

- [x] Regra de alerta por nova interseção
  Problema: dashboard não destaca automaticamente novidades detectadas entre execuções.
  Aceite:
  - Comparação da análise atual com a última concluída da mesma fazenda + tipo.
  - Alerta criado apenas para interseção nova (delta positivo).
  - Payload do alerta inclui contexto mínimo para investigação.

- [x] Dashboard com card/lista de alertas novos
  Problema: usuário não tem visão rápida de mudanças relevantes detectadas pelos agendamentos.
  Aceite:
  - Novo card de contagem de alertas novos no dashboard.
  - Lista de novidades com CTA para abrir análise.
  - Estado vazio amigável quando não houver alertas.

- [x] Nova aba de sidebar: Agendamento (UX amigável)
  Problema: falta ponto único para configurar recorrência sem complexidade.
  Aceite:
  - Item `Agendamento` no sidebar desktop/mobile.
  - Tela com criação rápida (fazenda, tipo, frequência) e lista de agendamentos.
  - Feedback claro de sucesso, erro e próximo disparo.

- [x] Qualidade e segurança operacional da feature
  Problema: risco de duplicidade de execução e de endpoint interno sem proteção suficiente.
  Aceite:
  - Idempotência mínima por schedule+janela de execução.
  - Sem execução duplicada na mesma janela por corrida.
  - Testes unitários cobrindo cálculo de próxima execução e regra de delta.

## EPIC-13 - UCS mesclada (Federal + CNUC) com cutover seguro
- [x] CARD-13.1 Contrato de dados do SHP preparado
  Contexto:
  - Baseline validado no banco de teste (2026-04-08): `lw_dataset.UNIDADES_CONSERVACAO` (dataset_id=81) com `natural_id_col` nulo, 344 feições ativas, `feature_key` em formato MD5.
  - Baseline validado nos SHPs locais: Federal=344 códigos, CNUC=3122 códigos, interseção dinâmica por código=344, complemento CNUC=2778, 1 geometria nula no CNUC.
  Descrição:
  - Formalizar contrato de saída do preprocess UCS com schema mínimo estável:
    `cnuc_code`, `nome_uc`, `categoria`, `grupo`, `esfera`, `source`, `geometry`.
  - Formalizar regras de normalização e prioridade:
    `TRIM(UPPER())` para chave, geometria federal prevalece quando código existir nas duas fontes.
  - Formalizar regras bloqueantes de qualidade:
    `cnuc_code` não nulo/único, `categoria` não nula, geometria não nula.
  Referências:
  - `apps/Versionamento/bulk_ingest.py`
  - `apps/Versionamento/ingest.sql`
  - `UCs-shps/copy_of_Limites_UCs_fed_112025/limites_UCs_fed_112025_a.shp`
  - `UCs-shps/shp_cnuc_2025_08/cnuc_2025_08.shp`
  Aceite:
  - Documento de contrato publicado no repositório com campos, tipos esperados, regras e exemplos.
  - Checklist de validação de qualidade definido com queries objetivas e thresholds.
  Entrega:
  - `docs/ucs-prepare-contract.md`

- [ ] CARD-13.2 Cutover do dataset `UNIDADES_CONSERVACAO` no banco
  Contexto:
  - O histórico ativo atual está em `lw_feature_geom_hist`, `lw_feature_attr_pack_hist` e `lw_feature_state` para `UNIDADES_CONSERVACAO`.
  - `version_label` no ingest é `dataset_code + snapshot_date`; reuso de data reaproveita versão existente.
  Descrição:
  - Encerrar versões ativas do dataset atual em data de corte explícita.
  - Ajustar `lw_dataset.natural_id_col` para `cnuc_code` no dataset `UNIDADES_CONSERVACAO`.
  - Definir janela de primeiro run pós-cutover com `snapshot_date` inédita.
  Referências:
  - Tabelas `landwatch.lw_dataset`, `landwatch.lw_dataset_version`, `landwatch.lw_feature_geom_hist`, `landwatch.lw_feature_attr_pack_hist`, `landwatch.lw_feature_state`
  - `apps/Versionamento/bulk_ingest.py` (fluxo de `start_dataset_version`)
  Aceite:
  - Após cutover, não existem linhas ativas legadas para o dataset na data de corte.
  - `natural_id_col='cnuc_code'` confirmado em `lw_dataset`.
  - Primeiro run pós-cutover cria nova versão `COMPLETED` com `snapshot_date` nova.
  Entrega preparada:
  - `apps/Versionamento/sql/ucs_cutover_precheck.sql`
  - `apps/Versionamento/sql/ucs_cutover_apply.sql`
  - `apps/Versionamento/sql/ucs_cutover_postcheck.sql`

- [x] CARD-13.3 Implementar etapa `prepare_ucs` (pré-ingest)
  Contexto:
  - Pipeline atual não possui etapa dedicada de merge UCS; ingest recebe arquivos de forma genérica.
  Descrição:
  - Criar step `jobs/steps/prepare_ucs.py` para:
    leitura dos dois SHPs, normalização de chave, join de enriquecimento no federal, anti-join do complemento CNUC, concatenação e ordenação por `cnuc_code`.
  - Gerar saída única com nome fixo `UNIDADES_CONSERVACAO.shp` e sidecars.
  - Excluir linhas inválidas (especialmente geometria nula) e registrar as exclusões.
  Referências:
  - `apps/Versionamento/jobs/steps/download_url.py`
  - `apps/Versionamento/jobs/steps/ingest.py`
  - `apps/Versionamento/jobs/steps/common.py`
  Aceite:
  - Saída final contém códigos únicos e não nulos.
  - Saída final tem `categoria` preenchida para 100% das linhas válidas.
  - Log QA do step informa `fed_in`, `cnuc_in`, `intersect`, `cnuc_complement`, `dropped_null_geom`, `output_total`.
  Entrega:
  - `apps/Versionamento/jobs/steps/prepare_ucs.py`
  - `apps/Versionamento/jobs/steps/test_prepare_ucs.py`

- [x] CARD-13.4 Integrar `prepare_ucs` ao job de versionamento
  Contexto:
  - Fluxo atual é `download_url -> ingest`; artefatos são fingerprintados por categoria no manifest.
  Descrição:
  - Encadear `download_url -> prepare_ucs -> ingest` na categoria URL/UCS.
  - Garantir que para UCS somente o arquivo preparado seja enviado ao ingest.
  - Preservar `dataset_code` como `UNIDADES_CONSERVACAO` via nome do arquivo.
  Referências:
  - `apps/Versionamento/jobs/run_job.py`
  - `apps/Versionamento/jobs/steps/manifest.py`
  - `apps/Versionamento/bulk_ingest.py` (`derive_dataset_code`)
  Aceite:
  - Manifest exibe fingerprint do artefato preparado e não dos SHPs brutos de UCS.
  - Ingest de UCS processa um único `.shp` com stem `UNIDADES_CONSERVACAO`.
  - Execução repetida sem mudanças resulta em `SKIPPED_NO_CHANGES`.
  Entrega:
  - `apps/Versionamento/jobs/run_job.py`
  - `apps/Versionamento/jobs/test_run_job_ucs.py`

- [x] CARD-13.5 MV UCS simplificada para categoria textual (sem `sigla_categ`)
  Contexto:
  - MV atual expõe apenas `sigla_categ`, e backend de análise de UCS depende desse campo.
  Descrição:
  - Manter nome da MV para compatibilidade (`mv_ucs_sigla_active`), mas remover `sigla_categ`.
  - Expor somente `categoria_uc` (texto), sem de/para de sigla.
  - Ajustar API para consumir categoria textual direta da MV/atributos.
  Referências:
  - `apps/Versionamento/create_functions.sql`
  - `apps/Versionamento/sql/ucs_mv_categoria_apply.sql`
  - `apps/api/src/analyses/analysis-detail.service.ts`
  Aceite:
  - MV retorna `dataset_code`, `feature_id`, `categoria_uc`.
  - Não há duplicidade por `(dataset_id, feature_id)` na MV.
  - Backend UCS usa labels textuais sem mapa hardcoded de siglas.
  Entrega:
  - `apps/Versionamento/create_functions.sql`
  - `apps/Versionamento/sql/ucs_mv_categoria_apply.sql`
  - `apps/api/src/analyses/analysis-detail.service.ts`
  - `apps/api/src/analyses/analysis-detail.service.spec.ts`

- [x] CARD-13.6 Ajustar backend para categoria textual com fallback
  Contexto:
  - `buildUcsItems` hoje assume sigla (`APA`, `PARNA`, etc.) e usa mapeamento hardcoded.
  Descrição:
  - Migrar geração de labels para priorizar `categoria_uc`.
  - Manter fallback para `sigla_categ` enquanto houver dados legados e durante transição.
  - Preservar estabilidade de agrupamento/hit para evitar regressão funcional.
  Referências:
  - `apps/api/src/analyses/analysis-detail.service.ts`
  - `apps/api/src/analyses/analysis-detail.service.spec.ts`
  Aceite:
  - Grupo "Unidades de conservação" exibe labels textuais corretas.
  - Quando `categoria_uc` estiver ausente, fallback para `sigla_categ` funciona.
  - Testes unitários cobrindo ambos cenários passam.
  Entrega:
  - `apps/api/src/analyses/analysis-detail.service.ts`
  - `apps/api/src/analyses/analysis-detail.service.spec.ts`

- [x] CARD-13.7 Ajustar frontend para consumir label textual de UCS
  Contexto:
  - Front usa label provido pela API e formatações gerais por `datasetCode`.
  Descrição:
  - Garantir que telas de análise renderizem categoria textual sem depender de sigla hardcoded.
  - Validar consistência em detalhe, impressão, mapa e legenda.
  Referências:
  - `apps/web/src/features/analyses/analysis-colors.ts`
  - `apps/web/src/features/analyses/analysis-legend.ts`
  - `apps/web/src/views/AnalysisDetailView.vue`
  - `apps/web/src/components/analyses/AnalysisPrintLayout.vue`
  Aceite:
  - Labels de UCS exibidas no front batem com `categoria_uc` da API.
  - Sem regressão visual em mapa/legenda/impressão.
  - Testes de front ajustados e verdes.
  Entrega:
  - `apps/web/src/features/analyses/analysis-legend.ts`
  - `apps/web/src/features/analyses/analysis-legend.spec.ts`
  - `apps/web/src/views/AnalysisDetailView.vue`
  - `apps/web/src/components/analyses/AnalysisPrintLayout.vue`
  - `apps/web/src/views/AnalysisPublicView.vue`

- [x] CARD-13.8 Testes obrigatórios da mudança UCS
  Contexto:
  - Mudança impacta ingestão, modelagem temporal, MV, API e UI.
  Descrição:
  - Criar testes unitários do `prepare_ucs`.
  - Criar teste de integração de ingest verificando `feature_key = cnuc_code`.
  - Criar regressão de MV/API e regressão temporal para análises antigas.
  Referências:
  - `apps/Versionamento/test_*`
  - `apps/api/src/analyses/*.spec.ts`
  - `apps/web/src/features/analyses/*.spec.ts`
  Aceite:
  - Suite cobre prioridade geométrica federal, anti-join e regras QA.
  - Pós-ingest, `lw_feature.feature_key` do dataset UCS segue padrão `0000.00.0000`.
  - Análises antigas continuam consultáveis sem erro.
  Entrega:
  - `apps/Versionamento/jobs/steps/test_prepare_ucs.py`
  - `apps/Versionamento/jobs/test_run_job_ucs.py`
  - `apps/Versionamento/jobs/steps/test_download_url.py`
  - `apps/Versionamento/test_bulk_ingest_natural_id.py`
  - `apps/Versionamento/sql/ucs_feature_key_post_ingest_check.sql`
  - `apps/api/src/analyses/analysis-detail.service.spec.ts`
  - `apps/web/src/features/analyses/analysis-legend.spec.ts`

- [ ] CARD-13.9 Observabilidade e guardrails operacionais
  Contexto:
  - Mudança adiciona etapa de transformação e novas validações críticas de qualidade.
  Descrição:
  - Publicar métricas do preprocess e persistir relatório QA no manifesto da categoria.
  - Adicionar alertas para variação abrupta da interseção e crescimento inesperado de drop de linhas.
  Referências:
  - `apps/Versionamento/jobs/steps/manifest.py`
  - `apps/Versionamento/jobs/run_job.py`
  Aceite:
  - Manifest salva métricas QA do run de UCS.
  - Alertas operacionais definidos para desvios de contagem.
  - Logs permitem auditoria de origem (`source`) por feição.

- [ ] CARD-13.10 Rollout, validação final e rollback
  Contexto:
  - Troca de chave natural em dataset existente tem impacto direto em histórico e consultas.
  Descrição:
  - Executar rollout em ambiente de teste com snapshot fixo.
  - Validar contagens antes/depois no banco e comportamento da API/UI.
  - Preparar rollback operacional simples e testado.
  Referências:
  - Tabelas `lw_dataset*`, `lw_feature*`, `mv_ucs_sigla_active`
  - `apps/Versionamento/USAGE.md`
  Aceite:
  - Checklist de pré-go-live e pós-go-live aprovado.
  - Rollout em produção com janela controlada e validação concluída.
  - Procedimento de rollback documentado e validado em teste.
